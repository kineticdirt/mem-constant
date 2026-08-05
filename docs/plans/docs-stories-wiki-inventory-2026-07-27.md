# Docs / Stories wiki inventory — 2026-07-27

**Scope:** read-heavy root-cause. No product feature implemented.  
**Trigger:** Stories tab · NYC Mafia × D&D shows flat **Story** list (`factions.md`, `premise.md`) — feels read-only / not generating structure.  
**Why this ask (interpretation):** GM expects Stories to grow like a campaign wiki (topic tree + new md as agents work). Today Stories is a **read-only indexer of thin `storyDirs`**, while think writes under **`reports/`** (Docs silo). Surface mismatch looks like “nothing is generating.”

**Holder:** docs-stories-wiki-inventory  
**Potato evidence:** 2026-07-27 ~20:09–20:11Z via `ssh potato` (REACHABLE).

---

## 1. How Stories / Docs load files

### Stories (canon browser)

| Piece | Path / API |
|-------|------------|
| UI | `scripts/linuxbox/linuxbox-status/index.html` → `loadStories()` → `renderStoryList()` |
| Catalog | `GET /api/stories` → `listStoryCatalog()` in `linuxbox-status-server.js` |
| Doc body | `GET /api/stories/doc?campaign=&path=` → `readStoryDoc()` (`.md` only, path must start `campaigns/<id>/`) |
| Walk | `walkStoryMarkdown(absDir, …)` depth ≤5, skip `README.md` |

**Index rule:** for each campaign in `CAMPAIGNS`, walk only `cfg.storyDirs` (not whole campaign tree).

```js
// linuxbox-status-server.js CAMPAIGNS (excerpt)
spacequest:      storyDirs: ["story", "lore", "characters"]
"nyc-mafia-dnd": storyDirs: ["story"]          // ← thin
"tropic-gooner": storyDirs: ["Things and Places of Note", "Organizations", "Plot Lines", "characters", "places"]
```

**Grouping:** `groupStoryFiles()` buckets by top folder → UI `<details class="story-group">`. NYC has one bucket `story` / label **Story** → matches screenshot (flat 2-file list). Tropic shows a real topic tree because its `storyDirs` are multi-folder Obsidian-style.

**Not indexed by Stories:**

- `campaigns/*/reports/**` (think drafts)
- `campaigns/*/notes/**` (Chat `CAMPAIGN_WRITE` / Save chat)
- root `reports/` (ops smokes, think-ticks, research, …)
- NYC has no `characters/`, `places/`, lore folders on disk

### Docs silo (rail label **Docs**, `data-tab="reports"`)

| Piece | Path / API |
|-------|------------|
| UI | `renderReports(agentData)` from `GET /api/agent` → `all_reports` |
| Public subset | `GET /api/reports/public` → `listPublicReports()` (`PUBLIC_REPORT_DIRS`) |
| Single file | `GET /api/reports/{campaignId}?file=` → `readReport()` under `cfg.reportsDir` |

**Cap:** `/api/agent` builds `allReports` as **top 6 md per campaign** (excludes `progress.md` / `README.md`), then sorts by mtime and keeps **`all_reports.slice(0, 16)`**. Flat recent list — **not** a wiki tree. Silo Phase 2 still open: “Docs: wiki-style cross-links / non-campaign docs tree” (`docs/plans/linuxbox-silo-dashboard-2026-07-26.md`).

Silo remap already mapped Stories → Docs sub-nav “Story canon” (`docs/plans/linuxbox-silo-inventory-2026-07-26.md`) — **Phase 1 shipped nav; Phase 2 wiki merge deferred.**

---

## 2. What is *supposed* to create new md / folders

| Source | Writes where | Shows in Stories? | Shows in Docs? |
|--------|--------------|-------------------|----------------|
| **Think campaign lane** (`agents/NYC_MAFIA_DND_TASK.md` + `agent-cycle-think-tick.sh`) | `campaigns/nyc-mafia-dnd/reports/<YYYY-MM-DD>-<slug>.md`; marks `reports/progress.md`; updates `reports/README.md` | **No** (`reports/` ∉ `storyDirs`) | **Yes** (if in top-6/top-16 window) |
| **Ops Chat `CAMPAIGN_WRITE`** (`applyCampaignWriteDirectives`) | `notes/`, `story/`, `lore/`, `characters/` under bound campaign (short or full `campaigns/<id>/…`) | Only if path under `storyDirs` — **`notes/` never** for NYC | No (unless also under reportsDir) |
| **Chat Save note / Save chat** | `campaigns/<id>/notes/chat-*.md` | **No** | No |
| **Stories UI** | **None** — GET-only; buttons = Interview / Brainstorm / Discuss / + Task (→ Chat/Tasks) | n/a | n/a |
| **Docs UI** | **None** — read list + markdown render | n/a | n/a |
| **Discord ingest** (Tropic) | `characters/discord/<slug>.md` via `tools/ingest_discord_sheets.py` + `sync_character_registry.py` | Yes for Tropic (`characters` in `storyDirs`) | No |
| **Policy for NYC** | Task says: **never auto-edit `story/` canon** — drafts only in `reports/` | By design Stories stays stable | Drafts accumulate in Docs |

**SpaceQuest / Tropic** get topic trees because folders already exist on disk and are listed in `storyDirs`. NYC never grew those folders; lane was never asked to scaffold `story/` trees.

---

## 3. Potato evidence (post power-cycle / silo)

| Check | Result |
|-------|--------|
| SSH | `potato` REACHABLE (hostname raspbian…, UTC Mon 27 Jul 2026 ~20:09Z) |
| `story/` | Only `factions.md`, `premise.md` (premise mtime Jul 27 11:36) |
| `reports/` | **~28 dated drafts** Jun 7 → Jul 27/28 (era, magic, five-families ×3, locations, session-01, …) + `progress.md` |
| `notes/` | 3 chat transcripts (Jul 18–19) — invisible to Stories |
| `GET /api/stories` NYC | **files=2**, groups=`[('story','Story',2)]` — matches UI |
| `GET /api/agent` NYC | `pending=6` `done=2`; `next=A-3 five-families`; `latest_reports` includes today’s era/magic |
| Think LATEST | `form-20260727T195903Z-lane-nyc-maf` exit 0; `task_id=lane:nyc-mafia-dnd/progress.md`; wrote/refreshed `reports/2026-07-27-era-and-tone.md` |
| RR / focus | `think-continuous-rr.json` last = nyc progress; focus `status=done` (paid DeepSeek last-resort) |

**Verdict:** Generation is **not stalled**. Think is writing under `reports/`. Stories looks frozen because it only mirrors `story/`, which policy + `storyDirs` keep minimal.

### Progress / reconcile stall (real secondary bug)

Open boxes still cite template paths like `` `reports/<date>-five-families.md` ``.

`think-reconcile` / `evidence_satisfied` require a **literal** backtick path to exist as a file. `<date>` never matches → **cannot auto-close A-3…B-3** even though e.g. `2026-07-26-five-families.md` (and older) exist on disk.

Potato open boxes: A-3…B-3. A-1/A-2 are `[x]` only because Hermes manually ticked them when writing — not because reconcile matched.

**Symptom:** lane keeps picking early items / re-drafting era-and-tone (LATEST refreshed A-1 today) while later deliverables already exist as files. Feels like “not progressing structure.”

PC workspace `campaigns/nyc-mafia-dnd/reports/progress.md` may still show all `[ ]` — **PC mirror lag**, potato is runtime SoT for this lane.

Power-cycle / silo move: **no evidence** write paths broke. Silo Phase 1 only relabeled Docs + deferred Stories→Docs nesting; did not change `storyDirs` or think write targets.

---

## 4. Entity / character sheet markdown conventions

| Convention | Location | Notes |
|------------|----------|-------|
| Tropic Discord sheets | potato `campaigns/tropic-gooner/characters/discord/<slug>.md` | Ingest by character `Name:`; registry `story_path` points here; duplicates in `duplicate_paths` / soft-hide via `canonical_id` |
| Tropic hand sheets | `characters/*.md`, `Minerva.md`, places under `Things and Places of Note/`, orgs under `Organizations/` | Indexed by Stories via `storyDirs` |
| SpaceQuest PC dossiers | `campaigns/spacequest/characters/pcs/*.md` (+ `meta/`) | Design-doc sections (Egri/Truby/voice); in `storyDirs` |
| NYC | **No** `characters/` tree; factions/premise only under `story/` | Cast/wiki growth not started for this campaign |
| Registry | `characters-registry.json` + Chars UI | Tropic only in `CAMPAIGNS`; Stories character panel only when path matches `/characters/` |
| Pixi wiki stubs | Pixi `observed_world` / Satyr (separate `:8767` product) | Not the Hub Stories catalog |

---

## 5. Current create / edit capabilities (as of inventory)

**Stories**

- Read catalog + render md
- Character Discord-link panel (Tropic paths under `characters/`)
- Bridges: Interview, Brainstorm, Discuss → Ops Chat (`campaign-write`); + Task with story context
- **No** New file / New folder / inline edit / save back to disk

**Docs**

- Flat recent report list + search filter + keyboard j/k
- Read-only markdown body
- **No** create/edit; **no** tree; capped to recent slice from `/api/agent`

**Write paths that exist elsewhere**

- Think Hermes yolo → files under `reports/`
- Chat `<<<CAMPAIGN_WRITE path="notes/…">>>` (and story/lore/characters)
- Chat message/thread save → `notes/chat-*.md`
- Chars registry POST (metadata, not arbitrary wiki md)

---

## 6. Root-cause hypotheses (ranked)

1. **Wrong surface (highest).** User looks at Stories for “new structure”; think + lane policy write **`reports/`** (Docs). Stories correctly shows only `story/*`. Not a dead generator — a **product/IA mismatch**.

2. **NYC `storyDirs: ["story"]` + no folder scaffold.** Unlike Tropic/SpaceQuest, NYC never grew places/orgs/characters trees, so UI cannot show a topic tree even if Chat wrote `notes/`.

3. **Progress template `` `<date>` `` breaks evidence reconcile.** Disk has A-3…B-3 deliverables; checkboxes stay open → think rework / A-1 refresh loops; structure feels stuck.

4. **Stories + Docs are intentionally read-only UIs.** “Smart” create only via Chat fences or think ticks — easy to miss after silo rename (Docs vs Stories).

5. **Docs list is capped / flat** (6/campaign → 16 global). Even on Docs, older NYC drafts drop out of the list; no folder tree → still “not a wiki.”

6. **Silo Phase 2 deferred** (Stories nest under Docs + wiki links). Phase 1 did not break writes; it left the dual-tab confusion in place.

7. **Low:** potato write permission / power-cycle path failure — **contradicted** by fresh `2026-07-27-*.md` and think exit 0.

---

## 7. Suggested next steps (do **not** implement in this pass)

Clarify with GM before building the big wiki:

**A.** Want Stories to **index** `reports/` + `notes/` for NYC (cheap: expand `storyDirs` / walk list)?  
**B.** Want think to **promote** accepted drafts into `story/` (or places/factions trees)?  
**C.** Full Docs wiki (tree, edit, @entities) = silo Phase 2 / parallel plan `docs-wiki-pixi-scenario`?  
**D.** Small correctness fix: progress evidence glob for `<date>` / slug patterns so A-3…B-3 auto-close when `*-five-families.md` exists?

---

## File index (absolute, PC workspace)

- `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\scripts\linuxbox\linuxbox-status-server.js` — `CAMPAIGNS`, `listStoryCatalog`, `readStoryDoc`, `applyCampaignWriteDirectives`, `listReports`, `/api/stories*`, `/api/reports*`
- `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\scripts\linuxbox\linuxbox-status\index.html` — Stories + Docs UI
- `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\agents\NYC_MAFIA_DND_TASK.md`
- `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\scripts\linuxbox\agent-cycle-think-tick.sh` — reconcile + lane pick
- `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\campaigns\nyc-mafia-dnd\story\` · `reports\` · `notes\` (notes potato-only for chat saves)
- `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\docs\plans\linuxbox-silo-inventory-2026-07-26.md`
- `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\docs\plans\linuxbox-silo-dashboard-2026-07-26.md`
