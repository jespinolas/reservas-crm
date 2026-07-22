#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="${SMOKE_PROJECT_NAME:-reservas-crm-smoke-$(date +%s)}"
HTTP_PORT="${SMOKE_HTTP_PORT:-18080}"
HTTPS_PORT="${SMOKE_HTTPS_PORT:-18443}"
KEEP_STACK="${SMOKE_KEEP_STACK:-0}"
TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-180}"

ENV_FILE="$(mktemp "${TMPDIR:-/tmp}/reservas-crm-smoke-env.XXXXXX")"
OVERRIDE_FILE="$(mktemp "${TMPDIR:-/tmp}/reservas-crm-smoke-compose.XXXXXX.yml")"

cleanup() {
  local exit_code=$?
  if [[ "${KEEP_STACK}" != "1" ]]; then
    docker compose \
      -p "${PROJECT_NAME}" \
      --env-file "${ENV_FILE}" \
      -f "${ROOT_DIR}/docker-compose.yml" \
      -f "${OVERRIDE_FILE}" \
      down -v --remove-orphans >/dev/null 2>&1 || true
  else
    echo "[smoke] Keeping stack '${PROJECT_NAME}' for inspection"
  fi
  rm -f "${ENV_FILE}" "${OVERRIDE_FILE}"
  exit "${exit_code}"
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[smoke] Missing required command: $1" >&2
    exit 1
  fi
}

random_hex() {
  openssl rand -hex "$1"
}

random_base64() {
  openssl rand -base64 "$1"
}

require_command curl
require_command docker
require_command openssl

if ! docker compose version >/dev/null 2>&1; then
  echo "[smoke] Docker Compose is not available through 'docker compose'" >&2
  exit 1
fi

cat >"${ENV_FILE}" <<ENV
APP_BASE_URL=https://localhost:${HTTPS_PORT}
DOMAIN=localhost
POSTGRES_PASSWORD=$(random_hex 24)
DATABASE_URL=postgresql://postgres:unused-by-compose@postgres:5432/reservas_crm
BETTER_AUTH_SECRET=$(random_base64 32)
ENCRYPTION_KEY=$(random_base64 32)
META_WEBHOOK_VERIFY_TOKEN=$(random_hex 32)
META_GRAPH_API_VERSION=v25.0
ALLOW_SIGNUP=true
ENV

cat >"${OVERRIDE_FILE}" <<YAML
services:
  caddy:
    ports:
      - "127.0.0.1:${HTTP_PORT}:80"
      - "127.0.0.1:${HTTPS_PORT}:443"
YAML

compose() {
  docker compose \
    -p "${PROJECT_NAME}" \
    --env-file "${ENV_FILE}" \
    -f "${ROOT_DIR}/docker-compose.yml" \
    -f "${OVERRIDE_FILE}" \
    "$@"
}

echo "[smoke] Project: ${PROJECT_NAME}"
echo "[smoke] HTTPS health URL: https://localhost:${HTTPS_PORT}/api/health"
echo "[smoke] Building and starting Docker Compose stack"
compose up --build -d

deadline=$((SECONDS + TIMEOUT_SECONDS))
until curl -fsSk "https://localhost:${HTTPS_PORT}/api/health" >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then
    echo "[smoke] /api/health did not become ready within ${TIMEOUT_SECONDS}s" >&2
    echo "[smoke] Compose status:" >&2
    compose ps >&2 || true
    echo "[smoke] App logs:" >&2
    compose logs --no-color app >&2 || true
    echo "[smoke] Caddy logs:" >&2
    compose logs --no-color caddy >&2 || true
    echo "[smoke] Postgres logs:" >&2
    compose logs --no-color postgres >&2 || true
    exit 1
  fi
  sleep 3
done

echo "[smoke] /api/health passed"
echo "[smoke] Migration evidence:"
compose logs --no-color app | grep -F "[migrate] migraciones aplicadas" | tail -n 1
echo "[smoke] Fresh install smoke test passed"
