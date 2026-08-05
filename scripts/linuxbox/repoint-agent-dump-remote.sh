#!/usr/bin/env bash
# Repoint ~/agent-dump from mem-constant to Linuxbox remote. Run ON linuxbox.
set -euo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-${HOME}/agent-dump}"
ORIGIN="${LINUXBOX_GIT_REMOTE:-git@github.com:kineticdirt/Linuxbox.git}"
BRANCH="${LINUXBOX_GIT_BRANCH:-main}"

cd "${REPO}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "repoint: not a git repo — run bootstrap-agent-dump-git.sh first" >&2
  exit 1
fi

git remote remove origin 2>/dev/null || true
git remote add origin "${ORIGIN}"
git fetch --depth 1 origin "${BRANCH}" 2>&1 || { echo "repoint: fetch failed or slow — remote set"; exit 0; }
git branch -M "${BRANCH}" 2>/dev/null || true
git branch --set-upstream-to="origin/${BRANCH}" "${BRANCH}" 2>/dev/null || true

echo "repoint: origin=$(git remote get-url origin) branch=${BRANCH}"
# ponytail: skip heavy pull on repoint — git-pull-and-deploy owns sync
echo "repoint: OK (pull deferred to git-pull-and-deploy.sh)"
