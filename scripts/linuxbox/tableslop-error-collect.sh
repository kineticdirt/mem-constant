#!/usr/bin/env bash
# Collect structured Tableslop errors (Theme A+B). Deterministic — no LLM.
# Writes reports/tableslop-errors/LATEST.json + runs/<UTC>.json
# Exit 1 if any severity=error finding.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="${TABLESLOP_ERROR_DIR:-$ROOT/reports/tableslop-errors}"
CODES_FILE="$OUT_DIR/codes.json"
HOST_MAP="${TABLESLOP_MAP_HOST:-127.0.0.1:8765}"
HOST_CAMP="${TABLESLOP_CAMP_HOST:-127.0.0.1:8768}"
CHECK_PUBLIC="${TABLESLOP_CHECK_PUBLIC:-0}"
RUN_SMOKES="${TABLESLOP_RUN_SMOKES:-0}"
UTC="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT_DIR/runs"

FINDINGS_FILE="$(mktemp)"
trap 'rm -f "$FINDINGS_FILE"' EXIT

add_finding() {
  local code="$1"
  local severity="$2"
  local surface="$3"
  local detail="$4"
  printf '%s\t%s\t%s\t%s\n' "$code" "$severity" "$surface" "$detail" >>"$FINDINGS_FILE"
}

http_code() {
  local url="$1"
  curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 15 "$url" 2>/dev/null || echo 000
}

echo "=== Tableslop error collect ($UTC) ==="

# --- health matrix endpoints ---
code="$(http_code "http://${HOST_MAP}/health")"
if [[ "$code" != "200" ]]; then add_finding TS-HEALTH-MAP error map "GET /health HTTP $code"; fi
code="$(http_code "http://${HOST_MAP}/")"
if [[ "$code" != "200" ]]; then add_finding TS-HEALTH-MAP error map "GET / HTTP $code"; fi
code="$(http_code "http://${HOST_MAP}/api/map")"
if [[ "$code" != "200" ]]; then
  add_finding TS-HEALTH-MAP error map "GET /api/map HTTP $code"
else
  MAP_TMP="$(mktemp)"
  curl -s --connect-timeout 5 --max-time 20 "http://${HOST_MAP}/api/map" >"$MAP_TMP" 2>/dev/null || true
  if ! python3 -c 'import sys,json; json.load(open(sys.argv[1],encoding="utf-8"))' "$MAP_TMP" 2>/dev/null; then
    add_finding TS-API-MAP-PARSE error map "/api/map not JSON"
  else
    python3 - "$MAP_TMP" "$CODES_FILE" "$FINDINGS_FILE" <<'PY'
import json, sys
map_path, codes_path, findings_path = sys.argv[1], sys.argv[2], sys.argv[3]
data = json.load(open(map_path, encoding="utf-8"))
codes = json.load(open(codes_path, encoding="utf-8"))
forbidden = {x.lower() for x in codes.get("forbidden_display_labels", [])}
required = codes.get("required_vibes_labels", [])
markers = data.get("markers") or []
labels = [(m.get("label") or m.get("name") or "") for m in markers]
label_set = {x for x in labels if x}

def add(code, sev, surface, detail):
    with open(findings_path, "a", encoding="utf-8") as f:
        f.write(f"{code}\t{sev}\t{surface}\t{detail}\n")

n = len(markers)
if n < 14:
    add("TS-MAP-MARKER-COUNT", "warn", "map", f"marker_count={n} expected>=14")

for lab in labels:
    if lab.lower() in forbidden:
        soft = lab.lower() in {"orchid falls", "nueva vista"}
        code = "TS-MAP-SOFT-PIN" if soft else "TS-MAP-LABEL-LORE"
        add(code, "error", "map", f"forbidden_display={lab!r}")

missing = [r for r in required if r not in label_set]
if missing:
    add("TS-MAP-LABEL-LORE", "error", "map", "missing_vibes_labels=" + ",".join(missing))
PY
  fi
  rm -f "$MAP_TMP"
fi

code="$(http_code "http://${HOST_CAMP}/health")"
if [[ "$code" != "200" ]]; then add_finding TS-HEALTH-CAMP error campaigns "GET /health HTTP $code"; fi
code="$(http_code "http://${HOST_CAMP}/")"
if [[ "$code" != "200" ]]; then add_finding TS-HEALTH-CAMP error campaigns "GET / HTTP $code"; fi
code="$(http_code "http://${HOST_CAMP}/api/availability")"
if [[ "$code" != "200" ]]; then add_finding TS-HEALTH-CAMP error campaigns "GET /api/availability HTTP $code"; fi

# GM-drawn region polygons (potato-owned regions-ui.json)
RUI_FILE="$ROOT/campaigns/tropic-gooner/map/regions-ui.json"
if [[ -f "$RUI_FILE" ]]; then
  python3 - "$RUI_FILE" "$ROOT/campaigns/tropic-gooner/map" "$FINDINGS_FILE" <<'PY'
import glob, json, sys
from pathlib import Path

rui_path, map_dir, findings_path = sys.argv[1], sys.argv[2], sys.argv[3]

def poly_count(path):
    data = json.load(open(path, encoding="utf-8"))
    areas = data.get("areas") or []
    if isinstance(areas, dict):
        areas = list(areas.values())
    polys = {}
    for a in areas:
        pts = a.get("points") or ""
        n = 0
        if isinstance(pts, str) and pts.strip():
            n = len([x for x in pts.replace(",", " ").split() if x.strip()]) // 2
        elif isinstance(pts, list):
            n = len(pts)
        if n >= 3:
            polys[a.get("id", "?")] = n
    return data.get("version"), polys

live_ver, live_polys = poly_count(rui_path)
bak_best = {}
bak_max_by_id = {}
for bak in sorted(glob.glob(str(Path(map_dir) / "regions-ui.json.bak-*"))):
    try:
        _, polys = poly_count(bak)
        if sum(polys.values()) > sum(bak_best.values()):
            bak_best = polys
        for aid, n in polys.items():
            bak_max_by_id[aid] = max(bak_max_by_id.get(aid, 0), n)
    except Exception:
        pass

def emit(code, sev, surface, detail):
    with open(findings_path, "a", encoding="utf-8") as f:
        f.write(f"{code}\t{sev}\t{surface}\t{detail}\n")

if not live_polys and bak_best:
    detail = (
        f"live_v={live_ver} gm_polys=0; richest_bak has "
        + ",".join(f"{k}:{v}" for k, v in sorted(bak_best.items()))
    )
    emit("TS-MAP-GM-BORDERS-MISSING", "error", "map", detail)

# City started (had GM verts in a bak) but live empty — e.g. Porto after Paradise PIP reassign
# Priority cities GM has been drawing; do not spam every pending draft city.
priority = {
    "r01-paradise": "Paradise",
    "r02-porto-lujuria": "Porto Lujara",
    "r03-crimson-quay": "Jackedsonville",
}
for aid, label in priority.items():
    live_n = live_polys.get(aid, 0)
    bak_n = bak_max_by_id.get(aid, 0)
    if bak_n >= 3 and live_n < 3:
        emit(
            "TS-MAP-CITY-BORDER-MISSING",
            "error",
            "map",
            f"{label} id={aid} live_verts={live_n} bak_max={bak_n} (GM Draw or reassign — do not invent verts)",
        )
PY
fi

if [[ "$CHECK_PUBLIC" == "1" ]]; then
  code="$(http_code "https://map.tableslop.org/health")"
  if [[ "$code" != "200" ]]; then add_finding TS-HEALTH-PUBLIC error edge "map.tableslop.org/health HTTP $code"; fi
  code="$(http_code "https://campaigns.tableslop.org/health")"
  if [[ "$code" != "200" ]]; then add_finding TS-HEALTH-PUBLIC error edge "campaigns.tableslop.org/health HTTP $code"; fi
fi

# optional Playwright (off by default — heavy on potato)
if [[ "$RUN_SMOKES" == "1" ]]; then
  SMOKE_DIR="${TABLESLOP_SMOKE_DIR:-$ROOT/.staging/portfolio-redesign/_screenshots}"
  if [[ -d "$SMOKE_DIR" ]] && command -v node >/dev/null 2>&1; then
    set +e
    (cd "$SMOKE_DIR" && PREVIEW_URL="http://${HOST_MAP}/" node "$ROOT/campaigns/tropic-gooner/map/tableslop-smoke.mjs")
    sm=$?
    set -e
    if [[ "$sm" -ne 0 ]]; then add_finding TS-SMOKE-MAP error map "tableslop-smoke exit $sm"; fi
    set +e
    (cd "$SMOKE_DIR" && PREVIEW_URL="http://${HOST_CAMP}/" node "$ROOT/campaigns/tropic-gooner/map/campaigns-avail-smoke.mjs")
    sc=$?
    set -e
    if [[ "$sc" -ne 0 ]]; then add_finding TS-SMOKE-CAMP error campaigns "campaigns-avail-smoke exit $sc"; fi
  else
    add_finding TS-SMOKE-MAP warn map "smokes skipped (no node or smoke dir)"
  fi
fi

# --- assemble JSON ---
python3 - "$FINDINGS_FILE" "$OUT_DIR" "$UTC" "$CODES_FILE" <<'PY'
import json, sys, os
from pathlib import Path
findings_path, out_dir, utc, codes_path = sys.argv[1:5]
findings = []
for line in Path(findings_path).read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    code, sev, surface, detail = line.split("\t", 3)
    findings.append({"code": code, "severity": sev, "surface": surface, "detail": detail})
codes_meta = json.load(open(codes_path, encoding="utf-8")) if Path(codes_path).is_file() else {}
errors = [f for f in findings if f["severity"] == "error"]
warns = [f for f in findings if f["severity"] == "warn"]
doc = {
    "version": 1,
    "collected_at": utc,
    "ok": len(errors) == 0,
    "error_count": len(errors),
    "warn_count": len(warns),
    "findings": findings,
    "codes_version": codes_meta.get("version"),
}
out = Path(out_dir)
(out / "LATEST.json").write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
(out / "runs" / f"{utc}.json").write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"ok": doc["ok"], "error_count": doc["error_count"], "warn_count": doc["warn_count"], "path": str(out / "LATEST.json")}))
sys.exit(0 if doc["ok"] else 1)
PY
