#!/usr/bin/env bash
# Mirror agents/PONYTAIL_CLEANUP_BOARD.md → USB PERSONAL (human-readable kanban on the drive).
set -euo pipefail

REPO="${HOME}/agent-dump"
SRC="${REPO}/agents/PONYTAIL_CLEANUP_BOARD.md"
USB_ROOT="/media/abhinav/PERSONAL/agent-work/agent-dump"
DEST="${USB_ROOT}/ponytail-board.md"

if [[ ! -f "${SRC}" ]]; then
  echo "Missing ${SRC}" >&2
  exit 1
fi

if [[ ! -d "/media/abhinav/PERSONAL" ]]; then
  echo "USB PERSONAL not mounted — skip sync (repo board is canonical)."
  exit 0
fi

mkdir -p "${USB_ROOT}"
cp "${SRC}" "${DEST}"
echo "Synced ponytail board → ${DEST}"
