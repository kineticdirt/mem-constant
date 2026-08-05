# Initial analysis — Tropic Gooner (2026-06-29)

**Sources:** imported Obsidian vault (`campaigns/tropic-gooner/`), 20 markdown files + character art.

## Setting spine

- **Isla Primavera** — tropical island state with federal mountain capital (**Sierra Dorado**), hedonistic **Paradisio County** bay tri-city (**Paradise**, **Porto Lujara**, **Jackedsonville** / Jackedsonville), and **14 numbered regions** on a color-coded map (`Misc Notes (REORG LATER).md`, `Laguna of the Isle.md`).
- Tone: sun-soaked, commercial nightlife, WoD-adjacent creeds/drives on PCs (Ellaine: Martial + Greed; Toga: Underground + Greed).
- Economy: tourism, ports, rum/agriculture, universities (USD, PIU, GVCC, CCC), orgs like **Stevens & Co. Sanitation and Liquidation**.

## Systems logic (for agent + table)

| Layer | What exists | Gap |
|-------|-------------|-----|
| **Rules** | Creeds/Drives named on PCs; not a full rules doc in vault | Confirm WoD 20th vs homebrew |
| **Cast** | 4+ active PCs in `Plot Lines/Plot Timeline.md`; Minerva stub only | Full sheets for Nelly, Red; Harper retired |
| **Places** | ~15 location notes + 14-region map lore | Many regions named only in prose — no per-city files |
| **Plot** | Character backstories; serial-killer hook (unfinished) | No session log; Discord not exported yet |
| **Map asset** | `id: main_map_wod_tropic_gooner_4k` → `output-onlinetools4k.png` | **Image missing from import** |

## Discord ingest (phase 1)

- Reuse `export_discord_lore.py` (SpaceQuest pattern). Output → `discord-export/`.
- Needs: bot token in `.env`, guild ID, category/channel IDs for RP threads.
- Legacy: none in this vault (unlike SpaceQuest).

## Agent next steps

1. Human: Discord guild + which channels are canon RP.
2. Human: drop `output-onlinetools4k.png` into `map/`.
3. Agent: after export, diff Discord names vs `Plot Timeline.md` cast list.
