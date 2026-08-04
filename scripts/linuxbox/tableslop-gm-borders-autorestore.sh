#!/usr/bin/env bash
# After sync/bundle: if live regions-ui is stubs/regressed vs richest bak, restore.
# Stops apply-git-bundle --hard from leaving git HEAD ellipse stubs in place when
# preserve fails. Never invents polys — only copies an existing richer bak.
set -euo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-}"
if [[ -z "${REPO}" || ! -d "${REPO}" ]]; then
  REPO="$(cd "$(dirname "$0")/../.." && pwd)"
fi

MAP="${REPO}/campaigns/tropic-gooner/map"
LIVE="${MAP}/regions-ui.json"
STATS="${REPO}/scripts/linuxbox/regions-ui-gm-stats.py"
GOLD="${MAP}/regions-ui.json.bak-autosave-2026-08-01T2208Z"
ARCHIVE_GOLD="/mnt/archive/state-backups/tableslop/regions-ui.gm-gold.json"

if [[ ! -f "${STATS}" ]]; then
  echo "tableslop-gm-borders-autorestore: skip (no stats script)" >&2
  exit 0
fi

live_verts="$(python3 "${STATS}" "${LIVE}" --json 2>/dev/null | python3 -c "import sys,json; print(int(json.load(sys.stdin).get('total_verts') or 0))" 2>/dev/null || echo 0)"

best=""
best_v=0
for cand in "${ARCHIVE_GOLD}" "${GOLD}" "${MAP}"/regions-ui.json.bak-porto-protect-* "${MAP}"/regions-ui.json.bak-autosave-*; do
  [[ -f "${cand}" ]] || continue
  v="$(python3 "${STATS}" "${cand}" --json 2>/dev/null | python3 -c "import sys,json; print(int(json.load(sys.stdin).get('total_verts') or 0))" 2>/dev/null || echo 0)"
  if [[ "${v}" -gt "${best_v}" ]]; then
    best_v="${v}"
    best="${cand}"
  fi
done

if [[ -z "${best}" ]]; then
  echo "tableslop-gm-borders-autorestore: no bak candidates" >&2
  exit 0
fi

# Regressed if live is empty/stub while bak has real GM verts
if [[ "${live_verts}" -ge 3 && "${live_verts}" -ge $((best_v * 80 / 100)) ]]; then
  echo "tableslop-gm-borders-autorestore: ok live=${live_verts} best=${best_v}"
  exit 0
fi

if [[ "${best_v}" -lt 3 ]]; then
  echo "tableslop-gm-borders-autorestore: nothing rich to restore (best=${best_v})" >&2
  exit 0
fi

ts="$(date -u +%Y%m%dT%H%MZ)"
cp -a "${LIVE}" "${MAP}/regions-ui.json.bak-before-autorestore-${ts}" 2>/dev/null || true
cp -a "${best}" "${LIVE}"
mkdir -p /mnt/archive/state-backups/tableslop 2>/dev/null || true
cp -a "${best}" "${ARCHIVE_GOLD}" 2>/dev/null || true
echo "tableslop-gm-borders-autorestore: RESTORED from ${best} (was live=${live_verts} → ${best_v})" >&2
# bust tableslop cache if running
systemctl try-restart linuxbox-tableslop 2>/dev/null || true
exit 0
