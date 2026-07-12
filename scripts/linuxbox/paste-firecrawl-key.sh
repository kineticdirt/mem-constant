#!/usr/bin/env bash
# Run ON linuxbox (interactive): paste Firecrawl API key into ~/.hermes/.env
set -euo pipefail

read -rsp "Paste FIRECRAWL_API_KEY (hidden, fc-...): " KEY
echo
if [[ -z "${KEY}" ]]; then
  echo "Empty key; aborting." >&2
  exit 1
fi

LINE="FIRECRAWL_API_KEY=${KEY}"
unset KEY
TMP="$(mktemp)"
chmod 600 "${TMP}"
printf '%s\n' "${LINE}" > "${TMP}"
python3 "$(dirname "$0")/merge-firecrawl-env.py" "${TMP}"
rm -f "${TMP}"
echo "Done. Run: bash $(dirname "$0")/configure-firecrawl-hermes.sh"
