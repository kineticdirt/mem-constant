#!/usr/bin/env bash
# Install bookmarks digest cron: every 3 days at 10:00 (local), not Saturday-only.
set -euo pipefail
REPO="${HOME}/agent-dump"
SCRIPT="${REPO}/scripts/linuxbox/research-bookmarks-weekly.sh"
sed -i 's/\r$//' "${SCRIPT}" 2>/dev/null || true
chmod +x "${SCRIPT}"
# day-of-month */3 ≈ every 3 days; also keep a Sunday weekly floor as backup
LINE1="0 10 */3 * * ${SCRIPT} >> /tmp/research-bookmarks.log 2>&1 # research-bookmarks-3d"
LINE2="0 10 * * 0 ${SCRIPT} >> /tmp/research-bookmarks.log 2>&1 # research-bookmarks-sun-floor"
TMP="$(mktemp)"
crontab -l 2>/dev/null | grep -v 'research-bookmarks' > "${TMP}" || true
echo "${LINE1}" >> "${TMP}"
echo "${LINE2}" >> "${TMP}"
crontab "${TMP}"
rm -f "${TMP}"
echo "installed:"
crontab -l | grep research-bookmarks || true
