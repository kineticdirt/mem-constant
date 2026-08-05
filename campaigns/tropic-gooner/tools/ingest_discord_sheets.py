#!/usr/bin/env python3
"""Ingest Discord character data: #basic-sheets, *-private channels, and threads.

Scans category export (excluding fallout-named channels). One file per character under
characters/discord/<slug>.md — never deletes files.

Usage:
  python tools/ingest_discord_sheets.py
  python tools/ingest_discord_sheets.py --category-dir discord-export/Fallout\\ Campaign-1137592539076120666
"""
from __future__ import annotations

import argparse
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / "discord-export"
OUT = ROOT / "characters" / "discord"

# WoD player private channels in category 1137592539076120666
PRIVATE_CHANNEL_CHARACTERS: dict[str, str] = {
    "angela": "Angela",
    "trance": "Trance",
    "jackie": "Jackie",
    "mell": "Mell",
    "tia": "Tia",
    "premier": "Premier",
    "celeste": "Celeste",
}

# Canon names for thread / sheet matching (extend as INDEX grows)
CANON_NAMES: tuple[str, ...] = (
    "Ellaine",
    "Toga",
    "Nelly",
    "Redmond",
    "Red",
    "Minerva",
    "Sasha",
    "Rosalinda",
    "Rosalina",
    "Felix",
    "Angela",
    "Trance",
    "Jackie",
    "Mell",
    "Tia",
    "Premier",
    "Celeste",
    "Rosa",
    "Harper",
)


@dataclass
class Message:
    stamp: str
    author: str
    body: str
    attachments: list[str] = field(default_factory=list)
    source: str = ""

    @property
    def sort_key(self) -> str:
        return self.stamp


@dataclass
class ThreadBundle:
    title: str
    path: Path
    messages: list[Message]
    source_channel: str

    @property
    def sort_key(self) -> str:
        if self.messages:
            return self.messages[0].stamp
        return ""


@dataclass
class CharacterRecord:
    display_name: str
    slug: str
    sheet_posts: list[Message] = field(default_factory=list)
    private_posts: list[Message] = field(default_factory=list)
    threads: list[ThreadBundle] = field(default_factory=list)


def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:60] or "unknown"


def _parse_stamp(stamp: str) -> datetime:
    try:
        return datetime.strptime(stamp, "%Y-%m-%d %H:%M UTC").replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


def _parse_messages(md_path: Path, source: str) -> list[Message]:
    if not md_path.is_file():
        return []
    text = md_path.read_text(encoding="utf-8", errors="replace")
    # Skip export header before first message
    if "---" in text:
        parts = text.split("---", 1)
        text = parts[1] if len(parts) > 1 else text
    blocks = re.split(r"\n---\n", text)
    rows: list[Message] = []
    for block in blocks:
        m = re.search(
            r"### (\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC) — (.+?)\n\n(.*)",
            block,
            re.DOTALL,
        )
        if not m:
            continue
        stamp, author, body = m.group(1), m.group(2).strip(), m.group(3).strip()
        att = re.findall(r"Attachment: `([^`]+)`", body)
        body = re.sub(r"- Attachment:.*", "", body).strip()
        rows.append(Message(stamp=stamp, author=author, body=body, attachments=att, source=source))
    rows.sort(key=lambda x: _parse_stamp(x.stamp))
    return rows


def _extract_sheet_name(body: str) -> str | None:
    cleaned = re.sub(r"^```+\w*\n?", "", body.strip())
    cleaned = re.sub(r"\n?```+\s*$", "", cleaned)
    m = re.search(r"^Name:\s*(.+)$", cleaned, re.MULTILINE | re.IGNORECASE)
    if not m:
        return None
    name = m.group(1).strip()
    if not name or name.lower() in ("", "n/a", "tbd"):
        return None
    return name


def _is_canon_character(name: str) -> bool:
    n = name.lower()
    if n in {v.lower() for v in PRIVATE_CHANNEL_CHARACTERS.values()}:
        return True
    return any(n == c.lower() or n.startswith(c.lower()) for c in CANON_NAMES)


def _channel_folder_info(name: str) -> tuple[str, int | None, str]:
    """Return (channel_slug, channel_id, kind) from folder like basic-sheets-134547..."""
    m = re.match(r"^(.+)-(\d{10,})$", name)
    if not m:
        return name, None, "unknown"
    slug_part, cid = m.group(1), int(m.group(2))
    if slug_part.endswith("-private"):
        char_key = slug_part[: -len("-private")]
        return slug_part, cid, f"private:{char_key}"
    if "basic-sheets" in slug_part:
        return slug_part, cid, "basic-sheets"
    return slug_part, cid, "channel"


def _find_category_export(explicit: Path | None) -> Path | None:
    if explicit and explicit.is_dir():
        return explicit
    if not EXPORT.is_dir():
        return None
    for p in sorted(EXPORT.iterdir()):
        if p.is_dir() and "1137592539076120666" in p.name:
            return p
    return None


def _match_characters_in_text(text: str) -> list[str]:
    found: list[str] = []
    lower = text.lower()
    for name in CANON_NAMES:
        if re.search(rf"\b{re.escape(name.lower())}\b", lower):
            found.append(name)
    # Normalize Redmond -> also tag as Red for file merge
    if "Redmond" in found and "Red" not in found:
        found.append("Red")
    return sorted(set(found), key=str.lower)


def _thread_title_from_dir(dirname: str) -> str:
    m = re.match(r"^(.+)-(\d{10,})$", dirname)
    raw = m.group(1) if m else dirname
    return raw.replace("_", " ").replace("  ", " ").strip()


def _should_write(rec: CharacterRecord) -> bool:
    if rec.threads or rec.private_posts:
        return True
    if _is_canon_character(rec.display_name):
        return True
    if any(_extract_sheet_name(m.body) for m in rec.sheet_posts):
        return True
    return False


def _ensure_record(records: dict[str, CharacterRecord], name: str) -> CharacterRecord:
    slug = _slug(name)
    if slug not in records:
        records[slug] = CharacterRecord(display_name=name, slug=slug)
    return records[slug]


def _assign_thread(records: dict[str, CharacterRecord], bundle: ThreadBundle) -> None:
    targets = _match_characters_in_text(bundle.title)
    if not targets:
        # Introduction / Intro prefix
        m = re.search(r"(?:introduction|intro)[:\s_]+(.+)", bundle.title, re.I)
        if m:
            targets = _match_characters_in_text(m.group(1)) or [m.group(1).strip()]
    if not targets:
        return
    for name in targets:
        rec = _ensure_record(records, name)
        if not any(t.path == bundle.path for t in rec.threads):
            rec.threads.append(bundle)


def ingest_category(category_dir: Path) -> int:
    records: dict[str, CharacterRecord] = {}
    author_to_character: dict[str, str] = {}

    channel_dirs = sorted(
        [d for d in category_dir.iterdir() if d.is_dir()],
        key=lambda d: d.name,
    )

    for ch_dir in channel_dirs:
        ch_slug, _cid, kind = _channel_folder_info(ch_dir.name)
        if "fallout" in ch_slug.lower():
            print(f"Skip {ch_dir.name} (fallout)")
            continue

        source_label = f"#{ch_slug.replace('-', ' ')}"

        # Main channel messages
        main_msgs = _parse_messages(ch_dir / "messages.md", source_label)

        if kind == "basic-sheets":
            for msg in main_msgs:
                char_name = _extract_sheet_name(msg.body)
                if char_name:
                    author_to_character[msg.author] = char_name
                    rec = _ensure_record(records, char_name)
                    rec.sheet_posts.append(msg)
                elif msg.author in author_to_character:
                    rec = _ensure_record(records, author_to_character[msg.author])
                    rec.sheet_posts.append(msg)

        elif kind.startswith("private:"):
            char_key = kind.split(":", 1)[1]
            display = PRIVATE_CHANNEL_CHARACTERS.get(char_key, char_key.title())
            rec = _ensure_record(records, display)
            rec.private_posts.extend(main_msgs)

        # Threads under any non-fallout channel
        threads_dir = ch_dir / "threads"
        if threads_dir.is_dir():
            for t_dir in sorted(threads_dir.iterdir()):
                if not t_dir.is_dir():
                    continue
                title = _thread_title_from_dir(t_dir.name)
                t_msgs = _parse_messages(t_dir / "messages.md", f"thread:{title}")
                if not t_msgs:
                    continue
                bundle = ThreadBundle(
                    title=title,
                    path=t_dir,
                    messages=t_msgs,
                    source_channel=source_label,
                )
                _assign_thread(records, bundle)

    OUT.mkdir(parents=True, exist_ok=True)
    written = 0
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    for slug in sorted(records.keys()):
        rec = records[slug]
        rec.sheet_posts.sort(key=lambda m: _parse_stamp(m.stamp))
        rec.private_posts.sort(key=lambda m: _parse_stamp(m.stamp))
        rec.threads.sort(key=lambda t: _parse_stamp(t.sort_key))

        lines = [
            f"# {rec.display_name}",
            "",
            f"- **Ingested:** {now}",
            f"- **Sources:** basic-sheets, private channels, RP threads (fallout excluded)",
            "",
        ]

        if rec.sheet_posts:
            lines.extend(["## Character sheet (#basic-sheets)", ""])
            for msg in rec.sheet_posts:
                lines.extend(_format_message_block(msg))
            lines.append("")

        if rec.private_posts:
            priv_name = _slug(rec.display_name)
            lines.extend([f"## Private channel (#{priv_name}-private)", ""])
            for msg in rec.private_posts:
                lines.extend(_format_message_block(msg))
            lines.append("")

        if rec.threads:
            lines.extend(["## Threads (chronological)", ""])
            for tb in rec.threads:
                lines.append(f"### {tb.title}")
                lines.append("")
                lines.append(f"- **Parent channel:** {tb.source_channel}")
                lines.append(f"- **Export:** `{tb.path.relative_to(ROOT).as_posix()}`")
                if tb.messages:
                    lines.append(f"- **Started:** {tb.messages[0].stamp}")
                lines.append("")
                for msg in tb.messages:
                    lines.extend(_format_message_block(msg, indent=0))
                lines.append("")

        if not rec.sheet_posts and not rec.private_posts and not rec.threads:
            continue
        if not _should_write(rec):
            continue

        path = OUT / f"{slug}.md"
        content = "\n".join(lines).rstrip() + "\n"
        if path.exists() and path.read_text(encoding="utf-8").strip() == content.strip():
            continue
        path.write_text(content, encoding="utf-8")
        print(f"Wrote {path.relative_to(ROOT)}")
        written += 1

    return written


def _format_message_block(msg: Message, indent: int = 0) -> list[str]:
    pad = "  " * indent
    lines = [f"{pad}#### {msg.stamp} — {msg.author}", ""]
    if msg.body:
        lines.append(f"{pad}{msg.body}")
        lines.append("")
    for a in msg.attachments:
        lines.append(f"{pad}- Attachment: `{a}`")
    if msg.attachments:
        lines.append("")
    return lines


def main() -> None:
    p = argparse.ArgumentParser(description="Ingest Discord sheets + threads per character")
    p.add_argument(
        "--category-dir",
        type=Path,
        default=None,
        help="Category export folder (default: auto-find *1137592539076120666*)",
    )
    args = p.parse_args()
    cat = _find_category_export(args.category_dir)
    if not cat:
        raise SystemExit("No category export found. Run export_discord_lore.py first.")
    print(f"Ingest from {cat.relative_to(ROOT)}")
    n = ingest_category(cat)
    print(f"Done — {n} character file(s) under characters/discord/")


if __name__ == "__main__":
    main()
