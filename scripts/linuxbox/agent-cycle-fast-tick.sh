#!/usr/bin/env bash
# DEPRECATED 2026-08-01 — fast lane removed. Sync only (no LLM).
# Crontab should use install-agent-cycle-think-only.sh (think tick calls agent-cycle-sync.sh).
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
REPO="${HOME}/agent-dump"
SYNC="${REPO}/scripts/linuxbox/agent-cycle-sync.sh"
[[ -x "${SYNC}" ]] || SYNC="${HOME}/bin/agent-cycle-sync.sh"
if [[ -x "${SYNC}" ]]; then
  exec bash "${SYNC}"
fi
exit 0
