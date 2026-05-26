#!/usr/bin/env bash
# Validate a static portfolio prototype dir (local http.server + curl).
set -euo pipefail

DIR="${1:-}"
if [[ -z "${DIR}" || ! -d "${DIR}" ]]; then
  echo "usage: portfolio_validate.sh <prototype-dir>" >&2
  exit 2
fi

if [[ ! -f "${DIR}/index.html" ]]; then
  echo "FAIL: missing index.html in ${DIR}" >&2
  exit 1
fi

PORT="${PORT:-8765}"
log="$(mktemp)"
cleanup() { kill "${PID:-0}" 2>/dev/null || true; rm -f "${log}"; }
trap cleanup EXIT

cd "${DIR}"
python3 -m http.server "${PORT}" --bind 127.0.0.1 >"${log}" 2>&1 &
PID=$!
sleep 1

body="$(curl -sS -m 10 "http://127.0.0.1:${PORT}/" || true)"
code="$(curl -sS -o /dev/null -w '%{http_code}' -m 10 "http://127.0.0.1:${PORT}/" || echo 000)"

if [[ "${code}" != "200" ]]; then
  echo "FAIL: HTTP ${code} for ${DIR}" >&2
  exit 1
fi

for needle in Abhinav viewport; do
  if ! grep -qi "${needle}" <<<"${body}"; then
    echo "FAIL: missing '${needle}' in rendered HTML for ${DIR}" >&2
    exit 1
  fi
done

# Content completeness hints (not exhaustive — agent checks inventory)
for needle in "OmniaDevWorkspace" "Cequence" "kineticdirt" "Founding Engineer"; do
  if ! grep -qi "${needle}" <<<"${body}"; then
    echo "WARN: missing expected content '${needle}' — verify PORTFOLIO_CONTENT_INVENTORY.md" >&2
  fi
done

echo "OK: ${DIR} (HTTP 200, content checks passed)"
