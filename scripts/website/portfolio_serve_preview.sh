#!/usr/bin/env bash
# Serve portfolio-redesign hub + three sites on tailnet (linuxbox).
set -euo pipefail

ROOT="${1:-/media/abhinav/PERSONAL/agent-work/abhinavall-net/portfolio-redesign}"
PORT="${PORT:-8765}"
BIND="${BIND:-100.122.108.94}"

if [[ ! -d "${ROOT}" ]]; then
  echo "Missing ${ROOT}" >&2
  exit 1
fi

if [[ ! -f "${ROOT}/index.html" ]]; then
  echo "WARN: no preview hub at ${ROOT}/index.html — open v1-system/ directly or run bootstrap" >&2
fi

echo "Preview hub: http://${BIND}:${PORT}/"
echo "Toggle v1-system | v2-editorial | v3-kinetic in the hub header."
echo "Ctrl+C to stop."
cd "${ROOT}"
exec python3 -m http.server "${PORT}" --bind "${BIND}"
