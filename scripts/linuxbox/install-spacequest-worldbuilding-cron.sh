#!/usr/bin/env bash
# Run ON linuxbox: weekly Hermes lane that drafts SpaceQuest worldbuilding reports.
# Drafts only -> campaigns/spacequest/reports/. No canon edits, no deploy.
set -euo pipefail

source "${HOME}/.bashrc" 2>/dev/null || true
HERMES_BIN="${HOME}/.local/bin/hermes"
REPO="${HOME}/agent-dump"

if [[ ! -x "${HERMES_BIN}" ]]; then
  echo "ERROR: hermes not found at ${HERMES_BIN}" >&2
  exit 1
fi
if [[ ! -d "${REPO}/campaigns/spacequest" ]]; then
  echo "ERROR: ${REPO}/campaigns/spacequest not found (git pull first?)" >&2
  exit 1
fi

HERMES_PROMPT="$(cat <<'EOF'
Workdir /home/abhinav/agent-dump. Read agents/SPACEQUEST_WORLDBUILDING_TASK.md first and follow it exactly.
Then read campaigns/spacequest/reports/README.md and the latest *-worldbuilding-open-threads.md.
Pick the single highest-priority UNRESOLVED open thread (skip anything already drafted in reports/).
Write ONE new file campaigns/spacequest/reports/<YYYY-MM-DD>-<slug>.md (today UTC), max 800 words,
evidence-anchored (cite the source files under campaigns/spacequest/), design-level only (this is an
erotic-horror campaign — NO explicit prose; structure, factions, arcs, continuity only).
Append a one-line row for the new report to the index table in campaigns/spacequest/reports/README.md.
Do NOT edit anything under campaigns/spacequest/story, lore, characters, or discord-export. Drafts only.
Do NOT deploy anything or touch production. Do NOT commit/push unless explicitly enabled.
EOF
)"

delete_if_exists() {
  local name="$1"
  local id
  id="$("${HERMES_BIN}" cron list 2>/dev/null | grep -E "${name}" | head -1 | awk '{print $1}')" || true
  if [[ -n "${id}" ]]; then
    "${HERMES_BIN}" cron delete "${id}" 2>/dev/null || true
  fi
}

delete_if_exists "spacequest-worldbuilding-review"

"${HERMES_BIN}" cron create "30 9 * * 6" "${HERMES_PROMPT}" \
  --name spacequest-worldbuilding-review \
  --workdir "${REPO}" \
  --deliver local

echo "Installed spacequest-worldbuilding-review (Sat 09:30 UTC)."
echo "Reports: ${REPO}/campaigns/spacequest/reports/"
echo "Config:  ${REPO}/agents/SPACEQUEST_WORLDBUILDING_TASK.md"
