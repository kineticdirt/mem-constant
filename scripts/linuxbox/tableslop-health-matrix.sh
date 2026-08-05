#!/usr/bin/env bash
# Tableslop dual-app health matrix (S0 Setup→Beta).
# Run on potato (loopback). Prints OK/FAIL per endpoint; exits 1 if any FAIL.
# Public hostnames noted for edge checks (optional; skip if offline).
set -euo pipefail

HOST_MAP="${TABLESLOP_MAP_HOST:-127.0.0.1:8765}"
HOST_CAMP="${TABLESLOP_CAMP_HOST:-127.0.0.1:8768}"
PUBLIC_MAP="${TABLESLOP_PUBLIC_MAP:-https://map.tableslop.org}"
PUBLIC_CAMP="${TABLESLOP_PUBLIC_CAMP:-https://campaigns.tableslop.org}"
CHECK_PUBLIC="${TABLESLOP_CHECK_PUBLIC:-0}"

failed=0

check() {
  local label="$1"
  local url="$2"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 15 "$url" 2>/dev/null || echo 000)"
  if [[ "$code" == "200" ]]; then
    printf 'OK   %-40s HTTP %s  %s\n' "$label" "$code" "$url"
  else
    printf 'FAIL %-40s HTTP %s  %s\n' "$label" "$code" "$url"
    failed=$((failed + 1))
  fi
}

echo "=== Tableslop health matrix (loopback) ==="
echo "Theme B map     → ${HOST_MAP}  (public: map.tableslop.org)"
echo "Theme A campaigns → ${HOST_CAMP}  (public: campaigns.tableslop.org)"
echo

check "map /health"            "http://${HOST_MAP}/health"
check "map /"                  "http://${HOST_MAP}/"
check "map /api/map"           "http://${HOST_MAP}/api/map"
check "campaigns /health"      "http://${HOST_CAMP}/health"
check "campaigns /"            "http://${HOST_CAMP}/"
check "campaigns /api/availability" "http://${HOST_CAMP}/api/availability"

if [[ "$CHECK_PUBLIC" == "1" ]]; then
  echo
  echo "=== Public hostnames (CHECK_PUBLIC=1) ==="
  check "public map /health"       "${PUBLIC_MAP}/health"
  check "public campaigns /health" "${PUBLIC_CAMP}/health"
else
  echo
  echo "NOTE: public hostnames not probed (set TABLESLOP_CHECK_PUBLIC=1 to include)."
  echo "      map.tableslop.org → :8765 · campaigns.tableslop.org → :8768"
fi

echo
if [[ "$failed" -gt 0 ]]; then
  echo "RESULT: FAIL ($failed endpoint(s))"
  exit 1
fi
echo "RESULT: OK"
exit 0
