#!/usr/bin/env bash
# One-time align ~/agent-dump to Linuxbox/main without blocking on SSH git.
# Uses HTTPS fetch (no deploy key required). Preserves local box files (inbox, etc.).
set -euo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-${HOME}/agent-dump}"
HTTPS_ORIGIN="${LINUXBOX_HTTPS_ORIGIN:-https://github.com/kineticdirt/Linuxbox.git}"
BRANCH="${LINUXBOX_GIT_BRANCH:-main}"

cd "${REPO}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "align: not a git repo" >&2
  exit 1
fi

git remote set-url origin "${HTTPS_ORIGIN}"
echo "align: fetch ${HTTPS_ORIGIN} (${BRANCH}) …"
GIT_TERMINAL_PROMPT=0 git fetch --depth 1 origin "${BRANCH}"

git branch -M "${BRANCH}"
git branch --set-upstream-to="origin/${BRANCH}" "${BRANCH}" 2>/dev/null || true
git reset "origin/${BRANCH}"

echo "align: HEAD=$(git rev-parse --short HEAD) branch=$(git branch --show-current)"
echo "align: local diffs (expected — inbox/progress on box):"
git status --short | head -15 || true
echo "align: OK — git-pull-and-deploy can run on future pushes"
