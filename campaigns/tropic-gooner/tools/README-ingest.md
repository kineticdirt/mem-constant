# Discord character ingest (canonical)

**Use only:** `tools/ingest_discord_sheets.py` — keys files by **character `Name:`** from sheet body, merges threads/private channels.

**Do not run** `campaigns/tropic-gooner/ingest_discord_sheets.py` (legacy, linuxbox-only) — it keys by **Discord author** (`alistrahd.md`) and creates duplicates alongside the tools ingest (`cassidy-catharine-cece.md`).

## After ingest

```bash
python tools/sync_character_registry.py --write
```

Links author ↔ character, sets `canonical` `story_path`, lists `duplicate_paths` / `aliases` in `characters-registry.json`. Does not delete files.

## Agent

Tropic Gooner pod: run sync after any ingest; post Inbox if `player_name` or `discord_user_id` still empty on active PCs.
