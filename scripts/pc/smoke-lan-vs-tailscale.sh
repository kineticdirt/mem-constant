#!/usr/bin/env bash
# A/B LAN vs Tailscale reachability for potato (linuxbox) from this PC.
# Prefer LAN at home for SSH/dashboard/Moonlight; keep Tailscale for away.
# Exit 0 if at least one path works; nonzero only on total failure.
#
# Usage (Git Bash on Windows, or bash on linuxbox/laptop):
#   bash scripts/pc/smoke-lan-vs-tailscale.sh
#   bash scripts/pc/smoke-lan-vs-tailscale.sh --tip
#   bash scripts/pc/smoke-lan-vs-tailscale.sh --count 10
set -uo pipefail

COUNT=5
WANT_TIP=0
TS_IP_DEFAULT="100.122.108.94"
LAN_IP_FALLBACK="192.168.4.23"
USER_NAME="abhinav"
KEY="${LINUXBOX_SSH_KEY:-$HOME/.ssh/id_rsa_potato}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tip) WANT_TIP=1; shift ;;
    --count) COUNT="${2:-5}"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

find_tailscale() {
  local c
  for c in \
    "/c/Program Files/Tailscale/tailscale.exe" \
    "/mnt/c/Program Files/Tailscale/tailscale.exe" \
    "$(command -v tailscale 2>/dev/null || true)"
  do
    if [[ -n "$c" && -x "$c" ]]; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

ssh_cfg() {
  local host="$1" key="$2"
  ssh -G "$host" 2>/dev/null | awk -v k="$key" 'BEGIN{k=tolower(k)} tolower($1)==k {print $2; exit}'
}

is_windows_ping() {
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
  esac
  [[ -n "${WINDIR:-}" ]]
}

# Prints "avg_ms loss_pct" (avg may be FAIL). Safe under command substitution.
ping_avg_ms() {
  local host="$1" out avg loss
  if is_windows_ping; then
    out="$(ping -n "$COUNT" "$host" 2>&1)" || true
  else
    out="$(ping -c "$COUNT" -W 2 "$host" 2>&1)" || true
  fi
  avg="$(printf '%s\n' "$out" | awk '
    /Average =/ { gsub(/ms/, "", $NF); print $NF; exit }
    /rtt min\/avg\// {
      split($4, a, "/"); print a[2]; exit
    }
  ')"
  loss="$(printf '%s\n' "$out" | sed -n 's/.*(\([0-9]*\)% loss).*/\1/p; s/.*\([0-9][0-9]*\)% packet loss.*/\1/p' | head -1)"
  loss="${loss:-100}"
  if [[ -z "$avg" ]]; then
    echo "FAIL ${loss}"
    return 1
  fi
  avg="$(printf '%.0f' "$avg" 2>/dev/null || echo "$avg")"
  echo "${avg} ${loss}"
}

ssh_true_ms() {
  local host="$1"
  python - "$host" "$USER_NAME" "$KEY" <<'PY'
import subprocess, sys, time
host, user, key = sys.argv[1], sys.argv[2], sys.argv[3]
cmd = [
    "ssh", "-i", key, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8", "-o", "StrictHostKeyChecking=accept-new",
    f"{user}@{host}", "true",
]
t0 = time.perf_counter()
r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
ms = (time.perf_counter() - t0) * 1000.0
ok = r.returncode == 0
print(f"{'OK' if ok else 'FAIL'} {ms:.0f}")
if not ok and r.stderr.strip():
    err = r.stderr.strip().splitlines()[-1][:120]
    print(err, file=sys.stderr)
sys.exit(0 if ok else 1)
PY
}

# Prints cur_endpoint=… and lan_hint=… only if CurAddr is in 192.168.4.0/22.
discover_from_tailscale() {
  local ts="$1" tip="$2"
  python - "$ts" "$tip" <<'PY'
import json, subprocess, sys

def in_home_lan(ip: str) -> bool:
    try:
        a, b, c, _d = (int(x) for x in ip.split("."))
    except ValueError:
        return False
    return a == 192 and b == 168 and 4 <= c <= 7

ts, tip = sys.argv[1], sys.argv[2]
try:
    raw = subprocess.check_output([ts, "status", "--json"], text=True, stderr=subprocess.DEVNULL, timeout=15)
    data = json.loads(raw)
except Exception:
    print("cur_endpoint=none")
    sys.exit(0)
cur_ip = None
for _k, p in (data.get("Peer") or {}).items():
    ips = p.get("TailscaleIPs") or []
    dns = ((p.get("DNSName") or "") + " " + (p.get("HostName") or "")).lower()
    if tip in ips or "raspbian" in dns or "potato" in dns:
        cur = (p.get("CurAddr") or "").split(":")[0].strip().replace("\r", "")
        if cur and not cur.startswith("100."):
            cur_ip = cur
        break
print(f"cur_endpoint={cur_ip or 'none'}")
if cur_ip and in_home_lan(cur_ip):
    print(f"lan_hint={cur_ip}")
PY
}

echo "=== LAN vs Tailscale smoke (potato) ==="
echo "count=$COUNT  tip=${WANT_TIP}"

TS_BIN=""
if TS_BIN="$(find_tailscale)"; then
  echo "tailscale: $TS_BIN"
else
  echo "tailscale: (not found — ICMP/SSH still run)"
  TS_BIN=""
fi

TS_IP="$(ssh_cfg potato hostname)"
[[ -z "$TS_IP" ]] && TS_IP="$TS_IP_DEFAULT"

LAN_CFG="$(ssh_cfg potato-lan hostname)"
CUR_EP="none"
LAN_HINT=""
if [[ -n "$TS_BIN" ]]; then
  while IFS= read -r line; do
    case "$line" in
      cur_endpoint=*) CUR_EP="${line#cur_endpoint=}" ;;
      lan_hint=*) LAN_HINT="${line#lan_hint=}" ;;
    esac
  done < <(discover_from_tailscale "$TS_BIN" "$TS_IP" 2>/dev/null || true)
fi

# Live LAN from potato over Tailscale SSH (most accurate if keys work).
LAN_VIA_SSH=""
if [[ -f "$KEY" ]]; then
  LAN_VIA_SSH="$(
    ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=8 \
      "${USER_NAME}@${TS_IP}" \
      "ip -4 -o addr show scope global 2>/dev/null | awk '{print \$4}' | cut -d/ -f1" \
      2>/dev/null | awk '/^192\.168\.(4|5|6|7)\./ {print; exit}'
  )" || true
fi

# Prefer home-subnet: live SSH → lan_hint → potato-lan HostName → fallback.
# Do NOT treat arbitrary CurAddr (e.g. 10.x WG endpoints) as L2 LAN.
LAN_IP=""
for cand in "$LAN_VIA_SSH" "$LAN_HINT" "$LAN_CFG" "$LAN_IP_FALLBACK"; do
  [[ -z "$cand" || "$cand" == "none" ]] && continue
  LAN_IP="$cand"
  break
done
[[ -z "$LAN_IP" ]] && LAN_IP="$LAN_IP_FALLBACK"
[[ -n "$LAN_VIA_SSH" ]] && echo "LAN via potato SSH: $LAN_VIA_SSH"

echo "TS_IP=$TS_IP  LAN_IP=$LAN_IP  (ssh potato-lan HostName=${LAN_CFG:-unset})"
echo "TS CurAddr endpoint: $CUR_EP (WG path; LAN only if in 192.168.4.0/22)"

if [[ -n "$LAN_CFG" && "$LAN_CFG" != "$LAN_IP" ]]; then
  echo "[WARN] potato-lan HostName ($LAN_CFG) != chosen LAN ($LAN_IP) — update ~/.ssh/config"
elif [[ -n "$LAN_CFG" && "$LAN_CFG" == "$LAN_IP" ]]; then
  echo "[OK] potato-lan HostName matches chosen LAN"
fi

if [[ -n "$TS_BIN" ]]; then
  "$TS_BIN" status --json 2>/dev/null | python -c 'import json,sys; d=json.load(sys.stdin); s=d.get("Self") or {}; print("exit_node_id=", s.get("ExitNodeID") or "(none)")' 2>/dev/null || true
fi

echo
echo "--- ICMP ---"
LAN_PING="$(ping_avg_ms "$LAN_IP" || true)"
TS_PING="$(ping_avg_ms "$TS_IP" || true)"
LAN_AVG="$(echo "$LAN_PING" | awk '{print $1}')"
LAN_LOSS="$(echo "$LAN_PING" | awk '{print $2}')"
TS_AVG="$(echo "$TS_PING" | awk '{print $1}')"
TS_LOSS="$(echo "$TS_PING" | awk '{print $2}')"
[[ "$LAN_AVG" == "FAIL" || -z "$LAN_AVG" ]] && LAN_AVG=""
[[ "$TS_AVG" == "FAIL" || -z "$TS_AVG" ]] && TS_AVG=""

printf "LAN  %s  avg=%sms  loss=%s%%\n" "$LAN_IP" "${LAN_AVG:-FAIL}" "${LAN_LOSS:-?}"
printf "TS   %s  avg=%sms  loss=%s%%\n" "$TS_IP" "${TS_AVG:-FAIL}" "${TS_LOSS:-?}"

ICMP_WINNER="neither"
if [[ -n "$LAN_AVG" && -n "$TS_AVG" ]]; then
  if (( LAN_AVG < TS_AVG )); then
    ICMP_WINNER="LAN"
    echo "ICMP winner: LAN (delta $((TS_AVG - LAN_AVG)) ms)"
  elif (( TS_AVG < LAN_AVG )); then
    ICMP_WINNER="TS"
    echo "ICMP winner: Tailscale (delta $((LAN_AVG - TS_AVG)) ms)"
  else
    ICMP_WINNER="tie"
    echo "ICMP winner: tie"
  fi
elif [[ -n "$LAN_AVG" ]]; then
  ICMP_WINNER="LAN"
  echo "ICMP winner: LAN (TS unreachable)"
elif [[ -n "$TS_AVG" ]]; then
  ICMP_WINNER="TS"
  echo "ICMP winner: Tailscale (LAN unreachable)"
else
  echo "ICMP winner: neither"
fi

echo
echo "--- SSH true ---"
SSH_LAN_OK=0
SSH_TS_OK=0
LAN_SSH_MS=""
TS_SSH_MS=""

if [[ ! -f "$KEY" ]]; then
  echo "[SKIP] SSH key missing: $KEY"
else
  out="$(ssh_true_ms "$LAN_IP" 2>/tmp/smoke-lan-ssh-err.$$)" && SSH_LAN_OK=1 || true
  LAN_SSH_MS="$(echo "$out" | awk '{print $2}')"
  mark="FAIL"
  [[ $SSH_LAN_OK -eq 1 ]] && mark="PASS"
  printf "LAN  ssh %s  %sms\n" "$mark" "${LAN_SSH_MS:-?}"
  [[ $SSH_LAN_OK -eq 0 && -s /tmp/smoke-lan-ssh-err.$$ ]] && sed 's/^/       /' /tmp/smoke-lan-ssh-err.$$

  out="$(ssh_true_ms "$TS_IP" 2>/tmp/smoke-ts-ssh-err.$$)" && SSH_TS_OK=1 || true
  TS_SSH_MS="$(echo "$out" | awk '{print $2}')"
  mark="FAIL"
  [[ $SSH_TS_OK -eq 1 ]] && mark="PASS"
  printf "TS   ssh %s  %sms\n" "$mark" "${TS_SSH_MS:-?}"
  [[ $SSH_TS_OK -eq 0 && -s /tmp/smoke-ts-ssh-err.$$ ]] && sed 's/^/       /' /tmp/smoke-ts-ssh-err.$$
  rm -f /tmp/smoke-lan-ssh-err.$$ /tmp/smoke-ts-ssh-err.$$
fi

SSH_WINNER="neither"
if [[ $SSH_LAN_OK -eq 1 && $SSH_TS_OK -eq 1 && -n "$LAN_SSH_MS" && -n "$TS_SSH_MS" ]]; then
  if (( LAN_SSH_MS < TS_SSH_MS )); then
    SSH_WINNER="LAN"
    echo "SSH winner: LAN (delta $((TS_SSH_MS - LAN_SSH_MS)) ms)"
  elif (( TS_SSH_MS < LAN_SSH_MS )); then
    SSH_WINNER="TS"
    echo "SSH winner: Tailscale (delta $((LAN_SSH_MS - TS_SSH_MS)) ms)"
  else
    SSH_WINNER="tie"
    echo "SSH winner: tie"
  fi
elif [[ $SSH_LAN_OK -eq 1 ]]; then
  SSH_WINNER="LAN"
  echo "SSH winner: LAN"
elif [[ $SSH_TS_OK -eq 1 ]]; then
  SSH_WINNER="TS"
  echo "SSH winner: Tailscale"
else
  echo "SSH winner: neither"
fi

echo
echo "--- Verdict ---"
PREFER="Tailscale (away / LAN down)"
if [[ "$ICMP_WINNER" == "LAN" || "$SSH_WINNER" == "LAN" ]]; then
  PREFER="LAN at home → ssh potato-lan / dashboard http://$LAN_IP:8790"
elif [[ $SSH_TS_OK -eq 1 || -n "$TS_AVG" ]]; then
  if [[ -z "$LAN_AVG" && $SSH_LAN_OK -eq 0 ]]; then
    PREFER="Tailscale only right now (LAN $LAN_IP unreachable — check Wi‑Fi / DHCP)"
  fi
fi
echo "Prefer now: $PREFER"

if [[ $WANT_TIP -eq 1 ]] || [[ "$ICMP_WINNER" == "LAN" || "$SSH_WINNER" == "LAN" ]]; then
  echo
  echo "--- How to enable faster same-WiFi ---"
  echo "1. Keep Tailscale ON (away path). Do NOT use exit node at home."
  echo "2. Auto SSH: paste scripts/pc/ssh-potato-match-snippet.txt above Host potato"
  echo "   (Match exec → LAN when home; else Tailscale). Force LAN: ssh potato-lan"
  echo "3. Or wrapper: bash scripts/pc/connect-linuxbox.sh"
  echo "4. Dashboard at home: http://${LAN_IP}:8790/Linuxbox/"
  echo "5. Moonlight: dual PC entries (no auto) — desktop LAN + 100.x travel"
  echo "6. Shared 50–100 Mbps: LAN won't raise WAN cap; Moonlight ~15–30 Mbps stream"
  echo
  echo "# ~/.ssh/config snippet (potato-lan + Match — see ssh-potato-match-snippet.txt):"
  cat <<EOF
Match host potato exec "bash $(cd "$(dirname "$0")" && pwd)/ssh-potato-prefer-lan.sh"
    HostName ${LAN_IP}
    HostKeyAlias potato

Host potato-lan
    HostName ${LAN_IP}
    User ${USER_NAME}
    IdentityFile ~/.ssh/id_rsa_potato
    IdentitiesOnly yes
    HostKeyAlias potato
    ServerAliveInterval 60
EOF
fi

LAN_REACH=0
TS_REACH=0
[[ -n "$LAN_AVG" || $SSH_LAN_OK -eq 1 ]] && LAN_REACH=1
[[ -n "$TS_AVG" || $SSH_TS_OK -eq 1 ]] && TS_REACH=1

if [[ $LAN_REACH -eq 0 && $TS_REACH -eq 0 ]]; then
  echo
  echo "RESULT: FAIL (neither LAN nor Tailscale reachable)"
  exit 1
fi

echo
echo "RESULT: PASS (LAN_reach=$LAN_REACH TS_reach=$TS_REACH icmp=$ICMP_WINNER ssh=$SSH_WINNER)"
echo "METRICS lan_icmp_ms=${LAN_AVG:-na} ts_icmp_ms=${TS_AVG:-na} lan_ssh_ms=${LAN_SSH_MS:-na} ts_ssh_ms=${TS_SSH_MS:-na} cur_endpoint=$CUR_EP"
exit 0
