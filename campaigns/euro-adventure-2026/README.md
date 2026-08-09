# Euro Adventure 2026 (D&D)

Discord-managed European travel / adventure table. **Not** NYC Mafia × D&D (`nyc-mafia-dnd`).

## Status

- **2026-08-02:** Campaign analysis tree + Discord export on potato/PC.
- **2026-08-09:** Swamp frontier fleshed — `worldbuilding/swamp/` (Halkin-Gaul). Play clock: party **arrived** at town hall cliffhanger (**2026-07-26** in `#main-rp`).
- **2026-08-09:** Discord re-ingest EXIT 0 — still no post-arrival play (`discord-export/SNAPSHOT-2026-08-09.md`).
- **2026-08-09:** Next arc prep — `worldbuilding/swamp/NEXT-ARC-HALKIN-GAUL.md` (wraith + necromancer **[proposal]** + adult NC seeds 18+); `analysis/timeline.md` + `define-with-gm.md`; `prep/` pointers.
- Player portal: **https://campaigns.tableslop.org/c/eurosluts** (alias `/c/euro`) — tracker mirror `campaigns/eurosluts/`.

## Start here (GM)

1. [`LOCKS.md`](./LOCKS.md) — Discord-cited only  
2. [`analysis/timeline.md`](./analysis/timeline.md) — what happened  
3. [`analysis/define-with-gm.md`](./analysis/define-with-gm.md) — decide / promote  
4. [`worldbuilding/swamp/NEXT-ARC-HALKIN-GAUL.md`](./worldbuilding/swamp/NEXT-ARC-HALKIN-GAUL.md) — next session spine  
5. [`worldbuilding/swamp/HALKIN-GAUL.md`](./worldbuilding/swamp/HALKIN-GAUL.md) — town bible  

## Discord IDs

| Role | ID |
|------|-----|
| Guild (server) | `1265793253798576148` |
| Category (+ threads) | `1477755184607396063` |
| `#main-rp` (primary play / portal probe) | `1495469564060893254` |
| `#campaign-rp` (early / SmithsVille) | `1477735120252178453` |
| Character sheets (players) | `1475174763533176844` |

Deep link (campaign-rp): https://discord.com/channels/1265793253798576148/1477735120252178453

## Repo layout

| Path | Purpose |
|------|---------|
| `discord.json` | Canonical Discord IDs |
| `discord-export/` | Bot export markdown (+ potato dated snapshots) |
| `analysis/` | Extracts + timeline + define-with-gm |
| `prep/` | Session-ready pointers → swamp NEXT-ARC |
| `worldbuilding/swamp/` | Halkin-Gaul + approach + **NEXT-ARC** (canon vs **[proposal]**) |
| `players-characters.md` | Player ↔ character index |
| `LOCKS.md` | Facts locked from Discord only |

## Export (linuxbox)

```bash
cd ~/agent-dump/campaigns/euro-adventure-2026
# Token: DISCORD_BOT_TOKEN (hunter profile or tropic .env) — do not commit
python3 export_discord_lore.py --guild 1265793253798576148 --category 1477755184607396063
python3 export_discord_lore.py --channels 1477735120252178453 1475174763533176844
```

Probe visibility (no message bodies): `python3 scripts/linuxbox/campaign-discord-probe.py`
