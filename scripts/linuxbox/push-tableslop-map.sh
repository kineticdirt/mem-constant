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
PATHS=(
  "scripts/linuxbox/tableslop-server.js"
  "${MAP}/map.json"
  "${MAP}/pyramid.json"
  "${MAP}/master-enhanced.png"
  "${MAP}/tiles"
  "${MAP}/output-onlinetools4k.png"
  "${MAP}/output-onlinetools-2k.png"
  "${MAP}/reference"
)

for p in "${PATHS[@]}"; do
  [ -e "${REPO}/${p}" ] || { echo "missing: ${p}" >&2; exit 1; }
done

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=20 -o IdentitiesOnly=yes -i "${KEY}")

tar -czf "${TARBALL}" -C "${REPO}" "${PATHS[@]}"
echo "uploading $(du -h "${TARBALL}" | cut -f1) over Tailscale (slow uplink — be patient)…"
scp "${SSH_OPTS[@]}" "${TARBALL}" "${HOST}:/tmp/tableslop-map-deploy.tgz"

ssh "${SSH_OPTS[@]}" "${HOST}" bash -s <<EOF
set -euo pipefail
tar xzf /tmp/tableslop-map-deploy.tgz -C "${REMOTE_REPO}"
sudo systemctl restart linuxbox-tableslop
sleep 2
systemctl is-active linuxbox-tableslop
curl -s -o /dev/null -w "tableslop8765:%{http_code}\\n" http://127.0.0.1:8765/health
EOF

echo "OK — map deployed to ${HOST}:${REMOTE_REPO}/${MAP}; linuxbox-tableslop restarted"
