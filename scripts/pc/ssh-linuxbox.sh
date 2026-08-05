#!/usr/bin/env bash
# One SSH session to linuxbox at a time (avoids hung parallel agent ssh).
# Usage: bash scripts/pc/ssh-linuxbox.sh 'remote command'
#        bash scripts/pc/ssh-linuxbox.sh   # interactive shell
set -euo pipefail

LOCK="${TMPDIR:-/tmp}/agent-dump-linuxbox-ssh.lock"
HOST="${LINUXBOX_HOST:-potato}"
KEY="${LINUXBOX_SSH_KEY:-$HOME/.ssh/id_rsa_potato}"
SSH_OPTS=(-o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o BatchMode=yes)

if ssh -G "${HOST}" >/dev/null 2>&1; then
  TARGET="${HOST}"
else
  TARGET="abhinav@100.122.108.94"
  SSH_OPTS+=(-i "${KEY}" -o IdentitiesOnly=yes)
fi

exec 200>"${LOCK}"
if ! flock -n 200; then
  echo "Another linuxbox SSH is in progress (${LOCK}). Wait or remove stale lock." >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  exec ssh "${SSH_OPTS[@]}" "${TARGET}"
else
  exec ssh "${SSH_OPTS[@]}" "${TARGET}" "$@"
fi
