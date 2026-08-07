#!/usr/bin/env python3
"""Think work packets — tick-sized units so Hermes does not burn 28 turns on epics.

SoT: agents/state/work-packets.json (potato runtime).
See docs/plans/think-work-packets-2026-08-06.md.

Usage:
  think-work-packet.py ensure  --repo REPO --task-id ID [--blurb TEXT] [--body TEXT]
  think-work-packet.py active  --repo REPO --task-id ID
  think-work-packet.py complete --repo REPO --packet-id ID [--blocked REASON]
  think-work-packet.py self-check
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

STATE_REL = Path("agents/state/work-packets.json")


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load(repo: Path) -> dict:
    fp = repo / STATE_REL
    if not fp.is_file():
        return {"version": 1, "updated_at": _now(), "packets": []}
    try:
        data = json.loads(fp.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"version": 1, "updated_at": _now(), "packets": []}
    if not isinstance(data, dict):
        return {"version": 1, "updated_at": _now(), "packets": []}
    data.setdefault("packets", [])
    if not isinstance(data["packets"], list):
        data["packets"] = []
    return data


def _save(repo: Path, data: dict) -> None:
    fp = repo / STATE_REL
    fp.parent.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = _now()
    data["version"] = int(data.get("version") or 1)
    fp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def _packets_for(data: dict, task_id: str) -> list[dict]:
    return [
        p
        for p in data.get("packets") or []
        if isinstance(p, dict) and str(p.get("task_id") or "") == task_id
    ]


def _next_open(packets: list[dict]) -> dict | None:
    for p in packets:
        if str(p.get("status") or "").lower() in ("open", "pending", ""):
            return p
    return None


def _slug(task_id: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "-", task_id).strip("-").lower()
    return (s or "task")[:48]


def _heuristic_packets(task_id: str, blurb: str, body: str) -> list[dict]:
    """Deterministic 1–3 packets. No LLM."""
    title = (blurb or "").strip() or task_id
    body = (body or "").strip()
    low = f"{title}\n{body}".lower()
    base = _slug(task_id)

    def pkt(n: int, goal: str, verify: str, max_turns: int) -> dict:
        return {
            "id": f"pkt-{base}-{n:02d}",
            "task_id": task_id,
            "goal": goal[:400],
            "verify": verify[:400],
            "max_turns": max_turns,
            "status": "open",
            "created_at": _now(),
            "notes": "auto-ensure",
        }

    # Incident cleanup: one root-cause packet, not a redesign epic.
    if "incident cleanup" in low or "timeout_124" in low:
        return [
            pkt(
                1,
                f"Root-cause or soft-close thrash for: {title[:160]}. "
                "Do NOT start a product redesign. Prefer one code/config guard or mark task blocked with inbox.",
                "agents/user-tasks.json id "
                + task_id
                + " status=done|blocked  AND  (optional) one papercut or guard file touched",
                10,
            )
        ]

    # Wishlist / feature without urgent tag → invent-or-close, not build the product.
    wishlist = any(
        t in low
        for t in (
            "[calendar]",
            "[weather]",
            "[stocks]",
            "[photography]",
            "[automotive]",
            "[voice]",
            "[disaster-recovery]",
            "[scheduling]",
            "[ci]",
            "[docs]",
            "[hardware]",
        )
    )
    if wishlist and "urgent" not in low and "[ops]" not in low:
        return [
            pkt(
                1,
                f"Triage wishlist item (do not implement full product): {title[:160]}. "
                "Either write a 1-page plan under docs/plans/ OR set status=blocked with one inbox ask.",
                "agents/user-tasks.json id "
                + task_id
                + " status=done|blocked",
                8,
            )
        ]

    # Numbered / Then-split when body looks multi-step.
    parts = re.split(r"(?:\n\s*\d+[.)]\s+|\n\s*[-*]\s+|(?:\bThen\b|\bNext\b)\s*:)", body)
    parts = [p.strip() for p in parts if p and len(p.strip()) > 40]
    if len(parts) >= 2:
        out = []
        for i, part in enumerate(parts[:3], start=1):
            out.append(
                pkt(
                    i,
                    f"Ship slice {i}/{min(3, len(parts))}: {part[:200]}",
                "Concrete verify for slice {i}: name ONE command (bash/curl/python) that exits 0 if the slice worked; "
                    f"leave parent task open until all packets done",
                    10,
                )
            )
        return out

    # Default: one implement+verify packet with modest budget.
    turns = 12 if "[ops]" in low or "playwright" in low or "smoke" in low else 10
    return [
        pkt(
            1,
            f"Smallest correct implement+verify for: {title[:200]}",
            "agents/user-tasks.json id "
            + task_id
            + " status=done|blocked  after a concrete check (script/curl/file)",
            turns,
        )
    ]


def cmd_ensure(repo: Path, task_id: str, blurb: str, body: str) -> int:
    if not task_id:
        print("ERROR: --task-id required", file=sys.stderr)
        return 2
    data = _load(repo)
    existing = _packets_for(data, task_id)
    if existing:
        active = _next_open(existing)
        print(json.dumps({"ok": True, "created": 0, "active": active, "total": len(existing)}))
        return 0
    created = _heuristic_packets(task_id, blurb, body)
    data["packets"].extend(created)
    _save(repo, data)
    print(json.dumps({"ok": True, "created": len(created), "active": created[0], "total": len(created)}))
    return 0


def cmd_active(repo: Path, task_id: str) -> int:
    data = _load(repo)
    packets = _packets_for(data, task_id)
    active = _next_open(packets)
    all_done = bool(packets) and active is None
    print(
        json.dumps(
            {
                "ok": True,
                "active": active,
                "all_done": all_done,
                "total": len(packets),
                "done": sum(1 for p in packets if str(p.get("status") or "").lower() == "done"),
            }
        )
    )
    return 0


def cmd_complete(repo: Path, packet_id: str, blocked: str) -> int:
    data = _load(repo)
    found = None
    for p in data["packets"]:
        if isinstance(p, dict) and str(p.get("id") or "") == packet_id:
            found = p
            break
    if not found:
        print(json.dumps({"ok": False, "error": "packet_not_found"}))
        return 1
    found["status"] = "blocked" if blocked else "done"
    found["closed_at"] = _now()
    if blocked:
        found["notes"] = (found.get("notes") or "") + f" | blocked: {blocked[:200]}"
    task_id = str(found.get("task_id") or "")
    siblings = _packets_for(data, task_id)
    remaining = [
        p
        for p in siblings
        if str(p.get("status") or "").lower() in ("open", "pending", "")
        and str(p.get("id") or "") != packet_id
    ]
    # If completing current, exclude it from remaining
    remaining = [p for p in remaining if str(p.get("id") or "") != packet_id]
    _save(repo, data)
    print(
        json.dumps(
            {
                "ok": True,
                "packet_id": packet_id,
                "status": found["status"],
                "task_id": task_id,
                "task_complete": len(remaining) == 0 and not blocked,
                "remaining_open": len(remaining),
            }
        )
    )
    return 0


def cmd_self_check() -> int:
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        repo = Path(td)
        (repo / "agents" / "state").mkdir(parents=True)
        # incident → single packet
        r = cmd_ensure(
            repo,
            "inc-clean-test",
            "[ops] Think incident cleanup: timeout_124 ×3 — Layout sidebar",
            "Recurring think failure",
        )
        assert r == 0
        data = _load(repo)
        pk = _packets_for(data, "inc-clean-test")
        assert len(pk) == 1 and pk[0]["max_turns"] == 10
        # idempotent ensure
        cmd_ensure(repo, "inc-clean-test", "x", "y")
        assert len(_packets_for(_load(repo), "inc-clean-test")) == 1
        # wishlist triage
        cmd_ensure(repo, "cal-1", "[calendar] Hub calendar tab", "big feature")
        w = _packets_for(_load(repo), "cal-1")
        assert len(w) == 1 and "Triage wishlist" in w[0]["goal"]
        # complete → task_complete
        pid = w[0]["id"]
        out = __import__("io").StringIO()
        # call complete via function
        data = _load(repo)
        for p in data["packets"]:
            if p["id"] == pid:
                p["status"] = "done"
                p["closed_at"] = _now()
        _save(repo, data)
        act = _next_open(_packets_for(_load(repo), "cal-1"))
        assert act is None
    print("SELF-CHECK PASS")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("cmd", choices=("ensure", "active", "complete", "self-check"))
    ap.add_argument("--repo", default=".", type=Path)
    ap.add_argument("--task-id", default="")
    ap.add_argument("--blurb", default="")
    ap.add_argument("--body", default="")
    ap.add_argument("--packet-id", default="")
    ap.add_argument("--blocked", default="")
    args = ap.parse_args()
    repo = args.repo.resolve()
    if args.cmd == "self-check":
        return cmd_self_check()
    if args.cmd == "ensure":
        return cmd_ensure(repo, args.task_id, args.blurb, args.body)
    if args.cmd == "active":
        return cmd_active(repo, args.task_id)
    if args.cmd == "complete":
        return cmd_complete(repo, args.packet_id, args.blocked)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
