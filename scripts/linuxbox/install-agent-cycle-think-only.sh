#!/usr/bin/env bash
# Run ON linuxbox: think lane only (1m crontab). Fast lane removed 2026-08-01.
# Sync/inbox duties live in agent-cycle-sync.sh (called from think tick).
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"

REPO="${HOME}/agent-dump"
THINK_TICK="${REPO}/scripts/linuxbox/agent-cycle-think-tick.sh"
SYNC_SH="${REPO}/scripts/linuxbox/agent-cycle-sync.sh"
THINK_MARK="# agent-cycle-think-1m"
FAST_MARK="# agent-cycle-fast-30s"

chmod +x "${THINK_TICK}" "${SYNC_SH}" 2>/dev/null || true
sed -i 's/\r$//' "${THINK_TICK}" "${SYNC_SH}" 2>/dev/null || true

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
  | grep -v "agent-cycle-fast-tick.sh" \
  | grep -v "agent-cycle-think-tick.sh" \
  | grep -v "agent-cycle-fast-1m" \
  | grep -v "agent-cycle-think-adaptive" > "${tmp}" || true
{
  cat "${tmp}"
  echo "* * * * * THINK_PAID_ON_FREE_EXHAUSTED=1 THINK_PAID_ON_VERIFIED_FREE_FAIL=1 THINK_PAID_FREE_FAIL_N=2 ${THINK_TICK} ${THINK_MARK}"
} | crontab -
rm -f "${tmp}"

# Durable ~/bin copy (survives git reset)
mkdir -p "${HOME}/bin"
cp -f "${THINK_TICK}" "${HOME}/bin/agent-cycle-think-tick.sh"
cp -f "${SYNC_SH}" "${HOME}/bin/agent-cycle-sync.sh"
chmod +x "${HOME}/bin/agent-cycle-think-tick.sh" "${HOME}/bin/agent-cycle-sync.sh"
# C8 helper (verified free-fail escalate)
if [[ -f "${REPO}/scripts/linuxbox/think-paid-escalate.py" ]]; then
  chmod +x "${REPO}/scripts/linuxbox/think-paid-escalate.py" 2>/dev/null || true
  sed -i 's/\r$//' "${REPO}/scripts/linuxbox/think-paid-escalate.py" 2>/dev/null || true
fi

echo "Think only: 1m via crontab (${THINK_TICK})"
echo "Sync: inside think tick (${SYNC_SH})"
echo "C8 paid: THINK_PAID_ON_FREE_EXHAUSTED=1 THINK_PAID_ON_VERIFIED_FREE_FAIL=1 N=2"
crontab -l | grep agent-cycle || true
