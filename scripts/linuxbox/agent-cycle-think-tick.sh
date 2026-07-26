#!/usr/bin/env bash
# Think tick: cooldown ~10s after LLM finishes. Hub: think-focus.json + think-last.log.
# Shell: hermes chat forces HERMES_INTERACTIVE=1 → use --yolo + access form/report.
# Guardrails = ordered checks (agents/THINK_SECURITY_CHECKS.md), not rigid bans.
# Toolsets omit browser/computer_use (C3: potato RAM; navigate :8790 hangs → exit 124).
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
REPO="${HOME}/agent-dump"
LOCK="/tmp/agent-cycle-think.lock"
FOCUS="${REPO}/agents/state/think-focus.json"
LOG="${REPO}/agents/runs/think-last.log"
FORM_PY="${REPO}/scripts/linuxbox/think-shell-access-form.py"
# Cadence throttle: cron fires every 1m but the LLM only runs if >= INTERVAL_SEC since the
# last real run (think-llm.last, stamped post-run). Default 480s (~8m) so an every-minute cron
# can't thrash a lane into repeated paid/heavy runs. Cheap has-work poll still runs each minute
# and exits early when idle. Override with THINK_INTERVAL_SEC=N. (was 10s → burned budget.)
INTERVAL_SEC="${THINK_INTERVAL_SEC:-480}"
# Turn ceiling = hard stop (stuck-tool guard). Soft target is lower — finish early.
# Override all with THINK_MAX_TURNS=N. Defaults: 18 normal / 24 [ops]|UI|Fix-this.
THINK_MAX_TURNS_DEFAULT="${THINK_MAX_TURNS_DEFAULT:-20}"
THINK_MAX_TURNS_OPS="${THINK_MAX_TURNS_OPS:-28}"
THINK_TIMEOUT_DEFAULT="${THINK_TIMEOUT_DEFAULT:-240}"
THINK_TIMEOUT_OPS="${THINK_TIMEOUT_OPS:-300}"
THINK_TOOLSETS="${THINK_TOOLSETS:-terminal,file,code_execution,skills,memory,todo}"
# Anti-thrash: after this many failed attempts at one lane box, skip to the next
# open box so a too-big item can't jam the lane. State: agents/state/think-lane-attempts.json.
THINK_MAX_LANE_ATTEMPTS="${THINK_MAX_LANE_ATTEMPTS:-3}"
SELF="${HOME}/bin/agent-cycle-think-tick.sh"
[[ -x "${SELF}" ]] || SELF="${REPO}/scripts/linuxbox/agent-cycle-think-tick.sh"

exec 200>"${LOCK}"
flock -n 200 || exit 0

cd "${REPO}"
mkdir -p "${REPO}/agents/state" "${REPO}/agents/runs"
date -Iseconds > "${REPO}/agents/state/think-tick.last"

focus() {
  STATUS="$1" BLURB="$2" TASK="$3" python3 - <<'PY'
import json, os
from pathlib import Path
from datetime import datetime, timezone
p = Path(os.environ.get("FOCUS_PATH", "/home/abhinav/agent-dump/agents/state/think-focus.json"))
now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
status = os.environ["STATUS"]
row = {
  "status": status,
  "blurb": (os.environ.get("BLURB") or "")[:500],
  "task_id": (os.environ.get("TASK") or "")[:80],
  "updated_at": now,
}
if status == "running":
  row["started_at"] = now
else:
  try:
    prev = json.loads(p.read_text())
    if isinstance(prev, dict) and prev.get("started_at"):
      row["started_at"] = prev["started_at"]
  except Exception:
    pass
p.write_text(json.dumps(row, indent=2) + "\n")
PY
}

export FOCUS_PATH="${FOCUS}"

# Ensure Hub focus leaves "running" if we die mid-tick (timeout / SIGTERM).
THINK_TASK_ID=""
THINK_RC=""
cleanup_think() {
  local rc="${THINK_RC:-$?}"
  [[ -n "${THINK_TASK_ID}" ]] || return 0
  # Only repair if Hub still thinks we are mid-flight.
  set +e
  python3 - <<'PY' 2>/dev/null
import json, os
from pathlib import Path
p = Path(os.environ.get("FOCUS_PATH", ""))
if not p.exists():
  raise SystemExit(0)
try:
  cur = json.loads(p.read_text())
except Exception:
  raise SystemExit(0)
if str(cur.get("status") or "").lower() != "running":
  raise SystemExit(0)
raise SystemExit(1)
PY
  still=$?
  if [[ "${still}" -eq 1 ]]; then
    python3 "${FORM_PY}" close --exit-code "${rc}" >/tmp/think-report-path.txt 2>/dev/null
    focus failed "trap exit ${rc}" "${THINK_TASK_ID}"
  fi
  set -e
}
trap 'cleanup_think' EXIT

# Progress.md lag guard: before has-work/picker, auto-close open `[ ]` boxes whose
# backtick-named *file* evidence already exists on disk (PC flipped / work shipped,
# potato checkboxes stale). Prevents think timeout redoing Discord-ingest etc.
# Directory-only paths (e.g. `discord-export/`) are NOT evidence — leave those open.
REPO="${REPO}" python3 - <<'PY' 2>/dev/null || true
import re
from datetime import datetime, timezone
from pathlib import Path

repo = Path("/home/abhinav/agent-dump")
BOARDS = [
  "agents/tableslop-progress.md",
  "agents/PIXI_RP_PROGRESS.md",
  "agents/portfolio-progress.md",
  "campaigns/nyc-mafia-dnd/reports/progress.md",
  "campaigns/tropic-gooner/reports/progress.md",
  "campaigns/tropic-gooner/reports/progress-hunter.md",
  "campaigns/spacequest/reports/progress.md",
  "agents/LINUXBOX_DASHBOARD_BACKLOG.md",
  "agents/maintenance-progress.md",
  "agents/system-integrity-progress.md",
  "agents/self-improvement-progress.md",
  "agents/research-studies-progress.md",
]
FILE_EXT = re.compile(
  r"\.(md|json|js|mjs|ts|tsx|py|sh|html|css|png|jpe?g|webp|txt|ya?ml|toml)$", re.I
)
BACKTICK = re.compile(r"`([^`]+)`")
# "append to existing.md" is work remaining — not evidence of completion.
MUTATE = re.compile(
  r"\b(append|expand|update|edit|refine|sync|merge|deep\s*dive|rewrite)\b", re.I
)

def evidence_paths(rel: str, body: str) -> list[Path]:
  """File paths named in backticks; dirs/URLs skipped. Empty if mutate-existing work."""
  if MUTATE.search(body):
    return []
  prog = repo / rel
  bases = [prog.parent, repo]
  if prog.parent.name == "reports":
    bases.insert(0, prog.parent.parent)  # campaign root
  found: list[Path] = []
  for raw in BACKTICK.findall(body):
    raw = raw.strip().strip("/")
    if not raw or "://" in raw or raw.endswith("/"):
      continue
    if not FILE_EXT.search(raw):
      continue
    hit = None
    for base in bases:
      cand = (base / raw)
      try:
        if cand.is_file():
          hit = cand
          break
      except OSError:
        pass
    if hit is None:
      cand = repo / raw
      try:
        if cand.is_file():
          hit = cand
      except OSError:
        pass
    if hit is None:
      return []  # named file missing → not satisfied
    found.append(hit)
  return found

def reconcile(rel: str) -> int:
  mf = repo / rel
  if not mf.is_file():
    return 0
  try:
    lines = mf.read_text(encoding="utf-8").splitlines()
  except OSError:
    return 0
  closed: list[str] = []
  out: list[str] = []
  for line in lines:
    m = re.match(r"^(\s*[-*]\s*)\[\s\](\s*)(.*)$", line)
    if not m:
      out.append(line)
      continue
    body = m.group(3).strip()
    paths = evidence_paths(rel, body)
    if paths:
      out.append(f"{m.group(1)}[x]{m.group(2)}{m.group(3)}")
      closed.append(body[:160])
    else:
      out.append(line)
  if not closed:
    return 0
  stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
  final: list[str] = []
  inserted = False
  for line in out:
    final.append(line)
    if not inserted and line.strip().lower() == "## done":
      for c in closed:
        final.append(f"- {stamp}: {c} — evidence on disk (think-reconcile)")
      inserted = True
  if not inserted:
    final.append("")
    final.append("## Done")
    for c in closed:
      final.append(f"- {stamp}: {c} — evidence on disk (think-reconcile)")
  try:
    mf.write_text("\n".join(final) + "\n", encoding="utf-8")
  except OSError:
    return 0
  print(f"think-reconcile: closed {len(closed)} in {rel}", flush=True)
  return len(closed)

n = sum(reconcile(r) for r in BOARDS)
if n:
  print(f"think-reconcile: total closed={n}", flush=True)
PY

# No work → idle, no LLM
HAS="${HOME}/bin/agent-cycle-has-work.py"
[[ -f "${HAS}" ]] || HAS="${REPO}/scripts/linuxbox/agent-cycle-has-work.py"
# Capture the reason (e.g. "WORK: agents/system-integrity-progress.md") so we can
# hand the agent a CONCRETE lane task instead of a vague "think lane" prompt when
# no user-task is open. Discarding this reason was the core 18/18 thrash bug.
HW_REASON=""
if [[ -f "${HAS}" ]]; then
  set +e
  HW_OUT="$(python3 "${HAS}" --lane think --repo "${REPO}" 2>/dev/null)"
  hw=$?
  set -e
  if [[ "${hw}" -eq 1 ]]; then
    THINK_TASK_ID=""
    trap - EXIT
    focus idle "IDLE — no open work" ""
    exit 0
  fi
  HW_REASON="$(printf '%s\n' "${HW_OUT}" | sed -n 's/^WORK:[[:space:]]*//p' | head -1)"
fi

# Throttle
LAST="${REPO}/agents/state/think-llm.last"
now=$(date +%s)
if [[ -f "${LAST}" ]]; then
  last=$(date -d "$(cat "${LAST}")" +%s 2>/dev/null || echo 0)
  age=$((now - last))
  if [[ "${age}" -lt "${INTERVAL_SEC}" ]]; then
    THINK_TASK_ID=""
    trap - EXIT
    # Do not clobber last done/failed focus (Hub Active Now / Last think).
    exit 0
  fi
fi

# Free-model swap gate (OpenRouter :free pool).
# Hermes retries the *same* -m model 3×; same-provider fallback_providers does NOT
# swap model ids. Outer loop rotates the wide free list via hermes -m.
# SoT: agents/model-budget/think-free-swap.json (override with THINK_FREE_MODELS=csv).
# When the FULL free list is 429 for the UTC day: temporary paid DeepSeek last-resort
# (THINK_PAID_MODEL) until free reset — do NOT skip Hermes / idle the lane.
# Never inbox/skip on primary-only 429, and never seed the whole chain from one fail.
THINK_PAID_MODEL="${THINK_PAID_MODEL:-deepseek/deepseek-v4-flash}"
THINK_PAID_LAST_RESORT=0
THINK_ALLOW_PAID_LAST_RESORT="${THINK_ALLOW_PAID_LAST_RESORT:-1}"
FREE_SWAP_JSON="${REPO}/agents/model-budget/think-free-swap.json"
THINK_FREE_MODELS="$(
  THINK_FREE_MODELS="${THINK_FREE_MODELS:-}" FREE_SWAP_JSON="${FREE_SWAP_JSON}" python3 - <<'PY'
import json, os
from pathlib import Path
env = (os.environ.get("THINK_FREE_MODELS") or "").strip()
if env:
  print(env)
  raise SystemExit(0)
p = Path(os.environ.get("FREE_SWAP_JSON") or "")
fallback = "poolside/laguna-xs-2.1:free,inclusionai/ling-3.0-flash:free,nvidia/nemotron-3-super-120b-a12b:free,cohere/north-mini-code:free,nvidia/nemotron-3-ultra-550b-a55b:free,poolside/laguna-s-2.1:free,google/gemma-4-31b-it:free,openai/gpt-oss-20b:free"
try:
  data = json.loads(p.read_text(encoding="utf-8"))
  ordered = [m for m in (data.get("ordered") or []) if isinstance(m, str) and m.strip()]
  print(",".join(ordered) if ordered else fallback)
except Exception:
  print(fallback)
PY
)"
FREE429_STATE="${REPO}/agents/state/think-free-429.json"
FREE429_CHECK="$(THINK_FREE_MODELS="${THINK_FREE_MODELS}" REPO="${REPO}" python3 - <<'PY'
import json, os
from datetime import datetime, timezone
from pathlib import Path
repo = Path(os.environ["REPO"])
chain = [m.strip() for m in (os.environ.get("THINK_FREE_MODELS") or "").split(",") if m.strip()]
day = datetime.now(timezone.utc).strftime("%Y%m%d")
p = repo / "agents/state/think-free-429.json"
try:
  st = json.loads(p.read_text(encoding="utf-8"))
  if not isinstance(st, dict):
    st = {}
except Exception:
  st = {}
if st.get("day") != day:
  st = {"day": day, "models_429": [], "reset_at": None, "inbox_posted": False}
blocked = [m for m in (st.get("models_429") or []) if m in chain]
all_blocked = bool(chain) and len(blocked) >= len(chain)
next_model = next((m for m in chain if m not in blocked), "")
print("ALL" if all_blocked else "OK")
print(next_model)
print(",".join(blocked))
print(st.get("reset_at") or "")
PY
)"
FREE429_STATUS="$(printf '%s\n' "${FREE429_CHECK}" | sed -n '1p')"
THINK_MODEL="$(printf '%s\n' "${FREE429_CHECK}" | sed -n '2p')"
FREE429_BLOCKED="$(printf '%s\n' "${FREE429_CHECK}" | sed -n '3p')"
FREE429_RESET="$(printf '%s\n' "${FREE429_CHECK}" | sed -n '4p')"
if [[ "${FREE429_STATUS}" == "ALL" && "${THINK_ALLOW_PAID_LAST_RESORT}" == "1" ]]; then
  # Full free chain already 429'd — do NOT skip Hermes; paid DeepSeek until free reset.
  THINK_PAID_LAST_RESORT=1
  THINK_MODEL="${THINK_PAID_MODEL}"
  REPO="${REPO}" FREE429_BLOCKED="${FREE429_BLOCKED}" FREE429_RESET="${FREE429_RESET}" \
    THINK_PAID_MODEL="${THINK_PAID_MODEL}" HW_REASON="${HW_REASON}" python3 - <<'PY'
import json, os
from datetime import datetime, timezone
from pathlib import Path
repo = Path(os.environ["REPO"])
day = datetime.now(timezone.utc).strftime("%Y%m%d")
qid = f"think-free-429-{day}"
paid = (os.environ.get("THINK_PAID_MODEL") or "deepseek/deepseek-v4-flash").strip()
blocked = (os.environ.get("FREE429_BLOCKED") or "").strip() or "(unknown)"
reset = (os.environ.get("FREE429_RESET") or "").strip() or "next UTC midnight (OpenRouter free daily reset)"
reason = (os.environ.get("HW_REASON") or "open work").strip()
now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
answer = (
  f"paid last-resort until free reset: using {paid} for think after full free swap "
  f"429 ({blocked}). Approximate free reset: {reset}. Has-work: {reason}."
)
inbox = repo / "agents/state/human-inbox.json"
try:
  data = json.loads(inbox.read_text(encoding="utf-8"))
except Exception:
  data = {"open": [], "answered": []}
if isinstance(data, list):
  data = {"open": [x for x in data if isinstance(x, dict)], "answered": []}
elif not isinstance(data, dict):
  data = {"open": [], "answered": []}
data.setdefault("open", [])
data.setdefault("answered", [])
moved = None
kept = []
for q in data["open"]:
  if isinstance(q, dict) and q.get("id") == qid:
    moved = dict(q)
  else:
    kept.append(q)
data["open"] = kept
if moved is None:
  known_ans = {q.get("id") for q in data["answered"] if isinstance(q, dict)}
  if qid not in known_ans:
    moved = {
      "id": qid,
      "type": "choice",
      "from": "think",
      "question": "All free think models exhausted today (shared OpenRouter free daily cap). How should ticks proceed?",
      "at": now,
    }
if moved is not None:
  moved["answered_at"] = now
  moved["answer"] = answer
  moved["answer_source"] = "auto-paid-last-resort"
  data["answered"] = [q for q in data["answered"] if not (isinstance(q, dict) and q.get("id") == qid)]
  data["answered"].append(moved)
  inbox.parent.mkdir(parents=True, exist_ok=True)
  inbox.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
st_path = repo / "agents/state/think-free-429.json"
try:
  st = json.loads(st_path.read_text(encoding="utf-8"))
  if not isinstance(st, dict):
    st = {}
except Exception:
  st = {}
st["day"] = day
st["inbox_posted"] = True
st["inbox_id"] = qid
st["inbox_answered"] = True
st["paid_last_resort"] = True
st["paid_model"] = paid
st["paid_last_resort_at"] = now
st_path.parent.mkdir(parents=True, exist_ok=True)
st_path.write_text(json.dumps(st, indent=2) + "\n", encoding="utf-8")
print(qid)
PY
  echo "think: full free chain 429 — paid last-resort ${THINK_PAID_MODEL} until free reset" >&2
elif [[ "${FREE429_STATUS}" == "ALL" ]]; then
  # Explicit opt-out (THINK_ALLOW_PAID_LAST_RESORT=0): keep skip+inbox behavior.
  INBOX_ID="$(REPO="${REPO}" FREE429_BLOCKED="${FREE429_BLOCKED}" FREE429_RESET="${FREE429_RESET}" HW_REASON="${HW_REASON}" python3 - <<'PY'
import json, os
from datetime import datetime, timezone
from pathlib import Path
repo = Path(os.environ["REPO"])
day = datetime.now(timezone.utc).strftime("%Y%m%d")
qid = f"think-free-429-{day}"
inbox = repo / "agents/state/human-inbox.json"
try:
  data = json.loads(inbox.read_text(encoding="utf-8"))
except Exception:
  data = {"open": [], "answered": []}
if isinstance(data, list):
  data = {"open": [x for x in data if isinstance(x, dict)], "answered": []}
elif not isinstance(data, dict):
  data = {"open": [], "answered": []}
data.setdefault("open", [])
data.setdefault("answered", [])
known_open = {q.get("id") for q in (data.get("open") or []) if isinstance(q, dict)}
known_ans = {q.get("id") for q in (data.get("answered") or []) if isinstance(q, dict)}
blocked = (os.environ.get("FREE429_BLOCKED") or "").strip() or "(unknown)"
reset = (os.environ.get("FREE429_RESET") or "").strip() or "next UTC midnight (OpenRouter free daily reset)"
reason = (os.environ.get("HW_REASON") or "open work").strip()
ctx = (
  f"Full free chain blocked: {blocked}. Reset ~{reset}. Has-work: {reason}. "
  "THINK_ALLOW_PAID_LAST_RESORT=0 so Hermes stays skipped."
)
q_text = "All free think models exhausted today. How should ticks proceed?"
opts = [
  "Wait until free reset (~00:00 UTC) — keep LLM skipped",
  "Allow paid DeepSeek for think until reset",
  "PC/Cursor agents own product work until reset",
  "Pause think ticks entirely until I say resume",
]
if qid not in known_open and qid not in known_ans:
  data["open"].append({
    "id": qid, "type": "choice", "from": "think",
    "question": q_text, "context": ctx, "options": opts,
    "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  })
  inbox.parent.mkdir(parents=True, exist_ok=True)
  inbox.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
print(qid)
PY
)"
  THINK_TASK_ID=""
  trap - EXIT
  focus failed "OpenRouter free 429 — full free chain blocked; paid last-resort disabled; inbox ${INBOX_ID}" "blocked:free-429"
  date -Iseconds > "${LAST}"
  exit 0
fi
[[ -n "${THINK_MODEL}" ]] || THINK_MODEL="poolside/laguna-xs-2.1:free"

# Picker priority (campaigns == projects; ops never forever-starve product):
#   1) urgent [ops] / Fix-this user-tasks
#   2) SAME TIER round-robin: product boards (tableslop / pixi / portfolio)
#      AND campaign progress (nyc / tropic) — tick-sized [ ] with enforce-lane flip
#   3) other product user-tasks (tableslop / pixi-rp / portfolio) when boards empty
#   4) remaining open user-tasks
#   5) other has-work markers (dashboard / integrity / …)
#   6) education (SI) then research (studies) — quiet continuous; before IDLE
# Anti-thrash: skip a box already attempted >= THINK_MAX_LANE_ATTEMPTS times without
# completion so a too-big item cannot jam the lane forever. Emits 4 lines:
# task_id / blurb / lane_file / lane_item.
# Also: skip evidence-satisfied boxes (belt after think-reconcile); when paid
# last-resort, skip Discord-ingest/export heavy items (timeout class).
PICK="$(HW_REASON="${HW_REASON}" THINK_MAX_LANE_ATTEMPTS="${THINK_MAX_LANE_ATTEMPTS:-3}" THINK_PAID_LAST_RESORT="${THINK_PAID_LAST_RESORT:-0}" python3 - <<'PY'
import json, os, re
from datetime import datetime, timezone
from pathlib import Path
repo = Path("/home/abhinav/agent-dump")
reason = (os.environ.get("HW_REASON") or "").strip()
maxa = int(os.environ.get("THINK_MAX_LANE_ATTEMPTS") or 3)
paid_lr = (os.environ.get("THINK_PAID_LAST_RESORT") or "0").strip() == "1"
task_id = blurb = lane_file = lane_item = ""
PRODUCT_PROJECTS = {"tableslop", "pixi-rp", "abhinavall-portfolio"}
# Same-tier continuous boards: product + campaign (skip spacequest archived; hunter = dedicated pod).
CONTINUOUS_LANES = [
  "agents/tableslop-progress.md",
  "agents/PIXI_RP_PROGRESS.md",
  "agents/portfolio-progress.md",
  "campaigns/nyc-mafia-dnd/reports/progress.md",
  "campaigns/tropic-gooner/reports/progress.md",
]
RR_PATH = repo / "agents/state/think-continuous-rr.json"
FILE_EXT = re.compile(
  r"\.(md|json|js|mjs|ts|tsx|py|sh|html|css|png|jpe?g|webp|txt|ya?ml|toml)$", re.I
)
BACKTICK = re.compile(r"`([^`]+)`")
HEAVY_DISCORD = re.compile(
  r"discord[\s_-]*(ingest|export)|`discord-export/|ingest.?runbook", re.I
)

def is_ops(t):
  title = str(t.get("title") or "")
  body = str(t.get("body") or "")
  return title.startswith("[ops]") or body.startswith("## Fix this")

MUTATE = re.compile(
  r"\b(append|expand|update|edit|refine|sync|merge|deep\s*dive|rewrite)\b", re.I
)

def evidence_satisfied(rel, body):
  """True when every backtick-named *file* path exists (dirs ignored / not evidence).
  Mutate-existing wording (append/expand/…) is never treated as satisfied."""
  if MUTATE.search(body):
    return False
  prog = repo / rel
  bases = [prog.parent, repo]
  if prog.parent.name == "reports":
    bases.insert(0, prog.parent.parent)
  named = []
  for raw in BACKTICK.findall(body):
    raw = raw.strip().strip("/")
    if not raw or "://" in raw or raw.endswith("/"):
      continue
    if not FILE_EXT.search(raw):
      continue
    named.append(raw)
  if not named:
    return False
  for raw in named:
    hit = False
    for base in bases + [repo]:
      try:
        if (base / raw).is_file():
          hit = True
          break
      except OSError:
        pass
    if not hit:
      return False
  return True

def open_boxes(rel):
  mf = repo / rel
  out = []
  try:
    for line in mf.read_text(encoding="utf-8").splitlines():
      if re.match(r"^\s*[-*]\s*\[\s\]", line):
        body = re.sub(r"^\s*[-*]\s*\[\s\]\s*", "", line).strip()[:200]
        if evidence_satisfied(rel, body):
          continue  # evidence on disk — reconcile should have closed; skip pick
        if paid_lr and HEAVY_DISCORD.search(body):
          continue  # paid last-resort: no Discord-ingest/export thrash
        out.append(body)
  except Exception:
    return []
  return out

def pick_lane_box(rel, boxes):
  ap = repo / "agents/state/think-lane-attempts.json"
  try:
    counts = json.loads(ap.read_text())
    if not isinstance(counts, dict):
      counts = {}
  except Exception:
    counts = {}
  def key(it):
    return f"{rel}::{it[:120]}"
  # Keep attempt counts across lanes — filtering to this file's keys wiped
  # sibling boards and broke anti-thrash (PIXI could 429 forever).
  def still_open(k):
    if "::" not in k:
      return True
    frel, _, _ = k.partition("::")
    return (repo / frel).is_file()
  counts = {k: v for k, v in counts.items() if still_open(k)}
  chosen = next((it for it in boxes if int((counts.get(key(it)) or {}).get("attempts", 0)) < maxa), None)
  if chosen is None:
    chosen = boxes[0]
  rec = counts.get(key(chosen)) or {}
  rec["attempts"] = int(rec.get("attempts", 0)) + 1
  rec["last"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
  counts[key(chosen)] = rec
  try:
    ap.parent.mkdir(parents=True, exist_ok=True)
    ap.write_text(json.dumps(counts, indent=2) + "\n")
  except Exception:
    pass
  return chosen

def pick_continuous_rr(candidates):
  """Round-robin across product+campaign boards so neither starves."""
  if not candidates:
    return None
  try:
    last = str((json.loads(RR_PATH.read_text()) or {}).get("last") or "")
  except Exception:
    last = ""
  names = [c[0] for c in candidates]
  start = 0
  if last in names:
    start = (names.index(last) + 1) % len(names)
  rel, boxes = candidates[start]
  try:
    RR_PATH.parent.mkdir(parents=True, exist_ok=True)
    RR_PATH.write_text(json.dumps({"last": rel, "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}, indent=2) + "\n")
  except Exception:
    pass
  return rel, boxes

def lane_label(rel):
  """Hub-safe id: disambiguate bare progress.md (tropic vs nyc vs spacequest)."""
  p = Path(rel)
  if p.name == "progress.md" and len(p.parts) >= 2:
    # campaigns/<slug>/reports/progress.md → <slug>/progress.md
    if len(p.parts) >= 3 and p.parts[-2] == "reports":
      return f"{p.parts[-3]}/{p.name}"
    return f"{p.parent.name}/{p.name}"
  return p.name

try:
  d = json.loads((repo / "agents/user-tasks.json").read_text(encoding="utf-8"))
  tasks = [t for t in (d.get("tasks") or []) if isinstance(t, dict) and t.get("status") == "open"]
  def score(t):
    soon = 0 if "Urgency: soon" in str(t.get("body") or "") else 1
    return (soon, str(t.get("created_at") or ""))
  tasks.sort(key=score)
except Exception:
  tasks = []

ops_tasks = [t for t in tasks if is_ops(t)]
product_tasks = [t for t in tasks if str(t.get("project_id") or "") in PRODUCT_PROJECTS and not is_ops(t)]
other_tasks = [t for t in tasks if t not in ops_tasks and t not in product_tasks]

if ops_tasks:
  t = ops_tasks[0]
  task_id = str(t.get("id") or "")
  blurb = str(t.get("title") or "task")[:120]
else:
  candidates = [(rel, open_boxes(rel)) for rel in CONTINUOUS_LANES]
  candidates = [(rel, boxes) for rel, boxes in candidates if boxes]
  picked = pick_continuous_rr(candidates)
  if picked:
    rel, boxes = picked
    chosen = pick_lane_box(rel, boxes)
    lane_item = chosen
    lane_file = rel
    task_id = f"lane:{lane_label(rel)}"
    blurb = f"Lane {lane_label(rel)}: {lane_item}"
    if any(rel.endswith(s) for s in ("tableslop-progress.md", "portfolio-progress.md", "PIXI_RP_PROGRESS.md")):
      blurb = f"[free-first] {blurb}"[:120]
  elif product_tasks:
    t = product_tasks[0]
    task_id = str(t.get("id") or "")
    blurb = str(t.get("title") or "task")[:120]
  elif other_tasks:
    t = other_tasks[0]
    task_id = str(t.get("id") or "")
    blurb = str(t.get("title") or "task")[:120]
  elif reason.endswith(".md") and reason not in ("open user-tasks", "no unchecked lane work"):
    boxes = open_boxes(reason)
    if boxes:
      chosen = pick_lane_box(reason, boxes)
      lane_item = chosen
      lane_file = reason
      task_id = f"lane:{lane_label(reason)}"
      blurb = f"Lane {lane_label(reason)}: {lane_item}"
      if reason.endswith("self-improvement-progress.md"):
        blurb = f"[free-first] {blurb}"[:120]
      if reason.endswith("research-studies-progress.md"):
        blurb = f"[free-only] {blurb}"[:120]
    else:
      blurb = f"Lane {lane_label(reason)}"
  else:
    blurb = "think lane"
print(task_id)
print(blurb)
print(lane_file)
print(lane_item)
PY
)"
TASK_ID="$(printf '%s\n' "${PICK}" | sed -n '1p')"
BLURB="$(printf '%s\n' "${PICK}" | sed -n '2p')"
LANE_FILE="$(printf '%s\n' "${PICK}" | sed -n '3p')"
LANE_ITEM="$(printf '%s\n' "${PICK}" | sed -n '4p')"
[[ -n "${BLURB}" ]] || BLURB="think lane"
# Focus/trap sentinel so a mid-flight timeout still repairs Hub "running" for lane work.
# Prefer picker task_id; fallback keeps campaign slug (not bare progress.md).
THINK_TASK_ID="${TASK_ID}"
if [[ -z "${THINK_TASK_ID}" && -n "${LANE_FILE}" ]]; then
  _lf_base="$(basename "${LANE_FILE}")"
  if [[ "${_lf_base}" == "progress.md" ]]; then
    _lf_slug="$(basename "$(dirname "$(dirname "${LANE_FILE}")")")"
    THINK_TASK_ID="lane:${_lf_slug}/${_lf_base}"
  else
    THINK_TASK_ID="lane:${_lf_base}"
  fi
  unset _lf_base _lf_slug
fi

# Adaptive turn/timeout budget: ops/UI/Fix-this/lane-implement get more room; still a hard ceiling.
if [[ -z "${THINK_MAX_TURNS:-}" ]]; then
  if printf '%s\n' "${BLURB}" | grep -qiE '\[ops\]|## Fix this|Fix this|Chat|smoke|[Pp]laywright|dashboard|UI verify|not running|integrity|Meta tab|Lane '; then
    THINK_MAX_TURNS="${THINK_MAX_TURNS_OPS}"
    THINK_TIMEOUT_SEC="${THINK_TIMEOUT_SEC:-${THINK_TIMEOUT_OPS}}"
  else
    THINK_MAX_TURNS="${THINK_MAX_TURNS_DEFAULT}"
    THINK_TIMEOUT_SEC="${THINK_TIMEOUT_SEC:-${THINK_TIMEOUT_DEFAULT}}"
  fi
fi
THINK_TIMEOUT_SEC="${THINK_TIMEOUT_SEC:-${THINK_TIMEOUT_DEFAULT}}"
THINK_MAX_TURNS="${THINK_MAX_TURNS:-${THINK_MAX_TURNS_DEFAULT}}"

focus running "${BLURB}" "${THINK_TASK_ID}"

CHECKS_LINE="Checks (agents/THINK_SECURITY_CHECKS.md): C0 hard-deny wipe/shutdown/force-push/secrets; C1 shell OK via form (sudo→blocked+inbox); C3 no Hermes browser_navigate; C6 UI needs bash scripts/linuxbox/run-chat-ui-smoke.sh (or run-dashboard-ui-smoke.sh) + reports/*-smoke/ evidence, never curl-only. Don't re-read a file you already read."
TURNS_LINE="Turns: finish by ~$(( THINK_MAX_TURNS>10 ? THINK_MAX_TURNS-6 : 8 )) tool steps; hard ceiling ${THINK_MAX_TURNS} (hitting it is a miss — shrink scope). Prefer a real code/config fix over endless diagnosing."
if [[ -n "${LANE_FILE}" ]]; then
  FREE_NOTE=""
  if printf '%s\n' "${LANE_FILE}" | grep -q 'tableslop-progress'; then
    FREE_NOTE=" Models: FREE-FIRST only (Laguna/free think chain). Paid only if this slice truly needs capability/image work free cannot do — say why in DONE line. Spec: agents/TABLESLOP_PROJECT_TASK.md."
  fi
  if printf '%s\n' "${LANE_FILE}" | grep -q 'portfolio-progress'; then
    FREE_NOTE=" Models: FREE-FIRST only. Preview-only — never auto-deploy live abhinavall.net. Spec: agents/PORTFOLIO_REDESIGN_TASK.md / agents/BLOG_AI_LANE_TASK.md."
  fi
  if printf '%s\n' "${LANE_FILE}" | grep -qE 'nyc-mafia-dnd/reports/progress|tropic-gooner/reports/progress\.md'; then
    FREE_NOTE=" Campaign lane (same tier as product boards). Spec: agents/NYC_MAFIA_DND_TASK.md or agents/TROPIC_GOONER_TASK.md. One tick-sized report/sheet only."
  fi
  if printf '%s\n' "${LANE_FILE}" | grep -q 'self-improvement-progress'; then
    FREE_NOTE=" Lane=education (human). Models: FREE-FIRST only. Spec: agents/SELF_IMPROVEMENT_TASK.md + docs/agents/continuous-lanes.md. Deliver one short drill to reports/self-improvement/ or reports/education/ (EM styles prefer reports/education/em-styles-*.md) and/or ONE Hub Inbox item (from=self-improvement|education, id si-*|edu-*); if open si-*/edu-* already exists write report-only — never spam. Max one new inbox item this cycle. Do not edit research-studies-progress.md."
  fi
  if printf '%s\n' "${LANE_FILE}" | grep -q 'research-studies-progress'; then
    FREE_NOTE=" Lane=research (after education). Models: FREE-ONLY (agents/research-studies-models.json; default nvidia/nemotron-3-super-120b-a12b:free). Spec: agents/RESEARCH_STUDIES_TASK.md + docs/agents/continuous-lanes.md. Deliver under reports/research/. Prefer hermes -p think chat -m <id> or bash scripts/linuxbox/research-studies-probe.sh — never rewrite think config.yaml, never paid. Do not edit self-improvement-progress.md."
  fi
  PROMPT="Think lane — lane work (no open user-task). Do EXACTLY this one item from ${LANE_FILE}:
  ${LANE_ITEM}
Implement the smallest correct change, then verify (curl 127.0.0.1:8790 for API; curl 127.0.0.1:8765 for tableslop; for dashboard/Chat UI run the Playwright smoke and cite the report). When it is genuinely complete, EDIT ${LANE_FILE}: flip that item's \`[ ]\` to \`[x]\` and append one dated line under '## Done'. If truly blocked (sudo/secrets/human), append ONE agents/human-inbox.json question and stop.${FREE_NOTE}
${CHECKS_LINE}
${TURNS_LINE}
End with exactly one line: DONE: <what shipped> / BLOCKED: <why + inbox id> / IDLE:."
else
  PROMPT="Think lane. Do ONE concrete implement+verify step for task ${TASK_ID}: ${BLURB}.
Prefer fixing the code/config over diagnosing. Then verify (curl 127.0.0.1:8790 for API; C6 Playwright smoke for UI). You MUST end by setting agents/user-tasks.json status for id ${TASK_ID} to done (finished+verified) or blocked (needs human/sudo/secrets) via a real JSON edit — never leave it open after saying blocked.
${CHECKS_LINE}
${TURNS_LINE}
/api/chat/status needs ?job_id=. End with exactly one line: DONE: / BLOCKED: / IDLE:."
fi
HERMES_BIN="${HOME}/.local/bin/hermes"
[[ -x "${HERMES_BIN}" ]] || HERMES_BIN="hermes"

set +e
python3 "${FORM_PY}" open --task-id "${TASK_ID}" --blurb "${BLURB}" --log "${LOG}" >/tmp/think-form-path.txt 2>/dev/null
set -e

export HERMES_CRON_SESSION=1
: > "${LOG}"
# Toolsets: no browser/computer_use (C3). Cap turns so one stuck tool cannot burn 4+ minutes.
# Free-model rotate: Hermes retries the same -m model 3×; outer loop advances on 429.
# On shared free-models-per-day-high-balance, fast-probe remaining ids (no Hermes 3× thrash).
run_hermes_once() {
  local model="$1"
  set +e
  stdbuf -oL -eL timeout "${THINK_TIMEOUT_SEC}" \
    "${HERMES_BIN}" -p think chat --yolo --max-turns "${THINK_MAX_TURNS}" \
    -m "${model}" \
    -t "${THINK_TOOLSETS}" \
    -q "${PROMPT}" 2>&1 | tee -a "${LOG}" >/dev/null
  echo "${PIPESTATUS[0]}"
  set -e
}

mark_free_429() {
  local model="$1" reset_hint="$2"
  MODEL="${model}" RESET_HINT="${reset_hint}" REPO="${REPO}" python3 - <<'PY'
import json, os
from datetime import datetime, timezone, timedelta
from pathlib import Path
repo = Path(os.environ["REPO"])
model = os.environ.get("MODEL") or ""
reset_hint = (os.environ.get("RESET_HINT") or "").strip() or None
day = datetime.now(timezone.utc).strftime("%Y%m%d")
p = repo / "agents/state/think-free-429.json"
try:
  st = json.loads(p.read_text(encoding="utf-8"))
  if not isinstance(st, dict):
    st = {}
except Exception:
  st = {}
if st.get("day") != day:
  st = {"day": day, "models_429": [], "reset_at": None, "inbox_posted": False}
blocked = list(st.get("models_429") or [])
if model and model not in blocked:
  blocked.append(model)
st["day"] = day
st["models_429"] = blocked
if reset_hint:
  st["reset_at"] = reset_hint
elif not st.get("reset_at"):
  now = datetime.now(timezone.utc)
  st["reset_at"] = (now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).strftime(
    "%Y-%m-%dT%H:%M:%SZ"
  )
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(json.dumps(st, indent=2) + "\n", encoding="utf-8")
print(",".join(blocked))
PY
}

# Fast-probe remaining free ids (cheap chat completion). Marks 429s; prints still-ok csv.
fast_probe_remaining_free() {
  local blocked_csv="$1"
  THINK_FREE_MODELS="${THINK_FREE_MODELS}" FREE429_BLOCKED="${blocked_csv}" REPO="${REPO}" python3 - <<'PY'
import json, os, urllib.error, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

def load_key():
  envp = Path.home() / ".hermes" / ".env"
  try:
    for line in envp.read_text(encoding="utf-8").splitlines():
      line = line.strip()
      if line.startswith("OPENROUTER_API_KEY=") and not line.startswith("#"):
        return line.split("=", 1)[1].strip().strip("\"'")
  except Exception:
    return None
  return None

chain = [m.strip() for m in (os.environ.get("THINK_FREE_MODELS") or "").split(",") if m.strip()]
blocked = {m for m in (os.environ.get("FREE429_BLOCKED") or "").split(",") if m.strip()}
remaining = [m for m in chain if m not in blocked]
repo = Path(os.environ["REPO"])
day = datetime.now(timezone.utc).strftime("%Y%m%d")
p = repo / "agents/state/think-free-429.json"
try:
  st = json.loads(p.read_text(encoding="utf-8"))
  if not isinstance(st, dict):
    st = {}
except Exception:
  st = {}
if st.get("day") != day:
  st = {"day": day, "models_429": [], "reset_at": None, "inbox_posted": False}
blocked_list = list(st.get("models_429") or [])
key = load_key()
still_ok = []
reset_iso = st.get("reset_at")
for model in remaining:
  if not key:
    still_ok.append(model)
    continue
  body = json.dumps({
    "model": model,
    "messages": [{"role": "user", "content": "Reply with exactly OK"}],
    "max_tokens": 8,
  }).encode()
  req = urllib.request.Request(
    "https://openrouter.ai/api/v1/chat/completions",
    data=body,
    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    method="POST",
  )
  try:
    with urllib.request.urlopen(req, timeout=45) as resp:
      _ = resp.read()
      still_ok.append(model)
  except urllib.error.HTTPError as e:
    raw = e.read().decode(errors="replace")[:400]
    if e.code == 429 or "free-models-per-day" in raw or "Rate limit" in raw:
      if model not in blocked_list:
        blocked_list.append(model)
      # try parse reset
      if "X-RateLimit-Reset" in raw and not reset_iso:
        import re
        m = re.search(r"X-RateLimit-Reset['\": ]+(\d+)", raw)
        if m:
          try:
            reset_iso = datetime.fromtimestamp(int(m.group(1)) / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
          except Exception:
            pass
    else:
      # non-429 HTTP — leave unmarked so Hermes can still try (or skip if 404 later)
      still_ok.append(model)
  except Exception:
    still_ok.append(model)
if not reset_iso:
  now = datetime.now(timezone.utc)
  reset_iso = (now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
st["day"] = day
st["models_429"] = blocked_list
st["reset_at"] = reset_iso
st["last_fast_probe"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(json.dumps(st, indent=2) + "\n", encoding="utf-8")
print(",".join(blocked_list))
print(",".join(still_ok))
PY
}

demote_lane_on_429() {
  # Only when the FULL free chain is exhausted — never mid-rotate (backups exist).
  [[ -n "${LANE_FILE}" && -n "${LANE_ITEM}" ]] || return 0
  LANE_FILE="${LANE_FILE}" LANE_ITEM="${LANE_ITEM}" THINK_MAX_LANE_ATTEMPTS="${THINK_MAX_LANE_ATTEMPTS}" REPO="${REPO}" python3 - <<'PY'
import json, os
from datetime import datetime, timezone
from pathlib import Path
repo = Path(os.environ["REPO"])
rel = os.environ["LANE_FILE"]
item = os.environ["LANE_ITEM"]
maxa = int(os.environ.get("THINK_MAX_LANE_ATTEMPTS") or 3)
key = f"{rel}::{item[:120]}"
ap = repo / "agents/state/think-lane-attempts.json"
try:
  counts = json.loads(ap.read_text(encoding="utf-8"))
  if not isinstance(counts, dict):
    counts = {}
except Exception:
  counts = {}
rec = counts.get(key) or {}
rec["attempts"] = max(int(rec.get("attempts") or 0), maxa)
rec["last"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
rec["reason"] = "free_429_full_chain"
counts[key] = rec
ap.parent.mkdir(parents=True, exist_ok=True)
ap.write_text(json.dumps(counts, indent=2) + "\n", encoding="utf-8")
PY
}

log_is_free_429() {
  grep -qiE 'HTTP 429|free-models-per-day|Rate limit exceeded' "${LOG}" 2>/dev/null
}

log_is_shared_free_daily() {
  grep -qiE 'free-models-per-day' "${LOG}" 2>/dev/null
}

log_has_tool_progress() {
  grep -qiE 'Messages:[[:space:]]*[2-9]|tool calls\)|DONE:|BLOCKED:' "${LOG}" 2>/dev/null
}

IFS=',' read -r -a _FREE_CHAIN <<< "${THINK_FREE_MODELS}"
rc=1
USED_MODEL="${THINK_MODEL}"
: > "${LOG}"

if [[ "${THINK_PAID_LAST_RESORT}" == "1" ]]; then
  {
    echo ""
    echo "======== think PAID last-resort (full free swap 429): ${THINK_PAID_MODEL} ========"
  } >> "${LOG}"
  USED_MODEL="${THINK_PAID_MODEL}"
  focus running "${BLURB} · PAID ${THINK_PAID_MODEL}" "${THINK_TASK_ID}"
  rc="$(run_hermes_once "${THINK_PAID_MODEL}")"
else
  for _cand in "${_FREE_CHAIN[@]}"; do
    _cand="$(printf '%s' "${_cand}" | tr -d '[:space:]')"
    [[ -n "${_cand}" ]] || continue
    # Skip models already marked 429 today
    if printf '%s' ",${FREE429_BLOCKED}," | grep -q ",${_cand},"; then
      continue
    fi
    {
      echo ""
      echo "======== think free-rotate try: ${_cand} ========"
    } >> "${LOG}"
    USED_MODEL="${_cand}"
    focus running "${BLURB} · ${_cand}" "${THINK_TASK_ID}"
    rc="$(run_hermes_once "${_cand}")"
    if log_is_free_429; then
      _reset="$(grep -oE "X-RateLimit-Reset['\": ]+[0-9]+" "${LOG}" 2>/dev/null | head -1 | grep -oE '[0-9]+$' || true)"
      _reset_iso=""
      if [[ -n "${_reset}" ]]; then
        _reset_iso="$(python3 -c "from datetime import datetime,timezone; print(datetime.fromtimestamp(int('${_reset}')/1000, tz=timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))" 2>/dev/null || true)"
      fi
      FREE429_BLOCKED="$(mark_free_429 "${_cand}" "${_reset_iso}")"
      # Shared daily free pool: probe the rest cheaply instead of Hermes 3× per id
      if log_is_shared_free_daily; then
        _probe_out="$(fast_probe_remaining_free "${FREE429_BLOCKED}")"
        FREE429_BLOCKED="$(printf '%s\n' "${_probe_out}" | sed -n '1p')"
        _still_ok="$(printf '%s\n' "${_probe_out}" | sed -n '2p')"
        {
          echo "======== free-rotate fast-probe after shared daily 429 ========"
          echo "blocked=${FREE429_BLOCKED}"
          echo "still_ok=${_still_ok}"
        } >> "${LOG}"
        if [[ -z "${_still_ok}" ]]; then
          break
        fi
        # continue loop — skip already-blocked via FREE429_BLOCKED
      fi
      continue
    fi
    # Non-429 result (ok or other fail) — stop rotating
    break
  done

  # Free rotate exhausted → one paid DeepSeek attempt (temporary until free reset).
  if log_is_free_429 && [[ "${THINK_ALLOW_PAID_LAST_RESORT}" == "1" ]]; then
    ALL_NOW="$(REPO="${REPO}" THINK_FREE_MODELS="${THINK_FREE_MODELS}" python3 - <<'PY'
import json, os
from datetime import datetime, timezone
from pathlib import Path
repo = Path(os.environ["REPO"])
chain = [m.strip() for m in (os.environ.get("THINK_FREE_MODELS") or "").split(",") if m.strip()]
day = datetime.now(timezone.utc).strftime("%Y%m%d")
p = repo / "agents/state/think-free-429.json"
try:
  st = json.loads(p.read_text(encoding="utf-8"))
except Exception:
  st = {}
blocked = set(st.get("models_429") or []) if st.get("day") == day else set()
print("ALL" if chain and blocked.issuperset(chain) else "PARTIAL")
PY
)"
    if [[ "${ALL_NOW}" == "ALL" ]]; then
      THINK_PAID_LAST_RESORT=1
      {
        echo ""
        echo "======== think PAID last-resort after free exhaust: ${THINK_PAID_MODEL} ========"
      } >> "${LOG}"
      USED_MODEL="${THINK_PAID_MODEL}"
      focus running "${BLURB} · PAID ${THINK_PAID_MODEL}" "${THINK_TASK_ID}"
      # Clear 429 markers from LOG view for paid attempt — append-only; check paid section later
      rc="$(run_hermes_once "${THINK_PAID_MODEL}")"
      REPO="${REPO}" THINK_PAID_MODEL="${THINK_PAID_MODEL}" FREE429_BLOCKED="${FREE429_BLOCKED}" python3 - <<'PY'
import json, os
from datetime import datetime, timezone
from pathlib import Path
repo = Path(os.environ["REPO"])
day = datetime.now(timezone.utc).strftime("%Y%m%d")
qid = f"think-free-429-{day}"
paid = (os.environ.get("THINK_PAID_MODEL") or "deepseek/deepseek-v4-flash").strip()
now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
answer = f"paid last-resort until free reset: using {paid} after full free swap 429."
inbox = repo / "agents/state/human-inbox.json"
try:
  data = json.loads(inbox.read_text(encoding="utf-8"))
except Exception:
  data = {"open": [], "answered": []}
if isinstance(data, list):
  data = {"open": [x for x in data if isinstance(x, dict)], "answered": []}
elif not isinstance(data, dict):
  data = {"open": [], "answered": []}
data.setdefault("open", [])
data.setdefault("answered", [])
moved = None
kept = []
for q in data["open"]:
  if isinstance(q, dict) and q.get("id") == qid:
    moved = dict(q)
  else:
    kept.append(q)
data["open"] = kept
if moved is None:
  known_ans = {q.get("id") for q in data["answered"] if isinstance(q, dict)}
  if qid not in known_ans:
    moved = {"id": qid, "type": "choice", "from": "think", "question": "All free think models exhausted.", "at": now}
if moved is not None:
  moved["answered_at"] = now
  moved["answer"] = answer
  moved["answer_source"] = "auto-paid-last-resort"
  data["answered"] = [q for q in data["answered"] if not (isinstance(q, dict) and q.get("id") == qid)]
  data["answered"].append(moved)
  inbox.parent.mkdir(parents=True, exist_ok=True)
  inbox.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
st_path = repo / "agents/state/think-free-429.json"
try:
  st = json.loads(st_path.read_text(encoding="utf-8"))
  if not isinstance(st, dict):
    st = {}
except Exception:
  st = {}
st["day"] = day
st["inbox_posted"] = True
st["inbox_id"] = qid
st["inbox_answered"] = True
st["paid_last_resort"] = True
st["paid_model"] = paid
st["paid_last_resort_at"] = now
st_path.write_text(json.dumps(st, indent=2) + "\n", encoding="utf-8")
PY
    fi
  fi
fi

THINK_RC="${rc}"
set -e

date -Iseconds > "${LAST}"
set +e
python3 "${FORM_PY}" close --exit-code "${rc}" >/tmp/think-report-path.txt 2>/dev/null
# C4 safety net: if log says BLOCKED:/DONE: but the work item is still open, patch it
# (stops has-work re-picking the same thing forever).
if [[ -n "${TASK_ID}" ]]; then
  python3 "${FORM_PY}" enforce-status --task-id "${TASK_ID}" --log "${LOG}" >/tmp/think-enforce-status.txt 2>/dev/null
elif [[ -n "${LANE_FILE}" && -n "${LANE_ITEM}" ]]; then
  python3 "${FORM_PY}" enforce-lane --file "${LANE_FILE}" --item "${LANE_ITEM}" --log "${LOG}" >/tmp/think-enforce-lane.txt 2>/dev/null
fi
set -e
tail="$(tail -n 12 "${LOG}" 2>/dev/null | tr '\n' ' ' | cut -c1-480 || true)"

# Free-cap handling: if we used paid last-resort, judge by paid attempt (not earlier free 429s).
if [[ "${THINK_PAID_LAST_RESORT}" == "1" ]]; then
  if [[ "${rc}" -eq 0 ]]; then
    focus done "PAID last-resort ${USED_MODEL}: ${tail:-done}" "${THINK_TASK_ID}"
  else
    focus failed "PAID last-resort ${USED_MODEL} exit ${rc}: ${tail}" "${THINK_TASK_ID}"
  fi
elif log_is_free_429; then
  rc=429
  THINK_RC=429
  ALL_NOW="$(REPO="${REPO}" THINK_FREE_MODELS="${THINK_FREE_MODELS}" python3 - <<'PY'
import json, os
from datetime import datetime, timezone
from pathlib import Path
repo = Path(os.environ["REPO"])
chain = [m.strip() for m in (os.environ.get("THINK_FREE_MODELS") or "").split(",") if m.strip()]
day = datetime.now(timezone.utc).strftime("%Y%m%d")
p = repo / "agents/state/think-free-429.json"
try:
  st = json.loads(p.read_text(encoding="utf-8"))
except Exception:
  st = {}
blocked = set(st.get("models_429") or []) if st.get("day") == day else set()
print("ALL" if chain and blocked.issuperset(chain) else "PARTIAL")
PY
)"
  if [[ "${ALL_NOW}" == "ALL" ]]; then
    demote_lane_on_429
    # Paid disabled or paid path not taken — soft note only (inbox already answered when paid on).
    focus failed "HTTP 429 free daily cap · full free pool · paid last-resort off/unavailable" "${THINK_TASK_ID}"
  else
    focus failed "HTTP 429 on ${USED_MODEL} — will rotate next free in pool" "${THINK_TASK_ID}"
  fi
elif [[ "${rc}" -eq 0 ]]; then
  focus done "${tail:-done}" "${THINK_TASK_ID}"
else
  focus failed "exit ${rc}: ${tail}" "${THINK_TASK_ID}"
fi

# Meta-Harness: leave a scored run trace so rollup/Hub aren't stale (pod-scheduler inactive).
# ponytail: reuse scripts/meta-harness/record_tick.py + score_tick.py (no upstream clone needed).
set +e
MH_RECORD="${REPO}/scripts/meta-harness/record_tick.py"
if [[ -f "${MH_RECORD}" ]]; then
  _mh_intent="INTENT_OK"
  [[ "${rc}" -eq 0 ]] || _mh_intent="INTENT_FAIL"
  python3 "${MH_RECORD}" \
    --repo "${REPO}" \
    --pod think \
    --profile think \
    --exit-code "${rc}" \
    --intent "${_mh_intent}" \
    --log-path "${LOG}" \
    --task-id "${THINK_TASK_ID}" \
    --model "${USED_MODEL:-}" \
    >/tmp/think-mh-run.txt 2>/dev/null
fi
set -e

# Normal path already closed form + focus; disable EXIT cleanup double-write.
THINK_TASK_ID=""
trap - EXIT

set +e
python3 "${HAS}" --lane think --repo "${REPO}" >/dev/null
hw=$?
set -e
if [[ "${hw}" -eq 0 ]]; then
  (
    sleep "${INTERVAL_SEC}"
    bash "${SELF}"
  ) >/dev/null 2>&1 &
fi
