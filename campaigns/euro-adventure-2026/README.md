# Euro Adventure 2026 (D&D)

Discord-managed European travel / adventure table. **Not** NYC Mafia × D&D (`nyc-mafia-dnd`).

## Status

- **2026-08-02:** Campaign analysis tree + Discord export on potato/PC.
- **2026-08-09:** Swamp frontier fleshed from Discord — `worldbuilding/swamp/` (Halkin-Gaul). Play clock: party **arrived** at town hall cliffhanger (2026-07-26 in `#main-rp`).
- Tableslop availability alias: `eurosluts` (see `campaigns/eurosluts/` for tracker mirror).

## Discord IDs

| Role | ID |
|------|-----|
| Guild (server) | `1265793253798576148` |
| Category (+ threads) | `1477755184607396063` |
| `#campaign-rp` (early / SmithsVille) | `1477735120252178453` |
| `#main-rp` (primary play in export) | `1495469564060893254` |
| Character sheets (players) | `1475174763533176844` |

Deep link (campaign-rp): https://discord.com/channels/1265793253798576148/1477735120252178453

## Repo layout

| Path | Purpose |
|------|---------|
| `discord.json` | Canonical Discord IDs |
| `discord-export/` | Bot export markdown + attachments (from `export_discord_lore.py`) |
| `analysis/` | Extracts + summaries (`discord-swamp-extract.md`) |
| `worldbuilding/swamp/` | Halkin-Gaul + approach bible (canon vs **[proposal]**) |
| `characters/` | One markdown per PC from sheets channel (optional) |
| `players-characters.md` | Player ↔ character index |
| `LOCKS.md` | Facts locked from Discord only; else UNCONFIRMED |

## Export (linuxbox)

```bash
cd ~/agent-dump/campaigns/euro-adventure-2026
# Token: DISCORD_BOT_TOKEN (hunter profile or tropic .env) — do not commit
python3 export_discord_lore.py --guild 1265793253798576148 --category 1477755184607396063
python3 export_discord_lore.py --channels 1475174763533176844
```

Probe visibility (no message bodies): `python3 scripts/linuxbox/campaign-discord-probe.py`
