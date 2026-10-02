from __future__ import annotations

import os
import subprocess
from pathlib import Path


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


def test_compose_uses_readiness_and_healthy_dependencies() -> None:
    compose = (REPO_ROOT / "docker-compose.yml").read_text()
    main = (REPO_ROOT / "apps" / "api" / "app" / "main.py").read_text()

    assert "urlopen('http://localhost:8001/ready'" in compose
    assert 'test: ["CMD", "redis-cli", "ping"]' in compose
    assert "worker_heartbeat_is_fresh_sync" in compose
    assert compose.count("condition: service_healthy") >= 4
    assert "app.include_router(health_router" in main


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
    assert 'CMD ["npm", "run", "start"' in web_dockerfile
    assert compose.count("no-new-privileges:true") >= 3
    assert compose.count("cap_drop:") >= 3
