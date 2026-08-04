#!/usr/bin/env bash
# Compare live regions-ui.json GM polygon verts vs regions-ui.gm-watermark.json.
# Exit 0 = ok (no regression). Exit 1 = vert/poly count dropped vs watermark.
# Update baseline only with explicit:  bash …/tableslop-gm-borders-guard.sh --accept
set -euo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-}"
if [[ -z "${REPO}" || ! -d "${REPO}" ]]; then
  REPO="$(cd "$(dirname "$0")/../.." && pwd)"
fi

MAP_DIR="${REPO}/campaigns/tropic-gooner/map"
RUI="${MAP_DIR}/regions-ui.json"
WATERMARK="${MAP_DIR}/regions-ui.gm-watermark.json"
GM_STATS="${REPO}/scripts/linuxbox/regions-ui-gm-stats.py"

ACCEPT=0
for arg in "$@"; do
  case "${arg}" in
    --accept) ACCEPT=1 ;;
    -h|--help)
      echo "usage: tableslop-gm-borders-guard.sh [--accept]"
      echo "  default: compare live regions-ui.json vs watermark; exit 1 on regression"
      echo "  --accept: write watermark from current live file (GM/agent explicit only)"
      exit 0
      ;;
  esac
done

if [[ ! -f "${RUI}" ]]; then
  echo "tableslop-gm-borders-guard: FAIL — missing ${RUI}" >&2
  exit 1
fi
if [[ ! -f "${GM_STATS}" ]]; then
  echo "tableslop-gm-borders-guard: FAIL — missing ${GM_STATS}" >&2
  exit 1
fi

read_live() {
  python3 "${GM_STATS}" "${RUI}" --json
}

if [[ "${ACCEPT}" -eq 1 ]]; then
  LIVE_JSON="$(read_live)"
  NOW="$(date -u -Iseconds)"
  python3 - "${WATERMARK}" "${NOW}" "${LIVE_JSON}" <<'PY'
import json, os, sys
wm_path, now, live_s = sys.argv[1], sys.argv[2], sys.argv[3]
live = json.loads(live_s)
out = {
    "_doc": (
        "GM border vert baseline — compare via scripts/linuxbox/tableslop-gm-borders-guard.sh. "
        "Update only with --accept after GM Draw saves (never auto-bump on PASS)."
    ),
    "file": "campaigns/tropic-gooner/map/regions-ui.json",
    "accepted_at": now,
    "accepted_by": "tableslop-gm-borders-guard.sh --accept",
    "version": live.get("version"),
    "poly_count": live.get("poly_count"),
    "total_verts": live.get("total_verts"),
    "polys": live.get("polys") or {},
}
os.makedirs(os.path.dirname(wm_path), exist_ok=True)
with open(wm_path, "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2)
    f.write("\n")
polys = ",".join(f"{k}:{v}" for k, v in sorted((out["polys"] or {}).items()))
print(
    "tableslop-gm-borders-guard: ACCEPT watermark v=%s polys=%s verts=%s (%s)"
    % (out["version"], out["poly_count"], out["total_verts"], polys or "none")
)
PY
  exit 0
fi

if [[ ! -f "${WATERMARK}" ]]; then
  LIVE_JSON="$(read_live)"
  echo "tableslop-gm-borders-guard: WARN — no watermark at ${WATERMARK}" >&2
  python3 - "${LIVE_JSON}" <<'PY'
import json, sys
live = json.loads(sys.argv[1])
polys = ",".join(f"{k}:{v}" for k, v in sorted((live.get("polys") or {}).items()))
print(
    "  live v=%s polys=%s verts=%s (%s)"
    % (live.get("version"), live.get("poly_count"), live.get("total_verts"), polys or "none"),
    file=sys.stderr,
)
print("  run with --accept once to baseline (GM approval)", file=sys.stderr)
PY
  exit 1
fi

python3 - "${RUI}" "${WATERMARK}" "${GM_STATS}" <<'PY'
import json, subprocess, sys

rui, wm_path, gm_stats = sys.argv[1], sys.argv[2], sys.argv[3]

def load_stats(path):
    raw = subprocess.check_output([sys.executable, gm_stats, path, "--json"], text=True)
    return json.loads(raw)

live = load_stats(rui)
with open(wm_path, encoding="utf-8") as f:
    wm = json.load(f)

fails = []
wm_polys = wm.get("polys") or {}
live_polys = live.get("polys") or {}

if int(live.get("poly_count") or 0) < int(wm.get("poly_count") or 0):
    fails.append(
        "poly_count %d < watermark %d"
        % (live.get("poly_count"), wm.get("poly_count"))
    )
if int(live.get("total_verts") or 0) < int(wm.get("total_verts") or 0):
    fails.append(
        "total_verts %d < watermark %d"
        % (live.get("total_verts"), wm.get("total_verts"))
    )
for rid, wn in sorted(wm_polys.items()):
    ln = live_polys.get(rid)
    if ln is None:
        fails.append("missing poly %s (watermark had %d verts)" % (rid, wn))
    elif int(ln) < int(wn):
        fails.append("poly %s verts %d < watermark %d" % (rid, ln, wn))

new_polys = sorted(set(live_polys) - set(wm_polys))
live_s = ",".join(f"{k}:{v}" for k, v in sorted(live_polys.items()))
wm_s = ",".join(f"{k}:{v}" for k, v in sorted(wm_polys.items()))

if fails:
    print("tableslop-gm-borders-guard: FAIL", file=sys.stderr)
    print("  watermark v=%s polys=%s" % (wm.get("version"), wm_s or "none"), file=sys.stderr)
    print("  live      v=%s polys=%s" % (live.get("version"), live_s or "none"), file=sys.stderr)
    for msg in fails:
        print("  - %s" % msg, file=sys.stderr)
    raise SystemExit(1)

msg = "tableslop-gm-borders-guard: PASS v=%s verts=%s (%s)" % (
    live.get("version"),
    live.get("total_verts"),
    live_s or "none",
)
if new_polys:
    msg += " [new polys %s — run --accept to bump watermark]" % ",".join(new_polys)
print(msg)
PY
