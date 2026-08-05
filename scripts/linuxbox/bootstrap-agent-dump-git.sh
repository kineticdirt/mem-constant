#!/usr/bin/env bash
# One-time: attach git remote to an SCP-seeded ~/agent-dump so git-pull-and-deploy works.
# Safe: mixed reset keeps local files; conflicts appear as local diffs (human-inbox, etc.).
set -euo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-${HOME}/agent-dump}"
ORIGIN="${AGENT_DUMP_ORIGIN:-git@github.com:kineticdirt/Linuxbox.git}"
BRANCH="${AGENT_DUMP_BRANCH:-main}"

cd "${REPO}"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "bootstrap-agent-dump-git: already a git repo"
  git remote -v 2>/dev/null | head -2 || true
  exit 0
fi

echo "bootstrap-agent-dump-git: init + fetch ${ORIGIN} (${BRANCH})"
git init
git checkout -B "${BRANCH}" 2>/dev/null || true
git remote add origin "${ORIGIN}" 2>/dev/null || git remote set-url origin "${ORIGIN}"
git fetch origin "${BRANCH}"
git branch -M "${BRANCH}" 2>/dev/null || true
git branch --set-upstream-to="origin/${BRANCH}" "${BRANCH}" 2>/dev/null || true
git reset "origin/${BRANCH}"

echo "bootstrap-agent-dump-git: OK — $(git rev-parse --short HEAD)"
echo "Local diffs (expected: human-inbox, progress, etc.):"
git status --short | head -20 || true
