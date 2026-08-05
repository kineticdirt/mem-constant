#!/usr/bin/env bash
# Install Sunday weekly free-model probe on linuxbox (Hermes cron).
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
HERMES_BIN="${HOME}/.local/bin/hermes"
REPO="${HOME}/agent-dump"
HERMES_SCRIPTS="${HOME}/.hermes/scripts"
SRC="${REPO}/scripts/linuxbox/probe-free-models-weekly.sh"
NAME="probe-free-models-weekly"

mkdir -p "${HERMES_SCRIPTS}"
sed -i 's/\r$//' "${SRC}" 2>/dev/null || true
install -m 755 "${SRC}" "${HERMES_SCRIPTS}/probe-free-models-weekly.sh"

id="$("${HERMES_BIN}" cron list 2>/dev/null | grep -E "${NAME}" | head -1 | awk '{print $1}')" || true
if [[ -n "${id}" ]]; then
  echo "cron ${NAME} already exists (${id})"
  exit 0
fi

"${HERMES_BIN}" cron create "15 7 * * 0" "" \
  --workdir "${REPO}" \
  --name "${NAME}" \
  --script probe-free-models-weekly.sh \
  --no-agent \
  --deliver local

echo "Created ${NAME} — Sunday 07:15 UTC probe + think-free-swap last_probe"
