# tableslop · Primavera — WoD campaign web platform

**tableslop** is the site/platform; **Primavera** is the setting (island: **Isla Primavera**).  
Tropic Gooner / Hunter: The Reckoning chronicle on **tableslop.org**.

Campaign canon lives in `campaigns/tropic-gooner/`; this folder tracks **product sub-projects**, **14 region boards**, status lanes, and the path to “click a place → Discord + character.”

**Machine-readable boards:**
- [`manifest.json`](./manifest.json) — platform sub-projects + tasks
- [`regions.json`](./regions.json) — **R1–R14** each with own status + tasks (coords, lore, discord, characters)

**Agent lane:** `agents/TABLESLOP_PROJECT_TASK.md` · registered in `agents/user-tasks.json`.

**Local UI design (before linuxbox deploy):** [`design/`](./design/) — preview on PC `:8767` via `bash scripts/tableslop/serve-design-preview.sh`.

## Vision (north star)

Players open **`https://map.tableslop.org/`** like a game overworld: explore **Primavera**, click a region, see lore and linked characters, jump to the right Discord channel — eventually a lightweight character builder. All hosted on **linuxbox** so it stays up when the PC is off.

## Status lanes

Every sub-project and task uses **one** lane:

| Lane | Meaning |
|------|---------|
| **planning** | Scope, spec, decisions — not building yet |
| **writing** | Code, content, assets in active development |
| **testing** | Deploy, Playwright, curl, human review |
| **blocked** | Waiting on human (credentials, canon, decision) |
| **done** | Shipped and verified |
| **deferred** | On the timeline; intentionally not active now |

Update `manifest.json` when a lane changes; append one `[PC]`/`[LINUX]` line to `AI_GROUPCHAT.md` on meaningful moves.

## Sub-projects (summary)

See [`manifest.json`](./manifest.json) for the full task list. High level:

| ID | Name | Lane (today) |
|----|------|----------------|
| `map-viewer` | Overworld map UI (pins, HUD, 2K/4K) | testing |
| `map-data` | Region coords + `map.json` accuracy | writing |
| `primavera-regions` | **14 regions** — per-place tasks in `regions.json` | planning |
| `map-assets` | Base images (4K, 2K, reference overlays) | writing |
| `infra-hosting` | linuxbox service + Cloudflare tunnel | testing |
| `discord-auth` | Login gate (OAuth) | planning |
| `discord-ingest` | Export + character sheet ingest | writing |
| `region-click` | Click place → detail panel | planning |
| `character-link` | Region ↔ Discord channel ↔ character MD | planning |
| `character-builder` | Sheet / builder UI | deferred |
| `hunter-agent` | Hermes Hunter gateway + RP pods | writing |
| `qa-smoke` | Playwright + health checks | testing |

## Key paths

| Piece | Path |
|-------|------|
| Map data | `campaigns/tropic-gooner/map/map.json` |
| Region board | `projects/tableslop/regions.json` |
| Map server | `scripts/linuxbox/tableslop-server.js` |
| OAuth plan | `tableslop-discord-oauth-plan.md` |
| Playwright | `campaigns/tropic-gooner/map/tableslop-smoke.mjs` |
| Characters | `campaigns/tropic-gooner/characters/` |
| Discord export | `campaigns/tropic-gooner/export_discord_lore.py` |

## Human decisions (open)

1. **Discord OAuth** — Client ID/Secret in Developer Portal (`tableslop-discord-oauth-plan.md` Phase 1).
2. **Region coords** — approve pin positions against `map/reference/updated_highlight_number_map.png`.
3. **2K default?** — mobile/slow links may prefer 2K; desktop keeps 4K (toggle in HUD when implemented).

## How agents should work this project

1. Read `manifest.json` for platform work; read `regions.json` for **per-region** work (pick one R# per tick when doing lore/coords).
2. Pick the **oldest** task in **writing** or **testing** (not deferred).
3. One concrete step; move task status in the relevant JSON file.
4. Verify with one check (Playwright, curl, or documented human step).
