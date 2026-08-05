#!/usr/bin/env bash
# Daily model probe + failover. Run ON linuxbox once.
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
HERMES_BIN="${HOME}/.local/bin/hermes"
REPO="${HOME}/agent-dump"
HERMES_SCRIPTS="${HOME}/.hermes/scripts"
SRC="${REPO}/scripts/linuxbox/hermes-model-failover.sh"
NAME="hermes-model-health"

mkdir -p "${HERMES_SCRIPTS}"
sed -i 's/\r$//' "${SRC}" 2>/dev/null || true
install -m 755 "${SRC}" "${HERMES_SCRIPTS}/hermes-model-failover.sh"

id="$("${HERMES_BIN}" cron list 2>/dev/null | grep -E "${NAME}" | head -1 | awk '{print $1}')" || true
if [[ -n "${id}" ]]; then
  echo "cron ${NAME} already exists (${id})"
  exit 0
fi

"${HERMES_BIN}" cron create "45 6 * * *" "" \
  --workdir "${REPO}" \
  --name "${NAME}" \
  --script hermes-model-failover.sh \
  --no-agent \
  --deliver local

echo "Created ${NAME} — daily 06:45 probe + profile rotation"
