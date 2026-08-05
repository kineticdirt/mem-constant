#!/usr/bin/env bash
# Deterministic sync: git pull → restart services when tracked deploy paths change.
# Enables cursor.com/agents (cloud) → GitHub push → linuxbox auto-deploy without PC SCP.
#
# Dashboard safety: SCP overlays + stash-before-pull used to drop linuxbox-status files
# (stash pop restored ancient working-tree content over a newer index). Preserve + marker
# verify so Active now / Threads cannot silently regress.
set -euo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-${HOME}/agent-dump}"
BRANCH="${AGENT_DUMP_BRANCH:-main}"
cd "${REPO}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "git-pull-deploy: not a git repo (run bootstrap-agent-dump-git.sh)" >&2
  exit 1
fi

DASH_INDEX="scripts/linuxbox/linuxbox-status/index.html"
DASH_SERVER="scripts/linuxbox/linuxbox-status-server.js"
DASH_PRESERVE="${TMPDIR:-/tmp}/linuxbox-dash-preserve-$$"
ALERT_LOG="${REPO}/agents/state/dashboard-deploy-alerts.jsonl"
PP="${REPO}/scripts/linuxbox/protected-paths.py"
PROT_PRESERVE="${TMPDIR:-/tmp}/linuxbox-protected-preserve-$$"

dash_markers_ok() {
  local f="${1:-${DASH_INDEX}}"
  [[ -f "${f}" ]] \
    && grep -q 'active-work' "${f}" \
    && grep -q 'chat-threads-toggle' "${f}" \
    && grep -q 'Running now' "${f}"
}

preserve_dashboard() {
  mkdir -p "${DASH_PRESERVE}"
  [[ -f "${DASH_INDEX}" ]] && cp -a "${DASH_INDEX}" "${DASH_PRESERVE}/index.html"
  [[ -f "${DASH_SERVER}" ]] && cp -a "${DASH_SERVER}" "${DASH_PRESERVE}/linuxbox-status-server.js"
}

restore_dashboard_if_needed() {
  if dash_markers_ok; then
    rm -rf "${DASH_PRESERVE}"
    return 0
  fi
  echo "git-pull-deploy: WARN dashboard markers missing after sync" >&2
  mkdir -p "${REPO}/agents/state"
  if [[ -f "${DASH_PRESERVE}/index.html" ]] && dash_markers_ok "${DASH_PRESERVE}/index.html"; then
    echo "git-pull-deploy: restoring dashboard from pre-stash preserve" >&2
    cp -a "${DASH_PRESERVE}/index.html" "${DASH_INDEX}"
    [[ -f "${DASH_PRESERVE}/linuxbox-status-server.js" ]] \
      && cp -a "${DASH_PRESERVE}/linuxbox-status-server.js" "${DASH_SERVER}"
    printf '{"alert":"dashboard_restored_from_preserve","at":"%s"}\n' "$(date -u -Iseconds)" >> "${ALERT_LOG}"
    sudo systemctl restart linuxbox-status 2>/dev/null || true
    sleep 2
    curl -s -o /dev/null -w "dashboard:%{http_code}\n" http://127.0.0.1:8790/ || true
  else
    echo "git-pull-deploy: ALERT dashboard broken — no good preserve; need PC bundle/SCP" >&2
    printf '{"alert":"dashboard_markers_missing","at":"%s","head":"%s"}\n' \
      "$(date -u -Iseconds)" "$(git rev-parse --short HEAD 2>/dev/null || echo unknown)" >> "${ALERT_LOG}"
  fi
  rm -rf "${DASH_PRESERVE}"
}

preserve_dashboard

# Protected runtime paths (registries, user-tasks, map edits…): snapshot tracked
# copies so stash/pull/pop can never silently revert them — docs/runtime-state-protection.md.
if [[ -f "${PP}" ]]; then
  mkdir -p "${PROT_PRESERVE}"
  PROTECTED_REPO="${REPO}" python3 "${PP}" preserve "${PROT_PRESERVE}" >/dev/null 2>&1 || true
fi


gm_borders_autorestore() {
  if [[ -f "${REPO}/scripts/linuxbox/tableslop-gm-borders-autorestore.sh" ]]; then
    bash "${REPO}/scripts/linuxbox/tableslop-gm-borders-autorestore.sh"       || echo "git-pull-deploy: WARN gm-borders-autorestore failed" >&2
  fi
}

restore_protected() {
  if [[ -f "${PP}" && -d "${PROT_PRESERVE}" ]]; then
    PROTECTED_REPO="${REPO}" python3 "${PP}" restore "${PROT_PRESERVE}" 2>/dev/null | grep -v '^restore: keep head' || true
    rm -rf "${PROT_PRESERVE}"
  fi
}

STASHED=0
# Stash non-dashboard dirt only — never put dashboard overlays into stash (pop used to wipe them).
if ! git diff --quiet -- . ":(exclude)${DASH_INDEX}" ":(exclude)${DASH_SERVER}" ":(exclude)scripts/linuxbox/linuxbox-status/" 2>/dev/null \
  || ! git diff --cached --quiet -- . ":(exclude)${DASH_INDEX}" ":(exclude)${DASH_SERVER}" ":(exclude)scripts/linuxbox/linuxbox-status/" 2>/dev/null; then
  git stash push -m "git-pull-deploy-$(date +%s)" -q -- . \
    ":(exclude)${DASH_INDEX}" \
    ":(exclude)${DASH_SERVER}" \
    ":(exclude)scripts/linuxbox/linuxbox-status/" || true
  STASHED=1
fi

OLD="$(git rev-parse HEAD)"
PULL_OUT="$(timeout 15 git pull --ff-only origin "${BRANCH}" 2>&1)" || true
if echo "${PULL_OUT}" | grep -qiE 'could not read Username|Authentication failed|Permission denied|Repository not found'; then
  echo "git-pull-deploy: HTTPS auth unavailable (use apply-git-bundle.sh / PC push-linuxbox-git-bundle.sh)" >&2
  if [[ "${STASHED}" -eq 1 ]]; then
    git stash pop -q 2>/dev/null || true
  fi
  restore_dashboard_if_needed
  restore_protected
  gm_borders_autorestore
  exit 0
fi
if echo "${PULL_OUT}" | grep -qiE 'fatal:|error:|Conflict|diverged|Not possible to fast-forward'; then
  echo "git-pull-deploy: pull failed (merge/conflict?)" >&2
  echo "${PULL_OUT}" >&2
  if [[ "${STASHED}" -eq 1 ]]; then
    git stash pop -q 2>/dev/null || true
  fi
  restore_dashboard_if_needed
  restore_protected
  gm_borders_autorestore
  exit 0
fi
# Success path may still print "Already up to date."
echo "${PULL_OUT}" | grep -v '^$' || true
NEW="$(git rev-parse HEAD)"

if [[ "${STASHED}" -eq 1 ]]; then
  git stash pop -q 2>/dev/null || echo "git-pull-deploy: WARN stash pop conflict — resolve on box" >&2
fi

restore_dashboard_if_needed
restore_protected
gm_borders_autorestore

if [[ "${OLD}" == "${NEW}" ]]; then
  exit 0
fi

echo "git-pull-deploy: ${OLD:0:8} → ${NEW:0:8}"

restart_dashboard=0
restart_tableslop=0
restart_campaigns=0
restart_origin=0

# Dashboard match includes the status server's require()d modules — node caches them,
# so a module-only change without restart runs stale code (see apply-git-bundle.sh).
while IFS= read -r path; do
  [[ -z "${path}" ]] && continue
  case "${path}" in
    scripts/linuxbox/linuxbox-status-server.js|scripts/linuxbox/linuxbox-status/*|\
    scripts/linuxbox/linuxbox-docs-wiki.js|scripts/linuxbox/linuxbox-systems.js|\
    scripts/linuxbox/linuxbox-machines.js|scripts/linuxbox/chat-offload-handoff.js|\
    scripts/linuxbox/chars-registry-persist.js|scripts/linuxbox/chars-registry-merge.js)
      restart_dashboard=1
      ;;
    scripts/linuxbox/tableslop-server.js|scripts/linuxbox/install-tableslop-linuxbox.sh)
      restart_tableslop=1
      ;;
    scripts/linuxbox/campaigns-availability-server.js)
      restart_campaigns=1
      ;;
    scripts/linuxbox/tunnel-origin-proxy.js)
      restart_origin=1
      ;;
  esac
done < <(git diff --name-only "${OLD}" "${NEW}")

if [[ "${restart_dashboard}" -eq 1 ]]; then
  echo "git-pull-deploy: restart linuxbox-status"
  sudo systemctl restart linuxbox-status
  sleep 2
  systemctl is-active linuxbox-status || true
  curl -s -o /dev/null -w "dashboard:%{http_code}\n" http://127.0.0.1:8790/ || true
fi

if [[ "${restart_tableslop}" -eq 1 ]]; then
  echo "git-pull-deploy: restart linuxbox-tableslop"
  sudo systemctl restart linuxbox-tableslop
  sleep 2
  systemctl is-active linuxbox-tableslop || true
  curl -s -o /dev/null -w "tableslop:%{http_code}\n" http://127.0.0.1:8765/ || true
fi

if [[ "${restart_campaigns}" -eq 1 ]] && systemctl cat linuxbox-campaigns-avail >/dev/null 2>&1; then
  echo "git-pull-deploy: restart linuxbox-campaigns-avail"
  sudo systemctl restart linuxbox-campaigns-avail
  sleep 2
  systemctl is-active linuxbox-campaigns-avail || true
  curl -s -o /dev/null -w "campaigns-avail:%{http_code}\n" http://127.0.0.1:8768/ || true
fi

if [[ "${restart_origin}" -eq 1 ]] && systemctl cat abhinavall-origin-8780 >/dev/null 2>&1; then
  echo "git-pull-deploy: restart abhinavall-origin-8780"
  sudo systemctl restart abhinavall-origin-8780
  sleep 2
  systemctl is-active abhinavall-origin-8780 || true
  curl -s -o /dev/null -w "origin-8780:%{http_code}\n" http://127.0.0.1:8780/ || true
fi

# Fail-loud verification gate — only when HEAD actually moved.
if [[ -f "${REPO}/scripts/linuxbox/verify-runtime-state.sh" ]]; then
  bash "${REPO}/scripts/linuxbox/verify-runtime-state.sh" --context git-pull-deploy \
    || { echo "git-pull-deploy: VERIFY FAILED — see agents/state/dashboard-deploy-alerts.jsonl" >&2; exit 1; }
fi

echo "git-pull-deploy: OK"
