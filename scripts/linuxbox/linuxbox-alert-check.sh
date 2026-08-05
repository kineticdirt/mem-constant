#!/usr/bin/env bash
# Evaluate linuxbox health thresholds; send email or ntfy push. Run via systemd timer (5m).
set -euo pipefail

REPO="${AGENT_DUMP:-$HOME/agent-dump}"
CONFIG="${REPO}/agents/linuxbox-alerts.json"
STATE="${REPO}/agents/state/alert-last.json"
ENV_FILE="${HOME}/.linuxbox-dashboard/alerts.env"
LOG_DIR="/mnt/archive/logs"
LOG="${LOG_DIR}/linuxbox-alerts.log"

mkdir -p "$(dirname "$STATE")"
[[ -d "$LOG_DIR" ]] || LOG="${REPO}/agents/state/linuxbox-alerts.log"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

if [[ ! -f "$CONFIG" ]]; then
  echo "no config" >>"$LOG"
  exit 0
fi

enabled=$(python3 -c "import json; print('yes' if json.load(open('$CONFIG')).get('enabled') else 'no')")
if [[ "$enabled" != "yes" ]]; then
  exit 0
fi

# --max-time: a wedged Hub socket (orphan LISTEN / CLOSE_WAIT flood) accepts but
# never answers — without a bound this curl hangs and blinds the alert lane itself.
snapshot=$(curl -sf --max-time 10 -u "${DASHBOARD_ADMIN_USER:-admin}:${DASHBOARD_TOKEN}" "http://127.0.0.1:8790/api/systems" 2>/dev/null || true)
if [[ -z "$snapshot" ]]; then
  snapshot=$(NODE_PATH="$REPO/scripts/linuxbox" node -e "
const { collectSystemsState } = require('./linuxbox-systems');
collectSystemsState().then((s) => process.stdout.write(JSON.stringify(s)));
" 2>/dev/null || echo '{}')
fi

export SNAPSHOT="$snapshot"
export CONFIG_PATH="$CONFIG"
export STATE_PATH="$STATE"

fired=$(python3 <<'PY'
import json, os, time
from pathlib import Path

config = json.loads(Path(os.environ["CONFIG_PATH"]).read_text())
state_path = Path(os.environ["STATE_PATH"])
try:
    state = json.loads(state_path.read_text())
except Exception:
    state = {}

now = time.time()
cooldown = int(config.get("cooldown_minutes", 30)) * 60
last = float(state.get("last_sent_at", 0))
if last and (now - last) < cooldown:
    print("")
    raise SystemExit(0)

snap = json.loads(os.environ.get("SNAPSHOT") or "{}")
host = snap.get("host") or {}
telemetry = (snap.get("resource") or {}).get("telemetry") or {}
metrics = {
    "mem_avail_mb": host.get("mem_avail_mb"),
    "swap_used_pct": host.get("swap_used_pct"),
}
by_id = {s["id"]: s for s in snap.get("systems") or []}

alerts = []
for chk in config.get("checks", []):
    mid = chk.get("metric")
    if mid == "system_health":
        sid = chk.get("system_id")
        val = (by_id.get(sid) or {}).get("health")
        if val == chk.get("eq"):
            alerts.append((chk.get("severity", "warn"), chk.get("id"), chk.get("message", sid)))
    else:
        val = metrics.get(mid)
        if val is None:
            continue
        if "gte" in chk and val >= chk["gte"]:
            alerts.append((chk.get("severity", "warn"), chk.get("id"), f"{chk.get('message','')} ({mid}={val})"))
        if "lte" in chk and val <= chk["lte"]:
            alerts.append((chk.get("severity", "warn"), chk.get("id"), f"{chk.get('message','')} ({mid}={val})"))

if not alerts:
    print("")
    raise SystemExit(0)

alerts.sort(key=lambda x: 0 if x[0] == "critical" else 1)
sev, aid, msg = alerts[0]
body = "\\n".join(f"[{s}] {m}" for s, i, m in alerts)
print(json.dumps({"id": aid, "severity": sev, "subject": f"linuxbox {sev}: {msg}", "body": body}))
PY
)

if [[ -z "$fired" ]]; then
  exit 0
fi

subject=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['subject'])" "$fired")
body=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['body'])" "$fired")
aid=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['id'])" "$fired")

sent=0
if [[ -n "${ALERT_NTFY_URL:-}" ]]; then
  curl -sf -d "$body" -H "Title: $subject" "$ALERT_NTFY_URL" >/dev/null && sent=1
fi

if [[ -n "${RESEND_API_KEY:-}" && -n "${ALERT_EMAIL_TO:-}" ]]; then
  payload=$(python3 -c "
import json, os
print(json.dumps({
  'from': os.environ.get('ALERT_EMAIL_FROM', 'linuxbox@abhinavall.net'),
  'to': [os.environ['ALERT_EMAIL_TO']],
  'subject': os.environ['SUBJ'],
  'text': os.environ['BODY'],
}))
" SUBJ="$subject" BODY="$body")
  curl -sf -X POST "https://api.resend.com/emails" \
    -H "Authorization: Bearer ${RESEND_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$payload" >/dev/null && sent=1
fi

echo "$(date -Iseconds) alert=$aid sent=$sent subj=$subject" >>"$LOG"

python3 -c "
import json, time
from pathlib import Path
p = Path('$STATE')
p.write_text(json.dumps({'last_sent_at': time.time(), 'last_id': '''$aid''', 'subject': '''$subject'''}, indent=2) + chr(10))
"

exit 0
