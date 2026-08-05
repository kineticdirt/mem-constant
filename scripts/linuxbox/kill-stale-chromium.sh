#!/usr/bin/env bash
# Free RAM from orphaned headless Chromium (agent-browser / smoke leftovers).
# ponytail: fast tick only — never launch browser on linuxbox crons.
set -euo pipefail
if pgrep -f 'agent-browser-chrome' >/dev/null 2>&1; then
  pkill -f 'agent-browser-chrome' 2>/dev/null || true
  echo "kill-stale-chromium: cleared agent-browser-chrome"
fi
