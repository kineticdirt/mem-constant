#!/usr/bin/env bash
# Hermes --script hook: RSS situation brief (no LLM). stdout → cron log if needed.
set -euo pipefail

REPO="${HERMES_SITUATION_REPO:-$HOME/agent-dump}"
cd "${REPO}"

SOURCES="scripts/situation_monitor/sources.json"
if [[ ! -f "${SOURCES}" ]]; then
  SOURCES="scripts/situation_monitor/sources.example.json"
fi

python3 scripts/situation_monitor/daily_situation_monitor.py \
  --sources "${SOURCES}" \
  --write-carryover

LATEST="${REPO}/reports/situation-monitor"
NEWEST="$(ls -t "${LATEST}"/situation-brief-*.md 2>/dev/null | head -1)"
if [[ -n "${NEWEST}" ]]; then
  cp -f "${NEWEST}" "${LATEST}/LATEST-BRIEF.md"
  echo "LATEST-BRIEF=${NEWEST}"
fi
