#!/usr/bin/env bash
# Run ON linuxbox (or via SSH). Non-interactive user gateway + 1m cron.
set -euo pipefail

source "${HOME}/.bashrc" 2>/dev/null || true

HERMES_BIN="${HOME}/.local/bin/hermes"
WORKDIR="${HOME}/agent-dump"

mkdir -p "${WORKDIR}/agents"
if [[ ! -f "${WORKDIR}/agents/CURRENT_TASK.md" ]]; then
  printf '%s\n' '# Hermes task inbox' 'Idle — add a task when ready.' > "${WORKDIR}/agents/CURRENT_TASK.md"
fi

printf "Y\nY\n" | "${HERMES_BIN}" gateway install
loginctl enable-linger "${USER}" 2>/dev/null || true

if ! "${HERMES_BIN}" cron list 2>/dev/null | grep -q agent-cycle; then
  "${HERMES_BIN}" cron create "every 1m" \
    "Read agents/CURRENT_TASK.md in the workdir. If it says idle or is empty, reply IDLE only. Otherwise advance the task in one small step; reply TASK_COMPLETE when fully done." \
    --workdir "${WORKDIR}" \
    --name agent-cycle \
    --deliver local
fi

echo "Gateway: $(systemctl --user is-active hermes-gateway 2>/dev/null || echo unknown)"
echo "Set OPENROUTER_API_KEY in ~/.hermes/.env and model openrouter/owl-alpha in config.yaml"
