#!/usr/bin/env bash
# Post-deploy / post-apply verification gate — fail loud, never silent.
# Checks (see docs/runtime-state-protection.md):
#   1. versioned-json protected files did not go DOWN vs watermark
#   2. dashboard HTML build marker matches server JS (deployed pair)
#   3. dashboard :8790 answers 200 (skipped when service not present, e.g. PC)
#   4. roster API count >= manifest min_visible
# On failure: append agents/state/dashboard-deploy-alerts.jsonl + open a
# human-inbox question (stable per-day id), exit 1.
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

if [[ ${#FAILS[@]} -eq 0 ]]; then
  echo "verify-runtime-state: PASS (${CONTEXT})"
  exit 0
fi

echo "verify-runtime-state: FAIL (${CONTEXT})" >&2
mkdir -p "${REPO}/agents/state"
for f in "${FAILS[@]}"; do
  echo "  - ${f}" >&2
  printf '{"alert":"runtime_verify_fail","context":"%s","detail":"%s","at":"%s"}\n' \
    "${CONTEXT}" "${f//\"/\'}" "$(date -u -Iseconds)" >> "${ALERT_LOG}"
done

# Open a human-inbox question (stable per-day id; never re-ask an answered one)
python3 - "${REPO}" "${CONTEXT}" "$(printf '%s; ' "${FAILS[@]}")" <<'PY' || true
import json, os, sys, datetime
repo, context, detail = sys.argv[1], sys.argv[2], sys.argv[3]
inbox = os.path.join(repo, "agents", "state", "human-inbox.json")
try:
    data = json.load(open(inbox, encoding="utf-8"))
except Exception:
    data = {"open": [], "answered": []}
qid = "runtime-verify-fail-%s" % datetime.datetime.utcnow().strftime("%Y%m%d")
known = {q.get("id") for q in (data.get("open") or [])} | {
    q.get("id") for q in (data.get("answered") or [])
}
if qid not in known:
    data.setdefault("open", []).append(
        {
            "id": qid,
            "type": "ops",
            "from": "verify-runtime-state",
            "question": "Runtime state verification FAILED after a deploy/bundle apply. Roster/dashboard may have regressed. Investigate now?",
            "context": "Context: %s. Failures: %s Check agents/state/dashboard-deploy-alerts.jsonl and docs/runtime-state-protection.md. Options: YES = a human/PC agent should triage; NO = known/expected (e.g. intentional rollback)."
            % (context, detail),
            "options": ["YES", "NO"],
            "at": datetime.datetime.utcnow().isoformat() + "Z",
        }
    )
    json.dump(data, open(inbox, "w", encoding="utf-8"), indent=2)
    open(inbox, "a", encoding="utf-8").write("\n")
    print("verify: opened inbox question %s" % qid)
PY
exit 1
