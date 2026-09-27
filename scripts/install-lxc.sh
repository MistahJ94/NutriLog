#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/nutrilog"
ETC_DIR="/etc/nutrilog"
REPO_URL="https://github.com/MistahJ94/NutriLog.git"
BRANCH="main"
DB_NAME="nutrilog"
DB_USER="nutrilog"
DB_PASSWORD="$(openssl rand -hex 24)"
APP_USER="nutrilog"

if [[ "${EUID}" -ne 0 ]]; then echo "Run as root."; exit 1; fi
if [[ -f /etc/os-release ]]; then . /etc/os-release; else echo "Unsupported OS."; exit 1; fi
if [[ "${ID}" != "debian" && "${ID_LIKE:-}" != *debian* ]]; then echo "NutriLog installer currently targets Debian-based LXCs."; exit 1; fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git openssl postgresql postgresql-client

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

id "${APP_USER}" >/dev/null 2>&1 || useradd --system --home "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
mkdir -p "${APP_DIR}" "${ETC_DIR}"
chown "${APP_USER}:${APP_USER}" "${APP_DIR}"

systemctl enable --now postgresql

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
  END IF;
END
$$;
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
SQL

if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" fetch --prune origin
  git -C "${APP_DIR}" checkout --quiet "${BRANCH}"
  git -C "${APP_DIR}" reset --hard "origin/${BRANCH}"
else
  rm -rf "${APP_DIR}"
  git clone --branch "${BRANCH}" --single-branch "${REPO_URL}" "${APP_DIR}"
fi
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

cat > "${ETC_DIR}/nutrilog.env" <<EOF
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}
CORS_ORIGIN=http://127.0.0.1:3001
DB_POOL_SIZE=10
EOF
chown root:${APP_USER} "${ETC_DIR}/nutrilog.env"
chmod 640 "${ETC_DIR}/nutrilog.env"

psql "postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}" -v ON_ERROR_STOP=1 -f "${APP_DIR}/db/schema.sql"

cd "${APP_DIR}"
runuser -u "${APP_USER}" -- npm ci
runuser -u "${APP_USER}" -- npm run build

install -m 0755 "${APP_DIR}/scripts/update.sh" /usr/bin/update
install -m 0644 "${APP_DIR}/deploy/nutrilog.service" /etc/systemd/system/nutrilog.service

systemctl daemon-reload
systemctl enable --now nutrilog

echo
echo "NutriLog installed."
echo "Application: http://127.0.0.1:3001"
echo "Update command: update"
