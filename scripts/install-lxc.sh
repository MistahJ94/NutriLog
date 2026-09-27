#!/usr/bin/env bash
set -euo pipefail

# Compatibility entry point for cloned/manual installs.
# The public installer is the repository-root install.sh.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "${SCRIPT_DIR}/install.sh" "$@"
