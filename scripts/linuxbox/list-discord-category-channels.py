#!/usr/bin/env python3
"""List text channels under a Discord category; emit env lines for Hermes gateway."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import discord
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
CAMPAIGN_ENV = ROOT / "campaigns" / "tropic-gooner" / ".env"


def _token() -> str:
    load_dotenv(CAMPAIGN_ENV)
    load_dotenv(Path.home() / ".hermes" / ".env")
    for key in ("DISCORD_BOT_TOKEN", "DISCORD_TOKEN", "BOT_TOKEN"):
        v = os.environ.get(key, "").strip()
        if v:
            return v
    raise SystemExit("No Discord token in campaigns/tropic-gooner/.env or ~/.hermes/.env")


async def main(category_id: int) -> int:
    token = _token()
    intents = discord.Intents.default()
    intents.message_content = True
    intents.guilds = True
    client = discord.Client(intents=intents)

    @client.event
    async def on_ready() -> None:
        cat = client.get_channel(category_id)
        if cat is None:
            cat = await client.fetch_channel(category_id)
        if not isinstance(cat, discord.CategoryChannel):
            print(f"ERROR: {category_id} is not a category (got {type(cat).__name__})", file=sys.stderr)
            await client.close()
            return

        guild = cat.guild
        channels = [c for c in cat.channels if isinstance(c, discord.TextChannel)]
        ids = [str(c.id) for c in sorted(channels, key=lambda x: x.position)]

        print(f"# Guild: {guild.name} ({guild.id})")
        print(f"# Category: {cat.name} ({cat.id})")
        print(f"# Text channels: {len(channels)}")
        for c in channels:
            print(f"#   #{c.name}  id={c.id}")
        print()
        if ids:
            joined = ",".join(ids)
            print(f"DISCORD_ALLOWED_CHANNELS={joined}")
            print(f"DISCORD_FREE_RESPONSE_CHANNELS={joined}")
            print("DISCORD_REQUIRE_MENTION=false")
            print("DISCORD_AUTO_THREAD=false")
            print("DISCORD_NO_THREAD_CHANNELS=" + joined)
        else:
            print("# No text channels in category", file=sys.stderr)
        await client.close()

    await client.start(token)
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(f"usage: {sys.argv[0]} CATEGORY_ID")
    raise SystemExit(asyncio.run(main(int(sys.argv[1]))))
