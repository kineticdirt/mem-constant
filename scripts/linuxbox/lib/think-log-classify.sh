#!/usr/bin/env bash
# Per-attempt think-log classification (sourced by agent-cycle-think-tick.sh).
#
# Why attempt-scoped: think-last.log ACCUMULATES every free-rotate attempt in a
# tick via tee -a. Classifying against the whole log let an early attempt's 429
# poison the rest of the tick — a later attempt's real DONE was ignored, the
# *successful* model got day-blocked via mark_free_429, and rc was rewritten to
# 429. Helpers here read ATTEMPT_LOG (truncated per run_hermes_once call) and
# fall back to LOG when no attempt file is set.
#
# Self-check: bash scripts/linuxbox/lib/think-log-classify.sh --self-check

_think_classify_target() {
  printf '%s' "${ATTEMPT_LOG:-${LOG:-}}"
}

log_is_free_429() {
  grep -qiE 'HTTP 429|free-models-per-day|Rate limit exceeded' "$(_think_classify_target)" 2>/dev/null
}

log_is_shared_free_daily() {
  grep -qiE 'free-models-per-day' "$(_think_classify_target)" 2>/dev/null
}

# ponytail: unused today; kept for parity with the pre-lib tick helpers.
log_has_tool_progress() {
  grep -qiE 'Messages:[[:space:]]*[2-9]|tool calls\)|DONE:|BLOCKED:' "$(_think_classify_target)" 2>/dev/null
}

# Real DONE:/BLOCKED: from the model — NOT the prompt template
# ("End with … DONE: <what> or BLOCKED: <why> or IDLE:.") which used to abort
# free-rotate before mark_free_429 / paid C8 (Hub stuck on "429 BLOCKED").
log_has_real_done_or_blocked() {
  LOG="$(_think_classify_target)" python3 - <<'PY'
import os, re
from pathlib import Path
p = Path(os.environ.get("LOG") or "")
try:
    text = p.read_text(encoding="utf-8", errors="replace")
except Exception:
    raise SystemExit(1)
# Free 429 in this attempt → keep rotating; template DONE must not win.
if re.search(r"HTTP\s*429|free-models-per-day|Rate limit exceeded", text, re.I):
    raise SystemExit(1)
pat = re.compile(r"^\s*(DONE|BLOCKED)\s*:(.*)$", re.I | re.M)
for m in pat.finditer(text):
    line = m.group(0)
    rest = (m.group(2) or "").strip()
    up = line.upper()
    if sum(up.count(k) for k in ("DONE:", "BLOCKED:", "IDLE:")) > 1:
        continue
    if not rest or re.fullmatch(r"[./|\s\-]*", rest):
        continue
    if re.search(r"<what|<why|pick one:", rest, re.I):
        continue
    raise SystemExit(0)
raise SystemExit(1)
PY
}

if [[ "${1:-}" == "--self-check" ]]; then
  set -euo pipefail
  _tmp="$(mktemp -d)"
  trap 'rm -rf "${_tmp}"' EXIT
  export ATTEMPT_LOG="${_tmp}/attempt.log" LOG="${_tmp}/think-last.log"

  # 1) Earlier attempt 429 (history) + clean DONE this attempt → DONE wins.
  printf 'HTTP 429 free-models-per-day\n' > "${LOG}"
  printf 'tool output\nDONE: flipped the checkbox and verified\n' > "${ATTEMPT_LOG}"
  log_has_real_done_or_blocked
  ! log_is_free_429

  # 2) This attempt 429'd — even a DONE in the same attempt loses (keep rotating).
  printf 'Error: HTTP 429 free-models-per-day limit\nDONE: still rotate\n' > "${ATTEMPT_LOG}"
  log_is_free_429
  log_is_shared_free_daily
  ! log_has_real_done_or_blocked

  # 3) Prompt-template marker only → not real.
  printf 'End with exactly one marker line — pick one: DONE: <what shipped>   or   BLOCKED: <why>   or   IDLE:.\n' > "${ATTEMPT_LOG}"
  ! log_has_real_done_or_blocked

  echo "think-log-classify self_check OK"
  exit 0
fi
