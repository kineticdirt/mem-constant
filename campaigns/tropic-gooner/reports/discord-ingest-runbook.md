# Discord ingest runbook — Tropic Gooner / Hunter

**Category ID (RP):** `1137592539076120666`  
**Live bot:** Hermes **`hunter-reckoning`** profile — see `docs/agents/discord-hunter-linuxbox.md`

## Prerequisites

1. Discord bot with **Message Content Intent** + **Server Members Intent**
2. Token in `campaigns/tropic-gooner/.env` (and `DISCORD_BOT_TOKEN` in `~/.hermes/.env` for gateway):
   ```
   DISCORD_TOKEN=...
   DISCORD_GUILD_ID=...
   DISCORD_CATEGORY_ID=1137592539076120666
   DISCORD_ALLOWED_USERS=...   # in ~/.hermes/.env only
   ```
3. `pip install discord.py python-dotenv` (on linuxbox)

## Connect bot to agent (live RP)

```bash
bash ~/agent-dump/scripts/linuxbox/configure-hermes-discord-hunter.sh
hunter-reckoning gateway install
hunter-reckoning gateway restart
```

## Batch export commands

```bash
cd campaigns/tropic-gooner
python export_discord_lore.py --list
python export_discord_lore.py --guild GUILD_ID --category 1137592539076120666
python export_discord_lore.py --channels CHANNEL_ID ...
```

Output → `discord-export/<server>-<id>/.../messages.md` (+ attachments subdirs).

## Canon scope

- **Category:** `1137592539076120666` (all text channels under it — auto-discovered by configure script)
- **Guild ID:** _paste after `--list`_
- **OOC channels:** document exclusions here when known

## linuxbox lane

- **Live:** Discord gateway on `hunter-reckoning` pod
- **Archive:** Hermes RP pod or manual export; scheduler does not auto-export until token present
- **HOLD:** if no token → `human-inbox.json` (do not spam)
