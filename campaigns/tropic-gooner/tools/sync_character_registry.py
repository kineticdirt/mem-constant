#!/usr/bin/env python3
"""Sync characters-registry.json from discord/*.md — link Discord author to character Name.

Resolves duplicate slugs (e.g. alistrahd.md vs cassidy-catharine-cece.md) by grouping on
sheet ``Name:`` field. Marks legacy author-slug files as aliases; picks canonical path.

Does not delete markdown files — human promotes/removes duplicates when ready.

Usage:
  python tools/sync_character_registry.py
  python tools/sync_character_registry.py --write
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DISCORD_DIR = ROOT / "characters" / "discord"
REGISTRY = ROOT / "characters-registry.json"
GOAL = "docs/campaign-player-continuity-goals.md"


def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:60] or "unknown"


def _extract_name(body: str) -> str | None:
    cleaned = re.sub(r"^```+\w*\n?", "", body.strip())
    cleaned = re.sub(r"\n?```+\s*$", "", cleaned)
    m = re.search(r"^Name:\s*(.+)$", cleaned, re.MULTILINE | re.IGNORECASE)
    if not m:
        return None
    name = m.group(1).strip()
    return name if name and name.lower() not in ("n/a", "tbd", "") else None


def _extract_discord_author(text: str) -> str | None:
    for line in text.splitlines():
        m = re.match(r"#### \d{4}-\d{2}-\d{2} .+ — (.+)$", line.strip())
        if m:
            return m.group(1).strip()
    m = re.search(r"Latest post:.*\n", text)
    return None


def _sheet_body(text: str) -> str:
    m = re.search(r"## Sheet text \(latest\)\s*\n+```\n(.*?)```", text, re.DOTALL)
    if m:
        return m.group(1)
    m = re.search(r"## Character sheet.*?\n\n```\n(.*?)```", text, re.DOTALL)
    if m:
        return m.group(1)
    m = re.search(r"```\n(Name:.*?)\n```", text, re.DOTALL)
    return m.group(1) if m else text


def _discord_authors(text: str) -> list[str]:
    authors: list[str] = []
    for m in re.finditer(r"#### \d{4}-\d{2}-\d{2} .+ — (.+)$", text, re.MULTILINE):
        a = m.group(1).strip()
        if a and a not in authors:
            authors.append(a)
    return authors


def _canonical_score(path: Path, text: str) -> int:
    """Higher = prefer as canonical story_path."""
    score = 0
    if "## Character sheet" in text:
        score += 10
    if len(text) > 500:
        score += 5
    if "Threads" in text:
        score += 3
    if "(Discord character sheet)" in text.splitlines()[0] if text else "":
        score -= 5  # legacy author-slug stub
    score += min(len(text) // 2000, 5)
    return score


def scan_discord_files() -> list[dict]:
    rows: list[dict] = []
    if not DISCORD_DIR.is_dir():
        return rows
    for path in sorted(DISCORD_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8", errors="replace")
        body = _sheet_body(text)
        char_name = _extract_name(body)
        authors = _discord_authors(text)
        rel = f"campaigns/tropic-gooner/characters/discord/{path.name}"
        rows.append(
            {
                "slug": path.stem,
                "path": rel,
                "char_name": char_name,
                "discord_username": authors[0] if authors else "",
                "authors": authors,
                "score": _canonical_score(path, text),
                "is_legacy_stub": "(Discord character sheet)" in (text.splitlines()[0] if text else ""),
            }
        )
    return rows


def build_registry(rows: list[dict], existing: dict) -> dict:
    groups: dict[str, list[dict]] = {}
    orphan: list[dict] = []

    for row in rows:
        key = _slug(row["char_name"]) if row["char_name"] else row["slug"]
        if row["char_name"]:
            groups.setdefault(key, []).append(row)
        else:
            orphan.append(row)

    # Merge orphans that match discord author slug to a group by author name
    for row in orphan:
        matched = False
        for gkey, members in groups.items():
            for m in members:
                if row["discord_username"] and _slug(row["discord_username"]) == row["slug"]:
                    members.append(row)
                    matched = True
                    break
            if matched:
                break
        if not matched:
            groups[row["slug"]] = [row]

    old_by_id = {c["id"]: c for c in existing.get("characters", [])}
    characters: list[dict] = []

    for gkey, members in sorted(groups.items()):
        members.sort(key=lambda m: (-m["score"], m["slug"]))
        canon = members[0]
        aliases = [m["slug"] for m in members[1:]]
        dup_paths = [m["path"] for m in members[1:]]
        char_id = _slug(canon["char_name"]) if canon["char_name"] else canon["slug"]
        display = canon["char_name"] or canon["slug"].replace("-", " ").title()
        prev = old_by_id.get(char_id) or old_by_id.get(canon["slug"]) or {}

        # Start from prev so GM/runtime fields (hidden, canonical_id, portraits,
        # relationships, etc.) survive a regen; scanned fields override below.
        entry = {
            **prev,
            "id": char_id,
            "display_name": prev.get("display_name") or display,
            "story_path": canon["path"],
            "discord_username": prev.get("discord_username") or canon["discord_username"],
            "discord_user_id": prev.get("discord_user_id", ""),
            "player_name": prev.get("player_name", ""),
            "status": prev.get("status", "active"),
            "can_proxy": prev.get("can_proxy", False),
            "notes": prev.get("notes", ""),
            "aliases": sorted(set(aliases + prev.get("aliases", []))),
            "duplicate_paths": sorted(set(dup_paths + prev.get("duplicate_paths", []))),
        }
        if (entry["aliases"] or entry["duplicate_paths"]) and "Auto-linked duplicates" not in entry["notes"]:
            entry["notes"] = (entry["notes"] + " Auto-linked duplicates — canonical file is story_path.").strip()
        characters.append(entry)

    # Union: keep existing rows the scan cannot reproduce (GM-added, portal rows,
    # non-discord story sheets). Without this every --write silently deletes them
    # (the 2026-08-06 v32→v2 wipe class — celine/alisa-stein/jinpei-mclaren et al).
    scanned_ids = {c["id"] for c in characters}
    for prev_row in existing.get("characters", []):
        if prev_row.get("id") and prev_row["id"] not in scanned_ids:
            characters.append(prev_row)

    # Monotonic version: never reset below the on-disk version.
    prev_version = int(existing.get("version") or 1)
    return {
        "version": max(2, prev_version + 1),
        "campaign_id": "tropic-gooner",
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "goal_doc": GOAL,
        "characters": characters,
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--write", action="store_true", help="Write characters-registry.json")
    p.add_argument("--allow-shrink", action="store_true",
                   help="Permit a write that removes rows (default: refuse)")
    args = p.parse_args()

    existing = {}
    if REGISTRY.is_file():
        existing = json.loads(REGISTRY.read_text(encoding="utf-8"))

    rows = scan_discord_files()
    reg = build_registry(rows, existing)

    dupes = [c for c in reg["characters"] if c.get("duplicate_paths")]
    print(f"Scanned {len(rows)} discord files → {len(reg['characters'])} registry rows")
    for c in dupes:
        print(f"  LINK {c['display_name']}: canonical={c['story_path']}")
        for d in c.get("duplicate_paths", []):
            print(f"    alias duplicate: {d}")

    if args.write:
        old_count = len(existing.get("characters", []))
        new_count = len(reg["characters"])
        old_ids = {c.get("id") for c in existing.get("characters", [])}
        new_ids = {c.get("id") for c in reg["characters"]}
        if new_count < old_count and not args.allow_shrink:
            print(f"REFUSING write: row count would drop {old_count} → {new_count} "
                  f"(lost: {sorted(old_ids - new_ids)[:8]}). Pass --allow-shrink to override.",
                  file=sys.stderr)
            raise SystemExit(2)
        REGISTRY.write_text(json.dumps(reg, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {REGISTRY.relative_to(ROOT.parent)}")
    else:
        print("(dry-run — pass --write to save)")


if __name__ == "__main__":
    main()
