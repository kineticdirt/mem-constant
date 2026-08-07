#!/usr/bin/env python3
"""Think-incident form: append on fail, rollup recurrence, promote cleanup tasks.

Phase 0 of docs/plans/think-incident-form-recurrence-2026-07-29.md.

Storage (potato runtime):
  agents/state/think-incidents.jsonl
  agents/state/think-incident-recurrence.json

Does not replace think-shell-access-form.py (C1 audit) or Meta-Harness scores.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(
    os.environ.get("LINUXBOX_AGENT_DUMP")
    or Path(__file__).resolve().parents[2]
)
STATE = REPO / "agents" / "state"
JSONL = STATE / "think-incidents.jsonl"
ROLLUP = STATE / "think-incident-recurrence.json"
USER_TASKS = REPO / "agents" / "user-tasks.json"

CATEGORIES = (
    "timeout_124",
    "free_exhausted_stale",
    "thrash_progress",
    "discord_hold",
    "terminal_prep",
    "status_patch_after_done",
    "other",
)

CAT_WEIGHT = {
    "timeout_124": 15,
    "free_exhausted_stale": 15,
    "terminal_prep": 15,
    "discord_hold": 8,
    "thrash_progress": 5,
    "status_patch_after_done": 5,
    "other": 0,
}

DISCORD_HOLD_RE = re.compile(
    r"discord[\s_-]*(ingest|export)|ingest.?runbook|first\s+export\s+or\s+hold|"
    r"documented\s+hold|hold\s+note",
    re.I,
)
FREE_EXHAUST_RE = re.compile(
    r"free\s*exhaust|0\s*free\s*tried|free.?429|paid\s+last.?resort|free.?pool",
    re.I,
)
TERMINAL_PREP_RE = re.compile(
    r"preparing\s+terminal|preparing\s+execute|stuck.*prepar",
    re.I,
)
STATUS_PATCH_RE = re.compile(r"enforce.?status|status_patch_after_done", re.I)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _norm(s: str, n: int = 80) -> str:
    s = (s or "").lower()
    s = re.sub(r"[^\w\s/:.\-]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:n] or "na"


def classify(
    *,
    exit_code: int,
    task_id: str,
    blurb: str,
    log_tail: str,
    notes: str,
    force_category: str | None,
) -> str:
    if force_category and force_category in CATEGORIES:
        return force_category
    blob = f"{task_id}\n{blurb}\n{notes}\n{log_tail[-4000:]}"
    if int(exit_code) == 124:
        return "timeout_124"
    if TERMINAL_PREP_RE.search(blob):
        return "terminal_prep"
    if FREE_EXHAUST_RE.search(blob):
        return "free_exhausted_stale"
    if DISCORD_HOLD_RE.search(blob):
        return "discord_hold"
    if STATUS_PATCH_RE.search(blob):
        return "status_patch_after_done"
    return "other"


def recurrence_key(category: str, task_id: str, blurb: str) -> str:
    return f"{category}|{_norm(task_id, 60)}|{_norm(blurb, 80)}"


def _log_tail_hash(path: Path) -> str:
    if not path.is_file():
        return ""
    try:
        raw = path.read_bytes()[-8000:]
    except OSError:
        return ""
    return "sha256:" + hashlib.sha256(raw).hexdigest()[:16]


def _read_log_tail(path: Path, n: int = 6000) -> str:
    if not path.is_file():
        return ""
    try:
        return path.read_text(encoding="utf-8", errors="replace")[-n:]
    except OSError:
        return ""


def cmd_append(args: argparse.Namespace) -> int:
    STATE.mkdir(parents=True, exist_ok=True)
    log_path = Path(args.log) if args.log else REPO / "agents" / "runs" / "think-last.log"
    log_tail = _read_log_tail(log_path)
    category = classify(
        exit_code=int(args.exit_code),
        task_id=args.task_id or "",
        blurb=args.blurb or "",
        log_tail=log_tail,
        notes=args.notes or "",
        force_category=args.category,
    )
    rid = recurrence_key(category, args.task_id or "", args.blurb or "")
    # thrash_progress: if same key already has count>=1 in rollup under other/timeout, keep category
    # but annotate — rollup may upgrade display; write-time stays specific.
    short = hashlib.sha256(rid.encode("utf-8")).hexdigest()[:4]
    row = {
        "id": f"inc-{_stamp()}-{short}",
        "at": _now(),
        "task_id": (args.task_id or "")[:120],
        "blurb": (args.blurb or "")[:400],
        "exit_code": int(args.exit_code),
        "category": category,
        "paid_last_resort": bool(int(args.paid_last_resort or 0)),
        "model": (args.model or "")[:160],
        "form_path": (args.form_path or "")[:240],
        "report_path": (args.report_path or "")[:320],
        "log_path": str(log_path)[:320],
        "log_tail_hash": _log_tail_hash(log_path),
        "notes": (args.notes or "")[:400],
        "recurrence_key": rid,
    }
    with JSONL.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(json.dumps({"ok": True, "id": row["id"], "category": category, "recurrence_key": rid}))
    return 0


def _load_jsonl() -> list[dict]:
    if not JSONL.is_file():
        return []
    rows: list[dict] = []
    for line in JSONL.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            rows.append(obj)
    return rows


def _parse_at(s: str) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def severity_for(item: dict) -> int:
    count = int(item.get("count") or 0)
    cat = item.get("category") or "other"
    score = 10 * count + int(CAT_WEIGHT.get(cat, 0))
    if item.get("paid_seen"):
        score += 10
    first = _parse_at(item.get("first_seen") or "")
    if first:
        hours = max(0.0, (datetime.now(timezone.utc) - first).total_seconds() / 3600.0)
        score += min(20, int(hours / 6))
    return score


def _ensure_user_task(item: dict, key: str) -> str | None:
    """Open one cleanup task per recurrence key; return task id."""
    existing_id = item.get("user_task_id")
    if not USER_TASKS.is_file():
        return existing_id
    try:
        data = json.loads(USER_TASKS.read_text(encoding="utf-8"))
    except Exception:
        return existing_id
    if not isinstance(data, dict):
        return existing_id
    tasks = data.get("tasks")
    if not isinstance(tasks, list):
        tasks = []
        data["tasks"] = tasks

    tid = existing_id or f"inc-clean-{hashlib.sha256(key.encode()).hexdigest()[:12]}"
    for t in tasks:
        if not isinstance(t, dict):
            continue
        if t.get("id") == tid:
            if str(t.get("status") or "").lower() in ("open", "blocked", "in_progress"):
                return tid
            # closed — reopen if still recurring
            t["status"] = "open"
            t["updated_at"] = _now()
            t["notes"] = (
                f"reopened by think-incident rollup count={item.get('count')} "
                f"severity={item.get('severity')} key={key}"
            )[:500]
            USER_TASKS.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            return tid
        # same key already open under another id
        ctx = t.get("context") if isinstance(t.get("context"), dict) else {}
        if ctx.get("recurrence_key") == key and str(t.get("status") or "").lower() in (
            "open",
            "blocked",
            "in_progress",
        ):
            return str(t.get("id"))

    cat = item.get("category") or "other"
    count = item.get("count") or 0
    sev = item.get("severity") or 0
    blurb = (item.get("blurb_sample") or "")[:120]
    if blurb.lstrip().startswith("[ops] Think incident cleanup"):
        # Never mint a cleanup task about a cleanup task (recursive title junk).
        return None
    task = {
        "id": tid,
        "title": f"[ops] Think incident cleanup: {cat} ×{count} — {blurb}",
        "body": (
            f"Recurring think failure (severity={sev}). "
            f"recurrence_key={key}. "
            f"Review agents/state/think-incidents.jsonl + think-incident-recurrence.json. "
            f"Fix root or soft-close/skip thrash; cleanup tasks are important."
        ),
        "status": "open",
        "project_id": "linuxbox",
        "tags": ["ops", "think-incident", cat],
        "context": {
            "campaign": None,
            "story_path": None,
            "recurrence_key": key,
            "severity": sev,
            "count": count,
        },
        "created_at": _now(),
        "updated_at": _now(),
        "notes": f"auto-promoted by think-incident-form.py rollup",
    }
    tasks.append(task)
    data["tasks"] = tasks
    USER_TASKS.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    # Tick-sized unit so the next think run does not burn 28 turns on the epic title.
    try:
        import subprocess

        subprocess.run(
            [
                sys.executable,
                str(REPO / "scripts/linuxbox/think-work-packet.py"),
                "ensure",
                "--repo",
                str(REPO),
                "--task-id",
                tid,
                "--blurb",
                task["title"],
                "--body",
                task["body"],
            ],
            check=False,
            capture_output=True,
            timeout=15,
        )
    except Exception:
        pass
    return tid


def cmd_rollup(args: argparse.Namespace) -> int:
    rows = _load_jsonl()
    items: dict[str, dict] = {}
    for row in rows:
        key = row.get("recurrence_key") or recurrence_key(
            row.get("category") or "other",
            row.get("task_id") or "",
            row.get("blurb") or "",
        )
        cur = items.get(key)
        at = row.get("at") or _now()
        if cur is None:
            items[key] = {
                "count": 1,
                "first_seen": at,
                "last_seen": at,
                "category": row.get("category") or "other",
                "task_id": row.get("task_id") or "",
                "blurb_sample": (row.get("blurb") or "")[:200],
                "paid_seen": bool(row.get("paid_last_resort")),
                "exit_codes": [row.get("exit_code")],
            }
        else:
            cur["count"] = int(cur["count"]) + 1
            cur["last_seen"] = at
            if row.get("paid_last_resort"):
                cur["paid_seen"] = True
            codes = cur.setdefault("exit_codes", [])
            if isinstance(codes, list):
                codes.append(row.get("exit_code"))
            # upgrade category to thrash_progress when same key repeats (non-discord)
            if cur["count"] >= 2 and cur.get("category") not in (
                "discord_hold",
                "free_exhausted_stale",
            ):
                # keep primary category; flag thrash via count
                pass

    # merge prior user_task_id if present
    prior: dict = {}
    if ROLLUP.is_file():
        try:
            prior = json.loads(ROLLUP.read_text(encoding="utf-8"))
        except Exception:
            prior = {}
    prior_items = prior.get("items") if isinstance(prior.get("items"), dict) else {}

    threshold = int(args.promote_threshold)
    promoted = []
    for key, item in items.items():
        if key in prior_items and isinstance(prior_items[key], dict):
            if prior_items[key].get("user_task_id"):
                item["user_task_id"] = prior_items[key]["user_task_id"]
        # Skip resolved recurrences — already-fixed work should not re-trigger cleanup tasks
        if item.get("resolved"):
            continue
        item["severity"] = severity_for(item)
        item["flagged_review"] = int(item["count"]) >= 2
        if (
            not getattr(args, "no_promote", False)
            and (int(item["count"]) >= threshold or int(item["severity"]) >= 50)
        ):
            tid = _ensure_user_task(item, key)
            if tid:
                item["user_task_id"] = tid
                promoted.append({"key": key, "user_task_id": tid, "severity": item["severity"]})

    out = {"updated_at": _now(), "items": items}
    STATE.mkdir(parents=True, exist_ok=True)
    ROLLUP.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "ok": True,
                "keys": len(items),
                "flagged": sum(1 for i in items.values() if i.get("flagged_review")),
                "promoted": promoted,
                "path": str(ROLLUP),
            }
        )
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("append", help="Append one incident row (call on think fail)")
    a.add_argument("--exit-code", type=int, required=True)
    a.add_argument("--task-id", default="")
    a.add_argument("--blurb", default="")
    a.add_argument("--model", default="")
    a.add_argument("--paid-last-resort", default="0")
    a.add_argument("--form-path", default="")
    a.add_argument("--report-path", default="")
    a.add_argument("--log", default="")
    a.add_argument("--notes", default="")
    a.add_argument("--category", default="", help="Force category enum")
    a.set_defaults(func=cmd_append)

    r = sub.add_parser("rollup", help="Rebuild recurrence + optional user-task promote")
    r.add_argument("--promote-threshold", type=int, default=3)
    r.add_argument(
        "--no-promote",
        action="store_true",
        help="Rebuild recurrence JSON only (do not seed user-tasks)",
    )
    r.set_defaults(func=cmd_rollup)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    # Tiny self-check: classify helpers only (no disk) when THINK_INCIDENT_SELFCHECK=1
    if os.environ.get("THINK_INCIDENT_SELFCHECK") == "1":
        assert classify(
            exit_code=124, task_id="t", blurb="x", log_tail="", notes="", force_category=None
        ) == "timeout_124"
        assert classify(
            exit_code=1,
            task_id="lane:hunter",
            blurb="First export or HOLD note",
            log_tail="",
            notes="",
            force_category=None,
        ) == "discord_hold"
        assert classify(
            exit_code=1,
            task_id="t",
            blurb="x",
            log_tail="preparing terminal...",
            notes="",
            force_category=None,
        ) == "terminal_prep"
        print("SELF_CHECK_OK")
        raise SystemExit(0)
    raise SystemExit(main())
