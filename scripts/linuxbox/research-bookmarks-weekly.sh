#!/usr/bin/env bash
# Bookmarks research hook — ~every 3 days / weekly floor. No posting. No X API.
# Install: scripts/linuxbox/install-research-bookmarks-cron.sh
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
REPO="${HOME}/agent-dump"
OUT_DIR="${REPO}/reports/research"
mkdir -p "${OUT_DIR}"
STAMP="$(date -u +%Y-%m-%d)"
DIGEST="${OUT_DIR}/bookmarks-${STAMP}.md"
MARKER="${OUT_DIR}/.last-bookmarks-run"
INGEST="${OUT_DIR}/bookmarks-inbox.json"
# Skip if last successful digest/ask was < 3 days ago
MIN_GAP_SEC=$((3 * 24 * 3600))

if [[ -f "${MARKER}" ]]; then
  last_epoch="$(date -d "$(tr -d '[:space:]' < "${MARKER}")" +%s 2>/dev/null || echo 0)"
  now_epoch="$(date +%s)"
  if [[ $((now_epoch - last_epoch)) -lt "${MIN_GAP_SEC}" ]]; then
    echo "skip: last run within 3 days"
    exit 0
  fi
fi

if [[ -f "${INGEST}" ]]; then
  {
    echo "# X bookmarks digest — ${STAMP}"
    echo
    echo "Source: \`${INGEST}\` (local ingest). Account: Wholesomeboi bookmarks."
    echo
    echo "## Raw"
    echo
    echo '```json'
    head -c 80000 "${INGEST}"
    echo
    echo '```'
    echo
    echo "## Next"
    echo
    echo "- Skip already-implemented ideas; propose 1–3 next research/implement items."
  } > "${DIGEST}"
  date -u -Iseconds > "${MARKER}"
  echo "wrote ${DIGEST}"
  exit 0
fi

# No ingest — ask human to log in on PC (stable id); do not LLM-loop
python3 - <<PY
import json
from pathlib import Path
from datetime import datetime, timezone

repo = Path("${REPO}")
inbox_path = repo / "agents" / "state" / "human-inbox.json"
inbox_path.parent.mkdir(parents=True, exist_ok=True)
if inbox_path.exists():
    data = json.loads(inbox_path.read_text(encoding="utf-8"))
else:
    data = {"open": [], "answered": []}
if not isinstance(data, dict):
    data = {"open": [], "answered": []}
data.setdefault("open", [])
data.setdefault("answered", [])
sid = "research-bookmarks-weekly"
answered_ids = {x.get("id") for x in data.get("answered") or [] if isinstance(x, dict)}
open_ids = {x.get("id") for x in data.get("open") or [] if isinstance(x, dict)}
if sid in answered_ids or sid in open_ids:
    print("inbox already has", sid)
else:
    data["open"].append({
        "id": sid,
        "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "lane": "research-bookmarks",
        "question": "Bookmarks digest ready — please log in on PC so we can read x.com/i/bookmarks?",
        "options": [
            "I'll log in now — use Cursor browser / paste export into reports/research/",
            "Drop bookmarks-inbox.json on potato when ready",
            "Defer this cycle (~3–4 days)",
        ],
        "context": (
            "Decided: no X API. Cadence ~every 3–4 days (or weekly floor / on ask). "
            "Bookmarks are AI ideas to research/implement; some already shipped. "
            "Potato cannot see bookmarks logged out. Log in on the PC (or drop "
            "reports/research/bookmarks-inbox.json) so the lane can write a digest "
            "without posting or thrashing LLMs."
        ),
    })
    tmp = inbox_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(inbox_path)
    print("opened inbox", sid)

Path("${MARKER}").write_text(
    datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") + "\n",
    encoding="utf-8",
)
print("marked run; waiting for login/ingest")
PY

if [[ -f "${REPO}/AI_GROUPCHAT.md" ]]; then
  printf -- '- **%s** — [LINUX] Bookmarks: no ingest; ask login (id research-bookmarks-weekly; ~3d cadence).\n' \
    "$(date -u +%Y-%m-%dT%H:%MZ)" >> "${REPO}/AI_GROUPCHAT.md" || true
fi
exit 0
