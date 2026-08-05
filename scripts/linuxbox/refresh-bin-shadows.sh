#!/usr/bin/env bash
# Refresh durable ~/bin shadow copies from the repo.
# Prevention for pc-2026-08-05-think-tick-stale-bin-shadow: the tick re-execs
# ~/bin/agent-cycle-think-tick.sh on its post-run sleeper chain and prefers
# ~/bin/agent-cycle-has-work.py over the repo copy, so a stale shadow silently
# defeats repo fixes until someone re-runs the installer. Called from
# agent-cycle-sync.sh every tick. cp+chmod to a temp then atomic mv, so a
# running shadow keeps its old inode and is never truncated mid-read.
#
# Self-check: bash scripts/linuxbox/refresh-bin-shadows.sh --self-check
set -euo pipefail

FILES="agent-cycle-think-tick.sh agent-cycle-sync.sh agent-cycle-has-work.py"

refresh_one() {
  local name="$1" src dst tmp
  src="${REPO}/scripts/linuxbox/${name}"
  dst="${BIN_DIR}/${name}"
  [[ -s "${src}" ]] || return 0 # never propagate an empty/truncated repo copy
  if [[ -f "${dst}" ]] && cmp -s "${src}" "${dst}"; then
    return 0
  fi
  mkdir -p "${BIN_DIR}"
  tmp="${dst}.tmp.$$"
  cp -f "${src}" "${tmp}"
  case "${name}" in
    *.sh) chmod +x "${tmp}" ;;
  esac
  mv -f "${tmp}" "${dst}"
  echo "refresh-bin-shadows: updated ${name}"
}

if [[ "${1:-}" == "--self-check" ]]; then
  _root="$(mktemp -d)"
  trap 'rm -rf "${_root}"' EXIT
  REPO="${_root}/repo"
  BIN_DIR="${_root}/bin"
  mkdir -p "${REPO}/scripts/linuxbox" "${BIN_DIR}"
  # Shebang fixtures: msys `test -x` only honors exec bits on shebang files.
  for f in ${FILES}; do printf '#!/usr/bin/env bash\n# v1\n' > "${REPO}/scripts/linuxbox/${f}"; done

  # Fresh install copies everything; .sh lands executable.
  for f in ${FILES}; do refresh_one "${f}"; done
  [[ -x "${BIN_DIR}/agent-cycle-think-tick.sh" ]]
  cmp -s "${REPO}/scripts/linuxbox/agent-cycle-has-work.py" "${BIN_DIR}/agent-cycle-has-work.py"

  # Identical copies → silent second pass.
  _out="$(for f in ${FILES}; do refresh_one "${f}"; done)"
  [[ -z "${_out}" ]]

  # Newer repo copy → shadow refreshed.
  printf '# v2\n' > "${REPO}/scripts/linuxbox/agent-cycle-sync.sh"
  refresh_one agent-cycle-sync.sh >/dev/null
  grep -q 'v2' "${BIN_DIR}/agent-cycle-sync.sh"

  # Empty repo copy must not clobber the good shadow.
  : > "${REPO}/scripts/linuxbox/agent-cycle-think-tick.sh"
  refresh_one agent-cycle-think-tick.sh
  grep -q 'v1' "${BIN_DIR}/agent-cycle-think-tick.sh"

  echo "refresh-bin-shadows self_check OK"
  exit 0
fi

REPO="${1:-${LINUXBOX_AGENT_DUMP:-${HOME}/agent-dump}}"
BIN_DIR="${BIN_DIR:-${HOME}/bin}"

for f in ${FILES}; do
  refresh_one "${f}"
done
