#!/usr/bin/env python3
"""Mark paths as human/Cursor-authored so think/lanes do not silently reverse them.

SoT: agents/state/human-authored-paths.json (potato runtime).
Policy defaults (tracked): agents/human-authored-defaults.json

Usage:
  human-authored.py list   --repo REPO
  human-authored.py mark   --repo REPO --path REL [--note TEXT] [--source cursor|gm|pc]
  human-authored.py check  --repo REPO --path REL
  human-authored.py block  --repo REPO   # text block for think inject
  human-authored.py self-check
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

STATE_REL = Path("agents/state/human-authored-paths.json")
DEFAULTS_REL = Path("agents/human-authored-defaults.json")


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load_json(fp: Path, fallback: dict) -> dict:
    if not fp.is_file():
        return dict(fallback)
    try:
        data = json.loads(fp.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return dict(fallback)
    return data if isinstance(data, dict) else dict(fallback)


def _merged(repo: Path) -> dict:
    defaults = _load_json(
        repo / DEFAULTS_REL,
        {"version": 1, "paths": [], "globs": [], "notes": ""},
    )
    state = _load_json(
        repo / STATE_REL,
        {"version": 1, "updated_at": None, "entries": []},
    )
    entries = []
    seen = set()
    for p in defaults.get("paths") or []:
        rel = str(p).replace("\\", "/").strip().lstrip("./")
        if not rel or rel in seen:
            continue
        seen.add(rel)
        entries.append(
            {
                "path": rel,
                "source": "policy",
                "note": "human-authored-defaults",
                "marked_at": None,
            }
        )
    for e in state.get("entries") or []:
        if not isinstance(e, dict):
            continue
        rel = str(e.get("path") or "").replace("\\", "/").strip().lstrip("./")
        if not rel or rel in seen:
            continue
        seen.add(rel)
        entries.append(
            {
                "path": rel,
                "source": str(e.get("source") or "gm"),
                "note": str(e.get("note") or "")[:200],
                "marked_at": e.get("marked_at"),
            }
        )
    return {
        "version": max(1, int(state.get("version") or 1)),
        "globs": list(defaults.get("globs") or []),
        "entries": entries,
    }


def _norm(path: str) -> str:
    return str(path or "").replace("\\", "/").strip().lstrip("./")


def cmd_list(repo: Path) -> int:
    print(json.dumps(_merged(repo), indent=2))
    return 0


def cmd_mark(repo: Path, path: str, note: str, source: str) -> int:
    rel = _norm(path)
    if not rel:
        print(json.dumps({"ok": False, "error": "path_required"}))
        return 2
    fp = repo / STATE_REL
    data = _load_json(fp, {"version": 1, "updated_at": None, "entries": []})
    if not isinstance(data.get("entries"), list):
        data["entries"] = []
    now = _now()
    found = None
    for e in data["entries"]:
        if isinstance(e, dict) and _norm(e.get("path")) == rel:
            found = e
            break
    if found is None:
        found = {"path": rel}
        data["entries"].append(found)
    found["path"] = rel
    found["source"] = source or "gm"
    found["note"] = (note or "")[:200]
    found["marked_at"] = now
    data["updated_at"] = now
    data["version"] = int(data.get("version") or 1) + 1
    fp.parent.mkdir(parents=True, exist_ok=True)
    fp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "entry": found}))
    return 0


def cmd_check(repo: Path, path: str) -> int:
    rel = _norm(path)
    merged = _merged(repo)
    hit = next((e for e in merged["entries"] if e["path"] == rel), None)
    protected = hit is not None
    if not protected:
        for g in merged.get("globs") or []:
            g = str(g).replace("\\", "/").strip()
            if g.endswith("/**") and rel.startswith(g[:-3]):
                protected = True
                hit = {"path": rel, "source": "glob", "note": g}
                break
            if g.endswith("/*") and rel.startswith(g[:-1]) and "/" not in rel[len(g) - 1 :]:
                protected = True
                hit = {"path": rel, "source": "glob", "note": g}
                break
    print(json.dumps({"ok": True, "protected": protected, "entry": hit}))
    return 0 if not protected else 3


def cmd_block(repo: Path) -> int:
    merged = _merged(repo)
    paths = [e["path"] for e in merged["entries"][:40]]
    globs = merged.get("globs") or []
    lines = [
        "HUMAN / CURSOR AUTHORSHIP (do not reverse without explicit GM ask):",
        "- Paths below were built or locked by the human (Cursor IDE / GM).",
        "- Prefer additive fixes around them. Never 'clean up', rewrite, or git-revert these to 'fix' a lane.",
        "- If a task needs changing them: set task blocked + one inbox ask — do not edit.",
    ]
    if paths:
        lines.append("- Locked paths:")
        for p in paths:
            lines.append(f"  · {p}")
    if globs:
        lines.append("- Globs: " + ", ".join(str(g) for g in globs[:20]))
    if not paths and not globs:
        lines.append("- (none marked yet — still treat GM Draw/Save map borders + Chars registry merges as sacred)")
    sys.stdout.write("\n".join(lines) + "\n")
    return 0


def cmd_self_check() -> int:
    assert _norm("\\a\\b") == "a/b"
    assert _norm("./x") == "x"
    print("OK human-authored self-check")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=("list", "mark", "check", "block", "self-check"))
    ap.add_argument("--repo", default=".")
    ap.add_argument("--path", default="")
    ap.add_argument("--note", default="")
    ap.add_argument("--source", default="gm", choices=("gm", "cursor", "pc", "policy"))
    args = ap.parse_args()
    repo = Path(args.repo).resolve()
    if args.cmd == "list":
        return cmd_list(repo)
    if args.cmd == "mark":
        return cmd_mark(repo, args.path, args.note, args.source)
    if args.cmd == "check":
        return cmd_check(repo, args.path)
    if args.cmd == "block":
        return cmd_block(repo)
    return cmd_self_check()


if __name__ == "__main__":
    raise SystemExit(main())
