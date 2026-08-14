# tableslop / GameSys (Isla Primavera) — continuous project progress

> **GameSys:** product name for the Isla Primavera play runtime. North star: `docs/plans/gamesys-isla-primavera-2026-08-14.md`.

**Lane:** `agents/TABLESLOP_PROJECT_TASK.md` · **Manifest:** `projects/tableslop/manifest.json` · **Regions:** `projects/tableslop/regions.json`  
**Runtime:** potato `linuxbox-tableslop` **:8765** · public `https://map.tableslop.org/`  
**Dual-app roadmap:** `docs/plans/tableslop-dual-app-roadmap-2026-08-01.md` — App A `:8768` campaigns · App B `:8765` **GameSys** map · Setup→Beta §9  
**Isla WB checklist:** `docs/plans/isla-primavera-wb-finish-checklist-2026-08-01.md`  
**Profile:** think (free-first) — one `[ ]` per tick when ops/`[ops]` are not blocking.

Tick-sized only (Hub-a/b/c lesson). When all Open children are `[x]`, archive under Done and seed the next slice from the manifest (oldest `writing`/`testing`, skip `deferred`/`blocked`).

## GameSys corridor (G0+)

- [x] **G0 Name lock** (2026-08-14) — `docs/plans/gamesys-isla-primavera-2026-08-14.md` + prior-doc aliases
- [ ] **G1** Roads as game system v1 (closures ↔ board ↔ travel; tri-city SoT already 52 feats)
- [ ] **G2** Discord ingest stub (character → GameSys presence)
- [ ] **G3** Clarify-question path (underspecified RP → one ask)
- [ ] **G4** Command-node job envelope (potato dispatch → external worker result)
- [ ] **G5** Phone light apps skeleton (Order + Move honest stubs)
- [ ] **G6+** NPC/econ/combat/zombies mode — after G5

## Setup → Beta corridor (S0–S3)

- [x] **S0 Setup** (2026-08-01, holder `tableslop-s0-s1-impl`): health matrix script; campaigns-avail smoke; docs Theme A/B + Hub link-out; archive template policy; `map/diegetic-clock.json` (48h/world-day soft).
- [x] **S1 Isla WB finish** — non-GM leftovers done; **`wb-tg-factions` closed 2026-08-01 (GM)** (no quest-obligation favors; ambient former-PC NPCs; flesh deferred).
- [x] **S2 Deterministic pregen** (authored): Paradise subzones, fog GeoJSON, R1/R2 encounter decks; `layers.json` optional sources.
- [x] **S3 Minimal App A player↔char paste** (2026-08-01, holder `tableslop-s3-link`): sidecar `player-character-links.json`; GET/POST `/api/campaigns/:id/links`; paste UI on `/c/<id>`; docs in `tableslop-linuxbox.md`.

## Post-S3 product focus (holder `tableslop-post-s3-focus`)

- [x] **Map HUD ↔ `vibes.png` art** (slice 2026-08-01) — potato was on lore labels; redeployed vibes-aligned `map.json`+coords+regions-ui (15 markers); stub chips for R15–R17; `ART-SOT.md`. Ellipse→boundary digitizing: Paradise/Porto/Jacked/San Aurelio/Ruby/Lagooni/Puckall + Sierra (see `map/TRACE-NOTES.md`); leftover ellipses Villa/Seaside/Black Sand/Portview/InterFederal/East Bayby/Research.
- [x] **Error collection framework** (slice) — `reports/tableslop-errors/{codes.json,README,LATEST}` + `tableslop-error-collect.sh`; smoke vibes label gate; potato collect RESULT ok.
- [ ] **Dashboard UX** — App A/B meat-and-potatoes (holder `tableslop-dashboard-ux`). Not radio/autonomous full P5. Tick children below; flip parent `[x]` when all children done.
  - [x] **dux-01** Cast HUD red silo (not orange dock) + smoke `TS-HUD-CAST-CHROME` (2026-08-09)
  - [ ] **dux-02** Region detail Discord CTA — show deep-link when `discord_channel_id` set; hide when absent (design LAYOUT ②)
  - [ ] **dux-03** Journal detail density vs design preview (lore excerpt / notes / cast chips still readable)
  - [ ] **dux-05** Phone/Radio/Sim dock panels — honest stub copy (what works vs placeholder); no fake game systems
  - [ ] **dux-10** `/world` logged-in Playwright smoke (Cast roster + Weather Overview→Detail) — owner cookie/fixture
  - [ ] **dux-11** World Transport card — highways status from `layers.json` + link note (no road drawing)
  - [ ] **dux-20** App A tropic portal Story section parity with eurosluts (when story artifact exists)
  - [ ] **dux-21** App A glance readability — last Discord activity / status chips clearer
  - [ ] **dux-22** Cancel/RSVP — **defer to roadmap P1** (do not fake); keep link/note only until session schema lands
  - [ ] **dux-30** Docs/smoke hygiene — Areas default ON documented; smoke keeps Cast chrome + borders gates

- [x] **Economy sim v1** — water/minerals/other + tick + World + Econ overlay (holder `tableslop-economy-sim-full`, 2026-08-10). Open polish in `agents/tableslop-economy-progress.md`.- [ ] **Map leftover boundaries** — **PAUSED for agents (2026-08-01 gear `nyc-wb-gear-change`)** — GM-owned Draw; borders sacred (`REGIONS-UI-LOCK.md`). Do **not** prioritize Cursor/Hermes on ellipse digitize / regions-ui. Leftover list still: Villa Miel, Seaside Springs, Black Sand Beach Preserve, Portview, InterFederal Shores, East Bayby, Research Islands — resume only on explicit GM ask. Focus shifted to **NYC Mafia × D&D** borough worldbuilding.
- [ ] **Error/test framework** — collector exists (`tableslop-error-collect.sh`); extend/fix if LATEST not ok; keep smoke gates green.
- Character flesh: **deferred** (sheets = place/world kernels only).
- **Potato handoff:** `docs/plans/tableslop-potato-handoff-2026-08-01.md` (PC shutdown; Cursor∥Hermes parallel).

## Models (free-first)

Use **free** Hermes/OpenRouter models for this lane. Paid only if the slice truly needs it (image processing, free model cannot complete after a real try) — then note why in the Done line / ledger.

## Open — map / v1 slices

- [x] **ts-a:** Region detail - merge design preview slide-out fields (name, type, short notes) into live `scripts/linuxbox/tableslop-server.js` for one selected region; verify `curl` `:8765` 200 + click/select still works
- [x] **ts-b:** QA smoke - add or finish Playwright check that 2K toggle loads alternate map image (`qa-02` / `campaigns/tropic-gooner/map/tableslop-smoke.mjs`); skip+note if 2K asset missing on box
- [x] **ts-c:** Places stub - create one `campaigns/tropic-gooner/places/` markdown for **R1 Paradise** and link it from `projects/tableslop/regions.json` (`pr-01` slice)
- [x] **ts-d:** Session notes - minimal per-region notes field persisted in localStorage on the region detail panel (`sp-02` MVP; no Discord OAuth)
- [x] **ts-e:** Region↔`character_ids` pins on map (`cl-03`) — cast chips on region detail
- [x] **ts-f:** Cast sheet markdown render on tableslop (full sheet view, reader width)
- [x] **ts-g:** Portrait upload/create parity or clean deep-link handoff to dashboard editor for create/merge/upload (decide smallest correct)

## Done
- 2026-07-26: **ts-f:** `/api/characters/sheet?id=` + marked render in cast detail (full-width `.cast-sheet` reader). Verify: potato sheet endpoint returns markdown for a registry id with story_path.
- 2026-07-26: **ts-g:** Chose deep-link handoff (no duplicate upload on :8765). Cast admin link → `?tab=characters&campaign=&char=`; dashboard `applyCharsDeepLink` opens Chars + selects id (`db-20260726-chars-deeplink-r1`).
- 2026-07-26: **ts-e:** Region↔`character_ids` pins on map (`cl-03`) — cast chips on region detail — think-enforce-lane (log DONE:)

- **2026-07-25 ts-a:** Merged boards `note` field into marker data in `loadMapJson()` board merge — `scripts/linuxbox/tableslop-server.js` l.1581. Detail panel already shows name (`detailTitle`), type (`detailMeta`), notes (`detailLore`). Syntax OK. Curl verify deferred (linuxbox unreachable this tick). Free model (deepseek/deepseek-v4-flash).
- **2026-07-25 ts-c:** Created `campaigns/tropic-gooner/places/paradise.md` (Paradise city lore stub with overview, notable locations, hunter notes). Added `places_file: "places/paradise.md"` to R1 in `regions.json`; flipped R1 status→writing, lore task→writing; moved `manifest.json` pr-01-places-index→writing. Curl verify: tableslop :8765=200. Free model (deepseek/deepseek-v4-flash).
