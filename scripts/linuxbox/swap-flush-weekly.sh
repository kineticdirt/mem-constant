#!/usr/bin/env bash
# swap-flush-weekly.sh — Sunday ~04:10 crontab. Flush stale swap pages back to RAM:
# sync, drop_caches, swapoff -a, swapon -a, then restart zramswap (zram0 is NOT in
# fstab, so swapon -a alone would leave it off). zram makes day-to-day swap cheap;
# this clears the slow SD-file swap (/var/swap2) weekly.
# Guard: skip when MemAvailable < SWAP_FLUSH_MIN_AVAIL_MB (default 400) — a flush
# under memory pressure could OOM a 2GB box. swapoff failure is non-fatal: the
# restore path always runs (swapon -a + zramswap restart) and the post-state is logged.
# DRY_RUN=1 logs what it would do. Log: /tmp/swap-flush-weekly.log (kept <=200 lines).
set -uo pipefail

LOG="${SWAP_FLUSH_LOG:-/tmp/swap-flush-weekly.log}"
MIN_AVAIL_MB="${SWAP_FLUSH_MIN_AVAIL_MB:-400}"

log() { echo "$(date -Iseconds) $*" >>"${LOG}"; }

trim_log() {
  [[ -f "${LOG}" ]] || return 0
  local n
  n="$(wc -l <"${LOG}")"
  if [[ "${n}" -gt 400 ]]; then
    tail -n 200 "${LOG}" >"${LOG}.tmp" && mv "${LOG}.tmp" "${LOG}"
  fi
}

avail_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
avail_mb=$(( ${avail_kb:-0} / 1024 ))
swap_used_kb="$(awk '/^SwapTotal:/ {t=$2} /^SwapFree:/ {f=$2} END {print t-f}' /proc/meminfo)"
swap_used_mb=$(( ${swap_used_kb:-0} / 1024 ))

if [[ "${avail_mb}" -lt "${MIN_AVAIL_MB}" ]]; then
  log "SKIP MemAvailable=${avail_mb}MB < ${MIN_AVAIL_MB}MB (swap_used=${swap_used_mb}MB)"
  trim_log
  exit 0
fi

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  log "DRY_RUN would flush: swap_used=${swap_used_mb}MB avail=${avail_mb}MB"
  trim_log
  exit 0
fi

sync
echo 3 | sudo -n tee /proc/sys/vm/drop_caches >/dev/null
sudo -n /sbin/swapoff -a
off_rc=$?
sudo -n /sbin/swapon -a
sudo -n systemctl restart zramswap.service 2>/dev/null || true
post_avail_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
post_avail_mb=$(( ${post_avail_kb:-0} / 1024 ))
post_swap_kb="$(awk '/^SwapTotal:/ {t=$2} /^SwapFree:/ {f=$2} END {print t-f}' /proc/meminfo)"
post_swap_mb=$(( ${post_swap_kb:-0} / 1024 ))
if [[ "${off_rc}" -eq 0 ]]; then
  log "FLUSH ok swap_used ${swap_used_mb}MB->${post_swap_mb}MB avail=${post_avail_mb}MB"
else
  log "FLUSH partial swapoff_rc=${off_rc} (low free RAM; swap restored) swap_used ${swap_used_mb}MB->${post_swap_mb}MB avail=${post_avail_mb}MB"
fi
trim_log
exit 0
