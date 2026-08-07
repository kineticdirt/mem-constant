#!/usr/bin/env python3
"""Pick one open user-task for the Cursor Auto parallel lane (Agent 2).

Hermes think (Agent 1) prefers ops/incident/verify. Cursor prefers product /
campaign / Hub UI slices when assigned_lane=cursor or tags match.

Usage:
  cursor-pick-task.py --repo REPO [--json]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Hermes keeps these (ops / money / infra). Cursor does product work.
HERMES_PREFIXES = (
    "[ops]",
    "[hardware]",
    "[ci]",
    "[security]",
    "[disaster-recovery]",
    "[declarative]",
    "[backup]",
    "[logging]",
    "[scheduling]",
    "[hermes]",
    "[monitoring]",
    "[proxy]",
    "[finance]",
    "[email]",
)
CURSOR_PREFIXES = (
    "[tableslop]",
    "[campaign]",
    "[hub]",
    "[pixi]",
    "[blog]",
    "[docs]",
    "[sim]",
    "[cursor]",
    "[mazda3]",
    "[infranet]",
    "[github]",
    "[testing]",
    "[red-teaming]",
    "[comfyui]",
    "[discord]",
)


def _load(repo: Path) -> dict:
    fp = repo / "agents" / "user-tasks.json"
    return json.loads(fp.read_text(encoding="utf-8"))


def _title(t: dict) -> str:
    return str(t.get("title") or t.get("blurb") or t.get("id") or "")


def _open(tasks: list) -> list[dict]:
    out = []
    for t in tasks:
        if not isinstance(t, dict):
            continue
        if str(t.get("status") or "").lower() in ("open", "pending", ""):
            out.append(t)
    return out


def _score(t: dict) -> tuple:
    title = _title(t)
    low = title.lower()
    ctx = t.get("context") if isinstance(t.get("context"), dict) else {}
    lane = str(ctx.get("assigned_lane") or t.get("assigned_lane") or "").lower()
    tags = [str(x).lower() for x in (t.get("tags") or [])]
    # hard assign
    if lane == "hermes" or "hermes" in tags:
        return (99, title)
    if lane == "cursor" or "cursor" in tags or "agent2" in tags:
        return (0, title)
    if any(title.startswith(p) for p in CURSOR_PREFIXES):
        return (1, title)
    if any(title.startswith(p) for p in HERMES_PREFIXES):
        return (90, title)
    if "idle" in low or "wasting" in low:
        return (95, title)
    return (5, title)


def pick(repo: Path) -> dict | None:
    data = _load(repo)
    tasks = _open(data.get("tasks") or [])
    if not tasks:
        return None
    ranked = sorted(tasks, key=_score)
    # skip hermes-owned
    for t in ranked:
        if _score(t)[0] >= 90:
            continue
        return t
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".", type=Path)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    repo = args.repo.resolve()
    t = pick(repo)
    if not t:
        if args.json:
            print(json.dumps({"ok": True, "task": None}))
        else:
            print("IDLE")
        return 0
    payload = {
        "ok": True,
        "task": {
            "id": t.get("id"),
            "title": _title(t),
            "body": (t.get("body") or t.get("notes") or "")[:1200],
            "status": t.get("status"),
        },
    }
    if args.json:
        print(json.dumps(payload))
    else:
        print(payload["task"]["id"])
        print(payload["task"]["title"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
