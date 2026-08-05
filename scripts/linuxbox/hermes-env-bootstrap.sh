#!/usr/bin/env bash
# Meta-Harness-inspired env snapshot for Hermes pods on linuxbox.
# Injected into pod prompts so agents skip blind ls/free/systemctl turns.
# ponytail: one script, no deps; failures are silent (empty block).
set -uo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-${HOME}/agent-dump}"
cd "${REPO}" 2>/dev/null || exit 0

echo "[Environment Snapshot — linuxbox]"

echo -n "Host: "
hostname 2>/dev/null || echo unknown

echo -n "Repo: "
pwd 2>/dev/null

if command -v free >/dev/null 2>&1; then
  echo "Memory:"
  free -m 2>/dev/null | awk '/^Mem:/{printf "  avail %s MiB / %s MiB\n", $7, $2}'
  free -m 2>/dev/null | awk '/^Swap:/{if($2>0) printf "  swap %s%% used\n", int(100*$3/$2); else print "  swap none"}'
fi

if [ -f /proc/loadavg ]; then
  echo -n "Load: "
  cut -d' ' -f1-3 /proc/loadavg
fi

echo "Key services:"
for u in linuxbox-status linuxbox-tableslop abhinav-portfolio cloudflared-abhinavall cloudflared-tableslop; do
  st=$(systemctl is-active "${u}.service" 2>/dev/null || echo "?")
  echo "  ${u}: ${st}"
done

if command -v git >/dev/null 2>&1; then
  echo -n "Git: "
  git rev-parse --short HEAD 2>/dev/null || echo "no-git"
  if git diff --quiet 2>/dev/null; then
    echo "  working tree: clean"
  else
    echo "  working tree: dirty (local changes present)"
  fi
fi

INBOX="${REPO}/agents/state/human-inbox.json"
if [ ! -f "${INBOX}" ]; then
  INBOX="${REPO}/agents/human-inbox.json"
fi
if [ -f "${INBOX}" ] && command -v python3 >/dev/null 2>&1; then
  python3 - "${INBOX}" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
try:
    d = json.loads(p.read_text(encoding="utf-8"))
    n = len(d.get("open") or [])
    print(f"Inbox open questions: {n}")
except Exception:
    pass
PY
fi

if [ -f "${REPO}/agents/CURRENT_TASK.md" ]; then
  echo "CURRENT_TASK (first open line):"
  grep -m1 '^\[ \]' "${REPO}/agents/CURRENT_TASK.md" 2>/dev/null || echo "  (none unchecked)"
fi
