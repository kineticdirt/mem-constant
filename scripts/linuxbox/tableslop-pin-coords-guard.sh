#!/usr/bin/env bash
# Compare live coords.json pin percents vs pin-coords-frozen.json.
# Exit 0 = ok. Exit 1 = any locked region moved.
# Re-freeze only with explicit: bash …/tableslop-pin-coords-guard.sh --accept
set -euo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-}"
if [[ -z "${REPO}" || ! -d "${REPO}" ]]; then
  REPO="$(cd "$(dirname "$0")/../.." && pwd)"
fi

MAP_DIR="${REPO}/campaigns/tropic-gooner/map"
COORDS="${MAP_DIR}/coords.json"
MAP_JSON="${MAP_DIR}/map.json"
FREEZE="${MAP_DIR}/pin-coords-frozen.json"

ACCEPT=0
for arg in "$@"; do
  case "${arg}" in
    --accept) ACCEPT=1 ;;
    -h|--help)
      echo "usage: tableslop-pin-coords-guard.sh [--accept]"
      echo "  default: fail if coords.json (or map markers) diverge from freeze"
      echo "  --accept: rewrite pin-coords-frozen.json from current coords+map (GM only)"
      exit 0
      ;;
  esac
done

if [[ ! -f "${COORDS}" ]]; then
  echo "tableslop-pin-coords-guard: FAIL — missing ${COORDS}" >&2
  exit 1
fi

if [[ "${ACCEPT}" -eq 1 ]]; then
  python3 - "${COORDS}" "${MAP_JSON}" "${FREEZE}" <<'PY'
import json, os, sys
from datetime import datetime, timezone
coords_p, map_p, freeze_p = sys.argv[1], sys.argv[2], sys.argv[3]
c = json.loads(open(coords_p, encoding="utf-8").read())
m = json.loads(open(map_p, encoding="utf-8").read()) if os.path.isfile(map_p) else {}
prev_v = 0
if os.path.isfile(freeze_p):
    try:
        prev_v = int(json.load(open(freeze_p, encoding="utf-8")).get("version") or 0)
    except Exception:
        prev_v = 0
freeze = {
    "version": prev_v + 1,
    "locked_at": datetime.now(timezone.utc).isoformat(),
    "policy": "FROZEN — do not move pins without explicit GM ask + --accept",
    "holder": "tableslop-pins-lock-freeze",
    "regions": {
        k: {"x_pct": v.get("x_pct"), "y_pct": v.get("y_pct")}
        for k, v in sorted((c.get("regions") or {}).items())
    },
    "markers": [
        {
            "id": mk.get("id"),
            "name": mk.get("name"),
            "region": mk.get("region"),
            "x_pct": mk.get("x_pct"),
            "y_pct": mk.get("y_pct"),
        }
        for mk in (m.get("markers") or [])
    ],
}
with open(freeze_p, "w", encoding="utf-8") as f:
    json.dump(freeze, f, indent=2)
    f.write("\n")
print(
    "tableslop-pin-coords-guard: ACCEPT freeze v=%s regions=%s"
    % (freeze["version"], len(freeze["regions"]))
)
PY
  exit 0
fi

if [[ ! -f "${FREEZE}" ]]; then
  echo "tableslop-pin-coords-guard: FAIL — no freeze file ${FREEZE} (run --accept once)" >&2
  exit 1
fi

python3 - "${COORDS}" "${MAP_JSON}" "${FREEZE}" <<'PY'
import json, sys

def num(x):
    return None if x is None else round(float(x), 2)

coords_p, map_p, freeze_p = sys.argv[1], sys.argv[2], sys.argv[3]
c = json.loads(open(coords_p, encoding="utf-8").read())
m = json.loads(open(map_p, encoding="utf-8").read())
fr = json.loads(open(freeze_p, encoding="utf-8").read())
bad = []
for k, want in (fr.get("regions") or {}).items():
    got = (c.get("regions") or {}).get(k) or {}
    if num(got.get("x_pct")) != num(want.get("x_pct")) or num(got.get("y_pct")) != num(want.get("y_pct")):
        bad.append(
            "coords %s freeze=%s/%s live=%s/%s"
            % (k, want.get("x_pct"), want.get("y_pct"), got.get("x_pct"), got.get("y_pct"))
        )
# map markers must match freeze markers by name when present
want_m = {x.get("name"): x for x in (fr.get("markers") or []) if x.get("name")}
for mk in m.get("markers") or []:
    name = mk.get("name")
    if name not in want_m:
        continue
    w = want_m[name]
    if num(mk.get("x_pct")) != num(w.get("x_pct")) or num(mk.get("y_pct")) != num(w.get("y_pct")):
        bad.append(
            "map %s freeze=%s/%s live=%s/%s"
            % (name, w.get("x_pct"), w.get("y_pct"), mk.get("x_pct"), mk.get("y_pct"))
        )
if bad:
    print("tableslop-pin-coords-guard: FAIL — pins moved vs freeze", file=sys.stderr)
    for line in bad:
        print("  " + line, file=sys.stderr)
    print("Re-freeze only with --accept after explicit GM OK.", file=sys.stderr)
    sys.exit(1)
print(
    "tableslop-pin-coords-guard: PASS v=%s regions=%s (FROZEN)"
    % (fr.get("version"), len(fr.get("regions") or {}))
)
PY
