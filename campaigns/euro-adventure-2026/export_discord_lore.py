"""
Export Discord channel history (text + attachments) into this folder.

Usage:
  python export_discord_lore.py --list
  python export_discord_lore.py --channels 123456789012345678 987654321098765432
  python export_discord_lore.py --guild 1012888284222988409 --category 1469873840703144060

Requires in .env (any one of these names):
  DISCORD_TOKEN=your_bot_token
  (alternatives: DISCORD_BOT_TOKEN, BOT_TOKEN)

Optional:
  DISCORD_GUILD_ID=...   If set, --list only shows that guild's channels.

Threads:
  By default, category/channel exports also walk active + archived threads under each
  text channel into .../threads/<thread-name-id>/messages.md
  Use --no-threads to disable.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import discord
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
EXPORT_ROOT = ROOT / "discord-export"


def _sanitize_segment(name: str, max_len: int = 80) -> str:
    s = re.sub(r'[<>:"/\\|?*]', "_", name.strip() or "channel")
    s = s.replace("\n", " ")
    return s[:max_len].rstrip() or "channel"


async def save_attachment(att: discord.Attachment, dest_dir: Path) -> Path | None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    base = _sanitize_segment(att.filename or "file")
    path = dest_dir / base
    if path.exists():
        stem, suf = path.stem, path.suffix
        for i in range(1, 10_000):
            candidate = dest_dir / f"{stem}_{i}{suf}"
            if not candidate.exists():
                path = candidate
                break
    try:
        await att.save(path)
        return path
    except Exception:
        return None


def _format_message(m: discord.Message, attachment_rel_paths: list[str]) -> str:
    ts = m.created_at
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    stamp = ts.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    author = m.author.display_name if m.author else "unknown"
    lines = [f"### {stamp} — {author}", ""]
    if m.content:
        lines.append(m.content)
        lines.append("")
    for rel in attachment_rel_paths:
        lines.append(f"- Attachment: `{rel}`")
    if attachment_rel_paths:
        lines.append("")
    lines.append("---")
    lines.append("")
    return "\n".join(lines)


async def cmd_list(client: discord.Client, guild_id: int | None) -> None:
    if guild_id is not None:
        g = client.get_guild(guild_id)
        if not g:
            print(f"Guild id {guild_id} not found (bot not in server or wrong id).")
            return
        guilds = [g]
    else:
        guilds = list(client.guilds)

    if not guilds:
        print("Bot is in no servers. Invite the bot and try again.")
        return

    for g in guilds:
        print(f"\n## Guild: {g.name!r}  id={g.id}\n")
        for ch in sorted(g.text_channels, key=lambda c: c.position):
            topic = (ch.topic or "").split("\n")[0][:120]
            extra = f"  |  {topic}" if topic else ""
            print(f"  #{ch.name}  id={ch.id}{extra}")


async def _export_message_history(
    client: discord.Client,
    ch: discord.abc.Messageable,
    out_dir: Path,
) -> tuple[Path, int]:
    """Write messages.md + attachments for a TextChannel or Thread. Returns (path, message_count)."""
    att_dir = out_dir / "attachments"
    out_dir.mkdir(parents=True, exist_ok=True)

    if isinstance(ch, discord.Thread):
        parent = ch.parent
        pname = f"#{parent.name}" if parent and hasattr(parent, "name") else "?"
        header_lines = [
            f"# Thread: {ch.name}",
            "",
            f"- **Guild:** {ch.guild.name if ch.guild else '?'}",
            f"- **Parent:** {pname} (`{ch.parent_id}`)",
            f"- **Thread id:** `{ch.id}`",
            f"- **Exported:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
            "",
            "---",
            "",
        ]
    elif isinstance(ch, discord.TextChannel):
        header_lines = [
            f"# Channel: #{ch.name}",
            "",
            f"- **Guild:** {ch.guild.name if ch.guild else '?'}",
            f"- **Channel id:** `{ch.id}`",
            f"- **Exported:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
            "",
            "---",
            "",
        ]
    else:
        header_lines = [
            f"# Messages: {getattr(ch, 'id', '?')}",
            "",
            f"- **Exported:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
            "",
            "---",
            "",
        ]

    parts: list[str] = header_lines
    count = 0
    async for m in ch.history(limit=None, oldest_first=True):
        count += 1
        rels: list[str] = []
        for att in m.attachments:
            saved = await save_attachment(att, att_dir)
            if saved:
                try:
                    rel = saved.relative_to(out_dir).as_posix()
                except ValueError:
                    rel = saved.name
                rels.append(rel)

        parts.append(_format_message(m, rels))

    md_path = out_dir / "messages.md"
    md_path.write_text("\n".join(parts), encoding="utf-8")
    return md_path, count


async def _export_threads_under_channel(
    client: discord.Client,
    parent: discord.TextChannel,
    parent_out_dir: Path,
) -> list[dict]:
    """Export active + archived threads under a text channel into parent_out_dir/threads/<name-id>/."""
    rows: list[dict] = []
    threads_root = parent_out_dir / "threads"
    seen: set[int] = set()

    async def one_thread(t: discord.Thread) -> None:
        if t.id in seen:
            return
        seen.add(t.id)
        safe = _sanitize_segment(f"{t.name}-{t.id}")
        out = threads_root / safe
        try:
            md_path, count = await _export_message_history(client, t, out)
            rel = md_path.relative_to(EXPORT_ROOT).as_posix()
            print(
                f"    thread #{parent.name} / {t.name!r} ({t.id}): {count} msgs -> {md_path}",
                flush=True,
            )
            rows.append(
                {
                    "thread_id": t.id,
                    "name": t.name,
                    "parent": parent.name,
                    "messages_path": rel,
                    "message_count": count,
                }
            )
        except Exception as e:
            print(f"    thread {t.id} skip: {e}", flush=True)

    for t in list(parent.threads):
        await one_thread(t)
    try:
        async for t in parent.archived_threads(limit=None):
            await one_thread(t)
    except Exception as e:
        print(f"  archived_threads #{parent.name}: {e}", flush=True)
    return rows


async def cmd_export(
    client: discord.Client,
    channel_ids: list[int],
    *,
    base_dir: Path | None = None,
    export_threads: bool = True,
) -> tuple[list[dict], list[dict]]:
    """
    Export each channel id. If base_dir is set, each channel goes under base_dir/<name-id>/.
    When export_threads is True, also exports active + archived threads under .../threads/.
    Returns (channel_rows, thread_rows).
    """
    EXPORT_ROOT.mkdir(parents=True, exist_ok=True)
    root = base_dir or EXPORT_ROOT
    root.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    thread_rows: list[dict] = []

    for cid in channel_ids:
        ch = client.get_channel(cid)
        if ch is None:
            try:
                ch = await client.fetch_channel(cid)
            except Exception as e:
                print(f"Skip {cid}: cannot access channel ({e})")
                continue

        if not isinstance(ch, discord.TextChannel):
            print(f"Skip {cid}: not a text channel ({type(ch).__name__})")
            continue

        safe_name = _sanitize_segment(f"{ch.name}-{ch.id}")
        out_dir = root / safe_name
        md_path, count = await _export_message_history(client, ch, out_dir)
        rel = md_path.relative_to(EXPORT_ROOT).as_posix()
        print(f"Exported #{ch.name} ({ch.id}): {count} messages -> {md_path}")
        rows.append(
            {
                "channel_id": ch.id,
                "name": ch.name,
                "messages_path": rel,
                "message_count": count,
            }
        )
        if export_threads:
            tr = await _export_threads_under_channel(client, ch, out_dir)
            thread_rows.extend(tr)

    return rows, thread_rows


async def _count_messages(channel: discord.abc.Messageable, *, limit: int | None = None) -> int:
    n = 0
    async for _ in channel.history(limit=limit, oldest_first=True):
        n += 1
    return n


async def _diagnose_one_messageable(
    label: str,
    ch: discord.abc.Messageable,
    *,
    client: discord.Client,
) -> None:
    """Try to read history; surface Forbidden vs empty vs errors."""
    lines = [label]
    try:
        n = 0
        async for m in ch.history(limit=10, oldest_first=False):
            n += 1
            lines.append(f"  msg {n}: id={m.id} author={m.author!s}")
        if n == 0:
            lines.append("  history(limit=10): 0 messages returned")
    except discord.Forbidden as e:
        lines.append(f"  FORBIDDEN (bot cannot read this channel): {e}")
    except discord.HTTPException as e:
        lines.append(f"  HTTP error: {e}")
    except Exception as e:
        lines.append(f"  error: {type(e).__name__}: {e}")

    cid = getattr(ch, "id", None)
    if cid is not None:
        try:
            fresh = await client.fetch_channel(cid)
            lm = getattr(fresh, "last_message_id", None)
            lines.append(f"  after fetch_channel: type={type(fresh).__name__} last_message_id={lm}")
        except Exception as e:
            lines.append(f"  fetch_channel failed: {e}")

    print("\n".join(lines) + "\n")


async def cmd_diagnose_category(
    client: discord.Client,
    guild_id: int,
    category_id: int,
) -> None:
    """
    Find why export shows 0: wrong type, 403, threads, duplicate names, or API empty.
    """
    cat_ch = client.get_channel(category_id)
    if cat_ch is None:
        try:
            cat_ch = await client.fetch_channel(category_id)
        except Exception as e:
            raise SystemExit(f"Cannot load category {category_id}: {e}") from e

    if not isinstance(cat_ch, discord.CategoryChannel):
        raise SystemExit(f"Channel {category_id} is not a category (got {type(cat_ch).__name__}).")

    cat_guild_id = getattr(cat_ch, "guild_id", None)
    if cat_guild_id is None and cat_ch.guild is not None:
        cat_guild_id = cat_ch.guild.id
    if cat_guild_id != guild_id:
        raise SystemExit(
            f"Category belongs to guild {cat_guild_id}, not {guild_id}. Fix --guild or --category."
        )

    guild = client.get_guild(guild_id)
    if guild is None:
        raise SystemExit(f"Guild {guild_id} not in bot cache.")

    if getattr(guild, "large", False) and not getattr(guild, "chunked", True):
        try:
            await guild.chunk()
        except Exception:
            pass

    cat_members = [c for c in guild.channels if getattr(c, "category_id", None) == category_id]
    cat_members.sort(key=lambda c: c.position)

    print(f"\n=== Diagnose: {cat_ch.name!r} in {guild.name!r} (guild id={guild.id}) ===\n")

    print(
        "Section A — Every channel in this category (all types). "
        "Voice/forum content does not appear in TextChannel export.\n"
    )
    for c in cat_members:
        t = getattr(c, "type", None)
        lm = getattr(c, "last_message_id", None)
        print(f"  {type(c).__name__}  type={t!s}  id={c.id}  name={c.name!r}  last_message_id={lm}")

    names_here = {c.name for c in cat_members if hasattr(c, "name")}
    print("\nSection B — Duplicate channel names elsewhere (compare IDs to your client):\n")
    dup_any = False
    for name in sorted(names_here):
        matches = [x for x in guild.channels if getattr(x, "name", None) == name]
        if len(matches) > 1:
            dup_any = True
            for x in matches:
                cat = getattr(x, "category", None)
                cname = getattr(cat, "name", None) if cat else None
                print(f"  #{name!r} id={x.id} category={cname!r}")
    if not dup_any:
        print("  (no duplicate names in this server)")

    print(
        "\nSection C — Text channels + deep probe (403 = permission; empty = API returned nothing)\n"
    )

    text_channels = [c for c in cat_members if isinstance(c, discord.TextChannel)]
    for ch in text_channels:
        main_count = await _count_messages(ch, limit=None)
        last = ch.last_message_id
        print(
            f"#{ch.name}  id={ch.id}  last_message_id={last}  full_history_count={main_count}"
        )
        await _diagnose_one_messageable(f"  deep probe #{ch.name}", ch, client=client)

        active = list(ch.threads)
        print(f"  active threads: {len(active)}")
        for t in active:
            try:
                tc = await _count_messages(t, limit=None)
            except Exception as e:
                tc = f"(error: {e})"
            print(f"    thread {t.name!r} id={t.id}: {tc} message(s)")
        try:
            async for t in ch.archived_threads(limit=25):
                try:
                    tc = await _count_messages(t, limit=None)
                except Exception as e:
                    tc = f"(error: {e})"
                print(f"    archived thread {t.name!r} id={t.id}: {tc} message(s)")
        except Exception as e:
            print(f"  archived_threads: {e}")

    print("Section D — Voice channels (text-in-voice uses these objects):\n")
    for c in cat_members:
        if isinstance(c, discord.VoiceChannel):
            await _diagnose_one_messageable(f"VOICE #{c.name} id={c.id}", c, client=client)

    forum_cls = getattr(discord, "ForumChannel", None)
    if forum_cls is not None:
        print("Section E — Forum channels (posts are threads, not parent history):\n")
        for c in cat_members:
            if isinstance(c, forum_cls):
                print(f"FORUM #{c.name} id={c.id}")
                try:
                    async for th in c.archived_threads(limit=15):
                        n = await _count_messages(th, limit=None)
                        print(f"  archived post-thread {th.name!r} id={th.id}: {n} msgs")
                except Exception as e:
                    print(f"  archived_threads: {e}")
                try:
                    for th in c.threads:
                        n = await _count_messages(th, limit=None)
                        print(f"  active post-thread {th.name!r} id={th.id}: {n} msgs")
                except Exception as e:
                    print(f"  threads: {e}")

    print("=== end diagnose ===\n")


async def cmd_export_category(
    client: discord.Client,
    guild_id: int,
    category_id: int,
    *,
    export_threads: bool = True,
) -> None:
    cat_ch = client.get_channel(category_id)
    if cat_ch is None:
        try:
            cat_ch = await client.fetch_channel(category_id)
        except Exception as e:
            raise SystemExit(f"Cannot load category {category_id}: {e}") from e

    if not isinstance(cat_ch, discord.CategoryChannel):
        raise SystemExit(f"Channel {category_id} is not a category (got {type(cat_ch).__name__}).")

    cat_guild_id = getattr(cat_ch, "guild_id", None)
    if cat_guild_id is None and cat_ch.guild is not None:
        cat_guild_id = cat_ch.guild.id
    if cat_guild_id != guild_id:
        raise SystemExit(
            f"Category belongs to guild {cat_guild_id}, not {guild_id}. Fix --guild or --category."
        )

    # Must use cached guild so .channels is populated; fetch_guild() is partial and has no channels.
    guild = client.get_guild(guild_id)
    if guild is None:
        msg = (
            f"Guild {guild_id} not in bot cache. Is the bot in this server? "
            "Invite the bot and ensure the server id matches."
        )
        (ROOT / "export_status.txt").write_text(msg + "\n", encoding="utf-8")
        raise SystemExit(msg)

    if getattr(guild, "large", False) and not getattr(guild, "chunked", True):
        try:
            await guild.chunk()
        except Exception:
            pass

    # Prefer guild-wide scan: CategoryChannel.channels is often empty until cache fills.
    text_channels = [
        c
        for c in guild.channels
        if isinstance(c, discord.TextChannel) and c.category_id == category_id
    ]
    text_channels.sort(key=lambda c: c.position)
    text_ids = [c.id for c in text_channels]

    if not text_ids:
        # Helpful when cache has no members under category (wrong guild or id).
        hint = (
            f"No text channels with category_id={category_id} in guild {guild.name!r}. "
            f"Guild has {len(guild.channels)} channel(s). "
            "Confirm the category id (Developer Mode: right-click category → Copy ID)."
        )
        (ROOT / "export_status.txt").write_text(hint + "\n", encoding="utf-8")
        print(hint, flush=True)
        return

    cat_folder = _sanitize_segment(f"{cat_ch.name}-{category_id}")
    base = EXPORT_ROOT / cat_folder
    base.mkdir(parents=True, exist_ok=True)

    print(
        f"Category {cat_ch.name!r} in {guild.name!r}: {len(text_ids)} text channel(s) -> {base}"
    )

    rows, thread_rows = await cmd_export(
        client, text_ids, base_dir=base, export_threads=export_threads
    )

    total_msgs = sum(r["message_count"] for r in rows)
    total_thread_msgs = sum(r["message_count"] for r in thread_rows)
    summary_lines = [
        f"# Category export: {cat_ch.name}",
        "",
        f"- **Guild:** {guild.name} (`{guild.id}`)",
        f"- **Category:** {cat_ch.name} (`{category_id}`)",
        f"- **Exported:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        f"- **Text channels:** {len(rows)}",
        f"- **Threads exported:** {len(thread_rows)}",
        f"- **Total messages (channels):** {total_msgs}",
        f"- **Total messages (threads):** {total_thread_msgs}",
        "",
        "## Channels",
        "",
        "| # | Channel | Messages | Export |",
        "|---|---------|----------|--------|",
    ]
    for i, r in enumerate(rows, 1):
        summary_lines.append(
            f"| {i} | #{r['name']} | {r['message_count']} | `{r['messages_path']}` |"
        )
    if thread_rows:
        summary_lines.extend(
            [
                "",
                "## Threads",
                "",
                "| Parent | Thread | Messages | Export |",
                "|--------|--------|----------|--------|",
            ]
        )
        for tr in sorted(thread_rows, key=lambda x: (x["parent"], x["name"])):
            summary_lines.append(
                f"| #{tr['parent']} | {tr['name']!r} | {tr['message_count']} | `{tr['messages_path']}` |"
            )
    summary_lines.extend(
        [
            "",
            "## Analysis notes",
            "",
            "- Summarize themes per channel, then cross-link recurring factions, locations, and tone.",
            "- Channel text: `messages.md`. Thread text: `threads/<thread-name-id>/messages.md`.",
            "",
        ]
    )
    summary_path = base / "category-summary.md"
    summary_path.write_text("\n".join(summary_lines), encoding="utf-8")
    (ROOT / "export_status.txt").write_text(
        f"OK: {summary_path.relative_to(ROOT).as_posix()}\n", encoding="utf-8"
    )
    print(f"Wrote {summary_path}", flush=True)


def _load_token() -> str:
    load_dotenv(ROOT / ".env")
    load_dotenv()
    for key in ("DISCORD_TOKEN", "DISCORD_BOT_TOKEN", "BOT_TOKEN"):
        v = os.environ.get(key, "").strip()
        if v:
            return v
    return ""


async def async_main(args: argparse.Namespace) -> None:
    token = _load_token()
    if not token:
        raise SystemExit(
            "No Discord token found. In .env set DISCORD_TOKEN (or DISCORD_BOT_TOKEN / BOT_TOKEN)"
        )

    guild_id_raw = os.environ.get("DISCORD_GUILD_ID", "").strip()
    guild_id = int(guild_id_raw) if guild_id_raw.isdigit() else None

    intents = discord.Intents.default()
    intents.guilds = True
    intents.messages = True
    intents.message_content = True

    client = discord.Client(intents=intents)

    @client.event
    async def on_ready() -> None:
        try:
            if args.list:
                await cmd_list(client, guild_id)
            elif args.diagnose and args.server_id is not None and args.category_id is not None:
                await cmd_diagnose_category(client, args.server_id, args.category_id)
            elif args.server_id is not None and args.category_id is not None:
                await cmd_export_category(
                    client,
                    args.server_id,
                    args.category_id,
                    export_threads=not args.no_threads,
                )
            elif args.channels:
                _rows, _threads = await cmd_export(
                    client,
                    args.channels,
                    export_threads=not args.no_threads,
                )
            else:
                print("Use --list, --channels <id> ..., or --guild & --category ...")
        finally:
            await asyncio.sleep(0.2)
            await client.close()

    # discord.Client: use start() directly; async-with can short-circuit on some setups.
    await client.start(token)


def main() -> None:
    p = argparse.ArgumentParser(description="Export Discord lore to markdown + attachments.")
    p.add_argument("--list", action="store_true", help="List guilds and text channels with ids.")
    p.add_argument(
        "--guild",
        type=int,
        dest="server_id",
        metavar="SERVER_ID",
        help="Server id (must pair with --category).",
    )
    p.add_argument(
        "--category",
        type=int,
        dest="category_id",
        metavar="CATEGORY_ID",
        help="Category id: export all text channels in this category into one folder + category-summary.md.",
    )
    p.add_argument(
        "--diagnose",
        action="store_true",
        help="With --guild and --category: print main-channel vs thread message counts (no export).",
    )
    p.add_argument(
        "--channels",
        nargs="+",
        type=int,
        metavar="ID",
        help="One or more text channel ids to export (full history, oldest first).",
    )
    p.add_argument(
        "--no-threads",
        action="store_true",
        help="Do not export active/archived threads under each text channel.",
    )
    args = p.parse_args()
    if (args.server_id is None) ^ (args.category_id is None):
        p.error("--guild and --category must be used together.")
    if args.channels and (args.server_id is not None or args.category_id is not None):
        p.error("Use either --channels or (--guild and --category), not both.")
    if args.list and (args.channels or args.server_id is not None):
        p.error("--list cannot be combined with export options.")
    if args.diagnose:
        if args.server_id is None or args.category_id is None:
            p.error("--diagnose requires --guild and --category")
        if args.channels:
            p.error("Do not combine --diagnose with --channels")
    asyncio.run(async_main(args))


if __name__ == "__main__":
    main()
