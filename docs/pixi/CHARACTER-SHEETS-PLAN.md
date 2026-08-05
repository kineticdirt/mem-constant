# Character sheets vs chat telemetry — plan

**Status:** draft for human sign-off (2026-07-17).  
**Scope:** Pixi RP chat-ui (`ObsidianWriterStack/PixiApp/chat-ui/`).  
**Companion:** [`CONTINUITY.md`](./CONTINUITY.md) (mechanical SoT / Send inject). This doc owns the **product contract**: what belongs on a **character sheet** vs what belongs with **chat / turn metadata**.

**Authoring baseline (Docs + six pillars):** [`../plans/character-sheet-baseline-2026-07-27.md`](../plans/character-sheet-baseline-2026-07-27.md) + template [`../../campaigns/_templates/character-sheet.md`](../../campaigns/_templates/character-sheet.md) + bridge [`docs-engine-bridge.md`](./docs-engine-bridge.md). Pillars (**Look / Speech / Act / Think / Skills+sexuality / Backstory**) map onto §3 sections below — **extend this plan**, do not fork a second sheet religion. **Docs uses engine guts; Pixi RP (`:8767`) stays a separate product.**

**Do not deploy potato until Phase 0+ is reviewed.** Phase 0 below is PC-local UI only when implemented.

---

## 1. Contract

| Surface | Owns | Does not own |
|---------|------|----------------|
| **Character sheet** (Cast card, Character tab, Wiki article, `rpg.character_sheets` / `rpg.character_record[].markdown`) | Diegetic, character-specific knowledge mined from play + package seed | Pipeline status, model/latency, WORLD_DELTA parse counters, BG job queues, raw `rpg.telemetry` dumps, Send retry chains |
| **Chat / turn metadata** (message fields + `rpg.telemetry` + Monitor / Debug / Pipeline) | Ops, debug, turn pipeline, pending_turn, WD last payload, issue_log, BG status | Long-form personality / outfit / secrets prose (except as source text to extract *into* sheets) |

**Rule of thumb:** if it answers “who is this person in the fiction?”, it is sheet. If it answers “what did the engine do on this turn?”, it is chat metadata.

**In doubt → chat meta**, not the sheet. Metadata need not be a visible message; it may live beside the transcript (see §4).

---

## 2. Audit — what lands where today

### 2.1 Already character / narrative (keep / expand)

| Source | What |
|--------|------|
| Package `people_md` / `syncPackagePeopleSheets` | Authored identity prose under `## Character (package)` |
| Thin sheet `buildThinPersonSheetMarkdown` | Name, age, pronouns, aka, appearance, scene/physical/activity, **Wearing now**, notes (non-salvage) |
| `observed_world.people` + WD people fields | Live outfit, scene, physical, body_profile, character_dossier fields |
| Wiki `wikiBodyProfileHtml` / `wikiCharacterDossierHtml` | Structured anatomy + dossier tables (ethnicity, personality_*, secrets_hooks, wardrobe_*, etc.) |
| Cast card | Name, role, scene, aka, notes, backstory excerpt, objective, affect line |
| Relations tab | Directed edges (trust/fear + relation tags) — graph UI; sheet should also get **relationships prose** (Phase 2) |
| Inventory on entity / sheet helpers | Item lists when populated |

### 2.2 Telemetry / ops currently on sheet surfaces (move or strip)

| Surface | What | Verdict |
|---------|------|---------|
| **Character tab** `renderDetail()` | Full `JSON.stringify(session.rpg.telemetry)` under “Telemetry” | **Strip (Phase 0)** — already on Monitor / Pipeline |
| **Character tab** | “State JSON (engine blob)” editor | Ops tool — **relocate to Debug** (Phase 0 or 1); not diegetic sheet |
| **Cast cards** | Always-on HP / Rad / AP bars (defaults invent AP≈50) | Game chrome; hide when unset / non-game scenarios (Phase 0 soft or Phase 2) |
| **Cast cards** | Hint: “Character record builds after the next Send…” | Ops empty-state — **soften / hide (Phase 0)** |
| **Wiki** | Empty-state copy naming ``character_record`` BG job | Ops — **soften (Phase 0)** |
| **Wiki** | Vitals HP/Rads/AP always shown as `—` | Engine placeholders — hide when empty (Phase 0 soft) |
| **Sheet markdown** (server `_sheet_for_person`, BG enrich) | Empty `## Affect and body` / `## Current drive` dash rows; `## Recent beats` / open threads | Partially scrubbed by `scrubCharacterSheetMarkdown`; keep scrubbing; stop *emitting* empty blocks (Phase 1–2) |
| **Sheet markdown** | ``ID: `npc:…```, object ids in outfit lists | Mechanical ids — OK in package seed; prefer names in player-facing sections (Phase 2) |
| **character_record** `sources` / `updated_at` | Pipeline provenance | Keep in record object; **do not** render as sheet body (already mostly hidden) |
| **Wiki “Repository — memory & worldbuilding”** | Repo file paths | Operator links — leave or move under Debug (ask); not character knowledge |

### 2.3 Chat / turn metadata already (home for ops)

| Location | Contents |
|----------|----------|
| `session.rpg.telemetry` | `pending_turn`, `last_world_delta`, `world_delta_turns`, rejects/merges, `last_rp_trace`, `last_chat_ms`, retry flags, `issue_log`, `background.*`, `continuity_hygiene`, `cast_enrich_pending`, session_arc / act_index, etc. |
| `session.messages[]` fields | Per-assistant: `model`, `response_model`, `generation_chain`, `applied_world_delta`, `opener_seed`, provisional flags |
| `session.rpg.world_turn_stack` | Undo snapshots of world state (engine, not sheet) |
| UI: **Monitor**, **Debug**, **Pipeline**, Send pipeline footer | Operator-facing views of the above |
| Message bubble watermark | Model + chain label (correct place) |

**Gap:** almost all ops already live under `rpg.telemetry` + message fields. There is **no** need for a new sidecar directory for Phase 1 if we treat `rpg.telemetry` (+ optional `rpg.chat_meta` alias) as the chat metadata home. Separate files only if session JSON bloat becomes a problem.

---

## 3. Target full sheet schema (product)

Canonical player-facing sections (markdown and/or structured fields that render into these headings). Order is reading order.

| Section | Structured home (preferred) | Notes |
|---------|------------------------------|-------|
| **Identity** | `name`, `also_known_as`, `pronouns`, `role`, age (`body_profile.age`) | Locked per CONTINUITY §2 |
| **Appearance** | `appearance_notes`, `features_notes`, `body_profile.*` | Identity-locked appearance ≠ outfit |
| **Current outfit** | `current_outfit` + clothing objects (`holder`/`wear_slot`) | Mutable; already in thin sheet |
| **Personality** | `character_dossier.personality_*`, voice | Expand extraction |
| **Goals / drives** | `state.goals`, dossier desires/needs | Diegetic objectives OK on sheet |
| **Relationships (prose)** | New: short paragraphs + link to Relations edges | Edges stay mechanical; prose is sheet |
| **Inventory** | `inventory[]` + held objects | |
| **Scene history** | **Open question** — see §7 | Summarized beats *about this character*, not full chat log |
| **Secrets** | `character_dossier.secrets_hooks`, hidden_agenda (GM/dev visibility) | |
| **Epistemic / knowledge bounds** | Derived from presence / `known_to_pc` | Sheet may show “knows / doesn’t know”; Send already injects fog |
| **Voice notes** | `character_dossier.voice_speech` + package | |
| **Physical / wounds** | `physical`/`condition`, injury flags, vitals when scenario uses them | Hide empty game vitals |
| **Bonds** | Relation tags + intimacy carry-forward prose | |
| **Status / cast activation** | `cast_activation`, present/off_scene/unmet… | Diegetic status OK; not BG job status |

**Plus proposed extras:** occupation, beliefs, daily routines, residence, carried gear (dossier already has many keys — UI should surface filled ones as first-class sections, not only a flat table).

---

## 4. What moves OFF sheets → chat metadata

| Item | Target (least new machinery) |
|------|------------------------------|
| Raw `rpg.telemetry` dump on Character tab | **Remove from sheet UI**; read via Monitor / Pipeline / Debug |
| State JSON editor | Debug page (or Monitor details) |
| WD counters, last_world_delta JSON, pending_turn, BG queue | Stay in `session.rpg.telemetry` (already) |
| `generation_chain`, model, applied_world_delta | Stay on **message** objects (already) |
| Empty affect/drive dash blocks | Stop writing; scrub on load (existing) |
| Play-log “Recent beats / Open threads” dumps | Prefer `event_memo` / transcript; character **scene history** = curated extract only (Phase 2–3) |
| Optional future bloat | `session.rpg.chat_meta` as a **namespaced mirror** of turn ops *or* `sessions/<id>.meta.json` sibling — **only if** session JSON size hurts; default = keep in `rpg.telemetry` |

**Recommended Phase 1 path:** document + lightly namespace (`rpg.telemetry` remains SoT; UI never reads it from Character/Wiki/Cast). No new folder until measured need.

---

## 5. How sheet content is established / updated

```text
Package people_md ──► syncPackagePeopleSheets / seedPersonRowFromPackageMd
                         │
Transcript + WORLD_DELTA ──► mergeObservedWorldIntoRpg
                         │
                         ├──► establishCharacterSheetsFromObserved (thin MD + outfit)
                         ├──► scrubCharacterSheetMarkdown / continuity hygiene
                         └──► BG character_record / cast_sheet_enrich (thicken markdown + dossier)
```

| Mechanism | Role |
|-----------|------|
| WORLD_DELTA people fields | Mechanical SoT for current outfit/scene/physical/dossier patches |
| `establishCharacterSheetsFromObserved` | Ensures every observed person has a Cast/Wiki row without waiting for LLM |
| `scrubCharacterSheetMarkdown` | Drops empty affect, play-log sections, junk dossier scrapes |
| `applyContinuityHygiene` | Sheet → people ages/outfits; prune stub edges; trim bloat |
| BG `character_record` | Mines transcript into richer markdown — **must write diegetic sections only** (Phase 3 quality) |

Sheets are **not** injected whole into Send today (CONTINUITY §3). Phase 2–3 may selectively inject *short* sheet slices (outfit/personality) only via existing layers — not full markdown dumps.

---

## 6. Phased implementation

### Phase 0 — Strip telemetry from sheet UI *(done PC-local 2026-07-17)*

- ✅ Removed Character-tab **Telemetry** JSON block (`renderDetail`).
- ✅ Softened/hid Cast/Wiki empty-states that named BG jobs / Send pipeline.
- ✅ Wiki omits empty HP/Rads/AP vitals rows.
- Pipeline / Monitor / Debug untouched. Cache bump: `app.js?v=20260717-sheets-phase0`.
- **Not deployed to potato** — review first.
- Left on Character (Phase 1): State JSON engine editor.

### Phase 1 — Chat metadata home *(needs sign-off)*

- Treat `rpg.telemetry` + message fields as documented chat-meta contract.
- Move State JSON editor to Debug.
- Optionally alias `rpg.chat_meta` → same object for clarity (no dual writes).
- Ensure sheet writers never append ops counters into markdown.

**Test:** Unit/UI: Character/Wiki DOM has no telemetry keys; Debug shows state editor; Monitor unchanged.

### Phase 2 — Rich sheet schema + UI *(needs sign-off)*

- Render target sections (appearance, outfit, personality, goals, relationships prose, inventory, secrets, …) as first-class Wiki/Character blocks.
- Hide empty game vitals / Fallout bars unless scenario declares them.
- Relationships prose section fed from edges + dossier.

**Test:** Playwright or manual: filled dossier keys appear under named headings; empty sections omitted.

### Phase 3 — Extraction quality + tests *(needs sign-off)*

- Harden `character_record` / enrich prompts to fill target sections from messages.
- Tests: scrub + establish + enrich fixtures; no telemetry sections reintroduced.
- Do **not** burn OpenRouter on idle enrich loops; keep free-first / rate limits.

**Test:** `session_turn_augment` + `character_record` / cast enrich tests; golden markdown fixtures.

---

## 7. Open questions (need human)

1. **Scene history on sheet vs chat log?** Proposal: sheet holds a **short curated “notable scenes with this character”** list (≤N bullets, character-centric); full chronology stays in transcript + `event_memo`. Confirm.
2. **HP/Rad/AP bars** — keep for Fallout-style packages only, or retire from Cast entirely?
3. **Wiki “Repository paths”** — keep on Wiki or move to Debug?
4. **Hidden agenda** — sheet (GM) vs Debug-only?

---

## 8. Non-goals

- Do not invent faces / portraits.
- Do not break continuity hygiene, identity locks, or WORLD_DELTA merge.
- Do not burn OpenRouter with new always-on sheet LLM jobs.
- Do not hard-delete sheets or wipe sessions.
- Do not put full sheet markdown into Send without an explicit inject-layer design.
- Do not redeploy potato until human signs Phase 0+ review (unless Phase 0 is tiny PC-local only — still prefer review before SCP).

---

## 9. Test plan summary

| Phase | Check |
|-------|--------|
| 0 | Character tab: no telemetry JSON; Cast/Wiki narrative still visible; Pipeline/Monitor still show ops |
| 1 | State editor on Debug; sheet markdown scrub never reintroduces Recent beats / empty Affect |
| 2 | Section headings match schema; empty omitted; Relations prose present when edges exist |
| 3 | Fixture transcript → expected section fills; regression tests for scrub + establish |

---

## 10. Key code pointers

| Path | Role |
|------|------|
| `static/app.js` → `renderDetail`, `renderWiki`, `renderParty` | Sheet UI surfaces |
| `static/app.js` → `renderMonitor`, `renderPipeline`, message watermarks | Chat ops UI |
| `static/session_turn_augment.mjs` → `buildThinPersonSheetMarkdown`, `scrubCharacterSheetMarkdown`, `establishCharacterSheetsFromObserved` | Sheet MD establish/scrub |
| `server.py` → `_sheet_for_person`, `rpg.telemetry` / `pending_turn` | Server sheet + chat meta |
| `character_record.py`, `cast_sheet_enrich.py` | BG thicken (diegetic only going forward) |
