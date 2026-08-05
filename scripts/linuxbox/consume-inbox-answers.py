#!/usr/bin/env python3
"""Deterministic inbox answer consumer — close the loop after GM replies.

Reads agents/state/human-inbox.json answered[] (or legacy list schema), routes by
stable question id (not question text), appends decision rows to campaign logs,
optionally closes user-tasks when task_id is set, and records a consumed watermark
so lanes do not re-process the same answer.

Stdlib only (Python 3.9+). Safe to run every fast tick before LLM.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

CONTEXT_REVIVE = re.compile(
    r"need\s+more\s+context|not\s+enough\s+context|don'?t\s+understand|confused|what\s+is\s+this",
    re.I,
)

# id prefix -> relative path under repo (git-owned campaign reports)
ID_ROUTES: dict[str, str] = {
    "taste-tg-": "campaigns/tropic-gooner/reports/gm-taste-decisions.md",
    "wb-tg-": "campaigns/tropic-gooner/reports/worldbuilding-decisions.md",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path: Path, default):
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def normalize_inbox(raw) -> dict:
    """Accept {open, answered} or legacy flat list with status fields."""
    if isinstance(raw, dict):
        return {
            "open": list(raw.get("open") or []),
            "answered": list(raw.get("answered") or []),
        }
    if isinstance(raw, list):
        open_items = []
        answered = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            if item.get("answer") or item.get("answered_at") or item.get("status") == "answered":
                answered.append(item)
            elif item.get("status") != "answered":
                open_items.append(item)
        return {"open": open_items, "answered": answered}
    return {"open": [], "answered": []}


def route_for_id(qid: str) -> str | None:
    for prefix, rel in ID_ROUTES.items():
        if qid.startswith(prefix):
            return rel
    return None


def decision_file_header(rel: str) -> str:
    if "gm-taste" in rel:
        return (
            "# GM taste decisions (answered)\n\n"
            "Log of **KEEP / CUT / TWEAK** from Inbox. Agents read before writing new lore.\n\n"
            "| Date | ID / topic | Decision | Notes |\n"
            "|------|------------|----------|-------|\n"
        )
    return (
        "# Worldbuilding decisions (answered)\n\n"
        "Canonical answers from Inbox seeds (`wb-tg-*`). Agents read before drafting lore.\n"
        "Source questions: `reports/worldbuilding-questions.md` + `agents/inbox-seeds.json`.\n\n"
        "| Date | ID | Answer | Notes |\n"
        "|------|-----|--------|-------|\n"
    )


def append_decision_row(repo: Path, rel: str, qid: str, answer: str, question: str) -> bool:
    fp = repo / rel
    line_id = qid
    if fp.is_file():
        text = fp.read_text(encoding="utf-8")
        if line_id in text:
            return False
    else:
        fp.parent.mkdir(parents=True, exist_ok=True)
        text = decision_file_header(rel)
    date = utc_now()[:10]
    safe_ans = answer.replace("|", "\\|").replace("\n", " ")[:500]
    safe_q = (question or qid).replace("|", "\\|")[:120]
    if "gm-taste" in rel:
        row = f"| {date} | {line_id} | {safe_ans} | Inbox: {safe_q} |\n"
    else:
        row = f"| {date} | {line_id} | {safe_ans} | {safe_q} |\n"
    fp.write_text(text + row, encoding="utf-8")
    return True


def close_user_task(repo: Path, task_id: str, answer: str) -> bool:
    fp = repo / "agents" / "user-tasks.json"
    data = load_json(fp, None)
    if not isinstance(data, dict):
        return False
    tasks = data.get("tasks")
    if not isinstance(tasks, list):
        return False
    changed = False
    for t in tasks:
        if not isinstance(t, dict) or t.get("id") != task_id:
            continue
        if t.get("status") == "done":
            return False
        t["status"] = "done"
        t["updated_at"] = utc_now()
        note = f"Inbox answer ({utc_now()}): {answer[:200]}"
        body = str(t.get("body") or "")
        if note not in body:
            t["body"] = (body.rstrip() + "\n\n" + note).strip()
        changed = True
        break
    if changed:
        save_json(fp, data)
    return changed


def append_inbox_log(repo: Path, lines: list[str]) -> None:
    if not lines:
        return
    log = repo / "agents" / "HUMAN_INBOX_LOG.md"
    header = ""
    if not log.is_file():
        header = "# Human inbox consumption log\n\n"
    with log.open("a", encoding="utf-8") as f:
        if header:
            f.write(header)
        for ln in lines:
            f.write(ln + "\n")


def consume(repo: Path, dry_run: bool = False) -> dict:
    inbox_path = repo / "agents" / "state" / "human-inbox.json"
    if not inbox_path.is_file():
        inbox_path = repo / "agents" / "human-inbox.json"
    consumed_path = repo / "agents" / "state" / "inbox-consumed.json"

    inbox = normalize_inbox(load_json(inbox_path, {}))
    state = load_json(consumed_path, {"version": 1, "consumed": {}})
    consumed: dict = state.setdefault("consumed", {})

    results = {"processed": 0, "skipped": 0, "actions": []}

    for item in inbox.get("answered") or []:
        if not isinstance(item, dict):
            continue
        qid = str(item.get("id") or "").strip()
        answer = str(item.get("answer") or "").strip()
        if not qid or not answer:
            continue
        if qid in consumed:
            results["skipped"] += 1
            continue
        if CONTEXT_REVIVE.search(answer):
            results["skipped"] += 1
            results["actions"].append(f"skip-revive {qid}")
            continue

        actions_for_item: list[str] = []
        rel = route_for_id(qid)
        if rel:
            if dry_run:
                actions_for_item.append(f"would-append {rel} {qid}")
            elif append_decision_row(repo, rel, qid, answer, str(item.get("question") or "")):
                actions_for_item.append(f"decision {rel}")

        task_id = item.get("task_id")
        if task_id:
            if dry_run:
                actions_for_item.append(f"would-close-task {task_id}")
            elif close_user_task(repo, str(task_id), answer):
                actions_for_item.append(f"task-done {task_id}")

        if not actions_for_item and not rel and not task_id:
            actions_for_item.append(f"logged-only {qid}")

        if dry_run:
            results["processed"] += 1
            results["actions"].extend(actions_for_item)
            continue

        consumed[qid] = {
            "at": utc_now(),
            "answer": answer[:500],
            "actions": actions_for_item,
        }
        results["processed"] += 1
        results["actions"].extend(actions_for_item)

    if not dry_run and results["processed"]:
        state["last_run"] = utc_now()
        save_json(consumed_path, state)
        log_lines = [f"- {utc_now()} consumed {results['processed']}: " + "; ".join(results["actions"][:8])]
        append_inbox_log(repo, log_lines)

    return results


def main() -> int:
    repo = Path(".").resolve()
    dry_run = "--dry-run" in sys.argv
    if "--repo" in sys.argv:
        i = sys.argv.index("--repo")
        repo = Path(sys.argv[i + 1]).resolve()
    out = consume(repo, dry_run=dry_run)
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    # ponytail: minimal self-check — route map + revive skip
    if "--self-check" in sys.argv:
        assert route_for_id("wb-tg-rules") is not None
        assert route_for_id("taste-tg-crt") is not None
        assert route_for_id("inbox-foo") is None
        assert CONTEXT_REVIVE.search("need more context")
        assert not CONTEXT_REVIVE.search("WoD 20th")
        print("SELF_CHECK_OK")
        raise SystemExit(0)
    raise SystemExit(main())
