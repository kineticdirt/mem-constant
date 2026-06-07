# Reference — exports & tooling

## Discord exports

Large tree: `../discord-export/`  
**Space Base V2** bundle: `../discord-export/Space Base V2-1469873840703144060/` — includes `category-summary.md`, per-channel `messages.md`, and `threads/` subfolders when exported with threads enabled.

**Meta-analysis (#RP channel + RP threads only — ignores general/OOC channels):** [[../discord-export/META-ANALYSIS]]

**Canon relationship analysis (loredoc, characters, dm-screen, #rp, #corpo) + Elasticsearch bulk:** [[../discord-export/CANON-RELATIONSHIP-ANALYSIS]] · `discord-export/elastic-bulk/*.ndjson`

**Canon vs inspiration (Space Base V2 only; GM account; art folders = inspo):** [[../discord-export/CANON-SCOPE]]

Do **not** rename or move export roots casually — notes and timelines reference these paths.

## Scripts

- `../export_discord_lore.py` — requires `.env` with `DISCORD_TOKEN` (see repo `.env.example` if present).

## Lore vs story

- **Setting + chronology:** [[../lore/README]]  
- **Arc, station, antagonist drafts:** [[../story/README]]

## Timeline & automated analysis (plan)

- **Unified plan:** [[timeline-and-analysis-pipeline-plan]] — timeline layers, export → Elasticsearch, scheduled “bot” / runbook, analysis refresh goals (Epic **A-6**).
