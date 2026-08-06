#!/usr/bin/env python3
"""
Re-download missing sheet attachments from Discord channel history.

Looks up basenames in recent history of channels inferred from discord-export
folder names (…-<channel_id>/). Batches downloads to protect ~2GB RAM.

Uses shared _discord_token() from discord_token.py (checks DISCORD_BOT_TOKEN,
DISCORD_TOKEN, BOT_TOKEN across campaign .env, hunter profile, and ~/.hermes/.env).

Prints one JSON summary line on stdout (no secrets).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPORT = ROOT / "discord-export"
PORTRAITS = ROOT / "characters" / "portraits"
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

sys.path.insert(0, str(ROOT / "scripts" / "linuxbox"))
from discord_token import _discord_token


def load_token() -> str | None:
    """Delegate to shared _discord_token(); return None on SystemExit."""
    try:
        return _discord_token()
    except SystemExit:
        return None


def channel_ids_from_export() -> list[int]:
    ids: set[int] = set()
    if not EXPORT.is_dir():
        return []
    for p in EXPORT.rglob("*"):
        if not p.is_dir():
            continue
        m = re.search(r"-(\d{15,})$", p.name)
        if m:
            ids.add(int(m.group(1)))
    return sorted(ids)


async def run_fetch(job: dict, batch: int) -> dict:
    try:
        import discord
        from dotenv import load_dotenv
    except ImportError as e:
        return {
            "ok": False,
            "token_ok": False,
            "copied": 0,
            "message": f"missing_dep:{e}",
            "fix": "pip install discord.py python-dotenv",
        }

    load_dotenv(ROOT / ".env")
    load_dotenv(Path.home() / ".hermes" / ".env")
    token = load_token()
    if not token:
        return {
            "ok": False,
            "token_ok": False,
            "copied": 0,
            "message": "no_discord_token",
            "fix": "Set DISCORD_TOKEN in campaigns/tropic-gooner/.env or DISCORD_BOT_TOKEN in ~/.hermes/.env",
        }

    wanted: dict[str, list[str]] = {}
    for item in job.get("missing") or []:
        ref = str(item.get("ref") or "")
        char_id = str(item.get("id") or "unknown")
        base = Path(ref).name
        if Path(base).suffix.lower() not in IMAGE_EXTS:
            continue
        wanted.setdefault(base.lower(), []).append(char_id)

    if not wanted:
        return {"ok": True, "token_ok": True, "copied": 0, "message": "nothing_to_fetch"}

    intents = discord.Intents.default()
    intents.message_content = True
    intents.guilds = True
    client = discord.Client(intents=intents)
    result = {"ok": True, "token_ok": True, "copied": 0, "failed": [], "message": ""}
    channel_ids = channel_ids_from_export()
    found: set[str] = set()

    @client.event
    async def on_ready() -> None:
        nonlocal result
        try:
            scanned = 0
            for cid in channel_ids:
                if len(found) >= len(wanted):
                    break
                ch = client.get_channel(cid)
                if ch is None:
                    try:
                        ch = await client.fetch_channel(cid)
                    except Exception:
                        continue
                if not hasattr(ch, "history"):
                    continue
                scanned += 1
                try:
                    async for msg in ch.history(limit=400):
                        for att in msg.attachments:
                            key = (att.filename or "").lower()
                            if key not in wanted or key in found:
                                continue
                            for char_id in wanted[key]:
                                dest_dir = PORTRAITS / char_id
                                dest_dir.mkdir(parents=True, exist_ok=True)
                                dest = dest_dir / (att.filename or key)
                                if dest.exists():
                                    found.add(key)
                                    continue
                                try:
                                    await att.save(dest)
                                    result["copied"] += 1
                                    found.add(key)
                                except Exception as e:
                                    result["failed"].append({"file": key, "error": type(e).__name__})
                            await asyncio.sleep(0.15)  # gentle on 2GB box
                        if len(found) >= len(wanted):
                            break
                except Exception as e:
                    result["failed"].append({"channel": cid, "error": type(e).__name__})
                if scanned % batch == 0:
                    await asyncio.sleep(0.4)
            still = sorted(set(wanted) - found)
            if still:
                result["failed"].extend({"file": f, "error": "not_found_in_history"} for f in still)
                result["message"] = f"scanned_channels={scanned} still_missing={len(still)}"
            else:
                result["message"] = f"scanned_channels={scanned} all_found"
        finally:
            await client.close()

    try:
        await client.start(token)
    except discord.LoginFailure:
        return {
            "ok": False,
            "token_ok": False,
            "copied": 0,
            "message": "login_failure",
            "fix": "Discord token rejected — paste a fresh bot token into ~/.hermes/.env (DISCORD_BOT_TOKEN) and campaigns/tropic-gooner/.env",
        }
    except Exception as e:
        return {
            "ok": False,
            "token_ok": True,
            "copied": result.get("copied", 0),
            "message": f"{type(e).__name__}:{e}"[:300],
            "fix": "Check Message Content Intent + bot guild membership; or re-run export_discord_lore.py --category …",
        }
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--job", required=True, help="JSON job path with {missing:[{id,ref}]}")
    ap.add_argument("--batch", type=int, default=4)
    args = ap.parse_args()
    job = json.loads(Path(args.job).read_text(encoding="utf-8"))
    result = asyncio.run(run_fetch(job, max(1, args.batch)))
    print(json.dumps(result))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
