from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parents[3]
DEPLOY_TEMPLATE = (
    REPO_ROOT / "ansible" / "roles" / "coditent" / "templates" / "deploy.sh.j2"
)
TESTED_COMMIT = "a" * 40


def _render_deploy_script(app_dir: Path) -> str:
    return (
        DEPLOY_TEMPLATE.read_text()
        .replace("{{ app_dir }}", str(app_dir))
        .replace("{{ repo_branch }}", "main")
        .replace("{{ api_port }}", "8001")
    )


def _write_fake_command(bin_dir: Path, name: str, body: str = "exit 0") -> None:
    command = bin_dir / name
    command.write_text(f"#!/usr/bin/env bash\n{body}\n")
    command.chmod(0o755)


def _run_rendered_deploy(tmp_path: Path, *, curl_exit: int) -> subprocess.CompletedProcess[str]:
    script = tmp_path / "deploy.sh"
    script.write_text(_render_deploy_script(tmp_path))
    script.chmod(0o755)

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _write_fake_command(
        bin_dir,
        "git",
        f'if [ "${{1:-}}" = "rev-parse" ]; then echo "{TESTED_COMMIT}"; fi\nexit 0',
    )
    _write_fake_command(bin_dir, "docker")
    _write_fake_command(bin_dir, "sleep")
    _write_fake_command(bin_dir, "curl", f"exit {curl_exit}")

    environment = os.environ.copy()
    environment["PATH"] = f"{bin_dir}:{environment['PATH']}"
    return subprocess.run(
        ["bash", str(script), TESTED_COMMIT],
        cwd=tmp_path,
        env=environment,
        text=True,
        capture_output=True,
        timeout=10,
        check=False,
    )


def test_deploy_exits_nonzero_when_readiness_never_succeeds(tmp_path: Path) -> None:
    result = _run_rendered_deploy(tmp_path, curl_exit=22)

    assert result.returncode != 0
    assert "did not become ready after 15 attempts" in result.stderr
    assert "Deployment finished successfully" not in result.stdout


def test_deploy_reports_success_only_after_readiness(tmp_path: Path) -> None:
    result = _run_rendered_deploy(tmp_path, curl_exit=0)

    assert result.returncode == 0
    assert "Application is ready!" in result.stdout
    assert "Deployment finished successfully" in result.stdout


def test_deploy_rejects_missing_or_untrusted_revision(tmp_path: Path) -> None:
    script = tmp_path / "deploy.sh"
    script.write_text(_render_deploy_script(tmp_path))
    script.chmod(0o755)

    result = subprocess.run(
        ["bash", str(script), "main"],
        cwd=tmp_path,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 2
    assert "requires the tested 40-character commit SHA" in result.stderr


def test_ci_uses_pinned_host_key_https_and_tested_commit() -> None:
    workflow = (REPO_ROOT / ".github" / "workflows" / "deploy.yml").read_text()

    assert "EC2_SSH_KNOWN_HOSTS" in workflow
    assert "ssh-keyscan" not in workflow
    assert "StrictHostKeyChecking=no" not in workflow
    assert "StrictHostKeyChecking=yes" in workflow
    assert "TESTED_COMMIT: ${{ github.sha }}" in workflow
    assert "PUBLIC_BASE_URL must use HTTPS" in workflow
    assert "--proto '=https'" in workflow
    assert "HTTP_STATUS" in workflow
    assert 'test "$HTTP_STATUS" = "308"' in workflow
    assert "REDIRECT_TARGET" in workflow
    assert "http://34.205.255.37" not in workflow
    assert "Provision trusted TLS ingress" in workflow
    assert "playbooks/setup.yml" in workflow


def test_compose_uses_readiness_and_healthy_dependencies() -> None:
    compose = (REPO_ROOT / "docker-compose.yml").read_text()
    main = (REPO_ROOT / "apps" / "api" / "app" / "main.py").read_text()

    assert "urlopen('http://localhost:8001/ready'" in compose
    assert 'test: ["CMD", "redis-cli", "ping"]' in compose
    assert "worker_heartbeat_is_fresh_sync" in compose
    assert "dispatcher_heartbeat_is_fresh_sync" in compose
    assert "python -m app.ai_dispatcher" in compose
    assert compose.count("condition: service_healthy") >= 4
    assert compose.count("- ./.env") == 3
    assert "fetch('http://127.0.0.1:3000/')" in compose
    assert "web:\n        condition: service_healthy" in compose
    assert "app.include_router(health_router" in main


def test_readiness_clients_allow_dependency_probe_to_finish() -> None:
    services = yaml.safe_load((REPO_ROOT / "docker-compose.yml").read_text())["services"]
    api = services["api"]
    setting = api["environment"]["READINESS_CHECK_TIMEOUT_SECONDS"]
    probe_budget = float(re.search(r":-([\d.]+)", setting).group(1))
    api_health = api["healthcheck"]
    client_budget = float(re.search(r"timeout=([\d.]+)", api_health["test"][-1]).group(1))
    assert probe_budget < client_budget < float(api_health["timeout"].removesuffix("s"))

    proxy_health = services["proxy"]["healthcheck"]
    proxy_client_budget = float(re.search(r"-T ([\d.]+)", proxy_health["test"][-1]).group(1))
    nginx = (REPO_ROOT / "nginx/includes/proxy-routes.conf").read_text()
    readiness_location = nginx.split("location ~ ^/(health|ready)$ {", 1)[1].split("}", 1)[0]
    nginx_budget = float(re.search(r"proxy_read_timeout ([\d.]+)s", readiness_location).group(1))
    assert probe_budget < nginx_budget <= proxy_client_budget
    assert proxy_client_budget < float(proxy_health["timeout"].removesuffix("s"))


def test_oauth_start_and_callback_share_a_public_origin() -> None:
    compose = (REPO_ROOT / "docker-compose.yml").read_text()
    web_dockerfile = (REPO_ROOT / "apps" / "web" / "Dockerfile").read_text()
    social_buttons = (
        REPO_ROOT / "apps" / "web" / "src" / "components" / "social-login-buttons.tsx"
    ).read_text()
    ansible_vars = (
        REPO_ROOT / "ansible" / "inventory" / "group_vars" / "all.yml"
    ).read_text()

    oauth_origin = (
        "NEXT_PUBLIC_OAUTH_API_URL: "
        "${NEXT_PUBLIC_OAUTH_API_URL:-http://localhost:8001}"
    )
    assert compose.count(oauth_origin) == 2
    assert "ARG NEXT_PUBLIC_OAUTH_API_URL=" in web_dockerfile
    assert "getOAuthBaseUrl()" in social_buttons
    assert 'next_public_oauth_api_url: "{{ next_public_api_url }}"' in ansible_vars


def test_evaluation_browser_routes_have_no_public_http_fallback() -> None:
    next_config = (REPO_ROOT / "apps" / "web" / "next.config.mjs").read_text()
    api_client = (REPO_ROOT / "apps" / "web" / "src" / "lib" / "api.ts").read_text()
    production = (
        REPO_ROOT / "ansible" / "inventory" / "group_vars" / "production.yml"
    ).read_text()

    assert "34.205.255.37" not in next_config
    assert "34.205.255.37" not in api_client
    assert 'server_name: "api.coditent.app"' in production
    assert 'frontend_url: "https://coditent.app"' in production
    assert 'cors_origins: "https://coditent.app,https://www.coditent.app"' in production
    assert 'next_public_api_url: "/api-proxy"' in (
        REPO_ROOT / "ansible" / "inventory" / "group_vars" / "all.yml"
    ).read_text()
    assert 'window.location.protocol === "https:"' in api_client
    assert '"wss:"' in api_client


def test_production_automates_trusted_tls_and_redirects_http() -> None:
    tasks = (REPO_ROOT / "ansible" / "roles" / "nginx" / "tasks" / "main.yml").read_text()
    template = (
        REPO_ROOT / "ansible" / "roles" / "nginx" / "templates" / "coditent.conf.j2"
    ).read_text()

    assert "certbot" in tasks
    assert "--webroot" in tasks
    assert "certbot.timer" in tasks
    assert "renewal-hooks/deploy/reload-nginx" in tasks
    assert "nginx_render_tls_enabled: false" in tasks
    assert "nginx_tls_enabled: false" not in tasks
    assert "label=com.docker.compose.service=proxy" in tasks
    assert "name=^/coditent-proxy$" in tasks
    assert "publish=80" in tasks
    assert "publish=443" in tasks
    assert "Stop containers conflicting with host Nginx before TLS bootstrap" in tasks
    assert "Capture recent Nginx service journal after bootstrap failure" in tasks
    assert "Verify the public ACME HTTP-01 route before requesting a certificate" in tasks
    assert 'path: "{{ letsencrypt_webroot }}/.well-known/acme-challenge"' in tasks
    assert 'dest: "{{ letsencrypt_webroot }}/.well-known/acme-challenge/coditent-' in tasks
    assert 'url: "http://{{ server_name }}/.well-known/acme-challenge/' in tasks
    assert "--preferred-challenges" in tasks
    assert "--cert-name" in tasks
    assert "return 308 https://$host$request_uri" in template
    assert "ssl_certificate {{ tls_certificate_path }}" in template
    assert "Strict-Transport-Security" in template
    assert "upgrade-insecure-requests" in template
    assert "proxy_set_header Upgrade $http_upgrade" in template
    assert "Activate and verify the final Nginx configuration" in tasks

    configure_env = (
        REPO_ROOT / "ansible" / "roles" / "coditent" / "tasks" / "configure_env.yml"
    ).read_text()
    assert "Reconcile non-secret production settings" in configure_env
    assert "key: COMPOSE_FILE" in configure_env
    assert "key: FRONTEND_URL" in configure_env
    assert "key: CORS_ORIGINS" in configure_env
    assert "key: ACCESS_TOKEN_COOKIE_SECURE" in configure_env


def test_ansible_declares_collection_and_syntax_check() -> None:
    requirements = (REPO_ROOT / "ansible" / "requirements.yml").read_text()
    workflow = (REPO_ROOT / ".github" / "workflows" / "deploy.yml").read_text()
    deploy_helper = (REPO_ROOT / "ansible" / "deploy.sh").read_text()

    assert "community.general" in requirements
    assert "bash deploy.sh check" in workflow
    for playbook in ("setup.yml", "deploy.yml", "restart.yml", "rollback.yml"):
        assert f"playbooks/{playbook}" in deploy_helper


def test_application_images_run_as_unprivileged_users() -> None:
    api_dockerfile = (REPO_ROOT / "apps" / "api" / "Dockerfile").read_text()
    web_dockerfile = (REPO_ROOT / "apps" / "web" / "Dockerfile").read_text()
    compose = (REPO_ROOT / "docker-compose.yml").read_text()

    assert "USER 10001:10001" in api_dockerfile
    assert "USER 10001:10001" in web_dockerfile
    assert "npm run build" in web_dockerfile
    assert 'CMD ["node", "server.js"]' in web_dockerfile
    assert compose.count("no-new-privileges:true") >= 3
    assert compose.count("cap_drop:") >= 3


def test_web_runtime_and_framework_are_on_supported_patched_lines() -> None:
    web_dockerfile = (REPO_ROOT / "apps" / "web" / "Dockerfile").read_text()
    package = json.loads((REPO_ROOT / "apps" / "web" / "package.json").read_text())

    assert web_dockerfile.count("FROM node:22-alpine") == 3
    assert package["engines"]["node"] == ">=22.0.0"
    assert package["dependencies"]["next"] == "16.3.8"
    assert package["dependencies"]["react"] == "19.3.0"
    assert package["dependencies"]["react-dom"] == "19.3.0"
    assert package["dependencies"]["axios"] == "1.20.0"
