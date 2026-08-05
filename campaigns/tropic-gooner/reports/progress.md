# Tropic Gooner (Hunter: The Reckoning) — agent progress



One chronicle. Campaign agent ticks: `agents/TROPIC_GOONER_TASK.md`.  

**Web platform board:** `projects/tableslop/manifest.json` (sub-projects + planning/writing/testing lanes).



## Phase 1 — Ingest & analysis



- [x] Discord ingest runbook (`reports/discord-ingest-runbook.md`)

- [x] First Discord export or documented HOLD (no token / guild ID)

- [x] Initial vault analysis (`reports/2026-06-29-initial-analysis.md`) — PC import pass

- [x] Hunter vault merged into this tree (`characters/sasha.md`, `tools/discord_gui_exporter.py`)



## Phase 2 — Worldbuilding



- [x] Character index stub (`characters/INDEX.md`)

- [x] Places index stub (`places/INDEX.md`)

- [x] Worldbuilding questions for human (`reports/worldbuilding-questions.md`)

- [x] Open threads + antagonist roster (`reports/open-threads.md`)



## Phase 3 — Map overlay



- [x] `map/map.json` schema + region seeds

- [x] `map/output-onlinetools4k.png` + 2K variant in repo

- [x] tableslop map server (`scripts/linuxbox/tableslop-server.js`)

- [x] Cloudflare `map.tableslop.org` on linuxbox tunnel

- [x] Dashboard map tab (`reports/map-overlay-spec.md`)

- [x] tableslop manifest: coord refine + click→character (see `projects/tableslop/`)



## Done
- 2026-07-28: First Discord export — evidence on disk at `/mnt/archive/campaigns/tropic-gooner/discord-export/` (2038 files; main-rp messages.md) + `reports/discord-export-dryrun.md` (think-fail-up close; stops exit124 thrash)
- 2026-07-28: tableslop click→character — character_ids[] populated in map.json (4/14), character names on region cards (🎭 Ellaine Mishpit, Sister Minerva, etc.). Server: `scripts/linuxbox/tableslop-server.js` line 1291-1295. Verified via `/api/map` curl. Manifest: cl-02→done, cl-03→writing, character-link→writing, region-click→writing.
- 2026-07-28: Discord ingest runbook (`reports/discord-ingest-runbook.md`) — evidence on disk (think-reconcile)
- 2026-07-28: Open threads + antagonist roster (`reports/open-threads.md`) — evidence on disk (think-reconcile)
- 2026-07-28: Dashboard map tab (`reports/map-overlay-spec.md`) — evidence on disk (think-reconcile)
