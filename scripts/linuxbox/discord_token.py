#!/usr/bin/env python3
"""Shared Discord bot-token resolver (canonical DISCORD_BOT_TOKEN).

Lookup order (first non-empty wins):
  1. Process env: DISCORD_BOT_TOKEN → DISCORD_TOKEN (compat)
  2. ~/.hermes/profiles/hunter-reckoning/.env
  3. campaigns/tropic-gooner/.env
  4. ~/.hermes/.env  (may be pointer-only; empty values skipped)

Never log the token. CLI prints it once to stdout for shell capture only.

Usage (Python):
    from discord_token import _discord_token
    token = _discord_token()

Usage (shell):
    tok=$(python3 scripts/linuxbox/discord_token.py)
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Optional: dotenv helps when callers already rely on it; parse still authoritative.
try:
    from dotenv import load_dotenv as _load_dotenv
except ImportError:  # pragma: no cover
    _load_dotenv = None

REPO_ROOT = Path(__file__).resolve().parents[2]
HUNTER_ENV = Path.home() / ".hermes" / "profiles" / "hunter-reckoning" / ".env"
CAMPAIGN_ENV = REPO_ROOT / "campaigns" / "tropic-gooner" / ".env"
HERMES_ENV = Path.home() / ".hermes" / ".env"

_TOKEN_KEYS = ("DISCORD_BOT_TOKEN", "DISCORD_TOKEN")


def _value_from_line(line: str, keys: tuple[str, ...]) -> str:
    if not line or line.lstrip().startswith("#") or "=" not in line:
        return ""
    key, _, raw = line.partition("=")
    key = key.strip()
    if key not in keys:
        return ""
    return raw.strip().strip('"').strip("'")


def _token_from_file(path: Path) -> str:
    """Return first non-empty token key from a .env file (skip blanks)."""
    if not path.is_file():
        return ""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return ""
    # Prefer canonical key before compat alias across the whole file.
    for prefer in _TOKEN_KEYS:
        for line in text.splitlines():
            val = _value_from_line(line, (prefer,))
            if val:
                return val
    return ""


def _discord_token() -> str:
    """Return Discord bot token or exit with a non-secret error."""
    for key in _TOKEN_KEYS:
        v = os.environ.get(key, "").strip()
        if v:
            return v

    if _load_dotenv is not None:
        # First file wins (override=False); empty hunter keys must not block tropic —
        # so we still parse files below and only use dotenv as a soft seed.
        for env_path in (HUNTER_ENV, CAMPAIGN_ENV, HERMES_ENV):
            if env_path.is_file():
                _load_dotenv(env_path, override=False)
        for key in _TOKEN_KEYS:
            v = os.environ.get(key, "").strip()
            if v:
                return v

    for env_path in (HUNTER_ENV, CAMPAIGN_ENV, HERMES_ENV):
        tok = _token_from_file(env_path)
        if tok:
            return tok

    sys.exit(
        "No Discord token found.\n"
        f"  Checked: {HUNTER_ENV}\n"
        f"  Checked: {CAMPAIGN_ENV}\n"
        f"  Checked: {HERMES_ENV}\n"
        "  Keys tried: DISCORD_BOT_TOKEN, DISCORD_TOKEN\n"
        "  Set DISCORD_BOT_TOKEN in hunter profile .env (canonical) and re-run."
    )


if __name__ == "__main__":
    print(_discord_token())
