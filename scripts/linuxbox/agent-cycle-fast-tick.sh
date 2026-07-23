#!/usr/bin/env bash
# Fast tick: sync + inbox consume. Hermes ONLY if inbox needs ack.
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
REPO="${HOME}/agent-dump"
LOCK="/tmp/agent-cycle-fast.lock"
exec 200>"${LOCK}"
flock -n 200 || exit 0

cd "${REPO}"
mkdir -p "${REPO}/agents/state"
date -Iseconds > "${REPO}/agents/state/fast-tick.last"

python3 "${REPO}/scripts/linuxbox/human-inbox-normalize.py" "${REPO}" --quiet 2>/dev/null || true
bash "${REPO}/scripts/linuxbox/kill-stale-chromium.sh" 2>/dev/null || true
bash "${REPO}/scripts/linuxbox/apply-git-bundle.sh" 2>/dev/null || true
timeout 12 bash "${REPO}/scripts/linuxbox/git-pull-and-deploy.sh" 2>/dev/null || true
bash "${REPO}/scripts/linuxbox/swarm-dispatch.sh" --once 2>/dev/null || true
python3 "${REPO}/scripts/linuxbox/consume-inbox-answers.py" --repo "${REPO}" 2>/dev/null || true

HAS="${REPO}/scripts/linuxbox/agent-cycle-has-work.py"
if [[ -f "${HAS}" ]]; then
  set +e
  python3 "${HAS}" --lane fast --repo "${REPO}" >/dev/null
  rc=$?
  set -e
  if [[ "${rc}" -eq 1 ]]; then
    exit 0
  fi
fi

timeout 90 fast chat -q 'Fast lane. Ack new human-inbox answers only. Else IDLE. No campaign work.' >/dev/null 2>&1 || true
