#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${NUTRILOG_APP_DIR:-/opt/nutrilog}"
ENV_FILE="${NUTRILOG_ENV_FILE:-/etc/nutrilog/nutrilog.env}"
SERVICE_NAME="nutrilog"

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

echo "[1/5] Updating source..."
git fetch --prune origin main
git checkout --quiet main
git reset --hard origin/main

echo "[2/5] Installing production dependencies..."
npm ci --omit=dev

echo "[3/5] Applying database schema..."
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f db/schema.sql

echo "[4/5] Building NutriLog..."
npm run build

echo "[5/5] Restarting service..."
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" >/dev/null
systemctl restart "${SERVICE_NAME}"

echo
echo "NutriLog update complete."
systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,12p'
