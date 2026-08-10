#!/usr/bin/env bash
# Push Linuxbox/main git bundle to potato (box cannot HTTPS-pull private repo).
# Run after publish-linuxbox-repo.sh or when cursor.com/agents pushed to GitHub.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${LINUXBOX_HOST:-abhinav@100.122.108.94}"
KEY="${LINUXBOX_SSH_KEY:-$HOME/.ssh/id_rsa_potato}"
REMOTE_REF="${LINUXBOX_GIT_BRANCH:-main}"
BUNDLE="/tmp/linuxbox-incoming.bundle"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=25 -o IdentitiesOnly=yes -i "${KEY}")

cd "${REPO}"
git remote add linuxbox git@github.com:kineticdirt/Linuxbox.git 2>/dev/null || true
git fetch linuxbox "${REMOTE_REF}" 2>/dev/null || git fetch origin "${REMOTE_REF}" 2>/dev/null || true

REF="linuxbox/${REMOTE_REF}"
if ! git rev-parse "${REF}" >/dev/null 2>&1; then
  REF="origin/${REMOTE_REF}"
fi
if ! git rev-parse "${REF}" >/dev/null 2>&1; then
  echo "ERROR: no ${REMOTE_REF} ref — run publish-linuxbox-repo.sh first" >&2
  exit 1
fi

# Thin incremental bundle when potato already shares a parent (79M full → ~80K delta).
REMOTE_HEAD="$(ssh "${SSH_OPTS[@]}" "${HOST}" "cd \${HOME}/agent-dump && git rev-parse HEAD 2>/dev/null" || true)"
if [[ -n "${REMOTE_HEAD}" ]] && git merge-base --is-ancestor "${REMOTE_HEAD}" "${REF}" 2>/dev/null; then
  if [[ "${REMOTE_HEAD}" == "$(git rev-parse "${REF}")" ]]; then
    echo "OK potato already at $(git rev-parse --short "${REF}") — nothing to bundle"
    exit 0
  fi
  git bundle create "${BUNDLE}" "${REMOTE_HEAD}..${REF}"
  echo "thin bundle $(git rev-parse --short "${REMOTE_HEAD}")..$(git rev-parse --short "${REF}")"
else
  git bundle create "${BUNDLE}" "${REF}"
  echo "full bundle $(git rev-parse --short "${REF}")"
fi
echo "bundle $(du -h "${BUNDLE}" | cut -f1) → ${HOST} …"
scp "${SSH_OPTS[@]}" "${BUNDLE}" "${HOST}:/tmp/linuxbox-incoming.bundle"
apply_rc=0
ssh "${SSH_OPTS[@]}" "${HOST}" "chmod +x \${HOME}/agent-dump/scripts/linuxbox/apply-git-bundle.sh 2>/dev/null; bash \${HOME}/agent-dump/scripts/linuxbox/apply-git-bundle.sh" || apply_rc=$?
# Always restore +x even when apply verify fails (set -e used to skip post-chmod).
# Evidence 2026-08-09: Hub watchdog 203/EXEC twice after modes landed 100644.
ssh "${SSH_OPTS[@]}" "${HOST}" 'chmod +x "$HOME"/agent-dump/scripts/linuxbox/*.sh "$HOME"/agent-dump/scripts/linuxbox/lib/*.sh 2>/dev/null; test -x "$HOME"/agent-dump/scripts/linuxbox/hermes-gateway-watchdog.sh'
rm -f "${BUNDLE}"
if [[ "${apply_rc}" -ne 0 ]]; then
  echo "WARN bundle apply exited ${apply_rc} (+x still restored)" >&2
  exit "${apply_rc}"
fi
echo "OK bundle applied on linuxbox (+x verified)"
