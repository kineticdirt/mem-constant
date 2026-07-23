#!/usr/bin/env bash
# Resume light fast (1m) + adaptive think (script throttles 5m/1m). Keeps pod-scheduler off.
set -euo pipefail
REPO="${HOME}/agent-dump"
FAST="${REPO}/scripts/linuxbox/agent-cycle-fast-tick.sh"
THINK="${REPO}/scripts/linuxbox/agent-cycle-think-tick.sh"
sed -i 's/\r$//' "${FAST}" "${THINK}" 2>/dev/null || true
chmod +x "${FAST}" "${THINK}"
# Never re-enable agent-pod-scheduler here (dual-fire caused Hub thrash).
systemctl --user stop agent-pod-scheduler.timer 2>/dev/null || true
systemctl --user disable agent-pod-scheduler.timer 2>/dev/null || true
TMP="$(mktemp)"
crontab -l 2>/dev/null \
  | grep -v 'agent-cycle-fast' \
  | grep -v 'agent-cycle-think' \
  | grep -v 'agent-cycle-fast-tick.sh' \
  | grep -v 'agent-cycle-think-tick.sh' > "${TMP}" || true
{
  cat "${TMP}"
  echo "* * * * * ${FAST} # agent-cycle-fast-1m"
  echo "* * * * * ${THINK} # agent-cycle-think-adaptive"
} | crontab -
rm -f "${TMP}"
echo "resumed adaptive ticks (fast 1m + think adaptive); pod-scheduler left disabled"
crontab -l | grep agent-cycle || true
