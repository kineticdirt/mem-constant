#!/usr/bin/env bash
# ssh-session-track.sh — SSH session duration tracking via timewarrior + who (1m sync tick).
# check        : start/stop timew per session, archive JSONL, ledger line for >=5min sessions.
# status --json: active sessions + today's totals (Hub API).
# ponytail: timew is single-open-interval — concurrent SSH sessions make timew durations
# approximate; the epoch-based JSONL record stays authoritative. Upgrade path: timew @ids.
set -euo pipefail
REPO="${AGENT_DUMP:-${HOME}/agent-dump}"
STATE_DIR="${REPO}/agents/state"
STATE_FILE="${SSH_TRACK_STATE:-${STATE_DIR}/ssh-sessions.json}"
ARCHIVE_OVR="${SSH_TRACK_ARCHIVE:-}"
GROUPCHAT="${SSH_TRACK_GROUPCHAT:-${REPO}/AI_GROUPCHAT.md}"
WHO_CMD="${SSH_TRACK_WHO:-who}"
MIN_LEDGER_SEC=300
TIMEW=0; command -v timew >/dev/null 2>&1 && TIMEW=1

san() { printf '%s' "${1:-}" | tr -cd 'A-Za-z0-9._@-'; }
iso() { date -d "@$1" +%Y-%m-%dT%H:%M:%S%z; }
hmz() { awk -v s="$1" 'BEGIN{d=int(s/86400);h=int(s%86400/3600);m=int(s%3600/60);printf "%s%s%dm",(d?d"d ":""),((h||d)?h"h ":""),m}'; }
adir() {
  if [ -n "$ARCHIVE_OVR" ]; then printf '%s' "$ARCHIVE_OVR"
  elif mountpoint -q /mnt/archive 2>/dev/null; then printf '/mnt/archive/logs/ssh-sessions'
  else printf '%s' "${STATE_DIR}/ssh-sessions"; fi
}

snapshot() { # user|rhost|pts|login_epoch — remote pts only (console tty excluded)
  $WHO_CMD 2>/dev/null | awk '$2 ~ /^pts\// && $NF ~ /^\(.*\)$/{h=$NF;gsub(/[()]/,"",h);print $1"|"h"|"$2"|"$3" "$4}' \
  | while IFS='|' read -r u h p t; do
      printf '%s|%s|%s|%s\n' "$(san "$u")" "$(san "$h")" "$(san "$p")" "$(date -d "$t" +%s 2>/dev/null || date +%s)"
    done | sort -u
}

read_state() {
  [ -f "$STATE_FILE" ] || return 0
  python3 - "$STATE_FILE" <<'PY' 2>/dev/null || true
import json, sys
try: st = json.load(open(sys.argv[1]))
except Exception: raise SystemExit(0)
for s in (st.get("sessions") or {}).values():
    print("|".join(str(s.get(k, "")) for k in ("user", "rhost", "pts", "login_epoch")))
PY
}

write_state() { # $1 = TSV file (user|rhost|pts|login_epoch) to load into state JSON
  python3 - "$STATE_FILE" "$1" <<'PY'
import json, os, sys, time
sessions = {}
for line in open(sys.argv[2]):
    f = line.rstrip("\n").split("|")
    if len(f) != 4 or not f[0]: continue
    u, h, p, ep = f; ep = int(ep or time.time())
    sessions["%s|%s|%s" % (u, h, p)] = {"user": u, "rhost": h, "pts": p, "login_epoch": ep,
        "login_iso": time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(ep))}
tmp = sys.argv[1] + ".tmp"
with open(tmp, "w") as fh: json.dump({"sessions": sessions}, fh, indent=1)
os.replace(tmp, sys.argv[1])
PY
}

ledger_line() { # newest-first per ledger convention; atomic-ish rewrite, history untouched
  local tmp; tmp="$(mktemp)"
  [ -f "$GROUPCHAT" ] || : > "$GROUPCHAT"
  { printf '%s\n\n' "$1"; cat "$GROUPCHAT"; } > "$tmp" && cat "$tmp" > "$GROUPCHAT"
  rm -f "$tmp"
}

cmd_check() {
  mkdir -p "$STATE_DIR"
  [ "$TIMEW" = 1 ] && mkdir -p "${HOME}/.timewarrior/data" 2>/dev/null || true # pre-seed db: timew prompts interactively on first run
  local tmp now ad u h p lep dur
  tmp="$(mktemp -d)"; now="$(date +%s)"
  snapshot > "$tmp/cur" || true
  read_state > "$tmp/prev" || true
  cut -d'|' -f1-3 "$tmp/cur"  | sort > "$tmp/cur.k"
  cut -d'|' -f1-3 "$tmp/prev" | sort > "$tmp/prev.k"
  comm -23 "$tmp/cur.k" "$tmp/prev.k" > "$tmp/new"  || true
  comm -13 "$tmp/cur.k" "$tmp/prev.k" > "$tmp/gone" || true
  while IFS='|' read -r u h p; do
    [ -n "$u" ] || continue
    [ "$TIMEW" = 1 ] && timew start "ssh:${u}@${h}" >/dev/null 2>&1 || true
  done < "$tmp/new"
  ad="$(adir)"; mkdir -p "$ad" 2>/dev/null || true
  while IFS='|' read -r u h p; do
    [ -n "$u" ] || continue
    lep="$(awk -F'|' -v k="$u|$h|$p" '$1"|"$2"|"$3==k{print $4;exit}' "$tmp/prev")"
    dur=$((now - ${lep:-$now})); [ "$dur" -ge 0 ] || dur=0
    [ "$TIMEW" = 1 ] && timew stop >/dev/null 2>&1 || true
    printf '{"user":"%s","rhost":"%s","login":"%s","logout":"%s","duration_sec":%d,"pts":"%s"}\n' \
      "$u" "$h" "$(iso "${lep:-$now}")" "$(iso "$now")" "$dur" "$p" >> "${ad}/$(date +%Y-%m).jsonl"
    [ "$dur" -lt "$MIN_LEDGER_SEC" ] || \
      ledger_line "- **$(date -u +%Y-%m-%dT%H:%MZ)** — [LINUX] SSH session ${u}@${h} ended — $(hmz "$dur")"
  done < "$tmp/gone"
  write_state "$tmp/cur"
  rm -rf "$tmp"
}

cmd_status() {
  SSH_TRACK_TIMEW="$TIMEW" python3 - "$STATE_FILE" "$(adir)" "${STATE_DIR}/ssh-sessions" <<'PY'
import json, os, sys, time
sf, ad, fb = sys.argv[1:4]
now = int(time.time()); active = []
try:
    st = json.load(open(sf))
    for s in (st.get("sessions") or {}).values():
        ep = int(s.get("login_epoch") or now)
        active.append({"user": s.get("user"), "rhost": s.get("rhost"), "pts": s.get("pts"),
                       "login": s.get("login_iso"), "elapsed_sec": max(0, now - ep)})
except Exception: pass
today, month = time.strftime("%Y-%m-%d"), time.strftime("%Y-%m")
n = tot = 0
for d in dict.fromkeys((ad, fb)):
    f = os.path.join(d, month + ".jsonl")
    if not os.path.isfile(f): continue
    for ln in open(f):
        try: r = json.loads(ln)
        except Exception: continue
        if str(r.get("login", ""))[:10] == today:
            n += 1; tot += int(r.get("duration_sec") or 0)
print(json.dumps({"active": active, "active_count": len(active),
                  "today": {"sessions": n, "total_sec": tot},
                  "timew": os.environ.get("SSH_TRACK_TIMEW") == "1",
                  "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(now))}))
PY
}

cmd_selfcheck() {
  local tmp; tmp="$(mktemp -d)"
  # Rebind globals (top-level defaults already resolved from env at startup).
  SSH_TRACK_STATE="${tmp}/state.json"; STATE_FILE="$SSH_TRACK_STATE"
  ARCHIVE_OVR="${tmp}/arch"; GROUPCHAT="${tmp}/LEDGER.md"
  : > "$GROUPCHAT"
  printf 'selftest pts/9 %s (192.0.2.10)\n' "$(date '+%Y-%m-%d %H:%M')" > "${tmp}/whoA"
  printf 'selftest pts/8 %s (198.51.100.7)\n' "$(date -d '10 minutes ago' '+%Y-%m-%d %H:%M')" > "${tmp}/whoB"
  : > "${tmp}/who0"
  WHO_CMD="cat ${tmp}/whoA"; cmd_check
  grep -q selftest "$STATE_FILE" || { echo "FAIL: new session not in state"; exit 1; }
  WHO_CMD="cat ${tmp}/who0"; cmd_check
  grep -q '"user":"selftest"' "${tmp}/arch/$(date +%Y-%m).jsonl" || { echo "FAIL: no jsonl record"; exit 1; }
  grep -q 'SSH session' "$GROUPCHAT" && { echo "FAIL: short session hit ledger"; exit 1; }
  WHO_CMD="cat ${tmp}/whoB"; cmd_check
  WHO_CMD="cat ${tmp}/who0"; cmd_check
  grep -q 'SSH session selftest@198.51.100.7 ended' "$GROUPCHAT" || { echo "FAIL: long session missing from ledger"; exit 1; }
  cmd_status | python3 -c 'import json,sys; d=json.load(sys.stdin); assert "active" in d and "today" in d' || { echo "FAIL: status json"; exit 1; }
  echo "ssh-session-track SELF-CHECK PASS (records=$(wc -l < "${tmp}/arch/$(date +%Y-%m).jsonl"), ledger_lines=$(grep -c 'SSH session' "$GROUPCHAT" || true), timew=${TIMEW})"
  rm -rf "$tmp"
}

case "${1:-}" in
  check) cmd_check ;;
  status) [ "${2:-}" = "--json" ] || { echo "usage: $0 status --json" >&2; exit 2; }; cmd_status ;;
  --self-check|self-check) cmd_selfcheck ;;
  *) echo "usage: $0 {check|status --json|--self-check}" >&2; exit 2 ;;
esac
