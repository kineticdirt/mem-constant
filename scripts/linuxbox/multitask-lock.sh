#!/usr/bin/env bash
# Multitask shared-state lock CLI (agents + humans).
# Usage:
#   multitask-lock.sh acquire RESOURCE --holder ID [--wait|--no-wait] [--note TEXT] [--stale-sec N]
#   multitask-lock.sh release RESOURCE --holder ID [--force]
#   multitask-lock.sh heartbeat RESOURCE --holder ID
#   multitask-lock.sh status [RESOURCE]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NODE_BIN="${NODE_BIN:-node}"
JS="$ROOT/scripts/linuxbox/multitask-lock-cli.js"

if [[ ! -f "$JS" ]]; then
  echo "missing $JS" >&2
  exit 2
fi

exec "$NODE_BIN" "$JS" "$@"
