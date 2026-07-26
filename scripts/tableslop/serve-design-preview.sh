#!/usr/bin/env bash
# Local tableslop UI design preview — PC only, no linuxbox deploy.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PREVIEW="${REPO}/projects/tableslop/design/preview"
PORT="${PORT:-8767}"

if [[ ! -f "${PREVIEW}/index.html" ]]; then
  echo "FAIL: missing ${PREVIEW}/index.html" >&2
  exit 1
fi

echo "tableslop design preview"
echo "  URL:  http://127.0.0.1:${PORT}/projects/tableslop/design/preview/"
echo "  root: ${REPO}"
echo "  (Ctrl+C to stop)"
cd "${REPO}"
exec python -m http.server "${PORT}" --bind 127.0.0.1
