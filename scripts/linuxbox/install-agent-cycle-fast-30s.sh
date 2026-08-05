#!/usr/bin/env bash
# DEPRECATED — use install-agent-cycle-think-only.sh (fast lane removed 2026-08-01).
set -euo pipefail
REPO="${HOME}/agent-dump"
exec bash "${REPO}/scripts/linuxbox/install-agent-cycle-think-only.sh"
