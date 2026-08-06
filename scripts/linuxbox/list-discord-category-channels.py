#!/usr/bin/env python3
"""List Discord channels in a category.

Usage:
    python3 list-discord-category-channels.py <category_id>

Outputs shell-friendly KEY=value lines to stdout (no secrets).
Exits non-zero if the token is missing or the category is unreachable.

Uses the shared _discord_token() resolver from discord_token.py.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "linuxbox"))

from discord_token import _discord_token


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: list-discord-category-channels.py <category_id>", file=sys.stderr)
        return 1

    category_id = sys.argv[1]
    token = _discord_token()

    try:
        import discord
    except ImportError:
        print("discord.py not installed", file=sys.stderr)
        return 2

    intents = discord.Intents.default()
    intents.guilds = True
    client = discord.Client(intents=intents)

    channels: list[dict] = []

    async def run() -> None:
        try:
            await client.start(token)
        except discord.LoginFailure:
            print("login_failure", file=sys.stderr)
            return

        guild = client.guilds[0] if client.guilds else None
        if guild is None:
            print("no_guild", file=sys.stderr)
            await client.close()
            return

        cat = guild.get_channel(int(category_id))
        if cat is None:
            try:
                cat = await client.fetch_channel(int(category_id))
            except Exception:
                print(f"category_not_found:{category_id}", file=sys.stderr)
                await client.close()
                return

        for ch in cat.channels:
            print(f"DISCORD_CHANNEL_{ch.name}={ch.id}")
            channels.append({"name": ch.name, "id": ch.id, "type": str(ch.type)})

        await client.close()

    import asyncio
    asyncio.run(run())

    if not channels:
        print(f"no_channels_in_category:{category_id}", file=sys.stderr)
        return 3

    return 0


if __name__ == "__main__":
    raise SystemExit(main())