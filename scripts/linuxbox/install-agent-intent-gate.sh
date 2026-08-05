#!/usr/bin/env bash
# Install systemd timer for static compiled-intent gate (every 5m).
# Usage: sudo bash install-agent-intent-gate.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
sed -i 's/\r$//' "${SCRIPT_DIR}/agent-intent-gate.sh" 2>/dev/null || true
chmod +x "${SCRIPT_DIR}/agent-intent-gate.sh"
chmod +x "${SCRIPT_DIR}/verify_agent_intent.py" 2>/dev/null || true

cp "${SCRIPT_DIR}/agent-intent-gate.service" /etc/systemd/system/
cp "${SCRIPT_DIR}/agent-intent-gate.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable agent-intent-gate.timer
systemctl start agent-intent-gate.timer
systemctl is-active agent-intent-gate.timer
echo "OK: agent-intent-gate.timer (static secret scan every 5m)"
