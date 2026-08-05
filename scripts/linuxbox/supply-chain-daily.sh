#!/usr/bin/env bash
# supply-chain-daily.sh — daily 04:20 crontab (GM-approved off-tick lane).
# For each target in agents/update-targets.json whose newest
# reports/supply-chain/<target>-*.md is older than SUPPLY_CHAIN_MAX_AGE_H
# (default 24h) or missing, run scripts/linuxbox/safe-update-check.sh <target>
# SEQUENTIALLY (2GB SBC — no parallelism). Owns report freshness so think ticks
# stop spawning supply-chain user-tasks. safe-update-check rc: 0 = ran (verdict
# SAFE|HOLD in output), 2 = hard error (logged as failed).
# Log: /tmp/supply-chain-daily.log (kept <=400 lines).
set -uo pipefail

REPO="${AGENT_DUMP:-$HOME/agent-dump}"
TARGETS_JSON="${REPO}/agents/update-targets.json"
REPORT_DIR="${REPO}/reports/supply-chain"
CHECK_SH="${REPO}/scripts/linuxbox/safe-update-check.sh"
LOG="${SUPPLY_CHAIN_LOG:-/tmp/supply-chain-daily.log}"
MAX_AGE_H="${SUPPLY_CHAIN_MAX_AGE_H:-24}"

log() { echo "$(date -Iseconds) $*" >>"${LOG}"; }

if [[ ! -f "${TARGETS_JSON}" ]]; then
  log "ERROR missing ${TARGETS_JSON}"
  exit 2
fi
if [[ ! -x "${CHECK_SH}" && ! -f "${CHECK_SH}" ]]; then
  log "ERROR missing ${CHECK_SH}"
  exit 2
fi

targets="$(python3 -c "import json,sys; print(chr(10).join(t['name'] for t in json.load(open(sys.argv[1])).get('targets',[]) if t.get('name')))" "${TARGETS_JSON}")"

ran=0
fresh=0
failed=0
while IFS= read -r name; do
  [[ -n "${name}" ]] || continue
  newest="$(ls -1t "${REPORT_DIR}/${name}"-*.md 2>/dev/null | head -1 || true)"
  if [[ -n "${newest}" ]]; then
    age_s=$(( $(date +%s) - $(date -r "${newest}" +%s) ))
    if [[ "${age_s}" -le $(( MAX_AGE_H * 3600 )) ]]; then
      fresh=$((fresh+1))
      continue
    fi
  fi
  log "CHECK ${name} (newest=${newest:-none})"
  out="$(bash "${CHECK_SH}" "${name}" 2>&1)"
  rc=$?
  verdict="$(printf '%s' "${out}" | sed -n 's/^VERDICT=//p' | head -1)"
  if [[ "${rc}" -eq 0 ]]; then
    ran=$((ran+1))
    log "DONE ${name} verdict=${verdict:-unknown}"
  else
    failed=$((failed+1))
    log "FAIL ${name} rc=${rc} $(printf '%s' "${out}" | tail -2 | tr ';' ' ')"
  fi
done <<<"${targets}"

log "SUMMARY ran=${ran} fresh_skipped=${fresh} failed=${failed}"
if [[ -f "${LOG}" ]] && [[ "$(wc -l <"${LOG}")" -gt 800 ]]; then
  tail -n 400 "${LOG}" >"${LOG}.tmp" && mv "${LOG}.tmp" "${LOG}"
fi
exit 0
