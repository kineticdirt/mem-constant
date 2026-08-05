# Tropic Gooner (Hunter: The Reckoning)

**One chronicle** — island hedonistic WoD setting (**Paradisio County** / **Isla Primavera**) plus Hunter PCs (e.g. Sasha). Same world, not a separate campaign.

Obsidian imports: `Obsidian/Tropic Gooner` + `Obsidian/Hunter_The_Reckoning` (non-destructive; source vaults left intact).

## Folder map

| Path | Contents |
|------|----------|
| `Things and Places of Note/` | Regions, cities, airports, colleges (imported Obsidian tree) |
| `Organizations/` | Paradise, JackedSonVille, Stevens & Co., … |
| `Plot Lines/` | `Plot Timeline.md` — character roster + hooks |
| `characters/` | Index + `sasha.md` (Hunter import) |
| `tools/` | `discord_gui_exporter.py` |
| `Character Images/` | Reference art (large; gitignored; present on linuxbox) |
| `reports/` | Agent-drafted analysis + worldbuilding (**drafts only**) |
| `map/` | `map.json` — overlay markers (GPS-style pins on base map image) |
| `discord-export/` | Channel/thread dumps from `export_discord_lore.py` |
| `export_discord_lore.py` | Discord → markdown exporter (same pattern as SpaceQuest) |

## Agent lane

`agents/TROPIC_GOONER_TASK.md` · progress: `reports/progress.md`

## Discord ingest

Token in **gitignored** `.env` at campaign root (`DISCORD_TOKEN=…`). Never commit.

```bash
cd campaigns/tropic-gooner
python export_discord_lore.py --list
python export_discord_lore.py --guild <id> --category <id>
```

## Map (phase 3)

Base image ref: `map/output-onlinetools4k.png` (Obsidian embed — **not in import**; drop into `map/` when available).

**Public viewer (linuxbox):** `http://127.0.0.1:8765/` via `tableslop-server.js` — route `tableslop.org` in Cloudflare (`docs/tableslop-linuxbox.md`).

**Dashboard:** `GET /api/campaigns/tropic-gooner/map` on `:8790` (admin).
