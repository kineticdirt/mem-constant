#!/usr/bin/env bash
# Archive bloated Hermes *profile* state.db files before they hang the box.
# Evidence 2026-07-21: fast 2.3G + think 811M → Hub Loading thrash / D-state.
# Gateway watchdog only watches ~/.hermes/state.db — this covers profiles/*.
# Safe to run from hermes-gateway-watchdog.timer or a dedicated timer.
set -euo pipefail

HOME_DIR="${HOME:-/home/abhinav}"
PROFILES_ROOT="${HOME_DIR}/.hermes/profiles"
ARCHIVE_ROOT="${HERMES_STATE_ARCHIVE:-/mnt/archive/logs}"
# Archive when larger than this (default 200 MiB)
MAX_BYTES="${HERMES_PROFILE_DB_MAX_BYTES:-$((200 * 1024 * 1024))}"
# Profiles that chat ticks write heavily
PROFILES="${HERMES_PROFILE_DB_GUARD_LIST:-fast think code meta}"

mkdir -p "${ARCHIVE_ROOT}" 2>/dev/null || true
STAMP="$(date -u +%Y%m%dT%H%MZ)"
DEST="${ARCHIVE_ROOT}/hermes-state-db-${STAMP}"
moved=0

for prof in ${PROFILES}; do
  db="${PROFILES_ROOT}/${prof}/state.db"
  [[ -f "${db}" ]] || continue
  sz="$(stat -c%s "${db}" 2>/dev/null || echo 0)"
  if [[ "${sz}" -le "${MAX_BYTES}" ]]; then
    continue
  fi
  mkdir -p "${DEST}"
  echo "[$(date -u -Iseconds)] archive ${prof} state.db bytes=${sz} -> ${DEST}"
  # Do not pkill lane chats — if sqlite is locked, mv fails and we leave it (safer than random kills).
  if ! mv -f "${db}" "${DEST}/${prof}-state.db"; then
    echo "[$(date -u -Iseconds)] skip ${prof}: could not move (in use?)"
    continue
  fi
  for ext in -wal -shm -journal; do
    [[ -f "${db}${ext}" ]] && mv -f "${db}${ext}" "${DEST}/${prof}-state.db${ext}" || true
  done
  # Fresh empty sqlite so next tick does not crash on missing file
  python3 - <<PY
import sqlite3
from pathlib import Path
p = Path("${db}")
p.parent.mkdir(parents=True, exist_ok=True)
sqlite3.connect(str(p)).close()
PY
  moved=$((moved + 1))
done

if [[ "${moved}" -gt 0 ]]; then
  echo "[$(date -u -Iseconds)] archived ${moved} profile DB(s) under ${DEST}"
  # Best-effort Hub alert
  ALERT="${HOME_DIR}/agent-dump/agents/state/hermes-profile-db-guard.json"
  mkdir -p "$(dirname "${ALERT}")" 2>/dev/null || true
  printf '{"status":"archived","count":%s,"dest":"%s","at":"%s"}\n' \
    "${moved}" "${DEST}" "$(date -u -Iseconds)" > "${ALERT}.tmp"
  mv -f "${ALERT}.tmp" "${ALERT}"
fi
exit 0
