#!/usr/bin/env bash
# Pause agent-cycle fast/think crontab lines (instant safety — no git needed).
# Does NOT touch runtime state, registries, or chat-threads.
set -euo pipefail
TMP="$(mktemp)"
crontab -l 2>/dev/null \
  | grep -v 'agent-cycle-fast-tick.sh' \
  | grep -v 'agent-cycle-think-tick.sh' \
  | grep -v 'agent-cycle-fast' \
  | grep -v 'agent-cycle-think-adaptive' \
  | grep -v 'agent-cycle-think-1m' > "${TMP}" || true
crontab "${TMP}"
rm -f "${TMP}"
echo "paused agent-cycle crontab lines"
crontab -l 2>/dev/null | grep -E 'agent-cycle|research-bookmarks' || echo "(no agent-cycle lines left)"
