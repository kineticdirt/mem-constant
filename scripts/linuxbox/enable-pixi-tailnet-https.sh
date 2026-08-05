#!/usr/bin/env bash
# Enable Tailscale-native HTTPS for Pixi RP (:8767) on potato, tailnet-only (no Funnel/public exposure).
# Idempotent — safe to re-run. Requires two one-time tailnet-admin clicks the first time (see docs/pixi-local-bonsai.md).
set -euo pipefail

PORT="${PIXI_PORT:-8767}"
UPSTREAM="http://127.0.0.1:${PORT}"

# Let this user run `tailscale serve`/`cert` without sudo (idempotent, harmless).
tailscale set --operator="$(whoami)" 2>/dev/null || true

# NOTE: when Serve isn't enabled yet for this node, `tailscale serve --bg` has been
# observed to hang indefinitely instead of failing fast (1.98.4) — always run it
# under `timeout` so a blocked run can't pile up processes on a 2 GB box.
OUT="$(timeout 20 tailscale serve --bg --https=443 "${UPSTREAM}" 2>&1)" || true
echo "${OUT}"

if echo "${OUT}" | grep -qi "not enabled on your tailnet" || [[ -z "${OUT}" ]]; then
  LINK="$(echo "${OUT}" | grep -o 'https://login.tailscale.com/f/serve?node=[A-Za-z0-9]*' || true)"
  echo
  echo "BLOCKED (tailnet admin, one-time): open this link and approve Serve for this node," >&2
  [[ -n "${LINK}" ]] && echo "  ${LINK}" >&2
  echo "then re-run: bash scripts/linuxbox/enable-pixi-tailnet-https.sh" >&2
  pkill -9 -f "tailscale serve --bg --https=443 ${UPSTREAM}" 2>/dev/null || true
  exit 2
fi

tailscale serve status

DNSNAME="$(tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')"

# tailscale serve provisions the cert lazily on first HTTPS hit — poke it now so
# the "HTTPS Certificates" tailnet setting gets exercised and any failure surfaces here.
CERT_OUT="$(timeout 15 tailscale cert --cert-file=/tmp/pixi-https-check.crt --key-file=/tmp/pixi-https-check.key "${DNSNAME}" 2>&1)" || true
rm -f /tmp/pixi-https-check.crt /tmp/pixi-https-check.key
if echo "${CERT_OUT}" | grep -qi "does not support getting TLS certs"; then
  echo
  echo "BLOCKED (tailnet admin, one-time): enable HTTPS Certificates —" >&2
  echo "  https://login.tailscale.com/admin/dns -> toggle 'HTTPS Certificates' on" >&2
  echo "then re-run: bash scripts/linuxbox/enable-pixi-tailnet-https.sh" >&2
  exit 2
fi

echo
echo "Pixi RP HTTPS live: https://${DNSNAME}/"
