#!/usr/bin/env bash
# Focused Hub+Systems visual check: Playwright screenshots + known-failure greps.
# Free-first / deterministic — not a vision LLM. Sibling to run-dashboard-ui-smoke.sh (C6).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${REPO}"

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

if ! (cd "${PW_DIR}" && npx playwright install --dry-run chromium 2>/dev/null | grep -q "is already installed"); then
  echo "Installing Playwright chromium (one-time) …" >&2
  (cd "${PW_DIR}" && npx playwright install chromium 2>/dev/null) || true
fi

node "${PW_DIR}/dashboard-visual-check.mjs" "$@"
