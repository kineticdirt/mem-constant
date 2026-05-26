#!/usr/bin/env bash
# Prune abhinavall.net agent artifacts (USB or fallback). Idempotent.
set -euo pipefail

WORK_ROOT="${1:-}"
if [[ -z "${WORK_ROOT}" ]]; then
  echo "usage: abhinavall_cleanup.sh <work-root>" >&2
  exit 2
fi

KEEP_REPORTS="${KEEP_REPORTS:-14}"
MAX_ARCHIVE="${MAX_ARCHIVE:-30}"
CACHE_MAX_DAYS="${CACHE_MAX_DAYS:-7}"

for sub in reports cache archive inbox; do
  mkdir -p "${WORK_ROOT}/${sub}"
done

if [[ -d "${WORK_ROOT}/cache" ]]; then
  find "${WORK_ROOT}/cache" -type f -mtime "+${CACHE_MAX_DAYS}" -delete 2>/dev/null || true
  find "${WORK_ROOT}/cache" -mindepth 1 -maxdepth 1 -type d -mtime "+${CACHE_MAX_DAYS}" -exec rm -rf {} + 2>/dev/null || true
fi

shopt -s nullglob
reports=( "${WORK_ROOT}/reports"/check-*.md "${WORK_ROOT}/reports"/review-*.md )
if ((${#reports[@]} > KEEP_REPORTS)); then
  mapfile -t sorted < <(printf '%s\n' "${reports[@]}" | sort)
  to_archive=$(( ${#sorted[@]} - KEEP_REPORTS ))
  for ((i = 0; i < to_archive; i++)); do
    base="$(basename "${sorted[$i]}")"
    mv -f "${sorted[$i]}" "${WORK_ROOT}/archive/${base}" 2>/dev/null || rm -f "${sorted[$i]}"
  done
fi

archives=( "${WORK_ROOT}/archive"/*.md )
if ((${#archives[@]} > MAX_ARCHIVE)); then
  mapfile -t asorted < <(printf '%s\n' "${archives[@]}" | sort)
  to_del=$(( ${#asorted[@]} - MAX_ARCHIVE ))
  for ((i = 0; i < to_del; i++)); do
    rm -f "${asorted[$i]}"
  done
fi

echo "cleanup ok: ${WORK_ROOT}"
