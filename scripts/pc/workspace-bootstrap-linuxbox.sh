#!/usr/bin/env bash
# Workspace open bootstrap — sync linuxbox secrets if secrets/linuxbox.env exists.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${REPO}/secrets/linuxbox.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[linuxbox] No secrets/linuxbox.env — skip sync (cp secrets/linuxbox.env.example when ready)."
  exit 0
fi

echo "[linuxbox] Syncing secrets to potato…"
bash "${REPO}/scripts/pc/sync-linuxbox-secrets.sh"
