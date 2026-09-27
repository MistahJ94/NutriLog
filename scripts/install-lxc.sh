#!/usr/bin/env bash
set -euo pipefail

# Compatibility entry point for manually prepared Debian LXCs.
# For a Proxmox-host deployment, use the repository-root install.sh.

VIRT="$(systemd-detect-virt 2>/dev/null || true)"
if [[ "$VIRT" != "lxc" ]]; then
  echo "ERROR: NutriLog's LXC installer must run inside a Proxmox LXC."
  echo "Detected virtualization environment: ${VIRT:-none}"
  echo "Use the repository-root install.sh from the Proxmox host instead."
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "${SCRIPT_DIR}/install/nutrilog-install.sh" "$@"
