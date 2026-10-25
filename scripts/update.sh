#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${NUTRILOG_APP_DIR:-/opt/nutrilog}"
ENV_FILE="${NUTRILOG_ENV_FILE:-/etc/nutrilog/nutrilog.env}"
SERVICE_NAME="nutrilog"
APP_USER="nutrilog"
APP_GROUP="nutrilog"
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

if ! id "${APP_USER}" >/dev/null 2>&1; then
  echo "Missing application service user: ${APP_USER}" >&2
  exit 1
fi

# Do not change ownership recursively: installations may contain local backups.
run_app() { runuser -u "${APP_USER}" -- "$@"; }

# Verify the service account can update this checkout before changing any source files.
# A previous root-run updater may have left Git metadata, tracked files, or
# npm installation metadata unreadable by the application user.
preflight_access() {
  if ! run_app git -C "${APP_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Git checkout is inaccessible to ${APP_USER}; repair Git metadata permissions before updating." >&2
    return 1
  fi
  if ! run_app test -w "${APP_DIR}/.git" || ! run_app test -r "${APP_DIR}/package.json"; then
    echo "Application checkout is not accessible to ${APP_USER}; repair ownership deliberately before updating." >&2
    return 1
  fi
  if ! run_app bash -c '
    set -euo pipefail
    cd "$1"
    while IFS= read -r -d "" path; do
      if [[ -f "$path" && ( ! -r "$path" || ! -w "$path" ) ]]; then
        printf "Inaccessible tracked file: %s\\n" "$path" >&2
        exit 1
      fi
    done < <(git ls-files -z)
    while IFS= read -r -d "" dir; do
      if [[ ! -w "$dir" || ! -x "$dir" ]]; then
        printf "Unwritable application directory: %s\\n" "$dir" >&2
        exit 1
      fi
    done < <(find . -path ./.git -prune -o -path ./node_modules -prune -o -path ./.npm -prune -o -type d -print0)
    if [[ -e node_modules/.package-lock.json && ! -r node_modules/.package-lock.json ]]; then
      echo "npm installation metadata is unreadable by the service account." >&2
      exit 1
    fi
  ' _ "${APP_DIR}"; then
    echo "Permission preflight failed; no source update attempted." >&2
    return 1
  fi
}
preflight_access

# Keep the installed updater in sync, including on no-op updates.
refresh_updater() {
  if [[ -f "${APP_DIR}/scripts/update.sh" ]]; then
    install -m 0755 "${APP_DIR}/scripts/update.sh" /usr/bin/update
  fi
}

cd "${APP_DIR}"

if [[ "$(git rev-parse --is-inside-work-tree 2>/dev/null || true)" != "true" ]]; then
  echo "${APP_DIR} is not a valid Git repository."
  exit 1
fi

CURRENT_COMMIT="$(git rev-parse HEAD)"
CURRENT_SHORT="$(git rev-parse --short HEAD)"
CURRENT_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")"

echo "[1/6] Checking for updates..."
run_app git fetch --prune origin main
REMOTE_COMMIT="$(git rev-parse origin/main)"
REMOTE_SHORT="$(git rev-parse --short origin/main)"

if [[ "${CURRENT_COMMIT}" == "${REMOTE_COMMIT}" ]]; then
  echo
  refresh_updater
  echo "NutriLog is already up to date."
  echo "Version: ${CURRENT_VERSION} (${CURRENT_SHORT})"
  exit 0
fi

REMOTE_VERSION="$(git show "origin/main:package.json" 2>/dev/null | node -e 'let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).version)}catch{console.log("unknown")}})' || echo "unknown")"

printf '\nUpdate available!\n'
printf 'Previous: %s (%s)\n' "${CURRENT_VERSION}" "${CURRENT_SHORT}"
printf 'New:      %s (%s)\n\n' "${REMOTE_VERSION}" "${REMOTE_SHORT}"

echo "[2/6] Updating source..."
if ! run_app git diff --quiet || ! run_app git diff --cached --quiet; then
  echo "Tracked local changes detected; refusing to overwrite production files. Untracked backups are preserved." >&2
  exit 1
fi
run_app git checkout --quiet main
run_app git reset --hard origin/main

echo "[3/6] Installing dependencies..."
run_app npm ci

echo "[4/6] Applying database schema..."
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f db/schema.sql

echo "[5/6] Building NutriLog..."
run_app npm run build
run_app npm prune --omit=dev --package-lock=false

# Ensure service account can read every generated runtime artifact.
if ! run_app node -e "require('postgres'); require('fs').accessSync('dist/index.html', require('fs').constants.R_OK); require('fs').accessSync('server/index.cjs', require('fs').constants.R_OK)"; then
  echo "Runtime file/dependency access check failed." >&2
  exit 1
fi

echo "[6/6] Restarting service and checking health..."
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" >/dev/null
systemctl restart "${SERVICE_NAME}"

echo "NutriLog service restarted. Waiting for the health check..."

for attempt in {1..15}; do
  if curl -fsS --max-time 3 "${HEALTH_URL}" >/dev/null; then
    echo "NutriLog health check passed."
    refresh_updater
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
