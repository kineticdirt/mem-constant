#!/usr/bin/env bash
# Run ON linuxbox: daily RSS + Hermes web digest (no Vercel, no dashboard).
set -euo pipefail

source "${HOME}/.bashrc" 2>/dev/null || true
HERMES_BIN="${HOME}/.local/bin/hermes"
REPO="${HOME}/agent-dump"
HERMES_SCRIPTS="${HOME}/.hermes/scripts"

mkdir -p "${HERMES_SCRIPTS}"
mkdir -p "${REPO}/reports/situation-monitor"
mkdir -p "${REPO}/agents"

install -m 755 "${REPO}/scripts/situation_monitor/run-daily-brief.sh" "${HERMES_SCRIPTS}/situation-rss.sh"

if [[ ! -f "${REPO}/scripts/situation_monitor/sources.json" ]]; then
  cp "${REPO}/scripts/situation_monitor/sources.example.json" \
    "${REPO}/scripts/situation_monitor/sources.json"
fi

HERMES_PROMPT="$(cat <<'EOF'
Workdir is the agent-dump repo. Read agents/SITUATION_WATCHLIST.md. If reports/situation-monitor/LATEST-BRIEF.md exists, read it for RSS headlines context. For each watchlist topic (max 5), run web_search once (focus last 48 hours). Write reports/situation-monitor/hermes-digest-YYYYMMDD.md (today UTC date in filename) with sections: Executive summary (max 6 bullets), By topic (bullets + source URLs), Watchlist next (3 items). Use web_search only, not browser. Under 1200 words. If nothing changed for a topic, one line saying so.
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

delete_if_exists "situation-rss"
delete_if_exists "situation-hermes"

"${HERMES_BIN}" cron create "0 8 * * *" "" \
  --name situation-rss \
  --workdir "${REPO}" \
  --script situation-rss.sh \
  --no-agent \
  --deliver local

"${HERMES_BIN}" cron create "0 9 * * *" "${HERMES_PROMPT}" \
  --name situation-hermes \
  --workdir "${REPO}" \
  --profile think \
  --deliver local

echo "Installed situation-rss (08:00 UTC) and situation-hermes (09:00 UTC)."
echo "Edit topics: ${REPO}/agents/SITUATION_WATCHLIST.md"
echo "List jobs: hermes cron list"
