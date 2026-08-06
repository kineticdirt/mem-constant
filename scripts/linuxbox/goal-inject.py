#!/usr/bin/env python3
"""Print the HUMAN GOALS prompt block from agents/state/agent-goal-control.json.

Shared by agent-cycle-think-tick.sh and cursor-agent-run.sh so every lane that
runs a model carries the same goals — the model can check whether its actions
fit what is expected, and obey the human redirect over lane items on conflict.

Prints nothing (exit 0) when there is nothing to inject: missing/corrupt file,
both fields empty, or --respect-pause with pause=true (think-lane gate only —
explicit Cursor runs are human-launched and must not be paused by it).

Usage:
  goal-inject.py [--respect-pause] <agent-goal-control.json>
"""
import json
import sys
from pathlib import Path

HEADER = (
    "HUMAN GOALS (from Hub Tasks Active now — obey these over the lane item if "
    "they conflict; check that your actions fit what is expected):"
)


def main() -> int:
    args = sys.argv[1:]
    respect_pause = "--respect-pause" in args
    paths = [a for a in args if not a.startswith("--")]
    if not paths:
        return 0
    path = Path(paths[0])
    if not path.exists():
        return 0
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return 0
    if respect_pause and d.get("pause"):
        return 0
    redir = (d.get("redirect_goal") or "").strip()
    note = (d.get("human_note") or "").strip()
    if not redir and not note:
        return 0
    print(HEADER)
    if redir:
        print(f"  Redirect: {redir[:500]}")
    if note and note != redir:
        print(f"  Note: {note[:500]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
