#!/usr/bin/env bash
# Resume think-only crontab from durable ~/bin (survives git reset).
set -euo pipefail
REPO="${HOME}/agent-dump"
exec bash "${REPO}/scripts/linuxbox/install-agent-cycle-think-only.sh"
