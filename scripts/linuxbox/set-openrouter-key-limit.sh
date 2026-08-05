#!/usr/bin/env bash
# Raise/set OpenRouter per-key daily USD limit via Management API.
# Requires: OPENROUTER_MANAGEMENT_API_KEY + KEY_HASH (or OPENROUTER_KEY_HASH)
# Usage: bash set-openrouter-key-limit.sh [usd] [key_hash]
# Example: bash set-openrouter-key-limit.sh 7
set -euo pipefail

USD="${1:-7}"
HASH="${2:-${OPENROUTER_KEY_HASH:-}}"
MGMT="${OPENROUTER_MANAGEMENT_API_KEY:-}"

if [[ -z "${MGMT}" ]]; then
  # shellcheck disable=SC1091
  [[ -f "${HOME}/.hermes/.env" ]] && set -a && source "${HOME}/.hermes/.env" && set +a || true
  MGMT="${OPENROUTER_MANAGEMENT_API_KEY:-}"
fi

if [[ -z "${MGMT}" ]]; then
  echo "Missing OPENROUTER_MANAGEMENT_API_KEY."
  echo "Create a Management key at https://openrouter.ai/settings/keys"
  echo "Then either:"
  echo "  1) OpenRouter UI → edit the ops key → Limit = ${USD}, Reset = daily"
  echo "  2) export OPENROUTER_MANAGEMENT_API_KEY=... OPENROUTER_KEY_HASH=... and re-run"
  exit 2
fi

if [[ -z "${HASH}" ]]; then
  echo "Missing KEY_HASH / OPENROUTER_KEY_HASH (hash of the inference key to update)."
  echo "List keys: curl -s https://openrouter.ai/api/v1/keys -H \"Authorization: Bearer \$OPENROUTER_MANAGEMENT_API_KEY\""
  exit 2
fi

echo "Setting key ${HASH:0:8}… daily limit to \$${USD}…"
curl -sS -X PATCH "https://openrouter.ai/api/v1/keys/${HASH}" \
  -H "Authorization: Bearer ${MGMT}" \
  -H "Content-Type: application/json" \
  -d "{\"limit\": ${USD}, \"limit_reset\": \"daily\"}"
echo
echo "Done. Verify with GET /api/v1/key using the inference key (limit should be ${USD})."
