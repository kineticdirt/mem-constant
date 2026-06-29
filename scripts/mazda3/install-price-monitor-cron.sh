#!/usr/bin/env bash
# Run ON linuxbox: install the every-3-days Mazda3 price monitor as a Hermes cron.
# Deterministic (--no-agent): runs the python scraper, no LLM/credit used.
set -euo pipefail

source "${HOME}/.bashrc" 2>/dev/null || true
HERMES_BIN="${HOME}/.local/bin/hermes"
REPO="${HOME}/agent-dump"
HERMES_SCRIPTS="${HOME}/.hermes/scripts"

mkdir -p "${HERMES_SCRIPTS}"
install -m 755 "${REPO}/scripts/mazda3/mazda3-price-check.sh" "${HERMES_SCRIPTS}/mazda3-price-check.sh"

delete_if_exists() {
  local name="$1" id
  id="$("${HERMES_BIN}" cron list 2>/dev/null | grep -E "${name}" | head -1 | awk '{print $1}')" || true
  [[ -n "${id}" ]] && "${HERMES_BIN}" cron delete "${id}" 2>/dev/null || true
}

delete_if_exists "mazda3-price-monitor"

# ponytail: "*/3" day-of-month resets at month end, so the gap is 1-4 days near the 1st.
# Fine for a price watch; if exact 72h spacing is ever needed, switch to a systemd timer.
"${HERMES_BIN}" cron create "0 9 */3 * *" "" \
  --name mazda3-price-monitor \
  --workdir "${REPO}" \
  --script mazda3-price-check.sh \
  --no-agent \
  --deliver local

echo "Installed mazda3-price-monitor (09:00 every 3rd day-of-month, deterministic, no LLM)."
echo "Reports: ${REPO}/reports/mazda3/  ·  Data: ${REPO}/projects/mazda3-sports-build/parts.json"
