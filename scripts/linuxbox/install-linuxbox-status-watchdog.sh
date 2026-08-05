#!/usr/bin/env bash
# Install user systemd timer: linuxbox-status-watchdog every 2 minutes.
# Restarts Hub (:8790) / origin proxy (:8780) / cloudflared on hang, D-state, or
# wedged-deactivating. Needs the existing passwordless systemctl sudoers rule
# (same one Hub controls use); without it the watchdog degrades to alert-only.
set -euo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-${HOME}/agent-dump}"
SRC="${REPO}/scripts/linuxbox/linuxbox-status-watchdog.sh"
UNIT_DIR="${HOME}/.config/systemd/user"
SERVICE="${UNIT_DIR}/linuxbox-status-watchdog.service"
TIMER="${UNIT_DIR}/linuxbox-status-watchdog.timer"

mkdir -p "${UNIT_DIR}"
chmod +x "${SRC}"

cat > "${SERVICE}" <<EOF
[Unit]
Description=Hub / tunnel-origin / cloudflared hang watchdog (linuxbox-status :8790)

[Service]
Type=oneshot
ExecStart=${SRC}
Nice=10
EOF

cat > "${TIMER}" <<'EOF'
[Unit]
Description=Run linuxbox-status-watchdog every 2 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
AccuracySec=30s
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now linuxbox-status-watchdog.timer
systemctl --user start linuxbox-status-watchdog.service || true
echo "watchdog timer: $(systemctl --user is-active linuxbox-status-watchdog.timer)"
echo "watchdog last: $(systemctl --user show -p ActiveState --value linuxbox-status-watchdog.service)"
