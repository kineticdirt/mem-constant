#!/usr/bin/env bash
# Start SSH to linuxbox, wait for Tailscale to print the check URL, open it in
# Windows default browser, then wait for SSH to finish (approve in browser
# while this script waits — do not Ctrl+C until you see remote output).
set -euo pipefail
KEY="${HOME}/.ssh/id_rsa_potato"
HOST="abhinav@100.122.108.94"
ERR="$(mktemp)"
OUT="$(mktemp)"
cleanup() { rm -f "$ERR" "$OUT"; }
trap cleanup EXIT

ssh -i "$KEY" -o IdentitiesOnly=yes -o ConnectTimeout=20 "$HOST" "$@" >"$OUT" 2>"$ERR" &
pid=$!
# Wait until URL appears or ssh exits
for _ in $(seq 1 40); do
  if ! kill -0 "$pid" 2>/dev/null; then
    break
  fi
  url=$(grep -oE 'https://login\.tailscale\.com/a/[a-zA-Z0-9]+' "$ERR" | head -1 || true)
  if [ -n "${url:-}" ]; then
    echo "Opening browser: $url"
    echo "(Approve in the browser, then return here — SSH is still connecting.)"
    cmd.exe //c start "" "$url"
    break
  fi
  sleep 0.25
done
wait "$pid" || true
echo "--- stderr (tail) ---"
tail -5 "$ERR" || true
echo "--- stdout ---"
cat "$OUT" || true
