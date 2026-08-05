#!/usr/bin/env python3
"""DEPRECATED — use tools/ingest_discord_sheets.py (character Name slug, not author slug)."""
import subprocess
import sys
from pathlib import Path

print(
    "DEPRECATED: campaigns/tropic-gooner/ingest_discord_sheets.py (author-slug) "
    "creates duplicates. Running tools/ingest_discord_sheets.py instead.",
    file=sys.stderr,
)
tools = Path(__file__).resolve().parent / "tools" / "ingest_discord_sheets.py"
raise SystemExit(subprocess.call([sys.executable, str(tools), *sys.argv[1:]]))
