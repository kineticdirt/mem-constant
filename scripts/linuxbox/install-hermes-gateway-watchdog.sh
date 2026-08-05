#!/usr/bin/env bash
# Install user systemd timer: hermes-gateway-watchdog every 2 minutes.
set -euo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-${HOME}/agent-dump}"
SRC="${REPO}/scripts/linuxbox/hermes-gateway-watchdog.sh"
UNIT_DIR="${HOME}/.config/systemd/user"
SERVICE="${UNIT_DIR}/hermes-gateway-watchdog.service"
TIMER="${UNIT_DIR}/hermes-gateway-watchdog.timer"

mkdir -p "${UNIT_DIR}"
chmod +x "${SRC}"

cat > "${SERVICE}" <<EOF
[Unit]
Description=Hermes gateway hang watchdog (SQLite/D-state / Discord heartbeat)
After=hermes-gateway.service

[Service]
Type=oneshot
ExecStart=${SRC}
Nice=10
EOF

cat > "${TIMER}" <<'EOF'
[Unit]
Description=Run hermes-gateway-watchdog every 2 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
AccuracySec=30s
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now hermes-gateway-watchdog.timer
systemctl --user start hermes-gateway-watchdog.service || true
echo "watchdog timer: $(systemctl --user is-active hermes-gateway-watchdog.timer)"
echo "watchdog last: $(systemctl --user show -p ActiveState --value hermes-gateway-watchdog.service)"
