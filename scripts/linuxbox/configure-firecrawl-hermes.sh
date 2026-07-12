#!/usr/bin/env bash
# Run ON linuxbox after FIRECRAWL_API_KEY is in ~/.hermes/.env (paste-firecrawl-key.sh).
# Path E for Hermes: cloud browser + web tools — no firecrawl-cli on the Pi.
set -euo pipefail

source "${HOME}/.bashrc" 2>/dev/null || true
HERMES_BIN="${HOME}/.local/bin/hermes"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! grep -q '^FIRECRAWL_API_KEY=fc-' "${HOME}/.hermes/.env" 2>/dev/null; then
  echo "Missing FIRECRAWL_API_KEY in ~/.hermes/.env — run paste-firecrawl-key.sh first." >&2
  exit 1
fi

python3 "${SCRIPT_DIR}/patch-hermes-firecrawl-config.py"

"${HERMES_BIN}" tools enable web browser

systemctl --user restart hermes-gateway 2>/dev/null || "${HERMES_BIN}" gateway restart 2>/dev/null || true

echo "Gateway: $(systemctl --user is-active hermes-gateway 2>/dev/null || echo unknown)"
echo "Smoke (API): curl -s -o /dev/null -w '%{http_code}' -X POST https://api.firecrawl.dev/v2/scrape -H \"Authorization: Bearer \$(grep FIRECRAWL_API_KEY ~/.hermes/.env | cut -d= -f2-)\" -H 'Content-Type: application/json' -d '{\"url\":\"https://firecrawl.dev\"}'"
echo "Smoke (Hermes): hermes chat -q 'Use web_search for one sentence about Firecrawl; cite no URLs.'"
