#!/usr/bin/env bash
# Apply a git bundle dropped at /tmp/linuxbox-incoming.bundle (from PC push-linuxbox-git-bundle.sh).
# Runtime-state protection: docs/runtime-state-protection.md — protected paths are
# preserved across the hard reset via agents/protected-runtime-paths.json.
set -euo pipefail

# Re-exec from a temp copy: git reset --hard swaps this file under the running
# interpreter mid-script (bash reads incrementally) — evidence class 2026-07-14.
if [[ -z "${APPLY_BUNDLE_SELFCOPY:-}" ]]; then
  _self_tmp="$(mktemp /tmp/apply-git-bundle-self.XXXXXX)"
  cp "${BASH_SOURCE[0]}" "${_self_tmp}"
  APPLY_BUNDLE_SELFCOPY=1 exec bash "${_self_tmp}" "$@"
fi
trap 'rm -f "${BASH_SOURCE[0]}"' EXIT

REPO="${LINUXBOX_AGENT_DUMP:-${HOME}/agent-dump}"
BUNDLE="${LINUXBOX_GIT_BUNDLE:-/tmp/linuxbox-incoming.bundle}"
BRANCH="${LINUXBOX_GIT_BRANCH:-main}"
REF="refs/remotes/origin/${BRANCH}"

# Serialize: fast tick (30s cron) + manual PC pushes must not apply concurrently.
exec 201>/tmp/apply-git-bundle.lock
flock -w 60 201 || { echo "apply-git-bundle: lock timeout" >&2; exit 1; }

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
  git fetch "${BUNDLE}" "refs/heads/${BRANCH}:${REF}" 2>/dev/null || \
  git fetch "${BUNDLE}" "+refs/heads/master:${REF}" 2>/dev/null || true

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
# Protected runtime paths (registries, user-tasks, agents/state, map edits…)
# are snapshotted before and restored after — manifest-driven, type-aware.
PRESERVE_DIR="$(mktemp -d /tmp/linuxbox-protected-preserve.XXXXXX)"
# Snapshot the tool + manifest so preserve AND restore run the same generation
# even though the reset swaps both files on disk.
PP_TOOL="${PRESERVE_DIR}/_tool/protected-paths.py"
mkdir -p "${PRESERVE_DIR}/_tool" "${PRESERVE_DIR}/files"
cp "${REPO}/scripts/linuxbox/protected-paths.py" "${PP_TOOL}" 2>/dev/null || true
cp "${REPO}/agents/protected-runtime-paths.json" "${PRESERVE_DIR}/_tool/manifest.json" 2>/dev/null || true

preserve_ok=0
if [[ -f "${PP_TOOL}" && -f "${PRESERVE_DIR}/_tool/manifest.json" ]]; then
  if PROTECTED_REPO="${REPO}" python3 "${PP_TOOL}" preserve "${PRESERVE_DIR}/files"; then
    preserve_ok=1
  else
    echo "apply-git-bundle: WARN preserve failed — falling back to registry-only" >&2
  fi
fi
if [[ "${preserve_ok}" -eq 0 ]]; then
  # legacy fallback: keep campaigns/*/characters-registry.json at minimum
  while IFS= read -r -d '' reg; do
    rel="${reg#"${REPO}"/}"
    mkdir -p "${PRESERVE_DIR}/files/$(dirname "${rel}")"
    cp -a "${reg}" "${PRESERVE_DIR}/files/${rel}"
  done < <(find "${REPO}/campaigns" -maxdepth 2 -type f -name 'characters-registry.json' -print0 2>/dev/null || true)
fi

# Snapshot protected runtime files to archive before touching anything.
bash "${REPO}/scripts/linuxbox/backup-registries.sh" --quiet 2>/dev/null || true

git reset --hard "origin/${BRANCH}"
rm -f "${BUNDLE}"

if [[ -f "${PP_TOOL}" && "${preserve_ok}" -eq 1 ]]; then
  PROTECTED_REPO="${REPO}" python3 "${PP_TOOL}" restore "${PRESERVE_DIR}/files" \
    || echo "apply-git-bundle: WARN restore failed — check ${PRESERVE_DIR}" >&2
else
  # legacy fallback restore (version >= rule)
  while IFS= read -r -d '' saved; do
    rel="${saved#"${PRESERVE_DIR}"/files/}"
    dest="${REPO}/${rel}"
    local_ver="$(python3 -c 'import json,sys; print(int(json.load(open(sys.argv[1])).get("version") or 0))' "${saved}" 2>/dev/null || echo 0)"
    head_ver=0
    if [[ -f "${dest}" ]]; then
      head_ver="$(python3 -c 'import json,sys; print(int(json.load(open(sys.argv[1])).get("version") or 0))' "${dest}" 2>/dev/null || echo 0)"
    fi
    if [[ "${local_ver}" -ge "${head_ver}" ]] && [[ "${local_ver}" -gt 0 ]]; then
      mkdir -p "$(dirname "${dest}")"
      cp -a "${saved}" "${dest}"
      echo "apply-git-bundle: preserved ${rel} (local v${local_ver} >= head v${head_ver})"
    fi
  done < <(find "${PRESERVE_DIR}/files" -type f -name 'characters-registry.json' -print0 2>/dev/null || true)
fi
rm -rf "${PRESERVE_DIR}"

# GM borders: if hard reset left git HEAD stubs, restore richest bak (fail-loud log).
if [[ -f "${REPO}/scripts/linuxbox/tableslop-gm-borders-autorestore.sh" ]]; then
  bash "${REPO}/scripts/linuxbox/tableslop-gm-borders-autorestore.sh"     || echo "apply-git-bundle: WARN gm-borders-autorestore failed" >&2
fi

# Windows/git-bundle often lands scripts as 100644; systemd ExecStart then fails 203/EXEC.
# Evidence 2026-07-12 / 2026-08-09: hermes + Hub status watchdogs Permission denied (203/EXEC).
chmod +x "${REPO}/scripts/linuxbox/"*.sh 2>/dev/null || true
chmod +x "${REPO}/scripts/linuxbox/lib/"*.sh 2>/dev/null || true
# Fail-loud on timer ExecStart scripts — soft chmod || true must not hide 203/EXEC (dd-07).
for _wd in hermes-gateway-watchdog.sh linuxbox-status-watchdog.sh; do
  if [[ ! -x "${REPO}/scripts/linuxbox/${_wd}" ]]; then
    echo "apply-git-bundle: ERROR ${_wd} not executable after chmod (203/EXEC risk)" >&2
    exit 1
  fi
done
unset _wd
# CRLF guard (bundle path): no root .gitattributes, so a Windows CRLF commit of a .sh
# lands verbatim via bundle → shebang /bin/bash^M → ExecStart 203 / cron bad-interpreter.
# SCP path is covered by scripts/pc/fix-sh-crlf-remote.sh; same strip here for bundles.
find "${REPO}/scripts/linuxbox" -name '*.sh' -type f -exec sed -i 's/\r$//' {} + 2>/dev/null || true

restart_dashboard=0
restart_tableslop=0
restart_campaigns=0
restart_origin=0
# Dashboard match includes the status server's require()d modules (linuxbox-systems,
# linuxbox-machines, chat-offload-handoff, linuxbox-docs-wiki at startup; chars-registry-*
# lazily) — node caches them, so a module-only change without restart runs STALE code
# until some unrelated restart/reboot.
while IFS= read -r path; do
  case "${path}" in
    scripts/linuxbox/linuxbox-status-server.js|scripts/linuxbox/linuxbox-status/*|\
    scripts/linuxbox/linuxbox-docs-wiki.js|scripts/linuxbox/linuxbox-systems.js|\
    scripts/linuxbox/linuxbox-machines.js|scripts/linuxbox/chat-offload-handoff.js|\
    scripts/linuxbox/chars-registry-persist.js|scripts/linuxbox/chars-registry-merge.js) restart_dashboard=1 ;;
    scripts/linuxbox/tableslop-server.js) restart_tableslop=1 ;;
    scripts/linuxbox/campaigns-availability-server.js) restart_campaigns=1 ;;
    scripts/linuxbox/tunnel-origin-proxy.js) restart_origin=1 ;;
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
# Guard newer units with `systemctl cat` so a box without them doesn't abort the apply.
if [[ "${restart_campaigns}" -eq 1 ]] && systemctl cat linuxbox-campaigns-avail >/dev/null 2>&1; then
  sudo systemctl restart linuxbox-campaigns-avail
  curl -s -o /dev/null -w "campaigns-avail:%{http_code}\n" http://127.0.0.1:8768/ || true
fi
if [[ "${restart_origin}" -eq 1 ]] && systemctl cat abhinavall-origin-8780 >/dev/null 2>&1; then
  sudo systemctl restart abhinavall-origin-8780
  curl -s -o /dev/null -w "origin-8780:%{http_code}\n" http://127.0.0.1:8780/ || true
fi

mkdir -p "${REPO}/agents/state"
date -u -Iseconds > "${REPO}/agents/state/git-sync.json.tmp"
printf '{"applied_at":"%s","from_rev":"%s","to_rev":"%s","noop":false}\n' \
  "$(cat "${REPO}/agents/state/git-sync.json.tmp")" "${OLD}" "${NEW}" \
  > "${REPO}/agents/state/git-sync.json"
rm -f "${REPO}/agents/state/git-sync.json.tmp"

echo "apply-git-bundle: ${OLD:0:8} → ${NEW:0:8}"

# Fail-loud verification gate (versions, dashboard pair marker, :8790, roster count).
if [[ -f "${REPO}/scripts/linuxbox/verify-runtime-state.sh" ]]; then
  bash "${REPO}/scripts/linuxbox/verify-runtime-state.sh" --context bundle-apply \
    || { echo "apply-git-bundle: VERIFY FAILED — see agents/state/dashboard-deploy-alerts.jsonl" >&2; exit 1; }
fi
