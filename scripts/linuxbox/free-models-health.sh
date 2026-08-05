#!/usr/bin/env bash
# Cached free-model readiness probe (~30m). Used so Chat/Agent-coding can skip
# thrashing OpenRouter :free on every fail and fall through to Cursor instead.
#
# Does NOT probe Cursor. Cheap OpenRouter /api/v1/models + generation smoke is
# optional; default is: read think-free-429 day state + light HEAD/list check.
#
# Usage:
#   bash scripts/linuxbox/free-models-health.sh           # human one-liner
#   bash scripts/linuxbox/free-models-health.sh --json
#   bash scripts/linuxbox/free-models-health.sh --force  # ignore TTL
#
# Env: FREE_MODELS_HEALTH_TTL_SEC (default 1800), AGENT_DUMP, OPENROUTER_API_KEY via ~/.hermes/.env
set -euo pipefail
REPO="${AGENT_DUMP:-${HOME}/agent-dump}"
STATE_DIR="${REPO}/agents/state"
CACHE="${STATE_DIR}/free-models-health.json"
SWAP="${REPO}/agents/model-budget/think-free-swap.json"
FREE429="${STATE_DIR}/think-free-429.json"
ENV_FILE="${HOME}/.hermes/.env"
TTL_SEC="${FREE_MODELS_HEALTH_TTL_SEC:-1800}"
FORCE=0
JSON=0
for arg in "$@"; do
  case "${arg}" in
    --force) FORCE=1 ;;
    --json) JSON=1 ;;
  esac
done

mkdir -p "${STATE_DIR}"
now_epoch="$(date +%s)"

if [[ "${FORCE}" -eq 0 && -f "${CACHE}" ]]; then
  cached="$(python3 - "${CACHE}" "${TTL_SEC}" "${now_epoch}" <<'PY'
import json, sys
path, ttl, now = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
try:
    d = json.load(open(path, encoding="utf-8"))
except Exception:
    sys.exit(1)
checked = int(d.get("checked_epoch") or 0)
age = now - checked
if age < 0 or age > ttl:
    sys.exit(1)
d["cache_hit"] = True
d["age_sec"] = age
d["ttl_sec"] = ttl
print(json.dumps(d, separators=(",", ":")))
PY
)" || cached=""
  if [[ -n "${cached}" ]]; then
    if [[ "${JSON}" -eq 1 ]]; then
      printf '%s\n' "${cached}"
    else
      python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(("UP" if d.get("any_up") else "DOWN")+": "+str(d.get("summary") or "")+" (cache "+str(d.get("age_sec"))+"s)")' "${cached}"
    fi
    exit 0
  fi
fi

# Fresh probe (no Hermes chat thrash — generation probe only on first 3 ids, max_tokens=1).
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  set -a
  # shellcheck disable=SC1091
  source "${ENV_FILE}"
  set +a
fi
export OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-${OPENROUTER_API_KEY_OPS:-}}"

out="$(
  REPO="${REPO}" SWAP="${SWAP}" FREE429="${FREE429}" TTL_SEC="${TTL_SEC}" \
  CACHE="${CACHE}" NOW_EPOCH="${now_epoch}" python3 <<'PY'
import json, os, urllib.error, urllib.request
from datetime import datetime, timezone
from pathlib import Path

repo = Path(os.environ["REPO"])
swap_path = Path(os.environ["SWAP"])
free429_path = Path(os.environ["FREE429"])
cache_path = Path(os.environ["CACHE"])
ttl = int(os.environ["TTL_SEC"])
now_epoch = int(os.environ["NOW_EPOCH"])
key = (os.environ.get("OPENROUTER_API_KEY") or "").strip()
day = datetime.now(timezone.utc).strftime("%Y%m%d")

chain = []
try:
    swap = json.loads(swap_path.read_text(encoding="utf-8"))
    chain = [m for m in (swap.get("ordered") or []) if isinstance(m, str) and m.strip()]
except Exception:
    chain = []

blocked = set()
try:
    st = json.loads(free429_path.read_text(encoding="utf-8"))
    if st.get("day") == day:
        blocked = set(st.get("models_429") or [])
except Exception:
    pass

candidates = [m for m in chain if m not in blocked][:4] or chain[:4]
results = []
any_up = False

def probe(model: str) -> dict:
    if not key:
        return {"id": model, "ok": False, "status": "no_key"}
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://abhinavall.net/Linuxbox/",
            "X-Title": "linuxbox-free-models-health",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            code = resp.getcode()
            raw = resp.read(400)
            ok = 200 <= code < 300
            return {"id": model, "ok": ok, "status": f"http_{code}", "bytes": len(raw)}
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read(200).decode("utf-8", "replace")
        except Exception:
            pass
        return {
            "id": model,
            "ok": False,
            "status": f"http_{e.code}",
            "detail": detail[:160],
        }
    except Exception as e:
        return {"id": model, "ok": False, "status": "error", "detail": str(e)[:120]}

# If day blocklist already covers full chain, skip live pings (that's the point of the cache).
if chain and blocked and set(chain).issubset(blocked):
    results = [{"id": m, "ok": False, "status": "day_blocklist"} for m in chain[:6]]
    any_up = False
    summary = f"0/{len(chain)} free up (full day blocklist in think-free-429)"
else:
    for m in candidates:
        row = probe(m)
        results.append(row)
        if row.get("ok"):
            any_up = True
            break  # one live free model is enough for "pool up"
    if any_up:
        summary = f"free pool UP (sample ok: {results[-1]['id']})"
    elif not key:
        summary = "no OPENROUTER_API_KEY — cannot probe"
    else:
        failed = len(results)
        summary = f"0/{failed} sampled free models ok (rest may still be in rotate list)"

doc = {
    "any_up": any_up,
    "summary": summary,
    "day": day,
    "chain_size": len(chain),
    "blocked_count": len(blocked),
    "sampled": results,
    "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "checked_epoch": now_epoch,
    "ttl_sec": ttl,
    "cache_hit": False,
    "age_sec": 0,
    "probe": "openrouter_chat_max1_or_day_blocklist",
    "cursor_fallback_recommended": not any_up,
}
cache_path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
print(json.dumps(doc, separators=(",", ":")))
PY
)"

if [[ "${JSON}" -eq 1 ]]; then
  printf '%s\n' "${out}"
else
  python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(("UP" if d.get("any_up") else "DOWN")+": "+str(d.get("summary") or ""))' "${out}"
fi
