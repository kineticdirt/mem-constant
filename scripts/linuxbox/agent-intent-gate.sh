#!/usr/bin/env bash
# Static compiled-intent gate — global secret scan. Run on linuxbox (cron/timer).
set -euo pipefail

REPO="${HOME}/agent-dump"
PY="${REPO}/scripts/linuxbox/verify_agent_intent.py"

if [[ ! -f "${PY}" ]]; then
  echo "SKIP: missing ${PY}" >&2
  exit 0
fi

python3 "${PY}" --static --repo "${REPO}"
