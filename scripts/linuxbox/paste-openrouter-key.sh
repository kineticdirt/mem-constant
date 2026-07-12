#!/usr/bin/env bash
# Run ON linuxbox (interactive): paste OpenRouter key into ~/.hermes/.env
set -euo pipefail

read -rsp "Paste OPENROUTER_API_KEY (hidden): " KEY
echo
if [[ -z "${KEY}" ]]; then
  echo "Empty key; aborting." >&2
  exit 1
fi

LINE="OPENROUTER_API_KEY=${KEY}"
unset KEY
TMP="$(mktemp)"
printf '%s\n' "${LINE}" > "${TMP}"
python3 "$(dirname "$0")/merge-openrouter-env.py" "${TMP}"
rm -f "${TMP}"
echo "Done. Test with: hermes chat -q 'Reply with exactly: owl-alpha-ok'"
