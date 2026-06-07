"""
Parse Discord-export messages.md files (### timestamp headers) into Elasticsearch bulk NDJSON.

Usage (from SpaceQuest root):
  python scripts/discord_messages_to_elasticsearch_ndjson.py

Outputs:
  discord-export/elastic-bulk/messages-bulk.ndjson
  discord-export/elastic-bulk/ingest-instructions.md
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXPORT = ROOT / "discord-export" / "Space Base V2-1469873840703144060"
OUT_DIR = ROOT / "discord-export" / "elastic-bulk"
INDEX = "spacequest-discord-canon"

# (folder_name, short channel key)
CHANNELS: list[tuple[str, str]] = [
    ("loredoc-1469876798614405274", "loredoc"),
    ("characters-1469873902208421997", "characters"),
    ("dm-screen-spbs-1472402938327728383", "dm_screen"),
    ("rp-1469873871036612855", "rp"),
    ("corpo-station-1474987916701863936", "corpo_station"),
]

HEADER_RE = re.compile(
    r"^###\s+(?P<ts>\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+UTC)\s+—\s+(?P<author>.+?)\s*$"
)


def stable_id(channel: str, start_line: int, body: str) -> str:
    h = hashlib.sha256(f"{channel}:{start_line}:{body[:500]}".encode()).hexdigest()[:16]
    return f"{channel}-{start_line}-{h}"


def parse_messages(path: Path) -> list[tuple[int, str, str, str]]:
    """Yield (start_line, ts, author, body) per message block."""
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    blocks: list[tuple[int, str, str, str]] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        m = HEADER_RE.match(line)
        if not m:
            i += 1
            continue
        start = i + 1  # 1-based line number for editors
        ts = m.group("ts").strip()
        author = m.group("author").strip()
        i += 1
        body_lines: list[str] = []
        while i < len(lines) and not HEADER_RE.match(lines[i]):
            body_lines.append(lines[i])
            i += 1
        body = "\n".join(body_lines).strip()
        # Strip trailing export separators (lines that are only ---)
        parts = body.split("\n")
        while parts and parts[-1].strip() in ("---", ""):
            parts.pop()
        body = "\n".join(parts).strip()
        blocks.append((start, ts, author, body))
    return blocks


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "messages-bulk.ndjson"
    rel_root = "discord-export/Space Base V2-1469873840703144060"

    lines_out: list[str] = []
    for folder, ch_key in CHANNELS:
        md = EXPORT / folder / "messages.md"
        if not md.exists():
            continue
        vault_rel = f"{rel_root}/{folder}/messages.md"
        for start_line, ts, author, body in parse_messages(md):
            _id = stable_id(ch_key, start_line, body)
            doc = {
                "channel_key": ch_key,
                "channel_folder": folder,
                "obsidian_uri": vault_rel,
                "line_start": start_line,
                "timestamp_header": ts,
                "author": author,
                "is_gm_voice": author.strip() == "WHOLESOMEest Boi",
                "body": body,
                "body_length": len(body),
            }
            lines_out.append(json.dumps({"index": {"_index": INDEX, "_id": _id}}))
            lines_out.append(json.dumps(doc))

    out_path.write_text("\n".join(lines_out) + "\n", encoding="utf-8")

    ingest = OUT_DIR / "ingest-instructions.md"
    ingest.write_text(
        f"""# Elasticsearch bulk ingest (SpaceQuest Discord canon)

## Generated file

- `messages-bulk.ndjson` — Elasticsearch bulk API format (action line + source line per message).

## Index

- Suggested index name: `{INDEX}`

## curl (Elasticsearch 7/8)

Replace `ELASTIC_URL` and auth as needed.

```bash
curl -s -H "Content-Type: application/x-ndjson" -X POST "ELASTIC_URL/{INDEX}/_bulk?pretty" --data-binary "@messages-bulk.ndjson"
```

## Obsidian

Message documents include `obsidian_uri` (path relative to vault root `PersonalVault/SpaceQuest/` if that is your vault folder) and `line_start` for jumping in the editor.

## Regenerate

```bash
python scripts/discord_messages_to_elasticsearch_ndjson.py
```
""",
        encoding="utf-8",
    )
    print(f"Wrote {out_path} ({len(lines_out)//2} documents)")


if __name__ == "__main__":
    main()
