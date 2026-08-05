#!/usr/bin/env python3
"""Write reports/research/bookmarks-inbox.json for the research-bookmarks lane.

No X API. Human/PC pastes URLs or a JSON export after logging into x.com/i/bookmarks.

Usage:
  python scripts/pc/write-bookmarks-inbox.py https://x.com/…/status/1 https://x.com/…/status/2
  python scripts/pc/write-bookmarks-inbox.py --file paste.json
  python scripts/pc/write-bookmarks-inbox.py --stdin < urls.txt
  python scripts/pc/write-bookmarks-inbox.py --file paste.json --push-potato
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SOURCE_CFG = REPO / "agents" / "research-bookmarks-source.json"
OUT_DIR = REPO / "reports" / "research"
OUT = OUT_DIR / "bookmarks-inbox.json"
URL_RE = re.compile(r"https?://(?:x\.com|twitter\.com)/\S+", re.I)


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load_source_meta() -> dict:
    if SOURCE_CFG.is_file():
        return json.loads(SOURCE_CFG.read_text(encoding="utf-8"))
    return {}


def _item_from_url(url: str) -> dict:
    url = url.rstrip(").,]\"'")
    return {
        "url": url,
        "title": "",
        "author": "",
        "saved_at": _utc_now()[:10],
        "tags": [],
        "snippet": "",
        "status": "new",
    }


def _normalize_payload(raw: object) -> dict:
    meta = _load_source_meta()
    base = {
        "source": "x-bookmarks",
        "account": meta.get("account") or "Wholesomeboi",
        "source_url": meta.get("source_url") or "https://x.com/i/bookmarks",
        "exported_at": _utc_now(),
        "notes": "Local ingest for research-bookmarks lane (no X API).",
        "items": [],
    }
    if isinstance(raw, dict):
        items = raw.get("items")
        if isinstance(items, list):
            base["items"] = [x for x in items if isinstance(x, dict) and x.get("url")]
            for k in ("account", "source_url", "notes", "exported_at"):
                if raw.get(k):
                    base[k] = raw[k]
            return base
        # single object with url
        if raw.get("url"):
            base["items"] = [raw]
            return base
    if isinstance(raw, list):
        out = []
        for x in raw:
            if isinstance(x, str) and URL_RE.search(x):
                out.append(_item_from_url(URL_RE.search(x).group(0)))
            elif isinstance(x, dict) and x.get("url"):
                out.append(x)
        base["items"] = out
        return base
    raise SystemExit("unrecognized input: need JSON object with items[], URL list, or URL lines")


def _from_text(text: str) -> dict:
    text = text.strip()
    if not text:
        raise SystemExit("empty input")
    if text[0] in "{[":
        return _normalize_payload(json.loads(text))
    urls = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = URL_RE.search(line)
        if m:
            urls.append(m.group(0))
        elif line.startswith("http"):
            urls.append(line.split()[0])
    if not urls:
        raise SystemExit("no URLs found in text")
    return _normalize_payload(urls)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("urls", nargs="*", help="Bookmark URLs")
    ap.add_argument("--file", "-f", type=Path, help="JSON file or URL list")
    ap.add_argument("--stdin", action="store_true", help="Read JSON or URL lines from stdin")
    ap.add_argument(
        "--push-potato",
        action="store_true",
        help="scp inbox to potato:~/agent-dump/reports/research/",
    )
    args = ap.parse_args()

    if args.file:
        payload = _from_text(args.file.read_text(encoding="utf-8"))
    elif args.stdin:
        payload = _from_text(sys.stdin.read())
    elif args.urls:
        payload = _normalize_payload(list(args.urls))
    else:
        ap.print_help()
        print("\nSource config:", SOURCE_CFG, file=sys.stderr)
        return 2

    if not payload["items"]:
        raise SystemExit("no items to write")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(payload['items'])} items)")

    if args.push_potato:
        remote = "potato:~/agent-dump/reports/research/bookmarks-inbox.json"
        subprocess.run(
            ["ssh", "potato", "mkdir", "-p", "agent-dump/reports/research"],
            check=False,
        )
        r = subprocess.run(["scp", str(OUT), remote], check=False)
        if r.returncode != 0:
            print("scp to potato failed — inbox is local; push later", file=sys.stderr)
            return r.returncode
        print(f"pushed {remote}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
