#!/usr/bin/env bash
# Run ON linuxbox: think lane (1m) + Cursor Auto parallel tick (5m, interval-gated 15m).
# Fast lane removed 2026-08-01. Sync/inbox duties live in agent-cycle-sync.sh (think tick).
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"

REPO="${HOME}/agent-dump"
THINK_TICK="${REPO}/scripts/linuxbox/agent-cycle-think-tick.sh"
CURSOR_TICK="${REPO}/scripts/linuxbox/agent-cycle-cursor-tick.sh"
SYNC_SH="${REPO}/scripts/linuxbox/agent-cycle-sync.sh"
THERMAL_SH="${REPO}/scripts/linuxbox/thermal-monitor.sh"
THINK_MARK="# agent-cycle-think-1m"
CURSOR_MARK="# agent-cycle-cursor-5m"
THERMAL_MARK="# thermal-monitor-5m"
FAST_MARK="# agent-cycle-fast-30s"

chmod +x "${THINK_TICK}" "${SYNC_SH}" "${CURSOR_TICK}" 2>/dev/null || true
chmod +x "${THERMAL_SH}" 2>/dev/null || true
sed -i 's/\r$//' "${THINK_TICK}" "${SYNC_SH}" "${CURSOR_TICK}" 2>/dev/null || true
sed -i 's/\r$//' "${THERMAL_SH}" 2>/dev/null || true
chmod +x "${REPO}/scripts/linuxbox/cursor-pick-task.py" \
  "${REPO}/scripts/linuxbox/triage-open-user-tasks.py" 2>/dev/null || true

# Pause legacy Hermes lane jobs if present (avoid double ticks)
for name in agent-cycle-fast agent-cycle-think agent-cycle; do
  id=$(hermes cron list 2>/dev/null | grep -B1 "Name:[[:space:]]*${name}" | grep -oE '[0-9a-f]{12}' | head -1 || true)
  if [[ -n "${id}" ]]; then
    echo "Pausing Hermes ${name} (${id}) — using crontab think only"
    hermes cron pause "${id}" 2>/dev/null || true
  fi
done

tmp=$(mktemp)
crontab -l 2>/dev/null \
  | grep -v "${FAST_MARK}" \
  | grep -v "${THINK_MARK}" \
  | grep -v "${CURSOR_MARK}" \
  | grep -v "${THERMAL_MARK}" \
  | grep -v "agent-cycle-fast-tick.sh" \
  | grep -v "agent-cycle-think-tick.sh" \
  | grep -v "agent-cycle-cursor-tick.sh" \
  | grep -v "thermal-monitor.sh" \
  | grep -v "agent-cycle-fast-1m" \
  | grep -v "agent-cycle-think-adaptive" > "${tmp}" || true
{
  cat "${tmp}"
  echo "* * * * * THINK_PAID_ON_FREE_EXHAUSTED=1 THINK_PAID_ON_VERIFIED_FREE_FAIL=1 THINK_PAID_FREE_FAIL_N=2 ${THINK_TICK} ${THINK_MARK}"
  # Agent 2 Cursor Auto — parallel Hermes-style agent (interval gate inside, default 15m)
  echo "*/5 * * * * CURSOR_SDK_AUTO_ONLY=1 ${CURSOR_TICK} ${CURSOR_MARK}"
  echo "*/5 * * * * ${THERMAL_SH} ${THERMAL_MARK}"
} | crontab -
rm -f "${tmp}"

# Durable ~/bin copy (survives git reset)
mkdir -p "${HOME}/bin"
cp -f "${THINK_TICK}" "${HOME}/bin/agent-cycle-think-tick.sh"
cp -f "${SYNC_SH}" "${HOME}/bin/agent-cycle-sync.sh"
cp -f "${CURSOR_TICK}" "${HOME}/bin/agent-cycle-cursor-tick.sh"
chmod +x "${HOME}/bin/agent-cycle-think-tick.sh" "${HOME}/bin/agent-cycle-sync.sh" "${HOME}/bin/agent-cycle-cursor-tick.sh"
# C8 helper (verified free-fail escalate)
if [[ -f "${REPO}/scripts/linuxbox/think-paid-escalate.py" ]]; then
  chmod +x "${REPO}/scripts/linuxbox/think-paid-escalate.py" 2>/dev/null || true
  sed -i 's/\r$//' "${REPO}/scripts/linuxbox/think-paid-escalate.py" 2>/dev/null || true
fi

echo "Agent 1 Hermes think: 1m via crontab (${THINK_TICK})"
echo "Agent 2 Cursor Auto: 5m crontab + ${CURSOR_INTERVAL_SEC:-900}s interval gate (${CURSOR_TICK})"
echo "Thermal: 5m (${THERMAL_SH})"
echo "Sync: inside think tick (${SYNC_SH})"
echo "C8 paid: THINK_PAID_ON_FREE_EXHAUSTED=1 THINK_PAID_ON_VERIFIED_FREE_FAIL=1 N=2"
crontab -l | grep -E "agent-cycle|thermal" || true
