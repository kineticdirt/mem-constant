#!/usr/bin/env bash
# Run ON linuxbox. Hermes cron: think only (crontab owns real ticks — see install-agent-cycle-think-only.sh).
set -euo pipefail

source "${HOME}/.bashrc" 2>/dev/null || true
export PATH="${HOME}/.local/bin:${PATH}"

HERMES_BIN="${HOME}/.local/bin/hermes"
WORKDIR="${HOME}/agent-dump"

THINK_PROMPT='Think lane (profile: think, owl-alpha). Workdir: agent-dump.

1. Read agents/CURRENT_TASK.md — follow lane rotation. Complete exactly ONE unchecked campaign/portfolio/blog/nousagent/dashboard-meta step, then stop.
2. Sync/git/inbox consume runs deterministically before LLM (agent-cycle-sync.sh) — do NOT git pull in shell unless debugging.
3. Campaign priority: SpaceQuest progress.md, else NYC Mafia progress.md, else portfolio (USB), else blog, else NousAgent, else one LINUXBOX_DASHBOARD_BACKLOG.md item (profile meta).
4. If blocked and need human judgment (not shell approval), append ONE entry to agents/state/human-inbox.json "open" (id, at, from lane name, question, required context with lore path). Do not guess. NEVER replace the whole file with a bare JSON array — keep {"open":[],"answered":[]} shape; run python3 scripts/linuxbox/human-inbox-normalize.py after editing.
5. If all lanes empty: reply IDLE only.'

remove_cron_by_name() {
  local name="$1"
  local id=""
  local raw
  raw=$("${HERMES_BIN}" cron list 2>/dev/null || true)
  id=$(echo "${raw}" | awk -v n="${name}" '
    /^[[:space:]]*[0-9a-f]{12}/ { gsub(/^[[:space:]]+/, ""); id=$1; sub(/ .*/, "", id) }
    $0 ~ "Name:[[:space:]]*" n "[[:space:]]*$" { if (id != "") { print id; exit } }
  ')
  if [[ -n "${id}" ]]; then
    echo "Removing cron ${name} (${id})"
    "${HERMES_BIN}" cron remove "${id}" 2>/dev/null || "${HERMES_BIN}" cron delete "${id}" 2>/dev/null || true
  else
    echo "No cron named ${name}"
  fi
}

remove_cron_by_name agent-cycle
remove_cron_by_name agent-cycle-fast
remove_cron_by_name agent-cycle-think

# Fast lane removed 2026-08-01 — pause any resurrected fast job
if "${HERMES_BIN}" cron list 2>/dev/null | grep -q "agent-cycle-fast"; then
  id=$("${HERMES_BIN}" cron list 2>/dev/null | grep -B1 "Name:[[:space:]]*agent-cycle-fast" | grep -oE '[0-9a-f]{12}' | head -1 || true)
  if [[ -n "${id}" ]]; then
    echo "Pausing agent-cycle-fast (${id})"
    "${HERMES_BIN}" cron pause "${id}" 2>/dev/null || true
  fi
fi

if ! "${HERMES_BIN}" cron list 2>/dev/null | grep -q "agent-cycle-think"; then
  "${HERMES_BIN}" cron create "every 1m" "${THINK_PROMPT}" \
    --workdir "${WORKDIR}" \
    --name agent-cycle-think \
    --profile think \
    --deliver local
fi

echo ""
"${HERMES_BIN}" cron list 2>/dev/null | grep -E 'agent-cycle|Name:|Last run:|Schedule:' || true
echo "Done: agent-cycle-think (Hermes cron; prefer crontab via install-agent-cycle-think-only.sh). Fast lane removed."
