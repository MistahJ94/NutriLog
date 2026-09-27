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

CURRENT_COMMIT="$(git rev-parse HEAD)"
CURRENT_SHORT="$(git rev-parse --short HEAD)"
CURRENT_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")"

echo "[1/6] Checking for updates..."
git fetch --prune origin main
REMOTE_COMMIT="$(git rev-parse origin/main)"
REMOTE_SHORT="$(git rev-parse --short origin/main)"

if [[ "${CURRENT_COMMIT}" == "${REMOTE_COMMIT}" ]]; then
  echo
  echo "NutriLog is already up to date."
  echo "Version: ${CURRENT_VERSION} (${CURRENT_SHORT})"
  exit 0
fi

REMOTE_VERSION="$(git show "origin/main:package.json" 2>/dev/null | node -e 'let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).version)}catch{console.log("unknown")}})' || echo "unknown")"

printf '\nUpdate available!\n'
printf 'Previous: %s (%s)\n' "${CURRENT_VERSION}" "${CURRENT_SHORT}"
printf 'New:      %s (%s)\n\n' "${REMOTE_VERSION}" "${REMOTE_SHORT}"

echo "[2/6] Updating source..."
git checkout --quiet main
git reset --hard origin/main

echo "[3/6] Installing dependencies..."
npm ci

echo "[4/6] Applying database schema..."
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f db/schema.sql

echo "[5/6] Building NutriLog..."
npm run build
npm prune --omit=dev

echo "[6/6] Restarting service and checking health..."
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" >/dev/null
systemctl restart "${SERVICE_NAME}"

echo "NutriLog service restarted. Waiting for the health check..."

for attempt in {1..15}; do
  if curl -fsS --max-time 3 "${HEALTH_URL}" >/dev/null; then
    echo "NutriLog health check passed."
    echo
    echo "NutriLog update complete."
    echo "Previous: ${CURRENT_VERSION} (${CURRENT_SHORT})"
    echo "Current:  ${REMOTE_VERSION} (${REMOTE_SHORT})"
    systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,12p'
    exit 0
  fi
  sleep 1
done

echo "NutriLog restarted but the health check failed."
systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,20p' || true
journalctl -u "${SERVICE_NAME}" -n 30 --no-pager || true
exit 1
