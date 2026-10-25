#!/usr/bin/env bash
# Deploy one immutable, CI-built API image on the production host.
# This script is invoked by AWS Systems Manager as root.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/coditent}"
IMAGE_URI="${1:-}"
EXPECTED_COMMIT="${2:-}"
AWS_REGION="${3:-}"
COMPOSE_SERVICES=(vault redis api worker ai-dispatcher)
IMAGE_SERVICES=(api worker ai-dispatcher)
ENV_FILE="$APP_DIR/.env"
PREVIOUS_IMAGE_FILE="$APP_DIR/.previous-api-image"
WAF_SOURCE="$APP_DIR/ansible/roles/nginx/templates/modsecurity-coditent.conf.j2"
WAF_DESTINATION="/etc/nginx/modsecurity-coditent.conf"

if [[ ! "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: deployment requires the tested 40-character commit SHA" >&2
  exit 2
fi

if [[ ! "$IMAGE_URI" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/[a-zA-Z0-9._/-]+:${EXPECTED_COMMIT}$ ]]; then
  echo "ERROR: image must be an ECR image tagged with the tested commit SHA" >&2
  exit 2
fi

if [[ ! "$AWS_REGION" =~ ^[a-z]{2}(-gov)?-[a-z]+-[0-9]+$ ]]; then
  echo "ERROR: invalid AWS region" >&2
  exit 2
fi

cd "$APP_DIR"

DEPLOYED_COMMIT="$(git -c safe.directory="$APP_DIR" rev-parse HEAD)"
if [[ "$DEPLOYED_COMMIT" != "$EXPECTED_COMMIT" ]]; then
  echo "ERROR: checked-out commit does not match tested commit" >&2
  exit 3
fi

if [[ ! -s "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE is missing; production secrets must already exist" >&2
  exit 4
fi

# Fail before changing the release image or host ingress if Vault is not ready.
source scripts/vault-env.sh
vault_load_env --production
export CODITENT_API_IMAGE="$IMAGE_URI"
export COMPOSE_FILE="docker-compose.yml:docker-compose.production.yml"
docker compose config --quiet

reconcile_nginx_waf() {
  local backup=""
  local candidate=""
  local had_existing=false

  if [[ ! -s "$WAF_SOURCE" ]]; then
    echo "ERROR: tested ModSecurity configuration is missing: $WAF_SOURCE" >&2
    return 1
  fi
  if cmp --silent "$WAF_SOURCE" "$WAF_DESTINATION"; then
    return 0
  fi

  candidate="$(mktemp /etc/nginx/modsecurity-coditent.conf.XXXXXX)"
  backup="$(mktemp /tmp/coditent-modsecurity-backup.XXXXXX)"
  if [[ -e "$WAF_DESTINATION" ]]; then
    cp --preserve=mode,ownership,timestamps "$WAF_DESTINATION" "$backup"
    had_existing=true
  fi
  install -o root -g root -m 0644 "$WAF_SOURCE" "$candidate"
  mv -f "$candidate" "$WAF_DESTINATION"

  if nginx -t && systemctl reload nginx; then
    rm -f "$backup"
    echo "Reconciled and reloaded the production ModSecurity configuration"
    return 0
  fi

  echo "ERROR: new ModSecurity configuration failed validation or reload; restoring previous configuration" >&2
  if [[ "$had_existing" == true ]]; then
    mv -f "$backup" "$WAF_DESTINATION"
  else
    rm -f "$WAF_DESTINATION" "$backup"
  fi
  nginx -t >/dev/null 2>&1 && systemctl reload nginx >/dev/null 2>&1 || true
  return 1
}

echo "=== Reconciling host Nginx WAF configuration ==="
reconcile_nginx_waf

REGISTRY="${IMAGE_URI%%/*}"
echo "=== Authenticating the EC2 instance role to ECR ==="
aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "$REGISTRY"

PREVIOUS_IMAGE="$(
  docker ps \
    --filter label=com.docker.compose.service=api \
    --format '{{.Image}}' | head -n 1
)"
if [[ -n "$PREVIOUS_IMAGE" && "$PREVIOUS_IMAGE" != "$IMAGE_URI" ]]; then
  printf '%s\n' "$PREVIOUS_IMAGE" > "$PREVIOUS_IMAGE_FILE"
  chmod 0600 "$PREVIOUS_IMAGE_FILE"
fi

set_image_in_env() {
  local image="$1"
  local temporary
  temporary="$(mktemp "$APP_DIR/.env.image.XXXXXX")"
  awk -v replacement="CODITENT_API_IMAGE=$image" '
    !/^CODITENT_API_IMAGE=/ { print }
    END { print replacement }
  ' "$ENV_FILE" > "$temporary"
  chown --reference="$ENV_FILE" "$temporary"
  chmod --reference="$ENV_FILE" "$temporary"
  mv "$temporary" "$ENV_FILE"
}

set_image_in_env "$IMAGE_URI"
export CODITENT_API_IMAGE="$IMAGE_URI"
export COMPOSE_FILE="docker-compose.yml:docker-compose.production.yml"

echo "=== Pulling the tested API image ==="
docker compose pull "${IMAGE_SERVICES[@]}"

echo "=== Starting production backend services without building ==="
docker compose up -d --no-build --remove-orphans --force-recreate "${COMPOSE_SERVICES[@]}"

echo "=== Waiting for application readiness ==="
for attempt in {1..30}; do
  if curl --silent --show-error --fail --max-time 8 \
    http://127.0.0.1:8001/ready >/dev/null; then
    docker image prune -f >/dev/null
    echo "Deployment succeeded for $EXPECTED_COMMIT"
    exit 0
  fi
  echo "Application is not ready (attempt $attempt/30); retrying in 5 seconds ..."
  sleep 5
done

echo "ERROR: application failed its readiness check" >&2
docker compose ps >&2 || true
docker compose logs --tail=200 api worker ai-dispatcher >&2 || true

if [[ -s "$PREVIOUS_IMAGE_FILE" ]]; then
  PREVIOUS_IMAGE="$(head -n 1 "$PREVIOUS_IMAGE_FILE")"
  if [[ "$PREVIOUS_IMAGE" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/ ]]; then
    echo "=== Restoring the previous API image ===" >&2
    set_image_in_env "$PREVIOUS_IMAGE"
    export CODITENT_API_IMAGE="$PREVIOUS_IMAGE"
    docker compose up -d --no-build --remove-orphans --force-recreate "${COMPOSE_SERVICES[@]}" || true
  fi
fi

exit 1
