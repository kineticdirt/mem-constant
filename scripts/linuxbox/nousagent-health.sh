#!/usr/bin/env bash
# Read-only health snapshot for the linuxbox Hermes agent (no secrets).
set -euo pipefail

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

AGENT_DUMP="${AGENT_DUMP:-$HOME/agent-dump}"
HERMES_ENV="$HOME/.hermes/.env"
USB_MOUNT="/media/abhinav/PERSONAL"

# Alive-but-hung: MainPID in D (disk sleep on state.db) or Discord heartbeat blocks
# *since this unit activation* (not a rolling window — restart leaves old journal lines).
gw="$(systemctl --user is-active hermes-gateway 2>/dev/null || echo inactive)"
if [ "$gw" = "active" ]; then
  pid="$(systemctl --user show -p MainPID --value hermes-gateway 2>/dev/null || echo 0)"
  st="?"
  # Prefer /proc (cheap) — never spawn ps under Hub poll load.
  if [ -n "$pid" ] && [ "$pid" != "0" ] && [ -r "/proc/$pid/status" ]; then
    st="$(awk '/^State:/{print $2; exit}' "/proc/$pid/status" 2>/dev/null || echo '?')"
  fi
  case "$st" in
    D*) gw="hung" ;;
  esac
  # Rolling 10m window only — scanning journal since unit activation (days)
  # made Hub collectHealth hit its 15s timeout → gateway=unknown → UI DOWN
  # while the unit was healthy (pc-2026-08-09-think-idle-gateway-false-down).
  blocks="$(timeout 2 journalctl --user -u hermes-gateway --since '10 min ago' --no-pager -q 2>/dev/null | grep -c 'heartbeat blocked' || true)"
  if [ "${blocks:-0}" -ge 3 ]; then
    gw="hung"
  fi
fi
echo "gateway=${gw}"
STATE_DB="$HOME/.hermes/state.db"
if [ -f "$STATE_DB" ]; then
  echo "hermes_state_db_mb=$(( $(stat -c%s "$STATE_DB" 2>/dev/null || echo 0) / 1024 / 1024 ))"
else
  echo "hermes_state_db_mb=0"
fi
echo "usb_mounted=$([ -d "$USB_MOUNT" ] && echo yes || echo no)"
echo "usb_free=$([ -d "$USB_MOUNT" ] && df -h "$USB_MOUNT" 2>/dev/null | awk 'NR==2{print $4}' || echo n/a)"
echo "openrouter_key=$([ -f "$HERMES_ENV" ] && grep -q '^OPENROUTER_API_KEY=.' "$HERMES_ENV" && echo set || echo missing)"
echo "firecrawl_key=$([ -f "$HERMES_ENV" ] && grep -q '^FIRECRAWL_API_KEY=.' "$HERMES_ENV" && echo set || echo missing)"
echo "root_free=$(df -h / | awk 'NR==2{print $4}')"
echo "mem_available=$(free -m | awk '/^Mem:/{print $7}')"

if [ -f "$AGENT_DUMP/agents/CURRENT_TASK.md" ]; then
  status_line=$(grep -m1 '^\*\*Status:\*\*' "$AGENT_DUMP/agents/CURRENT_TASK.md" | sed 's/^\*\*Status:\*\* //')
  echo "current_task_status=${status_line:-unknown}"
else
  echo "current_task_status=missing"
fi

if command -v hermes >/dev/null 2>&1; then
  # ponytail: 2h journalctl scan added ~7s per Hub load on 2GB box — skip on dashboard path
  echo "recent_agent_cycle_log_lines=0"
fi
