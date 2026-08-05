#!/usr/bin/env bash
# Install meta-harness-rollup systemd timer (user-level).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UNIT_DIR="${HOME}/.config/systemd/user"
mkdir -p "${UNIT_DIR}"

sed "s|%h|${HOME}|g" "${SCRIPT_DIR}/meta-harness-rollup.service" > "${UNIT_DIR}/meta-harness-rollup.service"
cp "${SCRIPT_DIR}/meta-harness-rollup.timer" "${UNIT_DIR}/meta-harness-rollup.timer"

chmod +x "${SCRIPT_DIR}/meta-harness-rollup.sh"
systemctl --user daemon-reload
systemctl --user enable --now meta-harness-rollup.timer
systemctl --user is-active meta-harness-rollup.timer
echo "OK: meta-harness-rollup.timer (30m campaign scores → reports/meta-harness/)"
