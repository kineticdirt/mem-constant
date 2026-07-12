#!/usr/bin/env bash
# Apply a git bundle dropped at /tmp/linuxbox-incoming.bundle (from PC push-linuxbox-git-bundle.sh).
set -euo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-${HOME}/agent-dump}"
BUNDLE="${LINUXBOX_GIT_BUNDLE:-/tmp/linuxbox-incoming.bundle}"
BRANCH="${LINUXBOX_GIT_BRANCH:-main}"
REF="refs/remotes/origin/${BRANCH}"

cd "${REPO}"
if [[ ! -f "${BUNDLE}" ]]; then
  exit 0
fi

if ! git bundle verify "${BUNDLE}" >/dev/null 2>&1; then
  echo "apply-git-bundle: invalid bundle" >&2
  exit 1
fi

OLD="$(git rev-parse HEAD)"
git fetch "${BUNDLE}" "linuxbox/${BRANCH}:${REF}" 2>/dev/null || \
  git fetch "${BUNDLE}" "${BRANCH}:${REF}" 2>/dev/null || \
  git fetch "${BUNDLE}" "refs/heads/${BRANCH}:${REF}"

NEW="$(git rev-parse "origin/${BRANCH}")"
if [[ "${OLD}" == "${NEW}" ]]; then
  rm -f "${BUNDLE}"
  echo "apply-git-bundle: already at ${NEW:0:8}"
  mkdir -p "${REPO}/agents/state"
  date -u -Iseconds > "${REPO}/agents/state/git-sync.json.tmp"
  printf '{"applied_at":"%s","from_rev":"%s","to_rev":"%s","noop":true}\n' \
    "$(cat "${REPO}/agents/state/git-sync.json.tmp")" "${OLD}" "${NEW}" \
    > "${REPO}/agents/state/git-sync.json"
  rm -f "${REPO}/agents/state/git-sync.json.tmp"
  exit 0
fi

git branch -M "${BRANCH}" 2>/dev/null || true
# HARD reset: mixed reset left ancient working-tree files dirty; the next
# git-pull-and-deploy stash/pop then re-applied the old dashboard over HEAD.
# Runtime dirs (chat-threads, human-inbox) are gitignored — survive --hard.
git reset --hard "origin/${BRANCH}"
rm -f "${BUNDLE}"

# Windows/git-bundle often lands scripts as 100644; systemd ExecStart then fails 203/EXEC.
# Evidence 2026-07-12: hermes-gateway-watchdog Permission denied every 2m until chmod +x.
chmod +x "${REPO}/scripts/linuxbox/"*.sh 2>/dev/null || true
chmod +x "${REPO}/scripts/linuxbox/lib/"*.sh 2>/dev/null || true

DASH_INDEX="scripts/linuxbox/linuxbox-status/index.html"
ALERT_LOG="${REPO}/agents/state/dashboard-deploy-alerts.jsonl"
if [[ -f "${DASH_INDEX}" ]]; then
  if ! grep -q 'active-work' "${DASH_INDEX}" || ! grep -q 'chat-threads-toggle' "${DASH_INDEX}"; then
    echo "apply-git-bundle: ALERT dashboard markers missing after hard reset" >&2
    mkdir -p "${REPO}/agents/state"
    printf '{"alert":"dashboard_markers_missing_after_bundle","at":"%s","rev":"%s"}\n' \
      "$(date -u -Iseconds)" "${NEW:0:8}" >> "${ALERT_LOG}"
  fi
fi

restart_dashboard=0
restart_tableslop=0
while IFS= read -r path; do
  case "${path}" in
    scripts/linuxbox/linuxbox-status-server.js|scripts/linuxbox/linuxbox-status/*) restart_dashboard=1 ;;
    scripts/linuxbox/tableslop-server.js) restart_tableslop=1 ;;
  esac
done < <(git diff --name-only "${OLD}" "${NEW}" 2>/dev/null || true)

if [[ "${restart_dashboard}" -eq 1 ]]; then
  sudo systemctl restart linuxbox-status
  curl -s -o /dev/null -w "dashboard:%{http_code}\n" http://127.0.0.1:8790/ || true
fi
if [[ "${restart_tableslop}" -eq 1 ]]; then
  sudo systemctl restart linuxbox-tableslop
  curl -s -o /dev/null -w "tableslop:%{http_code}\n" http://127.0.0.1:8765/ || true
fi

mkdir -p "${REPO}/agents/state"
date -u -Iseconds > "${REPO}/agents/state/git-sync.json.tmp"
printf '{"applied_at":"%s","from_rev":"%s","to_rev":"%s","noop":false}\n' \
  "$(cat "${REPO}/agents/state/git-sync.json.tmp")" "${OLD}" "${NEW}" \
  > "${REPO}/agents/state/git-sync.json"
rm -f "${REPO}/agents/state/git-sync.json.tmp"

echo "apply-git-bundle: ${OLD:0:8} → ${NEW:0:8}"
