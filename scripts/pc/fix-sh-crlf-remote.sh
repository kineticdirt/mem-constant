#!/usr/bin/env bash
# Strip CRLF from scripts/linuxbox/*.sh on remote linuxbox (post-deploy hygiene).
set -euo pipefail

HOST="${LINUXBOX_HOST:-abhinav@100.122.108.94}"
KEY="${LINUXBOX_SSH_KEY:-$HOME/.ssh/id_rsa_potato}"
REMOTE="${LINUXBOX_AGENT_DUMP:-/home/abhinav/agent-dump}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=25 -o IdentitiesOnly=yes -i "${KEY}")

ssh "${SSH_OPTS[@]}" "${HOST}" bash -s -- "${REMOTE}" <<'REMOTE'
set -euo pipefail
REMOTE_ROOT="$1"
while IFS= read -r f; do
  sed -i 's/\r$//' "${f}"
done < <(find "${REMOTE_ROOT}/scripts/linuxbox" -name '*.sh' -type f)
chmod +x "${REMOTE_ROOT}/scripts/linuxbox/"*.sh 2>/dev/null || true
chmod +x "${REMOTE_ROOT}/scripts/linuxbox/lib/"*.sh 2>/dev/null || true
echo "remote: stripped CRLF + restored +x under ${REMOTE_ROOT}/scripts/linuxbox"
REMOTE
