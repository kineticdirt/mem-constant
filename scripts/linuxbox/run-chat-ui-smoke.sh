#!/usr/bin/env bash
# One-shot Chat UI Playwright smoke (think/ops C6). Timeout-bounded for potato RAM.
# Prefer this over Hermes browser_navigate. Full tab walk: run-dashboard-ui-smoke.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${REPO}"

TIMEOUT_SEC="${CHAT_UI_SMOKE_TIMEOUT_SEC:-120}"

if [[ -f "${HOME}/.linuxbox-dashboard/.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "${HOME}/.linuxbox-dashboard/.env"
  set +a
  export DASHBOARD_ADMIN_PASS="${DASHBOARD_ADMIN_PASS:-${DASHBOARD_TOKEN:-}}"
fi

export DASHBOARD_URL="${DASHBOARD_URL:-http://127.0.0.1:8790/}"
export DASHBOARD_ADMIN_USER="${DASHBOARD_ADMIN_USER:-admin}"

PW_DIR="${REPO}/.staging/portfolio-redesign/_screenshots"
if [[ ! -d "${PW_DIR}/node_modules/playwright" ]]; then
  echo "Installing Playwright in ${PW_DIR} …" >&2
  mkdir -p "${PW_DIR}"
  (cd "${PW_DIR}" && npm install --no-audit --no-fund 2>/dev/null)
fi

# Skip re-download when cache already has chromium (dry-run grep is flaky on ARM).
if [[ ! -d "${HOME}/.cache/ms-playwright/chromium-1228" ]] \
  && [[ ! -d "${HOME}/.cache/ms-playwright/chromium_headless_shell-1228" ]]; then
  echo "Installing Playwright chromium (one-time) …" >&2
  (cd "${PW_DIR}" && npx playwright install chromium 2>/dev/null) || true
fi

echo "Chat UI smoke (timeout ${TIMEOUT_SEC}s)…" >&2
set +e
timeout "${TIMEOUT_SEC}" node "${PW_DIR}/chat-ui-smoke.mjs" "$@"
rc=$?
set -e
if [[ "${rc}" -eq 124 ]]; then
  echo "FAIL chat-ui-smoke timed out after ${TIMEOUT_SEC}s" >&2
  exit 124
fi
exit "${rc}"
