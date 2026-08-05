#!/usr/bin/env bash
# Install systemd timer for agent-pod-scheduler (every 30s).
# Usage: sudo bash install-agent-pod-scheduler.sh
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo on linuxbox." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sed -i 's/\r$//' "${SCRIPT_DIR}/agent-pod-scheduler.sh" 2>/dev/null || true
chmod +x "${SCRIPT_DIR}/agent-pod-scheduler.sh"

cp "${SCRIPT_DIR}/agent-pod-scheduler.service" /etc/systemd/system/
cat > /etc/systemd/system/agent-pod-scheduler.timer <<'EOF'
[Unit]
Description=Run Hermes agent pod scheduler every 30s

[Timer]
OnBootSec=45s
OnUnitActiveSec=30s
AccuracySec=1s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable agent-pod-scheduler.timer
systemctl start agent-pod-scheduler.timer
systemctl is-active agent-pod-scheduler.timer
echo "OK — scheduler timer active (30s). Logs: ~/agent-dump/agents/runs/pod-*.log"
