#!/usr/bin/env bash
# Run on linuxbox before installing Pi-hole. Read-only checks + hints.
set -euo pipefail

echo "=== Listeners on UDP/TCP port 53 (Pi-hole needs these free) ==="
if command -v ss >/dev/null 2>&1; then
  ss -lunp 2>/dev/null | grep -E '(:53\s)|(\*:53)' || echo "(none seen on UDP)"
  ss -ltnp 2>/dev/null | grep -E '(:53\s)|(\*:53)' || echo "(none seen on TCP)"
else
  echo "ss not found; install iproute2"
fi

echo ""
echo "=== systemd-resolved (often holds 127.0.0.53:53) ==="
if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found (not systemd Linux?); skip this section on the Pi if applicable."
elif systemctl is-enabled systemd-resolved >/dev/null 2>&1; then
  echo "systemd-resolved is present. If Pi-hole fails to bind port 53, set in /etc/systemd/resolved.conf:"
  echo "  DNSStubListener=no"
  echo "then: sudo systemctl restart systemd-resolved"
  echo "and point /etc/resolv.conf at Pi-hole (installer may offer this)."
else
  echo "systemd-resolved not enabled (OK for many bare Debian images)."
fi

echo ""
echo "=== Optional: other DNS / K3s ==="
echo "If you run Kubernetes DNS on this host, ensure it does not bind host port 53."
echo "Pi-hole admin UI defaults to port 80; change in installer if Apache/nginx already use 80."
