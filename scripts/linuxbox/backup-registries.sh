#!/usr/bin/env bash
# Timestamped snapshot of protected runtime files (manifest backup:true) with retention.
# Runs on the box; called before every git hard-reset (apply-git-bundle.sh) and manually.
# Dest: /mnt/archive/state-backups/<UTC>/ (fallback <repo>/backups/state/ when archive absent).
set -uo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-${HOME}/agent-dump}"
[[ -d "${REPO}" ]] || REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PP="${REPO}/scripts/linuxbox/protected-paths.py"
KEEP="${STATE_BACKUP_KEEP:-40}"
QUIET=0
[[ "${1:-}" == "--quiet" ]] && QUIET=1

if [[ -d /mnt/archive ]] && touch /mnt/archive/.state-backup-probe 2>/dev/null; then
  rm -f /mnt/archive/.state-backup-probe
  ROOT="/mnt/archive/state-backups"
else
  ROOT="${REPO}/backups/state"
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${ROOT}/${TS}"
mkdir -p "${DEST}"

N=0
while IFS= read -r rel; do
  [[ -z "${rel}" ]] && continue
  src="${REPO}/${rel}"
  [[ -f "${src}" ]] || continue
  mkdir -p "${DEST}/$(dirname "${rel}")"
  cp -a "${src}" "${DEST}/${rel}" 2>/dev/null && N=$((N + 1))
done < <(python3 "${PP}" list --backup-only 2>/dev/null)

if [[ "${N}" -eq 0 ]]; then
  rmdir "${DEST}" 2>/dev/null || true
  [[ "${QUIET}" -eq 0 ]] && echo "backup-registries: nothing to back up"
  exit 0
fi

# retention: keep newest ${KEEP} snapshot dirs
ls -1d "${ROOT}"/*/ 2>/dev/null | sort | head -n -"${KEEP}" | while IFS= read -r old; do
  rm -rf "${old}"
done

[[ "${QUIET}" -eq 0 ]] && echo "backup-registries: ${N} file(s) → ${DEST} (keep ${KEEP})"
exit 0
