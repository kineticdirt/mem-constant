#!/usr/bin/env bash
# Sourceable paths: bulk logs on archive HDD; small meta stays in repo for agents.
# ponytail: one helper, reused by schedulers and push scripts.
ARCHIVE_ROOT="${LINUXBOX_ARCHIVE:-/mnt/archive}"
# Hermes `-p think` sets HOME to ~/.hermes/profiles/think/home/ — never resolve
# the repo (or agent binaries) through that overlay. Prefer an already-correct
# REPO from the caller; otherwise pin to the real passwd home.
_REAL_HOME="$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f6)"
_REAL_HOME="${_REAL_HOME:-/home/$(id -un)}"
if [[ -z "${REPO:-}" || "${REPO}" == */.hermes/profiles/* ]]; then
  _cand="${AGENT_DUMP:-${_REAL_HOME}/agent-dump}"
  if [[ "${_cand}" == */.hermes/profiles/* ]]; then
    _cand="${_REAL_HOME}/agent-dump"
  fi
  REPO="${_cand}"
fi
unset _cand _REAL_HOME

archive_logs_ready() {
  [[ -d "${ARCHIVE_ROOT}/logs" ]] && [[ -w "${ARCHIVE_ROOT}/logs" ]]
}

if archive_logs_ready; then
  export LINUXBOX_LOG_ROOT="${ARCHIVE_ROOT}/logs"
  export LINUXBOX_AGENT_RUNS="${LINUXBOX_LOG_ROOT}/agent-runs"
  export LINUXBOX_SECURITY_LOGS="${LINUXBOX_LOG_ROOT}/security"
  export LINUXBOX_REPORTS_ARCHIVE="${ARCHIVE_ROOT}/reports"
else
  export LINUXBOX_LOG_ROOT=""
  export LINUXBOX_AGENT_RUNS="${REPO}/agents/runs"
  export LINUXBOX_SECURITY_LOGS="${REPO}/reports/security"
  export LINUXBOX_REPORTS_ARCHIVE=""
fi

export LINUXBOX_ARCHIVE_META="${REPO}/agents/archive-meta.json"
export LINUXBOX_RUN_INDEX="${REPO}/agents/state/run-index.jsonl"

mkdir -p "${LINUXBOX_AGENT_RUNS}" "${REPO}/agents/state" 2>/dev/null || true
if archive_logs_ready; then
  mkdir -p "${LINUXBOX_AGENT_RUNS}" "${LINUXBOX_SECURITY_LOGS}" "${LINUXBOX_REPORTS_ARCHIVE}" 2>/dev/null || true
fi
