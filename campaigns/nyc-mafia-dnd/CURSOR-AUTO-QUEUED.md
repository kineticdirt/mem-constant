# Cursor Auto — queued next run

**Status:** QUEUED after `cursor-20260802T001152Z` (PID 2043289) finishes or if stale (>15m log idle).

**Prompt file:** `agents/state/cursor-prompts/nyc-city-build-ste-20260801.txt`

**Start command (potato):**
```bash
cd ~/agent-dump
export CURSOR_SDK_AUTO_ONLY=1
export CURSOR_AGENT_TIMEOUT_SEC=3600
nohup bash scripts/linuxbox/cursor-agent-run.sh "$(cat agents/state/cursor-prompts/nyc-city-build-ste-20260801.txt)" > /mnt/archive/logs/cursor-agent/nyc-city-build-ste-nohup.log 2>&1 &
```

**Focus:** city economics, culture/nightlife, boroughs; STE voice; 5e texture; refine 2026-08-01 reports — no blank-wipe.
