#!/usr/bin/env bash
# Push tableslop map to linuxbox: serving bundle + source backup, then restart.
# Map binaries are gitignored, so `git pull` won't carry them — scp does.
#
# Usage: bash scripts/linuxbox/push-tableslop-map.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${LINUXBOX_HOST:-abhinav@100.122.108.94}"
KEY="${LINUXBOX_SSH_KEY:-$HOME/.ssh/id_rsa_potato}"
REMOTE_REPO="${LINUXBOX_AGENT_DUMP:-/home/abhinav/agent-dump}"
MAP="campaigns/tropic-gooner/map"
TARBALL="/tmp/tableslop-map-deploy.tgz"

# Serving artifacts + sources (sources are gitignored; linuxbox is their durable home).
# regions-ui.json is potato-owned (GM Draw→Save). Excluded by default so empty PC
# stubs cannot clobber live borders. Opt-in: PUSH_REGIONS_UI=1 after potato→PC pull
# with non-empty geometry (see campaigns/tropic-gooner/map/REGIONS-UI-LOCK.md).
PATHS=(
  "scripts/linuxbox/tableslop-server.js"
  "scripts/linuxbox/tableslop-auth.js"
  "scripts/linuxbox/tableslop-world-roads.js"
  "scripts/linuxbox/tableslop-world-weather.js"
  "scripts/linuxbox/tableslop-world-sot.js"
  "scripts/linuxbox/vendor/sql-js"
  "scripts/linuxbox/tableslop-static/3d"
  "scripts/tableslop/m1-paradise-verify.cjs"
  "scripts/tableslop/phone-responder.js"
  "campaigns/tropic-gooner/roads"
  "campaigns/tropic-gooner/weather"
  "campaigns/tropic-gooner/board"
  "campaigns/tropic-gooner/logistics"
  "${MAP}/map.json"
  "${MAP}/cities"
  "${MAP}/coords.json"
  "${MAP}/layers.json"
  "${MAP}/pyramid.json"
  "${MAP}/master-enhanced.png"
  "${MAP}/heightmap-256.bin"
  "${MAP}/heightmap-256.json"
  "${MAP}/roadmask-256.bin"
  "${MAP}/heightmap-512.bin"
  "${MAP}/heightmap-512.json"
  "${MAP}/roadmask-512.bin"
  "${MAP}/heightmap-1024.bin"
  "${MAP}/heightmap-1024.json"
  "${MAP}/roadmask-1024.bin"
  "${MAP}/heightmap-4096.bin"
  "${MAP}/heightmap-4096.json"
  "${MAP}/roadmask-4096.bin"
  "${MAP}/heightmap-8192.bin"
  "${MAP}/heightmap-8192.json"
  "${MAP}/roadmask-8192.bin"
  "${MAP}/tiles"
  "${MAP}/output-onlinetools4k.png"
  "${MAP}/output-onlinetools-2k.png"
)

_GM_STATS="${REPO}/scripts/linuxbox/regions-ui-gm-stats.py"
_rui="${REPO}/${MAP}/regions-ui.json"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=20 -o IdentitiesOnly=yes -i "${KEY}")

_remote_gm_stats_inline() {
  ssh "${SSH_OPTS[@]}" "${HOST}" python3 - <<'PY'
import json, os
p = os.path.expanduser("~/agent-dump/campaigns/tropic-gooner/map/regions-ui.json")
if not os.path.isfile(p):
    print("MISSING")
    raise SystemExit(0)
d = json.load(open(p, encoding="utf-8"))
areas = d.get("areas") or []
if isinstance(areas, dict):
    areas = list(areas.values())
polys, total = {}, 0
has_ellipse = False
for a in areas:
    if not isinstance(a, dict):
        continue
    shape = a.get("shape")
    if shape == "ellipse":
        has_ellipse = True
        continue
    pts = a.get("points")
    n = 0
    if isinstance(pts, list):
        n = len(pts) if len(pts) >= 3 else 0
    else:
        s = str(pts or "").strip()
        if s and len(s) > 2:
            n = len([x for x in s.split() if x and "," in x])
    if n >= 3:
        polys[str(a.get("id") or "?")] = n
        total += n
doc = str(d.get("_doc") or "")
stub = len(polys) == 0 and (has_ellipse or "ellipses" in doc.lower())
print(json.dumps({
    "version": d.get("version"),
    "poly_count": len(polys),
    "total_verts": total,
    "polys": polys,
    "is_empty_or_stub": stub,
}))
PY
}

if [[ -f "${_GM_STATS}" && -f "${_rui}" ]]; then
  _local_json="$(python3 "${_GM_STATS}" "${_rui}" --json 2>/dev/null || echo '{}')"
else
  _local_json='{"poly_count":0,"total_verts":0,"is_empty_or_stub":true}'
fi
_remote_json="$(_remote_gm_stats_inline)"
echo "regions-ui local: poly_count=$(python3 -c "import json; j=json.loads('${_local_json}'); print(j.get('poly_count',0))") verts=$(python3 -c "import json; j=json.loads('${_local_json}'); print(j.get('total_verts',0))")"
if [[ "${_remote_json}" != "MISSING" && "${_remote_json}" != "REMOTE_ERR" ]]; then
  echo "regions-ui remote: ${_remote_json}"
fi

if [[ "${PUSH_REGIONS_UI:-0}" == "1" ]]; then
  if [[ ! -f "${_rui}" ]]; then
    echo "REFUSE: PUSH_REGIONS_UI=1 but PC ${_rui} missing" >&2
    exit 1
  fi
  _local_poly="$(python3 -c "import json; j=json.loads('${_local_json}'); print(j.get('poly_count',0))")"
  _local_verts="$(python3 -c "import json; j=json.loads('${_local_json}'); print(j.get('total_verts',0))")"
  _local_stub="$(python3 -c "import json; j=json.loads('${_local_json}'); print(1 if j.get('is_empty_or_stub') else 0)")"
  if [[ "${_local_poly}" -le 0 ]] || [[ "${_local_stub}" == "1" ]]; then
    echo "REFUSE: PUSH_REGIONS_UI=1 but PC regions-ui empty/stub (polys=${_local_poly}). Pull potato→PC first." >&2
    exit 1
  fi
  if [[ "${_remote_json}" != "MISSING" && "${_remote_json}" != "REMOTE_ERR" ]]; then
    _refuse="$(python3 - "${_local_json}" "${_remote_json}" <<'PY'
import json, sys
local, remote = json.loads(sys.argv[1]), json.loads(sys.argv[2])
rp, rv = int(remote.get("poly_count") or 0), int(remote.get("total_verts") or 0)
lp, lv = int(local.get("poly_count") or 0), int(local.get("total_verts") or 0)
if rp == 0:
    raise SystemExit(0)
if local.get("is_empty_or_stub"):
    print(f"local stub vs remote polys={rp} verts={rv}")
    raise SystemExit(1)
if lv < rv:
    print(f"local verts {lv} < remote {rv}")
    raise SystemExit(1)
PY
)"
    if [[ -n "${_refuse}" ]]; then
      echo "REFUSE: PUSH_REGIONS_UI=1 would clobber potato GM borders — ${_refuse}" >&2
      exit 1
    fi
  fi
  PATHS+=("${MAP}/regions-ui.json")
  echo "PUSH_REGIONS_UI=1 — including regions-ui.json (local polys=${_local_poly} verts=${_local_verts})"
else
  echo "skip ${MAP}/regions-ui.json (potato-owned; set PUSH_REGIONS_UI=1 after non-empty potato→PC pull)"
  if [[ "${_remote_json}" != "MISSING" && "${_remote_json}" != "REMOTE_ERR" ]]; then
    _remote_poly="$(python3 -c "import json; j=json.loads('${_remote_json}'); print(j.get('poly_count',0))")"
    if [[ "${_remote_poly}" -gt 0 ]]; then
      echo "remote GM borders preserved (${_remote_poly} polys) — map push will NOT touch regions-ui.json"
    fi
  fi
fi

for p in "${PATHS[@]}"; do
  [ -e "${REPO}/${p}" ] || { echo "missing: ${p}" >&2; exit 1; }
done
# reference/ is optional (Canva exports, traces)
if [ -d "${REPO}/${MAP}/reference" ]; then
  PATHS+=("${MAP}/reference")
fi

tar -czf "${TARBALL}" -C "${REPO}" "${PATHS[@]}"
echo "uploading $(du -h "${TARBALL}" | cut -f1) over Tailscale (slow uplink — be patient)…"
scp "${SSH_OPTS[@]}" "${TARBALL}" "${HOST}:/tmp/tableslop-map-deploy.tgz"

ssh "${SSH_OPTS[@]}" "${HOST}" bash -s <<EOF
set -euo pipefail
tar xzf /tmp/tableslop-map-deploy.tgz -C "${REMOTE_REPO}"
# Prefer user unit; fall back to bare node if unit missing (potato often runs nohup)
if systemctl --user cat linuxbox-tableslop.service >/dev/null 2>&1; then
  systemctl --user restart linuxbox-tableslop
  sleep 2
  systemctl --user is-active linuxbox-tableslop
else
  pkill -f 'node .*tableslop-server.js' || true
  sleep 1
  cd "${REMOTE_REPO}"
  nohup /usr/bin/node scripts/linuxbox/tableslop-server.js >> /tmp/tableslop-server.log 2>&1 &
  sleep 3
fi
curl -s -o /dev/null -w "tableslop8765:%{http_code}\\n" http://127.0.0.1:8765/health
# Content gate: HTTP health alone does not prove map.json landed (see reports/agent-mistake-patterns-2026-07-26.md).
python3 - <<'PY'
import json, urllib.request, sys
raw = urllib.request.urlopen("http://127.0.0.1:8765/api/map", timeout=10).read()
data = json.loads(raw)
markers = data.get("markers") or []
labels = [m.get("label") or m.get("name") or "?" for m in markers]
print(f"api/map markers={len(markers)} labels={labels}")
if len(markers) < 1:
    sys.exit("push-tableslop-map: /api/map returned 0 markers")
PY
# Prevention: never claim 3D live if god-view scale=2 / missing heightmesh watermark
IDX="${REMOTE_REPO}/scripts/linuxbox/tableslop-static/3d/index.html"
APP="${REMOTE_REPO}/scripts/linuxbox/tableslop-static/3d/app.js"
grep -q 'tableslop-3d-watermark: gmaps2' "\$IDX" || { echo "FAIL: /3d index missing gmaps2 watermark" >&2; exit 1; }
grep -q 'scale: 200' "\$APP" || { echo "FAIL: /3d app.js not scale 200 (stale god-view?)" >&2; exit 1; }
curl -s -o /dev/null -w "hm4096:%{http_code} %{size_download}\\n" http://127.0.0.1:8765/map-heightmap-4096.bin
code=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/map-heightmap-4096.bin)
test "\$code" = "200" || { echo "FAIL: heightmap-4096 not served" >&2; exit 1; }
EOF


echo "OK — map deployed to ${HOST}:${REMOTE_REPO}/${MAP}; linuxbox-tableslop restarted"

# Post-deploy GM border gates on linuxbox (fail loud on regression).
ssh "${SSH_OPTS[@]}" "${HOST}" bash -s <<'REMOTE_VERIFY'
set -euo pipefail
REPO="${LINUXBOX_AGENT_DUMP:-/home/abhinav/agent-dump}"
cd "${REPO}"
bash "${REPO}/scripts/linuxbox/tableslop-gm-borders-guard.sh"
bash "${REPO}/scripts/linuxbox/tableslop-pin-coords-guard.sh"
bash "${REPO}/scripts/linuxbox/verify-runtime-state.sh" --context tableslop-map
REMOTE_VERIFY
echo "push-tableslop-map: post-deploy verify PASS"
