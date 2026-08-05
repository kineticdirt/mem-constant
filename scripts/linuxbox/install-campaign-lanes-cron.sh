#!/usr/bin/env bash
# Run ON linuxbox: weekly Hermes backup crons for campaign report lanes.
# Primary work happens via agent-cycle + agents/CURRENT_TASK.md (every 1m).
set -euo pipefail

source "${HOME}/.bashrc" 2>/dev/null || true
HERMES_BIN="${HOME}/.local/bin/hermes"
REPO="${HOME}/agent-dump"

delete_if_exists() {
  local name="$1"
  local id
  id="$("${HERMES_BIN}" cron list 2>/dev/null | grep -E "${name}" | head -1 | awk '{print $1}')" || true
  if [[ -n "${id}" ]]; then
    "${HERMES_BIN}" cron delete "${id}" 2>/dev/null || true
  fi
}

SPACEQUEST_PROMPT="$(cat <<'EOF'
Workdir /home/abhinav/agent-dump. Read agents/SPACEQUEST_WORLDBUILDING_TASK.md and campaigns/spacequest/reports/progress.md.
Complete ONE unchecked item if any remain. Drafts only under campaigns/spacequest/reports/. No canon edits. No deploy.
EOF
)"

NYC_PROMPT="$(cat <<'EOF'
Workdir /home/abhinav/agent-dump. Read agents/NYC_MAFIA_DND_TASK.md and campaigns/nyc-mafia-dnd/reports/progress.md.
Complete ONE unchecked item if any remain. Drafts only under campaigns/nyc-mafia-dnd/reports/. No canon edits. No deploy.
EOF
)"

delete_if_exists "spacequest-worldbuilding-review"
delete_if_exists "nyc-mafia-dnd-worldbuilding-review"

"${HERMES_BIN}" cron create "30 9 * * 6" "${SPACEQUEST_PROMPT}" \
  --name spacequest-worldbuilding-review \
  --workdir "${REPO}" \
  --deliver local

"${HERMES_BIN}" cron create "0 10 * * 6" "${NYC_PROMPT}" \
  --name nyc-mafia-dnd-worldbuilding-review \
  --workdir "${REPO}" \
  --deliver local

echo "Installed weekly campaign review crons (Sat)."
echo "Primary: agent-cycle reads agents/CURRENT_TASK.md every 1m."
