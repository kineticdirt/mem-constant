#!/usr/bin/env bash
# deepsec scan-only wrapper for linuxbox (no AI / no process).
# Opt-in: agents/deepsec-config.json enabled:true + .deepsec/ present.
set -euo pipefail

REPO="${AGENT_DUMP:-$HOME/agent-dump}"
# shellcheck source=lib/archive-paths.sh
source "${REPO}/scripts/linuxbox/lib/archive-paths.sh"
CFG="${REPO}/agents/deepsec-config.json"
DEEPSEC="${REPO}/.deepsec"
META_PY="${REPO}/scripts/linuxbox/archive_meta.py"
STAMP="$(date -u +%Y%m%d)"

if archive_logs_ready; then
  OUT_DIR="${LINUXBOX_SECURITY_LOGS}"
else
  echo "HOLD: /mnt/archive not mounted — deepsec logs must not fill SD" >&2
  exit 2
fi
REPORT="${OUT_DIR}/deepsec-scan-${STAMP}.md"

mkdir -p "${OUT_DIR}"

if [[ ! -f "${CFG}" ]]; then
  echo "SKIP: missing ${CFG}"
  exit 0
fi

enabled="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('enabled', False))" "${CFG}")"
if [[ "${enabled}" != "True" ]]; then
  echo "SKIP: deepsec disabled in ${CFG}"
  exit 0
fi

if [[ ! -f "${DEEPSEC}/package.json" ]]; then
  echo "HOLD: .deepsec not initialized. On PC: npx deepsec init && cd .deepsec && pnpm install" >&2
  exit 2
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "HOLD: pnpm not on PATH (needed for deepsec scan)" >&2
  exit 2
fi

cd "${DEEPSEC}"
echo "deepsec scan (linuxbox, regex-only) ..."
scan_out="$(mktemp)"
status_out="$(mktemp)"
set +e
pnpm deepsec scan 2>&1 | tee "${scan_out}"
scan_rc=${PIPESTATUS[0]}
pnpm deepsec status 2>&1 | tee "${status_out}" || true
set -e

{
  echo "# deepsec scan — ${STAMP} (linuxbox)"
  echo
  echo "> Mode: **scan-only** (no AI). Full investigation: PC \`process --diff\`."
  echo
  echo "## scan (exit ${scan_rc})"
  echo '```'
  cat "${scan_out}"
  echo '```'
  echo
  echo "## status"
  echo '```'
  cat "${status_out}"
  echo '```'
} > "${REPORT}"

rm -f "${scan_out}" "${status_out}"

if [[ ${scan_rc} -ne 0 ]]; then
  echo "FAIL: deepsec scan exit ${scan_rc}; see ${REPORT}" >&2
  exit "${scan_rc}"
fi

if [[ -f "${META_PY}" ]]; then
  python3 "${META_PY}" append security deepsec-scan "${scan_rc}" "${REPORT}" "deepsec scan-only" || true
fi

echo "OK: ${REPORT}"
exit 0
