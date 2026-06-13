#!/usr/bin/env bash
# Linuxbox: ensure tailscaled is running (for cron / @reboot).
# Install on Pi: copy to ~/bin/ensure-tailscale-up.sh, chmod +x,
#   crontab -e → */5 * * * * /home/abhinav/bin/ensure-tailscale-up.sh >> /tmp/tailscale-watchdog.log 2>&1
set -euo pipefail

if command -v tailscale >/dev/null 2>&1; then
  if ! tailscale status --json 2>/dev/null | grep -q '"BackendState": "Running"'; then
    echo "$(date -Is) tailscale not Running; attempting start"
    sudo systemctl start tailscaled 2>/dev/null || sudo service tailscaled start 2>/dev/null || true
    sleep 2
    tailscale up --accept-dns=true 2>/dev/null || true
  fi
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active tailscaled >/dev/null 2>&1 || sudo systemctl start tailscaled 2>/dev/null || true
fi
