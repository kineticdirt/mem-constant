#!/usr/bin/env bash
# Playwright responsive screenshots for portfolio v8 preview.
# PC (recommended): run preview on 8766, then this script.
# linuxbox: possible on ARM but heavy (~400MB Chromium); use for smoke only.
set -euo pipefail

REPO="${REPO:-$HOME/agent-dump}"
STAGING="${STAGING:-$REPO/.staging/portfolio-redesign}"
SHOT_DIR="${STAGING}/_screenshots"
PORT="${PORT:-8766}"
PREVIEW_URL="${PREVIEW_URL:-http://127.0.0.1:${PORT}/v8-brutalist-map/}"
BIND="${BIND:-127.0.0.1}"

if [[ ! -d "${STAGING}/v8-brutalist-map" ]]; then
  echo "Missing ${STAGING}/v8-brutalist-map" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node required" >&2
  exit 1
fi

# Start preview if not already listening
if ! curl -sf -o /dev/null --connect-timeout 2 "${PREVIEW_URL}" 2>/dev/null; then
  echo "Starting preview on ${BIND}:${PORT} ..."
  cd "${STAGING}"
  python3 -m http.server "${PORT}" --bind "${BIND}" &
  PREVIEW_PID=$!
  trap 'kill ${PREVIEW_PID} 2>/dev/null || true' EXIT
  sleep 1
fi

cd "${SHOT_DIR}"
if [[ ! -d node_modules/playwright ]]; then
  echo "Installing playwright (first run may take several minutes on ARM) ..."
  npm install
  npx playwright install chromium
fi

export PREVIEW_URL
node capture-responsive.mjs
echo "Screenshots: ${SHOT_DIR}/responsive/{desktop,tablet,mobile}/"
