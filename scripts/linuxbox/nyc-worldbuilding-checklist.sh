#!/usr/bin/env bash
# Print next NYC worldbuilding tick hint for Hermes / human (no LLM).
set -euo pipefail

REPO="${NYC_WB_REPO:-$(cd "$(dirname "$0")/../../" && pwd)}"
PROGRESS="${REPO}/campaigns/nyc-mafia-dnd/worldbuilding/progress.md"

if [[ ! -f "${PROGRESS}" ]]; then
  echo "MISSING: ${PROGRESS}"
  exit 1
fi

echo "=== NYC worldbuilding tick hint ==="
echo "Read: LOCKS.md → SETTING-*.md → worldbuilding/strokes/*locked*"
echo ""

open_line="$(grep -n '^- \[ \]' "${PROGRESS}" | head -1 || true)"
if [[ -z "${open_line}" ]]; then
  echo "STATUS: all Phase E items checked — lane idle"
  exit 0
fi

line_no="${open_line%%:*}"
item="$(sed -n "${line_no}p" "${PROGRESS}")"
echo "NEXT: ${item}"
echo "FILE: ${PROGRESS}:${line_no}"
