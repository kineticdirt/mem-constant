#!/usr/bin/env bash
# Print deploy checklist + validate production folder (does not upload).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SITE="${REPO}/sites/abhinavall.net"

if [[ ! -f "${SITE}/index.html" ]]; then
  echo "FAIL: missing ${SITE}/index.html" >&2
  exit 1
fi

echo "Production bundle: ${SITE}"
echo "Title should include: abhinavall.net glitch brand"
grep -q 'class="glitch" data-text="abhinavall.net"' "${SITE}/index.html" || { echo "FAIL: abhinavall.net glitch brand not in index.html" >&2; exit 1; }

bash "${REPO}/scripts/website/portfolio_validate.sh" "${SITE}"

echo ""
echo "OK — validated. Upload ${SITE}/* to your abhinavall.net host, then purge CDN."
echo "See: sites/abhinavall.net/DEPLOY.md"
