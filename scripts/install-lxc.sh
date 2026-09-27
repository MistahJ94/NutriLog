#!/usr/bin/env bash
set -euo pipefail

# Compatibility entry point for manually prepared Debian LXCs.
# For a Proxmox-host deployment, use the repository-root install.sh.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "${SCRIPT_DIR}/install/nutrilog-install.sh" "$@"
