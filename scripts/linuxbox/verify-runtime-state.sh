#!/usr/bin/env bash
# Post-deploy / post-apply verification gate — fail loud, never silent.
# Checks (see docs/runtime-state-protection.md):
#   1. versioned-json protected files did not go DOWN vs watermark
#   2. dashboard HTML build marker matches server JS (deployed pair)
#   3. dashboard :8790 answers 200 (skipped when service not present, e.g. PC)
#   4. roster API count >= manifest min_visible
# On failure: append agents/state/dashboard-deploy-alerts.jsonl + open a
# human-inbox question (stable per-day id + fail_sig dedupe), exit 1.
# On PASS: auto-close any open runtime-verify-fail-* (stale incidents).
set -uo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-${HOME}/agent-dump}"
[[ -d "${REPO}" ]] || REPO="$(cd "$(dirname "$0")/../.." && pwd)"
CONTEXT="manual"
if [[ "${1:-}" == "--context" ]]; then CONTEXT="${2:-manual}"; fi

PP="${REPO}/scripts/linuxbox/protected-paths.py"
DASH_INDEX="${REPO}/scripts/linuxbox/linuxbox-status/index.html"
DASH_SERVER="${REPO}/scripts/linuxbox/linuxbox-status-server.js"
ALERT_LOG="${REPO}/agents/state/dashboard-deploy-alerts.jsonl"
BASE_URL="${DASHBOARD_BASE_URL:-http://127.0.0.1:8790}"

FAILS=()

# 1. version watermarks
if [[ -f "${PP}" ]]; then
  if ! python3 "${PP}" verify-versions; then
    FAILS+=("versioned-json watermark regression")
  fi
else
  echo "verify-runtime-state: WARN protected-paths.py missing" >&2
fi

# 2. build marker pair (HTML meta must equal server JS const)
if [[ -f "${DASH_INDEX}" && -f "${DASH_SERVER}" ]]; then
  HTML_MARK="$(grep -o 'name="dash-build" content="[^"]*"' "${DASH_INDEX}" | grep -o 'content="[^"]*"' | cut -d'"' -f2 || true)"
  JS_MARK="$(grep -o 'DASH_BUILD = "[^"]*"' "${DASH_SERVER}" | cut -d'"' -f2 || true)"
  if [[ -z "${HTML_MARK}" || -z "${JS_MARK}" ]]; then
    FAILS+=("dash-build marker missing (html='${HTML_MARK}' js='${JS_MARK}')")
  elif [[ "${HTML_MARK}" != "${JS_MARK}" ]]; then
    FAILS+=("dash-build mismatch html='${HTML_MARK}' js='${JS_MARK}'")
  else
    echo "verify: dash-build pair ok (${HTML_MARK})"
  fi
fi

# legacy structural markers (kept from earlier incidents)
if [[ -f "${DASH_INDEX}" ]]; then
  if ! grep -q 'active-work' "${DASH_INDEX}" || ! grep -q 'chat-threads-toggle' "${DASH_INDEX}"; then
    FAILS+=("dashboard structural markers missing (active-work/chat-threads-toggle)")
  fi
fi

# 3 + 4. live service checks — only where the service exists (the box)
if systemctl list-unit-files linuxbox-status.service >/dev/null 2>&1 \
  && systemctl is-enabled linuxbox-status >/dev/null 2>&1; then
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${BASE_URL}/" || echo 000)"
  if [[ "${CODE}" != "200" ]]; then
    FAILS+=("dashboard ${BASE_URL}/ returned ${CODE}")
  else
    echo "verify: dashboard 200"
  fi
  # roster APIs from manifest verify blocks
  while IFS=$'\t' read -r api min_visible; do
    [[ -z "${api}" ]] && continue
    OUT="$(curl -s --max-time 15 "${BASE_URL}${api}" || true)"
    RES="$(printf '%s' "${OUT}" | python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    j = json.loads(raw)
except Exception:
    print("PARSE_FAIL")
    raise SystemExit
print("%d %d" % (len(j.get("characters") or []), int(j.get("version") or 0)))
' || echo PARSE_FAIL)"
    if [[ "${RES}" == "PARSE_FAIL" ]]; then
      FAILS+=("roster API ${api} returned non-JSON")
    else
      COUNT="${RES%% *}"
      VER="${RES##* }"
      if [[ "${COUNT}" -lt "${min_visible}" ]]; then
        FAILS+=("roster API ${api} count ${COUNT} < min ${min_visible}")
      else
        echo "verify: roster ${api} ok (v${VER}, ${COUNT} visible)"
      fi
    fi
  done < <(python3 - "${REPO}" <<'PY'
import json, os, sys
repo = sys.argv[1]
try:
    m = json.load(open(os.path.join(repo, "agents", "protected-runtime-paths.json"), encoding="utf-8"))
except Exception:
    raise SystemExit
for e in m.get("paths", []):
    v = e.get("verify") or {}
    if v.get("api"):
        print("%s\t%d" % (v["api"], int(v.get("min_visible") or 1)))
PY
  )
else
  echo "verify: linuxbox-status service not present here — skipping live checks"
fi

# 3b. Other node services must at least ANSWER (000 = dead/wedged/refused). Their
# post-deploy restarts in apply-git-bundle/git-pull-and-deploy curl with `|| true`,
# so without this a failed boot (syntax error, missing module) still PASSes the gate.
# Any non-000 code counts as alive: no evidence each service 200s on `/`.
while IFS='|' read -r unit port; do
  [[ -z "${unit}" ]] && continue
  if systemctl list-unit-files "${unit}.service" >/dev/null 2>&1 \
    && systemctl is-enabled "${unit}" >/dev/null 2>&1; then
    CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${port}/" || echo 000)"
    if [[ "${CODE}" == "000" ]]; then
      FAILS+=("${unit} enabled but :${port}/ unreachable (000)")
    else
      echo "verify: ${unit} :${port} answers (${CODE})"
    fi
  fi
done <<'SVCS'
linuxbox-tableslop|8765
linuxbox-campaigns-avail|8768
abhinavall-origin-8780|8780
SVCS

# 5. GM-drawn tableslop borders (potato-owned regions-ui.json)
RUI_FILE="${REPO}/campaigns/tropic-gooner/map/regions-ui.json"
if [[ -f "${RUI_FILE}" ]]; then
  if ! python3 - "${RUI_FILE}" "${REPO}/campaigns/tropic-gooner/map" <<'PY'
import glob, json, sys
from pathlib import Path

rui_path, map_dir = sys.argv[1], sys.argv[2]

def poly_count(path):
    data = json.load(open(path, encoding="utf-8"))
    areas = data.get("areas") or []
    if isinstance(areas, dict):
        areas = list(areas.values())
    polys = {}
    for a in areas:
        if not isinstance(a, dict) or a.get("shape") == "ellipse":
            continue
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
for bak in sorted(glob.glob(str(Path(map_dir) / "regions-ui.json.bak-*"))):
    try:
        _, polys = poly_count(bak)
        if len(polys) > len(bak_best):
            bak_best = polys
    except Exception:
        pass

if not live_polys and bak_best:
    detail = (
        f"live_v={live_ver} gm_polys=0; richest_bak has "
        + ",".join(f"{k}:{v}" for k, v in sorted(bak_best.items()))
    )
    print("FAIL", detail)
    raise SystemExit(1)
if live_polys:
    print(
        "verify: gm-borders ok v=%s polys=%s"
        % (live_ver, ",".join(f"%s:%d" % (k, v) for k, v in sorted(live_polys.items())))
    )
PY
  then
    FAILS+=("tableslop GM borders missing (regions-ui.json empty while backup has polys)")
  fi
  # 5b. watermark vert baseline (catches partial regression + stub vs known-good)
  GUARD="${REPO}/scripts/linuxbox/tableslop-gm-borders-guard.sh"
  if [[ -f "${GUARD}" ]]; then
    if ! bash "${GUARD}"; then
      FAILS+=("tableslop GM borders watermark regression (tableslop-gm-borders-guard.sh)")
    fi
  fi
  # 5c. frozen pin coords (no agent drift)
  # Bundle apply can race preserve vs freeze on disk (pc-2026-08-10-pin-freeze-verify-false-fail).
  # One sleep+re-check before FAIL/inbox; never auto --accept / never move pins to "fix" verify.
  PIN_GUARD="${REPO}/scripts/linuxbox/tableslop-pin-coords-guard.sh"
  if [[ -f "${PIN_GUARD}" ]]; then
    if ! bash "${PIN_GUARD}"; then
      PIN_SETTLED=0
      if [[ "${CONTEXT}" == "bundle-apply" || "${CONTEXT}" == bundle-* ]]; then
        echo "verify: pin-freeze FAIL under context=${CONTEXT} — settle 3s + re-check once (no --accept)" >&2
        sleep 3
        if bash "${PIN_GUARD}"; then
          echo "verify: pin-freeze ok after settle"
          PIN_SETTLED=1
        fi
      fi
      if [[ "${PIN_SETTLED}" -eq 0 ]]; then
        FAILS+=("tableslop pin coords freeze regression (tableslop-pin-coords-guard.sh)")
      fi
    fi
  fi
fi

if [[ ${#FAILS[@]} -eq 0 ]]; then
  echo "verify-runtime-state: PASS (${CONTEXT})"
  # Auto-close stale open runtime-verify-* (incident fixed; stop clogging Hub Inbox)
  python3 - "${REPO}" "${CONTEXT}" <<'PY' || true
import json, os, sys, datetime
repo, context = sys.argv[1], sys.argv[2]
inbox = os.path.join(repo, "agents", "state", "human-inbox.json")
try:
    data = json.load(open(inbox, encoding="utf-8"))
except Exception:
    raise SystemExit(0)
if isinstance(data, list):
    raise SystemExit(0)
if not isinstance(data, dict):
    raise SystemExit(0)
data.setdefault("open", [])
data.setdefault("answered", [])
now = datetime.datetime.utcnow().isoformat() + "Z"
still_open, closed = [], []
for q in data.get("open") or []:
    if not isinstance(q, dict):
        continue
    qid = str(q.get("id") or "")
    if qid.startswith("runtime-verify-fail-") and not q.get("answer"):
        item = dict(q)
        item["answer"] = (
            "YES — auto-closed: verify PASS now (%s). Prior failure was stale/fixed."
            % context
        )
        item["answered_at"] = now
        item["status"] = "answered"
        data["answered"].insert(0, item)
        closed.append(qid)
    else:
        still_open.append(q)
if closed:
    data["open"] = still_open
    json.dump(data, open(inbox, "w", encoding="utf-8"), indent=2)
    open(inbox, "a", encoding="utf-8").write("\n")
    print("verify: auto-closed inbox %s" % ", ".join(closed))
PY
  exit 0
fi

echo "verify-runtime-state: FAIL (${CONTEXT})" >&2
mkdir -p "${REPO}/agents/state"
for f in "${FAILS[@]}"; do
  echo "  - ${f}" >&2
  printf '{"alert":"runtime_verify_fail","context":"%s","detail":"%s","at":"%s"}\n' \
    "${CONTEXT}" "${f//\"/\'}" "$(date -u -Iseconds)" >> "${ALERT_LOG}"
done

# Open a human-inbox question (stable per-day id; never re-ask answered day-id;
# skip identical failure signature when already open or answered NO/known-noise)
python3 - "${REPO}" "${CONTEXT}" "$(printf '%s; ' "${FAILS[@]}")" <<'PY' || true
import hashlib, json, os, re, sys, datetime
repo, context, detail = sys.argv[1], sys.argv[2], sys.argv[3]
inbox = os.path.join(repo, "agents", "state", "human-inbox.json")
try:
    data = json.load(open(inbox, encoding="utf-8"))
except Exception:
    data = {"open": [], "answered": []}
# ponytail: agents sometimes write a bare array — normalize before append
if isinstance(data, list):
    open_items, answered = [], []
    for item in data:
        if not isinstance(item, dict):
            continue
        if item.get("answered_at") or item.get("status") == "answered" or item.get("answer"):
            answered.append(item)
        else:
            open_items.append(item)
    data = {"open": open_items, "answered": answered}
elif not isinstance(data, dict):
    data = {"open": [], "answered": []}
data.setdefault("open", [])
data.setdefault("answered", [])

def norm_fail_detail(s):
    # Collapse whitespace; keep concrete markers (dash-build ids, paths) in sig
    return re.sub(r"\s+", " ", (s or "").strip().lower())

fail_sig = hashlib.sha1(norm_fail_detail(detail).encode("utf-8")).hexdigest()[:16]
qid = "runtime-verify-fail-%s" % datetime.datetime.utcnow().strftime("%Y%m%d")
known_ids = {q.get("id") for q in (data.get("open") or [])} | {
    q.get("id") for q in (data.get("answered") or [])
}

def item_sig(q):
    if not isinstance(q, dict):
        return ""
    if q.get("fail_sig"):
        return str(q.get("fail_sig"))
    ctx = str(q.get("context") or "")
    m = re.search(r"failures:\s*(.*?)(?:\s*check agents/state|\s*$)", ctx, re.I | re.S)
    blob = m.group(1) if m else ctx
    return hashlib.sha1(norm_fail_detail(blob).encode("utf-8")).hexdigest()[:16]

# Already open with same signature → do not stack another day-id
for q in data.get("open") or []:
    if str(q.get("id") or "").startswith("runtime-verify-fail-") and item_sig(q) == fail_sig:
        print("verify: inbox already open for fail_sig=%s (%s)" % (fail_sig, q.get("id")))
        raise SystemExit(0)

# Answered NO / known-noise for this signature → do not re-fire identical alert
_noise = re.compile(r"^(no\b)|known|noise|expected|intentional|ignore", re.I)
for q in data.get("answered") or []:
    if not str(q.get("id") or "").startswith("runtime-verify-fail-"):
        continue
    if item_sig(q) != fail_sig:
        continue
    ans = str(q.get("answer") or "")
    if _noise.search(ans.strip()):
        print("verify: skip inbox (answered NO/noise for fail_sig=%s)" % fail_sig)
        raise SystemExit(0)

if qid not in known_ids:
    data.setdefault("open", []).append(
        {
            "id": qid,
            "type": "ops",
            "from": "verify-runtime-state",
            "fail_sig": fail_sig,
            "question": "Runtime state verification FAILED after a deploy/bundle apply. Roster/dashboard may have regressed. Investigate now?",
            "context": "Context: %s. Failures: %s Check agents/state/dashboard-deploy-alerts.jsonl and docs/runtime-state-protection.md. Options: YES = a human/PC agent should triage; NO = known/expected (e.g. intentional rollback)."
            % (context, detail),
            "options": ["YES", "NO"],
            "at": datetime.datetime.utcnow().isoformat() + "Z",
        }
    )
    json.dump(data, open(inbox, "w", encoding="utf-8"), indent=2)
    open(inbox, "a", encoding="utf-8").write("\n")
    print("verify: opened inbox question %s fail_sig=%s" % (qid, fail_sig))
else:
    print("verify: inbox id %s already known — not re-opening" % qid)
PY
exit 1
