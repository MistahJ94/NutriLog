#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${NUTRILOG_APP_DIR:-/opt/nutrilog}"
ENV_FILE="${NUTRILOG_ENV_FILE:-/etc/nutrilog/nutrilog.env}"
SERVICE_NAME="nutrilog"
HEALTH_URL="${NUTRILOG_HEALTH_URL:-http://127.0.0.1:3001/api/health}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run update as root."
  exit 1
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "NutriLog installation not found at ${APP_DIR}."
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}."
  exit 1
fi

source "${ENV_FILE}"

cd "${APP_DIR}"

if [[ "$(git rev-parse --is-inside-work-tree 2>/dev/null || true)" != "true" ]]; then
  echo "${APP_DIR} is not a valid Git repository."
  exit 1
fi

echo "[1/6] Updating source..."
git fetch --prune origin main
git checkout --quiet main
git reset --hard origin/main

echo "[2/6] Installing dependencies..."
npm ci

echo "[3/6] Applying database schema..."
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f db/schema.sql

echo "[4/6] Building NutriLog..."
npm run build
npm prune --omit=dev

echo "[5/6] Restarting service..."
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" >/dev/null
systemctl restart "${SERVICE_NAME}"

echo "[6/6] Checking service health..."
for attempt in {1..15}; do
  if curl -fsS --max-time 3 "${HEALTH_URL}" >/dev/null; then
    echo "NutriLog health check passed."
    echo
    echo "NutriLog update complete."
    systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,12p'
    exit 0
  fi
  sleep 1
done

echo "NutriLog restarted but the health check failed."
systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,20p' || true
journalctl -u "${SERVICE_NAME}" -n 30 --no-pager || true
exit 1
