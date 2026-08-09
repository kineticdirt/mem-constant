#!/usr/bin/env python3
"""Delete old Stack + Heisters; post H1–H6 history series to lore forum."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

FORUM = "1528216296779415683"
DELETE_IDS = [
    "1535826690486308884",  # 01 Stack
    "1535826722954412204",  # 05 Heisters
]
TOK_PATH = Path("/tmp/nyc-bot.tok")
DRAFT_DIR = Path("/tmp/nyc-discord-drafts")

THREADS = [
    ("01 — History: How to read the Stack", "h1-how-to-read.txt"),
    ("02 — History: Deep Past & the Harbor", "h2-deep-past-harbor.txt"),
    ("03 — History: Three Centuries of Spell-Industry", "h3-spell-industry.txt"),
    ("04 — History: Gilded Rails & the Present", "h4-rails-present.txt"),
    ("05 — Demographics of the Metro", "h5-demographics.txt"),
    ("06 — What the City Manufactures", "h6-manufacturing.txt"),
]


def api(method: str, url: str, body: dict | None = None) -> tuple[int, dict | list | str]:
    tok = TOK_PATH.read_text(encoding="utf-8").strip()
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bot {tok}",
            "Content-Type": "application/json",
            "User-Agent": "nyc-lore-poster (agent-dump)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            code = resp.status
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        code = e.code
    try:
        parsed: dict | list | str = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        parsed = raw
    return code, parsed


def chunk(text: str, limit: int = 1900) -> list[str]:
    text = text.strip()
    if len(text) <= limit:
        return [text]
    parts: list[str] = []
    rest = text
    while rest:
        if len(rest) <= limit:
            parts.append(rest)
            break
        cut = rest.rfind("\n\n", 0, limit)
        if cut < limit // 2:
            cut = rest.rfind("\n", 0, limit)
        if cut < limit // 2:
            cut = limit
        parts.append(rest[:cut].rstrip())
        rest = rest[cut:].lstrip()
    return parts


def main() -> None:
    results: list[str] = []

    for tid in DELETE_IDS:
        code, parsed = api("DELETE", f"https://discord.com/api/v10/channels/{tid}")
        results.append(f"DELETE {tid} -> {code} {parsed if code >= 400 else 'ok'}")
        time.sleep(1.2)

    created: list[tuple[str, str]] = []
    for title, fname in THREADS:
        body = (DRAFT_DIR / fname).read_text(encoding="utf-8")
        chunks = chunk(body)
        code, parsed = api(
            "POST",
            f"https://discord.com/api/v10/channels/{FORUM}/threads",
            {
                "name": title[:100],
                "auto_archive_duration": 10080,
                "message": {"content": chunks[0]},
            },
        )
        if code not in (200, 201) or not isinstance(parsed, dict):
            results.append(f"CREATE FAIL {title} -> {code} {parsed}")
            break
        tid = str(parsed.get("id"))
        created.append((title, tid))
        results.append(f"CREATE {title} -> {code} id={tid} parts={len(chunks)}")
        for i, c in enumerate(chunks[1:], start=2):
            time.sleep(1.2)
            c2, p2 = api(
                "POST",
                f"https://discord.com/api/v10/channels/{tid}/messages",
                {"content": c},
            )
            results.append(f"  followup p{i} -> {c2}")
            if c2 not in (200, 201):
                results.append(f"  FAIL body {p2}")
        time.sleep(1.5)

    out = Path("/tmp/nyc-discord-history-result.txt")
    out.write_text("\n".join(results) + "\n", encoding="utf-8")
    print(out.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
