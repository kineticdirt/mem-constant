# NYC Mafia × D&D — Discord ingest (Big Apples)

**Category:** `1528215677272330300` (Big Apples)  
**Guild:** `1012888284222988409`  
**Live Q&A:** same bot `AI_RP_Master` / Hermes profile `hunter-reckoning` (DeepSeek V4 Flash) — see `docs/agents/discord-hunter-linuxbox.md` § NYC.

## Why

Ingest channel + thread history so agents can **track what players do** (sheets, OOC, lore questions, rolls) without re-scraping Discord every tick. Export lands under:

`campaigns/nyc-mafia-dnd/discord-export/` (gitignored runtime on potato)

## One-shot / recurring

```bash
# on linuxbox
bash ~/agent-dump/scripts/linuxbox/nyc-discord-ingest.sh --list
bash ~/agent-dump/scripts/linuxbox/nyc-discord-ingest.sh
```

Uses `export_discord_lore.py` (same pattern as tropic-gooner). Token is copied from `~/.hermes/profiles/hunter-reckoning/.env` into gitignored `campaigns/nyc-mafia-dnd/.env`.

**Cadence:** daily cron recommended (category is small vs Tropic). Stamp: `~/.hermes/state/nyc-discord-ingest-last.json`. Logs: `/mnt/archive/logs/nyc-discord-ingest/`.

Install (idempotent) example:

```bash
crontab -l | grep -q nyc-discord-ingest || (
  crontab -l 2>/dev/null
  echo "25 6 * * * bash $HOME/agent-dump/scripts/linuxbox/nyc-discord-ingest.sh >>/mnt/archive/logs/nyc-discord-ingest/cron.log 2>&1"
) | crontab -
```

## Agent read path

- Hermes Discord soul: `campaigns/nyc-mafia-dnd/SOUL-discord-qa.md` (female GM helper; 5e external + NYC homebrew; GM `265909664590331915` always obeyed)
- Slash: `/skill what-do-i-know`, `/skill archive` (skills under `hermes-skills/`)
- Think / Cursor: prefer latest `discord-export/**/messages.md` + `characters-ba` for sheet tracking
- Do **not** commit `discord-export/` or `.env`

## Smoke (Q&A)

Webhook smoke is flaky (bot-message filters). Prefer a real player/GM message in `#general-ooc-ba`. Leftover `[SMOKE…]` / home-channel nags should be deleted.
