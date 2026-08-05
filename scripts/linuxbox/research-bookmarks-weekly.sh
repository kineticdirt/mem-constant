#!/usr/bin/env bash
# Bookmarks research hook — ~every 3 days / weekly floor. No posting. No X API.
# Source of truth: agents/research-bookmarks-source.json
# Install: scripts/linuxbox/install-research-bookmarks-cron.sh
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
REPO="${HOME}/agent-dump"
SOURCE_CFG="${REPO}/agents/research-bookmarks-source.json"
OUT_DIR="${REPO}/reports/research"
mkdir -p "${OUT_DIR}"
STAMP="$(date -u +%Y-%m-%d)"
DIGEST="${OUT_DIR}/bookmarks-${STAMP}.md"
MARKER="${OUT_DIR}/.last-bookmarks-run"
# Legacy marker name from first install
MARKER_LEGACY="${OUT_DIR}/.last-bookmarks-week"
INGEST="${OUT_DIR}/bookmarks-inbox.json"
if [[ -f "${SOURCE_CFG}" ]]; then
  # ponytail: read paths from source config when present
  _ingest="$(python3 -c "import json,sys; p=json.load(open(sys.argv[1],encoding='utf-8')); print(p.get('paths',{}).get('ingest',''))" "${SOURCE_CFG}" 2>/dev/null || true)"
  if [[ -n "${_ingest}" ]]; then
    INGEST="${REPO}/${_ingest}"
  fi
fi
# Skip if last successful digest/ask was < 3 days ago
MIN_GAP_SEC=$((3 * 24 * 3600))

for _m in "${MARKER}" "${MARKER_LEGACY}"; do
  if [[ -f "${_m}" ]]; then
    last_epoch="$(date -d "$(tr -d '[:space:]' < "${_m}")" +%s 2>/dev/null || true)"
    if [[ -z "${last_epoch}" || "${last_epoch}" == "0" ]]; then
      # legacy week stamp (e.g. 2026-W30) — fall back to file mtime
      last_epoch="$(stat -c %Y "${_m}" 2>/dev/null || echo 0)"
    fi
    now_epoch="$(date +%s)"
    if [[ $((now_epoch - last_epoch)) -lt "${MIN_GAP_SEC}" ]]; then
      echo "skip: last run within 3 days (${_m})"
      exit 0
    fi
  fi
done

if [[ -f "${INGEST}" ]]; then
  python3 - "${INGEST}" "${DIGEST}" "${STAMP}" <<'PY'
import json, sys
from pathlib import Path
ingest, digest, stamp = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
data = json.loads(ingest.read_text(encoding="utf-8"))
items = data.get("items") if isinstance(data, dict) else None
lines = [
    f"# X bookmarks digest — {stamp}",
    "",
    f"Source: `{ingest}` (local ingest from agents/research-bookmarks-source.json).",
    f"Account: {data.get('account', 'Wholesomeboi') if isinstance(data, dict) else 'Wholesomeboi'}.",
    f"Origin: {data.get('source_url', 'https://x.com/i/bookmarks') if isinstance(data, dict) else 'https://x.com/i/bookmarks'}.",
    "",
]
if isinstance(items, list) and items:
    lines += ["## Items", ""]
    for i, it in enumerate(items, 1):
        if not isinstance(it, dict):
            continue
        url = it.get("url") or ""
        title = it.get("title") or "(untitled)"
        snippet = it.get("snippet") or ""
        tags = ", ".join(it.get("tags") or []) or "—"
        status = it.get("status") or "new"
        lines.append(f"{i}. **{title}** — {url}")
        lines.append(f"   - status: `{status}` · tags: {tags}")
        if snippet:
            lines.append(f"   - {snippet}")
        lines.append("")
else:
    lines += ["## Raw", "", "```json", ingest.read_text(encoding="utf-8")[:80000], "```", ""]
lines += [
    "## Next",
    "",
    "- Skip already-implemented ideas; propose 1–3 next research/implement items.",
    "- Think lane: open user-task `rb-02-next-digest` / project `research-bookmarks`.",
]
digest.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"wrote {digest}")
PY
  date -u -Iseconds > "${MARKER}"
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
            "I'll log in now — run: python scripts/pc/write-bookmarks-inbox.py … [--push-potato]",
            "Drop bookmarks-inbox.json on potato (reports/research/)",
            "Defer this cycle (~3–4 days)",
        ],
        "context": (
            "Decided: no X API. Source SoT: agents/research-bookmarks-source.json. "
            "Cadence ~every 3–4 days (or weekly floor / on ask). "
            "Bookmarks are AI ideas to research/implement; some already shipped. "
            "Potato cannot see bookmarks logged out. Log in on the PC and run "
            "scripts/pc/write-bookmarks-inbox.py (or drop "
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
