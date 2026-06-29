#!/usr/bin/env bash
# Run ON linuxbox (via Hermes cron, --no-agent): deterministic price re-check, no LLM.
set -euo pipefail
REPO="${HOME}/agent-dump"
exec python3 "${REPO}/scripts/mazda3/price_monitor.py" \
  --parts "${REPO}/projects/mazda3-sports-build/parts.json"
