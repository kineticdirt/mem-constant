#!/usr/bin/env bash
# Install swarm-dispatch timer (60s) on linuxbox. Run ON the box.
set -euo pipefail

REPO="${HOME}/agent-dump"
UNIT_DIR="${HOME}/.config/systemd/user"
SCRIPT="${REPO}/scripts/linuxbox/swarm-dispatch.sh"

chmod +x "${SCRIPT}"

mkdir -p "${UNIT_DIR}"
cat > "${UNIT_DIR}/swarm-dispatch.service" <<EOF
[Unit]
Description=Swarm MoE dispatcher (one queued task per tick)

[Service]
Type=oneshot
ExecStart=${SCRIPT} --once
WorkingDirectory=${REPO}
EOF

cat > "${UNIT_DIR}/swarm-dispatch.timer" <<EOF
[Unit]
Description=Swarm MoE dispatcher timer

[Timer]
OnBootSec=2min
OnUnitActiveSec=60s
AccuracySec=15s

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now swarm-dispatch.timer
systemctl --user status swarm-dispatch.timer --no-pager | head -8
echo "OK swarm-dispatch.timer enabled (60s)"
