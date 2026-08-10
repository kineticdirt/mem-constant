#!/usr/bin/env python3
"""Probe Discord visibility + last-activity for campaign trackers.

Writes agents/state/campaign-discord-status.json (no tokens, no message bodies).
Uses shared `_discord_token()` from `discord_token.py` (process env, then hunter
profile → tropic `.env` → `~/.hermes/.env`; keys `DISCORD_BOT_TOKEN` then
`DISCORD_TOKEN`).

Specs: campaigns/*/discord.json, else tracker.json discord{} for TRACKED ids.

Usage (on potato):
  python3 scripts/linuxbox/campaign-discord-probe.py
"""
from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATUS_PATH = ROOT / "agents" / "state" / "campaign-discord-status.json"
TRACKED_IDS = ("eurosluts", "nyc-mafia-dnd", "tropic-gooner")

sys.path.insert(0, str(ROOT / "scripts" / "linuxbox"))
from discord_token import _discord_token


def load_token() -> str | None:
    """Delegate to shared _discord_token(); return None on SystemExit."""
    try:
        return _discord_token()
    except SystemExit:
        return None


def load_specs() -> list[dict]:
    """Prefer discord.json; fall back to tracker.json discord block."""
    by_id: dict[str, dict] = {}
    for cid in TRACKED_IDS:
        camp = ROOT / "campaigns" / cid
        disc_path = camp / "discord.json"
        track_path = camp / "tracker.json"
        spec: dict = {"campaign_id": cid, "label": cid}
        if disc_path.is_file():
            data = json.loads(disc_path.read_text(encoding="utf-8"))
            spec.update(data)
            spec["_path"] = str(disc_path)
        elif track_path.is_file():
            t = json.loads(track_path.read_text(encoding="utf-8"))
            d = t.get("discord") or {}
            spec.update(
                {
                    "guild_id": d.get("guild_id"),
                    "category_id": d.get("category_id"),
                    "channel_id": d.get("channel_id"),
                    "label": t.get("title") or cid,
                    "notes": d.get("notes"),
                }
            )
            spec["_path"] = str(track_path)
        else:
            continue
        spec["campaign_id"] = spec.get("campaign_id") or cid
        by_id[spec["campaign_id"]] = spec
    return [by_id[k] for k in TRACKED_IDS if k in by_id]


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def msg_created_iso(msg) -> str | None:
    created = getattr(msg, "created_at", None)
    if created is None:
        return None
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return created.astimezone(timezone.utc).isoformat()


async def probe_one(client, spec: dict) -> dict:
    cid = spec.get("campaign_id") or "unknown"
    guild_id = spec.get("guild_id")
    category_id = spec.get("category_id")
    channel_id = spec.get("channel_id")
    row = {
        "campaign_id": cid,
        "label": spec.get("label") or cid,
        "guild_id": guild_id,
        "category_id": category_id,
        "channel_id": channel_id,
        "ok": False,
        "status": "unknown",
        "detail": "",
        "threads": 0,
        "channel_name": None,
        "category_name": None,
        "guild_name": None,
        "last_message_id": None,
        "last_message_at": None,
        "discord_url": None,
    }
    if not guild_id or not channel_id:
        row["status"] = "needs_ids"
        row["detail"] = "guild_id / channel_id not set"
        return row

    try:
        gid = int(guild_id)
        ch_id = int(channel_id)
        cat_id = int(category_id) if category_id else None
    except (TypeError, ValueError):
        row["status"] = "bad_ids"
        row["detail"] = "IDs must be numeric snowflakes"
        return row

    row["discord_url"] = f"https://discord.com/channels/{gid}/{ch_id}"

    guild = client.get_guild(gid)
    if guild is None:
        try:
            guild = await client.fetch_guild(gid)
        except Exception as e:
            row["status"] = "guild_unreachable"
            row["detail"] = f"bot cannot see guild ({type(e).__name__})"
            return row

    row["guild_name"] = getattr(guild, "name", None)

    ch = guild.get_channel(ch_id) if hasattr(guild, "get_channel") else None
    if ch is None:
        try:
            ch = await client.fetch_channel(ch_id)
        except Exception as e:
            row["status"] = "channel_unreachable"
            row["detail"] = f"bot cannot see channel ({type(e).__name__})"
            return row

    row["channel_name"] = getattr(ch, "name", None)

    if cat_id:
        cat = guild.get_channel(cat_id) if hasattr(guild, "get_channel") else None
        if cat is None:
            try:
                cat = await client.fetch_channel(cat_id)
            except Exception:
                cat = None
        if cat is not None:
            row["category_name"] = getattr(cat, "name", None)
            threads = 0
            try:
                for t in getattr(guild, "threads", []) or []:
                    parent = getattr(t, "parent_id", None)
                    if parent == cat_id or parent == ch_id:
                        threads += 1
            except Exception:
                pass
            row["threads"] = threads

    try:
        async for msg in ch.history(limit=1):
            row["last_message_id"] = str(msg.id)
            row["last_message_at"] = msg_created_iso(msg)
            break
    except Exception as e:
        row["detail"] = f"history blocked ({type(e).__name__})"
        row["status"] = "partial"
        row["ok"] = True
        return row

    row["ok"] = True
    row["status"] = "ok"
    row["detail"] = "bot can see guild + channel"
    return row


async def main() -> int:
    token = load_token()
    if not token:
        STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
        STATUS_PATH.write_text(
            json.dumps(
                {
                    "ok": False,
                    "error": "no_discord_token",
                    "updated_at": iso_now(),
                    "campaigns": [],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print("no_discord_token", file=sys.stderr)
        return 2

    try:
        import discord
    except ImportError:
        print("discord.py not installed", file=sys.stderr)
        return 3

    intents = discord.Intents.default()
    intents.message_content = True
    intents.guilds = True
    client = discord.Client(intents=intents)
    specs = load_specs()
    results: list[dict] = []

    @client.event
    async def on_ready():
        try:
            for spec in specs:
                results.append(await probe_one(client, spec))
        finally:
            await client.close()

    try:
        await client.start(token)
    except discord.LoginFailure:
        STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
        STATUS_PATH.write_text(
            json.dumps(
                {
                    "ok": False,
                    "error": "login_failure",
                    "updated_at": iso_now(),
                    "campaigns": [],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print("login_failure", file=sys.stderr)
        return 4

    payload = {
        "ok": all(r.get("ok") or r.get("status") == "needs_ids" for r in results)
        if results
        else False,
        "updated_at": iso_now(),
        "campaigns": results,
    }
    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATUS_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    # Player-safe summary only (no message content).
    summary = [
        {
            "id": r.get("campaign_id"),
            "status": r.get("status"),
            "channel": r.get("channel_name"),
            "last_at": r.get("last_message_at"),
        }
        for r in results
    ]
    print(json.dumps({"wrote": str(STATUS_PATH), "n": len(results), "ok": payload["ok"], "summary": summary}))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
