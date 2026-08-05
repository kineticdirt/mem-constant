#!/usr/bin/env bash
# Hermes --no-agent: daily HTTPS health check for abhinavall.net → USB (or fallback).
set -euo pipefail

SITE_URL="${SITE_URL:-https://abhinavall.net/}"
USB_ROOT="${USB_ROOT:-/media/abhinav/PERSONAL/agent-work/abhinavall-net}"
FALLBACK_ROOT="${FALLBACK_ROOT:-$HOME/agent-dump/reports/website-abhinavall}"

if [[ -d "/media/abhinav/PERSONAL" ]]; then
  WORK_ROOT="${USB_ROOT}"
  STORAGE="usb"
else
  WORK_ROOT="${FALLBACK_ROOT}"
  STORAGE="fallback"
  echo "WARN: USB PERSONAL not mounted; using ${WORK_ROOT}"
fi

mkdir -p "${WORK_ROOT}/reports" "${WORK_ROOT}/cache" "${WORK_ROOT}/archive" "${WORK_ROOT}/inbox"

stamp="$(date -u +%Y%m%d-%H%M%S)"
out="${WORK_ROOT}/reports/check-${stamp}.md"

http_code="000"
time_total=""
tls_ok="unknown"
tls_expiry=""

if command -v curl >/dev/null 2>&1; then
  read -r http_code time_total <<<"$(curl -sS -o /dev/null -w '%{http_code} %{time_total}' --max-time 25 -L "${SITE_URL}" || echo '000 0')"
fi

if command -v openssl >/dev/null 2>&1; then
  host="$(printf '%s' "${SITE_URL}" | sed -E 's#^https?://([^/]+)/?.*#\1#')"
  tls_expiry="$(echo | openssl s_client -servername "${host}" -connect "${host}:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2- || true)"
  if [[ -n "${tls_expiry}" ]]; then
    tls_ok="ok"
  else
    tls_ok="check_failed"
  fi
fi

cat >"${out}" <<EOF
# abhinavall.net health check

- UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)
- URL: ${SITE_URL}
- Storage: ${STORAGE}
- HTTP status: ${http_code}
- Time (s): ${time_total:-n/a}
- TLS: ${tls_ok}
- TLS cert end: ${tls_expiry:-n/a}

## Notes

Automated ping only — no content edits. Weekly review: Hermes cron \`site-abhinavall-review\`.
EOF

cp -f "${out}" "${WORK_ROOT}/reports/LATEST-CHECK.md"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "${SCRIPT_DIR}/abhinavall-cleanup.sh" "${WORK_ROOT}"

echo "OK: ${out}"
