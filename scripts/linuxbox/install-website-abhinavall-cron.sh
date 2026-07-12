#!/usr/bin/env bash
# Run ON linuxbox: background monitoring for https://abhinavall.net/ (USB storage + cleanup).
set -euo pipefail

source "${HOME}/.bashrc" 2>/dev/null || true
HERMES_BIN="${HOME}/.local/bin/hermes"
REPO="${HOME}/agent-dump"
HERMES_SCRIPTS="${HOME}/.hermes/scripts"

mkdir -p "${HERMES_SCRIPTS}"
install -m 755 "${REPO}/scripts/website/abhinavall_check.sh" "${HERMES_SCRIPTS}/abhinavall-check.sh"
install -m 755 "${REPO}/scripts/website/abhinavall_cleanup.sh" "${HERMES_SCRIPTS}/abhinavall-cleanup.sh"

HERMES_PROMPT="$(cat <<'EOF'
Workdir /home/abhinav/agent-dump. Read agents/WEBSITE_ABHINAVALL.md. Use web_extract on https://abhinavall.net/ only (not browser). If /media/abhinav/PERSONAL is mounted, write report to /media/abhinav/PERSONAL/agent-work/abhinavall-net/reports/review-YYYYMMDD.md (today UTC); else ~/agent-dump/reports/website-abhinavall/reports/. Sections: Site status, Content freshness (1 paragraph), Outbound links spot-check (GitHub/LinkedIn if linked), Suggested optional updates (ideas only — do not deploy). Max 800 words. Then run: bash scripts/website/abhinavall_cleanup.sh with the same work root you used. Do not modify the live website.
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

delete_if_exists "site-abhinavall-ping"
delete_if_exists "site-abhinavall-review"

"${HERMES_BIN}" cron create "30 6 * * *" "" \
  --name site-abhinavall-ping \
  --workdir "${REPO}" \
  --script abhinavall-check.sh \
  --no-agent \
  --deliver local

"${HERMES_BIN}" cron create "0 10 * * 0" "${HERMES_PROMPT}" \
  --name site-abhinavall-review \
  --workdir "${REPO}" \
  --deliver local

echo "Installed site-abhinavall-ping (06:30 daily) and site-abhinavall-review (Sun 10:00)."
echo "USB artifacts: /media/abhinav/PERSONAL/agent-work/abhinavall-net/"
echo "Config: ${REPO}/agents/WEBSITE_ABHINAVALL.md"
