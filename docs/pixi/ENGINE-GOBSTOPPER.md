# Pixi engine — Gobstopper design

**Product:** Pixi RP **UI + engine** (not one campaign).  
**Runtime SoT:** linuxbox `~/pixi-rp/ObsidianWriterStack` (`linuxbox-pixi-rp` `:8767`).  
**Coord repo:** `agent-dump` (this doc).  
**Status:** Design / north-star (2026-07-23). No claim that every layer is fully wired yet.

Related: [`CONTINUITY.md`](./CONTINUITY.md) (SoT map), [`WORLD_PERMANENCE.md`](./WORLD_PERMANENCE.md), [`CHARACTER-SHEETS-PLAN.md`](./CHARACTER-SHEETS-PLAN.md), root plan [`../../pixi-rp-context-agency-plan.md`](../../pixi-rp-context-agency-plan.md).

---

## 1. Purpose

Build a **reusable RP engine** and **UI surface** that stay **data-driven**: packages + `observed_world` + `WORLD_DELTA` supply facts; the engine supplies **backends and peelable capability layers**. Scenarios get unique needs via **config/hooks**, not by forking core or baking character names into engine code.

**North-star pacing principle:** **delaying gratification** — immersion, agency, and earned reveals over instant wish-fulfillment. Explicit content stays in-bounds; compliance and lore dumps do not auto-arrive.

---

## 2. Product split — UI vs engine

| Surface | Owns | Must not own |
|---------|------|----------------|
| **UI** | Composer, Cast/Wiki/Monitor, model pickers, scenario picker, layer toggles / scenario load config, mobile chrome | Diegetic truth; inventing cast; silent compliance shortcuts |
| **Engine** | Session persist, Send pipeline, inject assembly, WORLD_DELTA merge, presence, BG jobs (stubs/enrich/summarize), hygiene/continuation backends | Scenario-specific character/place invent; per-NPC `if name == …` product logic |
| **Scenario package** | `system.md`, `people/`, entities, inject markdown, opening cast, authored agendas | Engine forks; hardcoding the same facts into JS/Python |

**Rule:** UI may expose **scenario load/config** (which layers on, package id, pacing prefs). Engine backends **accommodate** those needs as generic knobs. Scenario *content* lives in the package.

---

## 3. Gobstopper architecture

Like a gobstopper: **inner core always on**; **outer layers optional / advanced**, enabled or tuned per scenario (env, package flags, or UI config) without baking scenario facts into code.

```text
  [ NSFW helper ]     optional outer
  [ Cast enrich ]     optional (often paused)
  [ List-continue ]   feature layer
  [ Agency / delay-gratification ]   pacing (default on)
  [ Stubs / Satyr ]   context compression
  [ Diegetic clock ]  time
  [ Knowledge bounds / spatial ]  fog + place
  [ Presence + WORLD_DELTA ]  cast/facts
  [════════ CORE SESSION / SEND ════════]  always on
```

### Layer map

| # | Layer id | Owns | Default | Scenario hooks |
|---|----------|------|---------|----------------|
| 0 | **`core_session`** | Session JSON, messages, Send/Regenerate job, model routing, hygiene base, provisional persist | **ON** | Package id; model presets |
| 1 | **`world_delta`** | Merge `<<<WORLD_DELTA>>>` → `observed_world`; identity locks; permanence facade | **ON** | Package seed people/entities; no engine name invent |
| 2 | **`presence`** | Present / off_scene / unmet / elsewhere / dead / exiled; who may act on-screen | **ON** | `cast_activation`, package opening cast |
| 3 | **`diegetic_clock`** | Scene headers, monotonic time, daylight budget | **ON** | Package day/start; UI manual override |
| 4 | **`spatial_knowledge`** | Place layout inject + epistemic fog for non-present cast | **ON** | Package `inject/*` spatial; place-generic (not apartment-hardcoded) |
| 5 | **`stubs_satyr`** | Thin “in-chat” stubs for **present** cast; Satyr/OpenRouter/hydrate host order; full wiki stays disk/UI | **ON** (stubs); summarizer as available | Package people.md as seed; stub ≠ full sheet dump |
| 6 | **`agency_delay`** | Goals/stakes inject, breakdown stages, delay-gratification pacing (see §4) | **ON** | Authored `## Agenda` / hard limits in people.md; Turn guidance may force |
| 7 | **`list_continue`** | Roster/dossier multi-hop continue + list format hygiene | **ON** when list/dossier detected | None (engine capability) |
| 8 | **`cast_enrich`** | BG sheet/wiki expansion between posts | **OFF** / paused until persistence races fixed | Enrich budget env |
| 9 | **`nsfw_helper`** | Optional explicit-description helper (e.g. Venice); content in-bounds | **OFF** until configured | Scope block; never “instant yes” |

Layers compose: turning off an outer layer must not break core Send. Prefer **extending** existing inject ids (`present_cast_*`, `knowledge_bounds`, `wiki_stubs`, …) over parallel “agency2” systems — see agency plan.

---

## 4. Delaying gratification (pacing principle)

**Meaning for Pixi:** desire, smut, and information are **in-scope**, but **timing and consent of the fiction** are earned. The engine and prompts bias toward **tension and agency**, not obedient wish-fulfillment porn or instant roster dumps.

### Mystery vs confusion (operator mantra)

**Mystery is exciting; confusion is frustrating.**

| | Mystery (want) | Confusion (avoid) |
|--|----------------|-------------------|
| Feel | Curiosity, chase, earned reveal | Mud, “what just happened?”, broken trust |
| Fiction | Secrets, motives, fog of war the cast would not know | Contradictory time/place/outfit/identity with no acknowledge |
| Engine/UI | Epistemic bounds, presence tags, partial stubs | Silent model swap, missing WD, Cast empty, unexplained errors |
| Player | Can form a hypothesis and test it | Cannot tell what is diegetic vs broken |

Wire: inject layer `agency_delay` (`AGENCY_DELAY_BLOCK` / `CHAT_UI_INJECT_AGENCY_DELAY`).

| Domain | Delay / earn | Still allowed |
|--------|--------------|---------------|
| **Cast / agency** | Own goals; resist over-compliance; stages e.g. refuse → bargain → partial → crack → aftermath | Explicit anatomy/acts when the beat is sexual — hesitation ≠ sandbagging prose |
| **NSFW pacing** | Compliance follows disposition + `breakdown_stage` + fiction | In-bounds explicit description; Turn guidance can force pace |
| **Reveals** | Facts enter via play, WD, or present-cast stubs — not full wiki / full roster as free porn | Operator Cast/Wiki UI may show full sheets (UI ≠ Send inject) |
| **Context inject** | Latest scene + summaries + **present** stubs; epistemic fog for absent | Package contract + clock + presence |
| **Lists / dossiers** | Continue/complete when asked; do not volunteer entire unmet cast as fulfillment | List-continue layer when user asks |

### Anti-patterns (reject in product defaults)

1. **Instant compliance** — NPC drops agenda because the player asked once.
2. **Full roster / wiki dump as wish-fulfillment** — stuffing every sheet into Send.
3. **Option menus / `[Options]` / Option Pivot** — player-facing meta menus (hygiene + direction_contract).
4. **Sandboxing explicit content** to fake “agency” — agency is about *will*, not euphemism.
5. **Engine hardcodes** for a favorite character/scenario to “make the beat work.”
6. **Confusion dressed as mystery** — withholding clarity about *system/continuity* (who’s present, clock, identity) instead of *plot* secrets.

### Success criteria (pacing)

- Present NPCs show a durable agenda/stakes line (or package seed) that survives turns.
- Intimate escalation can be opposed while prose stays explicit.
- Send inject inventory stays presence-gated; full wiki remains UI/disk.
- No player-facing options menus or rejection-meta narration in shipped replies.

---

## 5. Anti-hardcode rules

Aligned with [`CONTINUITY.md` §10](./CONTINUITY.md):

1. **Package / `observed_world` / WORLD_DELTA first** — presence, identity, relations, home base from data.
2. **No per-character / per-scenario invent in engine** — no `if (name === "Yuna")` product paths; no minting scene-cast from rank titles.
3. **If forced special-case:** mark `HARDCODE(scenario): …` + upgrade path in the same comment.
4. **Alias → canonical sheet** — nicknames must not fork Cast cards; never fuzzy-merge distinct people.
5. **Life-stage / role inference** = generic text rules on **that person’s** corpus only.
6. **“Mentioned”** = epistemic first-hand relevance, not bare name-string hits.
7. **Scenario uniqueness** → package fields + layer config, not a second engine tree.

---

## 6. How scenario packages plug in

| Package piece | Role vs engine |
|---------------|----------------|
| `scenario.json` | Ids, activation, home_base, feature flags / layer hints |
| `system.md` | Immersion/agency charter, length, scenario voice (content) |
| `people/*.md` | Authored identity, agenda, limits — seeds, not Send dumps |
| `entities` / RAG / `inject/*.md` | Lore + spatial slices the engine **selects** by presence/scene |
| Opening cast | Initial `cast_activation` / unmet vs present |

**Engine backends** (merge, inject assembly, stub job, clock, list-continue, hygiene) read these generically. A zombie lab and a dorm slice share the same gobstopper; only package data and layer toggles differ.

---

## 7. Operator checklist

When adding a feature, ask:

1. Is this **core** or a **peelable layer**?
2. Does it read **package / observed_world**, or did I invent a name in code?
3. Does it respect **presence** and **delay-gratification** (no instant compliance / full-dump inject)?
4. Can a scenario **disable or tune** it without a fork?

---

## 8. mem-constant pointer

Project memory for **Pixi engine** (this coordination repo):

- Design SoT: **`docs/pixi/ENGINE-GOBSTOPPER.md`** (this file)
- Carryover pointer: **`.mem-constant/pixi-engine.md`**
- Continuity ops: `docs/pixi/CONTINUITY.md`
- Active implementation plan: `pixi-rp-context-agency-plan.md`

Agents starting Pixi work: read the gobstopper doc + Continuity §1–3 before changing inject or merge behavior.
