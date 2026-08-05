#!/usr/bin/env bash
# Cached Cursor Auto readiness probe (~30m). Cheap when cache fresh; light disk/binary
# checks when stale. Does NOT call the Cursor API (no spend / no chat ping).
#
# Usage:
#   bash scripts/linuxbox/cursor-lane-health.sh          # human one-liner
#   bash scripts/linuxbox/cursor-lane-health.sh --json  # full JSON
#   bash scripts/linuxbox/cursor-lane-health.sh --force # ignore TTL
#
# Env:
#   CURSOR_HEALTH_TTL_SEC   default 1800 (30m)
#   AGENT_DUMP             repo root
set -euo pipefail
REPO="${AGENT_DUMP:-${HOME}/agent-dump}"
STATE_DIR="${REPO}/agents/state"
CACHE="${STATE_DIR}/cursor-lane-health.json"
TTL_SEC="${CURSOR_HEALTH_TTL_SEC:-1800}"
ENV_FILE="${CURSOR_AGENT_ENV:-${HOME}/.cursor-agent.env}"
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
      python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(("UP" if d.get("up") else "DOWN")+": "+str(d.get("reason") or "")+" (cache "+str(d.get("age_sec"))+"s)")' "${cached}"
    fi
    exit 0
  fi
fi

# Fresh probe — local only
agent_bin=""
for c in "${HOME}/.local/bin/agent" "${HOME}/.local/share/cursor-agent/agent" "$(command -v agent 2>/dev/null || true)"; do
  if [[ -n "${c}" && -x "${c}" ]]; then
    agent_bin="${c}"
    break
  fi
done

key_present=0
if [[ -f "${ENV_FILE}" ]]; then
  if grep -E '^[[:space:]]*CURSOR_API_KEY=' "${ENV_FILE}" 2>/dev/null | grep -vqE 'CURSOR_API_KEY=["'\'']?\s*["'\'']?\s*$'; then
    key_present=1
  fi
fi

sdk_py="${REPO}/scripts/linuxbox/cursor_sdk_run.py"
sdk_ok=0
[[ -f "${sdk_py}" ]] && sdk_ok=1

run_sh="${REPO}/scripts/linuxbox/cursor-agent-run.sh"
run_ok=0
[[ -f "${run_sh}" ]] && run_ok=1

agent_version=""
if [[ -n "${agent_bin}" ]]; then
  agent_version="$("${agent_bin}" --version 2>/dev/null | head -1 | tr -d '\r' | cut -c1-80 || true)"
fi

up=0
reason="missing agent binary or CURSOR_API_KEY"
if [[ -n "${agent_bin}" && "${key_present}" -eq 1 && "${run_ok}" -eq 1 ]]; then
  up=1
  reason="agent+key+wrapper ready"
elif [[ -n "${agent_bin}" && "${key_present}" -eq 0 ]]; then
  reason="agent present but CURSOR_API_KEY missing in ${ENV_FILE}"
elif [[ -z "${agent_bin}" ]]; then
  reason="cursor agent binary not found on PATH / ~/.local"
elif [[ "${run_ok}" -eq 0 ]]; then
  reason="cursor-agent-run.sh missing"
fi

checked_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
out="$(python3 - "${CACHE}" "${up}" "${reason}" "${agent_bin}" "${agent_version}" "${key_present}" "${sdk_ok}" "${run_ok}" "${now_epoch}" "${TTL_SEC}" "${checked_at}" <<'PY'
import json, sys
(
    path,
    up,
    reason,
    agent_bin,
    agent_version,
    key_present,
    sdk_ok,
    run_ok,
    now_epoch,
    ttl,
    checked_at,
) = sys.argv[1:12]
doc = {
    "up": bool(int(up)),
    "reason": reason,
    "agent_bin": agent_bin or None,
    "agent_version": agent_version or None,
    "key_present": bool(int(key_present)),
    "sdk_script": bool(int(sdk_ok)),
    "run_script": bool(int(run_ok)),
    "checked_at": checked_at,
    "checked_epoch": int(now_epoch),
    "ttl_sec": int(ttl),
    "cache_hit": False,
    "age_sec": 0,
    "probe": "local_binary_key",
}
open(path, "w", encoding="utf-8").write(json.dumps(doc, indent=2) + "\n")
print(json.dumps(doc, separators=(",", ":")))
PY
)"

if [[ "${JSON}" -eq 1 ]]; then
  printf '%s\n' "${out}"
else
  python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(("UP" if d.get("up") else "DOWN")+": "+str(d.get("reason") or ""))' "${out}"
fi
