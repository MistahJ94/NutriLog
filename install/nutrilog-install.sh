#!/usr/bin/env bash

# NutriLog in-container installer
# Called by the Proxmox build framework after the LXC is created.

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing Dependencies"
$STD apt install -y ca-certificates curl git openssl
msg_ok "Installed Dependencies"

NODE_VERSION="20" setup_nodejs
PG_VERSION="17" setup_postgresql
PG_DB_NAME="nutrilog" PG_DB_USER="nutrilog" setup_postgresql_db

msg_info "Installing NutriLog"
rm -rf /opt/nutrilog
$STD git clone --branch main --single-branch https://github.com/MistahJ94/NutriLog.git /opt/nutrilog
cd /opt/nutrilog
$STD npm ci
$STD npm run build
msg_ok "Installed NutriLog"

msg_info "Configuring NutriLog"
mkdir -p /etc/nutrilog
DB_PASSWORD="${PG_DB_PASS}"
cat <<EOF >/etc/nutrilog/nutrilog.env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://nutrilog:${DB_PASSWORD}@127.0.0.1:5432/nutrilog
CORS_ORIGIN=http://127.0.0.1:3001
DB_POOL_SIZE=10
EOF
chmod 640 /etc/nutrilog/nutrilog.env

$STD psql "postgresql://nutrilog:${DB_PASSWORD}@127.0.0.1:5432/nutrilog" -v ON_ERROR_STOP=1 -f /opt/nutrilog/db/schema.sql
msg_ok "Configured NutriLog"

msg_info "Creating Service"
cat <<EOF >/etc/systemd/system/nutrilog.service
[Unit]
Description=NutriLog Service
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=nutrilog
Group=nutrilog
WorkingDirectory=/opt/nutrilog
EnvironmentFile=/etc/nutrilog/nutrilog.env
ExecStart=/usr/bin/node /opt/nutrilog/server/index.cjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/nutrilog

[Install]
WantedBy=multi-user.target
EOF

id nutrilog >/dev/null 2>&1 || useradd --system --user-group --home /opt/nutrilog --shell /usr/sbin/nologin nutrilog
chown -R nutrilog:nutrilog /opt/nutrilog
chown root:nutrilog /etc/nutrilog/nutrilog.env
systemctl daemon-reload
systemctl enable -q --now nutrilog
install -m 0755 /opt/nutrilog/scripts/update.sh /usr/bin/update
msg_ok "Created Service"

motd_ssh
customize
cleanup_lxc
