# Character sheet baseline — Docs + Pixi engine guts (2026-07-27)

**Status:** Phase 1 shipped (Docs create/`@`/NYC characters + engine dry-run) — 2026-07-27  
**Holder:** character-sheet-baseline  
**Inventory:** [`character-sheet-baseline-inventory-2026-07-27.md`](./character-sheet-baseline-inventory-2026-07-27.md) — **landed mid-flight**; this plan **implements its reuse verdict** (extend Pixi dossier/`body_profile` + CHARACTER-SHEETS-PLAN; prose depth from Sasha ∪ Pixi package people; Docs H2 envelope — no second JSON religion).  
**Extends (do not fork):** inventory §4–5 · [`docs/pixi/CHARACTER-SHEETS-PLAN.md`](../pixi/CHARACTER-SHEETS-PLAN.md) · [`docs/pixi/docs-engine-bridge.md`](../pixi/docs-engine-bridge.md) · wiki frontmatter in [`docs-wiki-pixi-scenario-2026-07-27.md`](./docs-wiki-pixi-scenario-2026-07-27.md) · Docs MVP · Gobstopper / CONTINUITY.

---

## Assumed “why” (confirmed)

You want **authored design-doc sheets** as the **baseline feed** into Pixi-shaped structured fields and as **writable SoT in Docs**, so one character can be defined (six pillars) and **beta-tested** — not only thin runtime sheets mined after Send.

| Surface | Job for sheets |
|---------|----------------|
| **Docs (linuxbox Hub)** | Create / edit / comment on pillar markdown; `@name` → sheet; talk-to-doc about the open sheet; sheet **generate/modify** via **Pixi engine guts** (adapters) — **not** the Pixi RP UI |
| **Pixi RP `:8767`** (`linuxbox-pixi-rp`) | Separate product: consume sheet → `observed_world` / stubs / package `people_md`; beta-test interactions for **one** cast member |
| **Chars registry** | Identity index + portraits (`id` / aliases) — **not** the prose SoT |

**Architecture (authoritative):** share **engine primitives** (`body_profile`, `character_dossier`, merge/hygiene parsers, heading→field adapters) between Docs authoring and Pixi RP. **Do not merge products** — no second full Pixi UI under Docs; no Hub iframe of `:8767` as the authoring app. See [`docs-engine-bridge.md`](../pixi/docs-engine-bridge.md).

Rejected readings: “second sheet format beside CHARACTER-SHEETS-PLAN,” “full Pixi engine rewrite this pass,” “auto-mint faces,” “Docs = Pixi RP.”

---

## Grade references (Sasha ∪ Pixi baseline)

| Role | Path | Size / notes |
|------|------|----------------|
| **Prose depth / key-points exemplar** | [`campaigns/tropic-gooner/characters/sasha.md`](../../campaigns/tropic-gooner/characters/sasha.md) | ~10 KB · SECTION 1–6: Core ID · Physical (musculature/craniofacial/marks) · Psych/behavior · **Skills & combat** · **Psychosexual** (orientation, arousal gate, intimate physiology, orgasmic response) · Wardrobe |
| **Largest / best Pixi package people baseline** (PC + potato match) | `ObsidianWriterStack/PixiApp/chat-ui/scenarios/fictionlab-cocksleeve/people/lauren-fictionlab-complete.md` · live: `~/pixi-rp/ObsidianWriterStack/.../lauren-fictionlab-complete.md` | **~34 KB** — Appearance regions · Temperament · Interests · **Skills** · Relationship/Background · Social/Goals · Daily Routine · Health · **Kinks & Flaws** · Voice phrases · Wardrobe · Psychology essay · scenario gates |
| **Mechanical SoT** | Pixi `body_profile.*` + `character_dossier.*` ([`CHARACTER-SHEETS-PLAN`](../pixi/CHARACTER-SHEETS-PLAN.md) §3; inventory §2) | Field ids in chat-ui `body_profile.py` / `character_dossier.py` |
| SpaceQuest fill quality (Speech/Act) | `campaigns/spacequest/characters/pcs/aurora.md` + `meta/00-framework.md` | Quotes / Egri — still secondary to Sasha∪Lauren for pillar 5 |

**Combine rule:** Sasha sets **uncomfortable specificity** for Look + Skills + Sexuality physiology/arousal honesty. Lauren sets **full RP authoring surface** (skills, kinks, routines, health, voice banks) that already maps onto dossier clusters. Template pillar 5 = **union of both section sets**, serialized later into dossier keys — not a third schema.

---

## 0. Inventory verdict (adopted)

From inventory §0–4 (do not re-litigate here):

| Fact | Implication for this plan |
|------|---------------------------|
| Pixi already has **strong** `body_profile` + `character_dossier` | Docs H2 pillars are an **authoring envelope** that must serialize into those fields later — not a competing schema |
| Hub campaign md ≠ Pixi schema | Template + adapter (Phase 2) bridge prose ↔ structured; Sasha/Lauren = **fill quality**, not SoT shape |
| Registry = roster only | Keep `story_path` / aliases / images; never stuff pillars into registry JSON |
| Docs can edit `characters/` but had **no template** | Phase 0 drops template (done); new-doc UI still deferred |
| Send ≠ Cast | Enriching Docs md alone does not fix RP forgetfulness — Phase 2 must land Look/Speech/Act slices in `observed_world` + inject |

**Rule:** map the **six pillars** onto inventory §5 mapping + CHARACTER-SHEETS-PLAN §3. Do **not** invent a parallel field set.

---

## 1. Six pillars ↔ existing schema

| # | Pillar (Docs H2) | Pixi structured home (inventory §5) | Detail bar |
|---|------------------|--------------------------------------|------------|
| 1 | **Look** | `appearance_notes`, `body_profile.*`, wardrobe_*, `current_outfit`, `inventory`; **promote** `modesty_code`, `gender_presentation` (inventory gap) | Sasha §2 + Lauren Appearance regions; clothing = **cut / fabric / brand / stitching**. Inventory merge-not-wipe. No invented faces. |
| 2 | **Speech** | `voice_speech` (+ optional diction/lexicon/emotional_register nest); live emotion → `state.affect` | SpaceQuest quotes + Lauren phrase banks; English-focused unless diegetic. |
| 3 | **Act** | `personality_social`, `state.goals`, optional `behavior_patterns`; agency_delay layer | Sasha §3 + Lauren Temperament/Goals; own goals; resist over-compliance. |
| 4 | **Think** | `personality_core`, beliefs/desires/secrets; optional `mentality` / worldview lens | Lauren Psychology essay depth; epistemic fog for non-present; life-stage age rules. |
| 5 | **Skills + sexuality + else** | Sexuality dossier cluster **strong**; add `skills` / competencies; gear/residence/routines; **`sexual_partners` / body_count** (already in dossier render) | **Sasha ∪ Lauren** — see §1.5 |
| 6 | **Backstory** | `origin_summary`, `life_timeline`, `world_backstory`, dating_*; clock-gated | Must **mesh** with 1–5; no Day-1 future lore. |

**Dedupe:** durable personality → Think (`personality_core`) + Act social face (`personality_social`); live emotions → `state.affect` only; Speech owns **how it sounds**, not a third personality dump.

**Identity header** (always above pillars): name, aka → **one** canonical `id`, age, pronouns, role/occupation, presence tag when known. Aka never forks a second Cast card.

**Telemetry ban:** pipeline status, model/latency, WD counters, BG queues stay on chat meta — never in these H2s ([CHARACTER-SHEETS-PLAN](../pixi/CHARACTER-SHEETS-PLAN.md) §1).

### 1.5 Pillar 5 — Sasha ∪ Pixi baseline (fields / sections kept)

Docs markdown may use these **H3** (or bold bullets). Adapter maps → Pixi keys when Phase 2 lands.

| Docs subsection (keep) | Source bar | Pixi / mechanical home |
|------------------------|------------|-------------------------|
| **Skills / competencies** | Sasha §4 Primary Skills · Lauren `## Skills` | **Gap → add** `skills` / `competencies` (prose list OK; not D&D sheet unless campaign asks) |
| **Strengths** | Sasha §4 | Optional under skills or Act; no separate dossier key yet |
| **Weaknesses / incompetence** | Sasha §4 · Lauren Flaws (skill-side) | Prose under skills; flaws that are **character** → Act/Think |
| **Interests / hobbies** | Lauren `## Interests & Hobbies` | Else / `daily_routines` adjacent; optional free prose |
| **Sexuality — orientation** | Sasha §5 | `psychosexual_profile` / `sexual_preferences` openers |
| **Arousal model / gates** | Sasha Demisexual binary · Lauren scenario consent/arousal gates | `psychosexual_profile` (explicit; no euphemisms) |
| **Intimate physiology** | Sasha §5.1 (anatomy accurate) · Lauren Appearance genital/pubic + Health | `body_profile` genital cluster + dossier NSFW fields; clock/age locked |
| **Stimulation & orgasmic response** | Sasha §5.1 | `stimulation_preferences` |
| **Fetish / kinks** | Lauren `## Kinks & Flaws` | `fetish_interests` |
| **Sexual behavior / preferences / boundaries** | Lauren rules + Sasha honesty | `sexual_behavior`, `sexual_preferences` |
| **Sex toys / equipment** | Lauren Health ledger / toys | `sex_toys_equipment` |
| **Partner / body-count map** | AGENTS SoT · dossier already renders `sexual_partners` + body_count | **`sexual_partners[]` + body_count** on dossier (established facts only — do not invent) |
| **Sexual / dating history** | dossier keys · Sasha chronological honesty | `sexual_history`, `dating_relationship_history` — **no invent past age / ahead of diegetic clock** |
| **Bonds / intimacy (non-map)** | Lauren Relationship · Sasha trust pattern | Prose + relation edges; not a second partner invent |
| **Health / somatic (skills/sex-relevant)** | Lauren `## Health` | Else prose; injuries → Look/physical |
| **Else — residence, gear, routines, vices, finances** | Lauren Daily Routine · dossier kit cluster | `residence_living_situation`, `carried_gear_habitual`, `daily_routines`, `property_possessions`, … |

**NSFW policy:** explicit anatomy and acts when established (AGENTS) — mirror Sasha’s honesty level; never invent partners, years, or acts past current age.

---

## 2. Canonical markdown template

**Path (Phase 0):** [`campaigns/_templates/character-sheet.md`](../../campaigns/_templates/character-sheet.md)  
**Example fill (stub):** [`campaigns/_templates/character-sheet.example.md`](../../campaigns/_templates/character-sheet.example.md)

Frontmatter + H2 pillars (system-understood). Optional YAML keys are for Docs `@` resolve + registry bridge — prose remains the design doc.

```markdown
---
id: <slug>                 # canonical; matches registry / Pixi person id when bridged
kind: character
aliases: []                # nicknames → same sheet; never fuzzy-merge distinct people
campaign: <campaign-id>
age: null                  # lock when known; life-stage inference only if no stronger age
pronouns: null
status: stub               # stub | draft | canon
---

# <Display Name>

## Identity
## Look
## Speech
## Act
## Think
## Skills + sexuality + else
## Backstory
```

**Authoring rules (pointers):**

- **Design-doc grade** — uncomfortable detail; do not truncate panels with “…” for identity/state. Cap only true disk bloat.
- **Age / clock** — sheet age and sexual history must not invent years/acts past current age or ahead of session diegetic clock.
- **Epistemic “mentioned”** — first-hand relevance (know/see/experience/told), not bare name hits.
- **Cast registration** — global via WORLD_DELTA / registry ensure; wiki md is secondary SoT for prose, not a second roster CRUD.
- **Empty sections** — omit or mark `TBD` briefly; do not emit empty Affect/telemetry dash blocks (Pixi scrub already hates those).
- **Grade refs** — when unsure how deep to go, open Sasha + Lauren complete (paths in § Grade references).

---

## 3. Where sheets live in the Docs tree

| Campaign | Preferred path | Indexed today? |
|----------|----------------|----------------|
| **tropic-gooner** | `campaigns/tropic-gooner/characters/<slug>.md` | Yes (`storyDirs` includes `characters`) |
| **spacequest** | `campaigns/spacequest/characters/pcs/<slug>.md` (or migrate headings to pillars over time) | Yes |
| **nyc-mafia-dnd** | `campaigns/nyc-mafia-dnd/story/characters/<slug>.md` **or** add `characters` to `storyDirs` | **No** `characters/` yet — open Q |
| **Cross-campaign template** | `campaigns/_templates/character-sheet.md` | Not in Stories (templates root); copy out |

**Draft vs canon:** drafts may start under `notes/` or `reports/` with `status: draft`; promote into `characters/` (or `story/characters/`) when ready. Docs badges already distinguish draft roots vs storyDirs.

**Do not** put design-doc sheets only inside `characters-registry.json`. Registry rows may point via `story_path` / `id` to the md file.

---

## 4. How Pixi consumes sheets (data-driven) + Docs engine guts

```text
Docs / package people_md  ──►  sync / seed person row  (heading→dossier adapter)
                              │
                              ├──► observed_world.people (+ dossier / outfit / age)
                              ├──► thin + enrich markdown (Cast / Wiki UI in Pixi RP)
                              └──► Send inject layers (stubs, identity, outfit, agency…)
                                       NOT full pillar dump by default
```

| Step | Mechanism | Rule |
|------|-----------|------|
| Seed | Package `people/` md **or** campaign `characters/<slug>.md` copied/linked into package | Same pillar headings when authored for Pixi |
| Live SoT | `observed_world` + WORLD_DELTA | Conflicts with current outfit/scene → people row wins |
| Hygiene | `applyContinuityHygiene` / sheet→people age & outfit | Sheet facts must land in people for Send |
| Inject | Present stubs + selective slices (voice, agenda, outfit) | Full six-pillar markdown = **UI/disk**; Gobstopper `stubs_satyr` ≠ full wiki |
| Engine | Generic parsers on headings / dossier keys | **No** `if (name === "…")` product paths |
| **Docs authoring on box** | Thin adapters under `scripts/pixi/` + bridge doc — reuse Pixi field merge logic | **Not** a second RP UI |

**Bridge target:** when Docs sheet `id` matches Pixi person / registry id, round-trip Identity + Look (outfit) + Act (agenda) + Speech (voice) first; Skills/Sexuality/Backstory on enrich / operator Cast.

**This pass:** document contract + template bar + bridge one-pager — **no** Pixi inject rewrite; **no** second UI.

---

## 5. Docs UX (create · edit · comments · beta-test)

### Create (Phase 0 — manual; Phase 1 — UI)

Docs **new-doc/folder is deferred** (MVP Result 2026-07-27). Until wired:

1. Copy `campaigns/_templates/character-sheet.md` → `campaigns/<id>/characters/<slug>.md` (or NYC `story/characters/`).
2. Fill frontmatter `id` / `aliases` / `campaign`.
3. Open in **Docs** silo → Edit → Save (allowlisted PUT already live).
4. Optional: Ops Chat `CAMPAIGN_WRITE` to `characters/<slug>.md` (short-form already allowlisted).

**Later (Docs A3):** “New character sheet” = New doc under `characters/` using this template stub.

### Edit + comments

- Inline edit + Save (live).
- Highlight → comment / post-it (live under `agents/state/doc-comments/`). Apply patches carefully; do not clobber registry.

### `@name` → sheet

- **Target:** autocomplete from registry ∪ frontmatter `id`/`aliases` ∪ filename slug (Docs B4 — deferred).
- **Phase 0 interim:** markdown link `[Name](characters/<slug>.md)` + Chars deep-link `?tab=characters&char=<id>` when registry row exists.
- **Never** fuzzy-merge distinct cast.

### Beta-test (ponytail pick)

| Path | Use when | Why |
|------|----------|-----|
| **A. Pixi RP `:8767` (preferred for play)** | Exercise Look/Speech/Act/Think in play; one-character scenario | Real Send + WD + agency; **separate product** |
| **B. Ops Chat · document** | Critique / rewrite pillars; talk-to-doc | Authorship / prose — cheaper |
| **C. Docs + engine guts (future)** | Generate/modify structured fields from pillar md without opening RP UI | Adapters only — see bridge doc |

**Recommendation:** beta-test **interactions** on Pixi RP; beta-test **prose quality** on Ops Chat focus-doc. Do not route talk-to-doc through Pixi Send.

**Beta loop:** edit sheet → open Pixi RP with that `id` in package/cast → N turns → patch pillars via Docs comments or WD→enrich (registry writes only with multitask lock).

---

## 6. Phased todos

### Phase 0 — scaffold ✅

- [x] Ledger Intent
- [x] This plan (extend existing formats)
- [x] Template `campaigns/_templates/character-sheet.md`
- [x] Example stub `campaigns/_templates/character-sheet.example.md` (fictional placeholder — not a live cast invent)
- [x] Cross-link from CHARACTER-SHEETS-PLAN + pixi README
- [x] Document create path (no Docs new-doc UI yet)
- [x] User decisions: architecture split · pillar 5 = Sasha ∪ Lauren · refine not redesign
- [x] Expand template pillar 5 to combined bar
- [x] `docs/pixi/docs-engine-bridge.md` one-pager
- [x] Deploy templates to potato (copy for authors; `_templates` not in `storyDirs`)
- [x] Ledger Result

### Phase 0+ — adapter stub (ponytail)

- [x] Bridge doc points at Pixi field modules + future `scripts/pixi/` hook notes
- [x] `scripts/pixi/sheet-to-dossier.py` heading→field dry-run (+ optional `--generate`)

### Phase 1 — Docs create + `@` resolve (after Docs MVP follow-ons)

- [x] “New character sheet” in Docs → `POST /api/docs/character-sheet` under allowlisted `characters/`
- [x] `@` resolve API + Docs button (exact id/alias/slug — not full autocomplete UI)
- [x] NYC: add `characters` to `storyDirs` + `campaigns/nyc-mafia-dnd/characters/INDEX.md`
- [ ] Playwright: create → edit → reload; `@slug` jumps to sheet (curl verify on potato this pass)

### Phase 2 — Pixi consume one character (+ Docs adapter)

- [ ] Package or session seed from pillar md (generic heading parse → dossier / people fields)
- [ ] Selective Send inject slices (Speech / Act agenda / Look outfit) — still no full dump
- [x] Docs→structured dry-run via `sheet-to-dossier.py` (no second UI)
- [x] Beta CTA on Hub Pixi + Docs (engine path; play still `:8767` separate)
- [ ] Verify: clothing permanence + agency line survive N turns

### Phase 3 — generate / modify from play

- [ ] Docs comments / post-its → Accept → patch pillars
- [ ] Pixi enrich / character_record write **into pillar headings** (diegetic only)
- [ ] Registry soft-link `story_path` when promoting stub → canon (**lock** required)

---

## 7. Open questions — resolved vs still open

### Resolved (user 2026-07-27)

| Q | Answer |
|---|--------|
| Architecture | **Engine guts shared; Pixi RP product separate** (`:8767`). Docs authoring/beta/sheet-gen on linuxbox uses adapters — not a merged UI. |
| Skills / sexuality / else depth | **Follow Sasha ∪ Pixi Lauren baseline** (§1.5). Verbose OK. Explicit NSFW when established. |
| Skills format | **Free prose competencies** (+ strengths/weaknesses) first; D&D-style lists only if a campaign asks — not the Docs default. |
| Partner / body-count map | Prefer **dossier `sexual_partners` + body_count** (already rendered in Pixi); optional per-campaign SoT file later if multi-thread drift needs it — not blocking. |

### Still open (human)

1. **Pillar dedupe** — accept §1 write rule (Think core / Act social / Speech sound / affect live)?
2. **Modesty / gender presentation** — first-class Pixi keys (inventory sketch) or Look prose only for now?
3. **NYC path** — ✅ add `characters` to `storyDirs` (done)
4. **SpaceQuest** — migrate PC dossiers to six-pillar H2s, or keep Egri/Truby with pillar aliases?
5. **Beta seed path** — Docs → package `people/*.md` first vs live PATCH `observed_world` from Hub? (recommend package seed first)
6. **First real sheet** — which living character is the Phase 2 pilot? (Ellaine / Sasha / SpaceQuest PC — do not invent)
7. **Registry** — on promote, auto-stub with `story_path`, or always ask GM first?

---

## 8. Non-goals

- Second competing sheet schema beside CHARACTER-SHEETS-PLAN / CONTINUITY
- Merging Docs Hub with Pixi RP into one UI / standing up a second full Pixi UI
- Full Pixi engine / inject rewrite this pass
- Inventing faces / AI portraits
- Blind registry overwrite or writes without multitask lock
- Dumping full six-pillar markdown into every Send
- Docs formatting ribbon / Obsidian clone
- Hard-delete of GM cast; fuzzy alias merges (Vivian ≠ Yuna)

---

## 9. Related paths

| Path | Role |
|------|------|
| `campaigns/_templates/character-sheet.md` | Canonical empty template |
| `campaigns/_templates/character-sheet.example.md` | Filled stub (placeholder person) |
| `campaigns/tropic-gooner/characters/sasha.md` | Prose depth / psychosexual grade ref |
| `…/fictionlab-cocksleeve/people/lauren-fictionlab-complete.md` | Largest Pixi package people baseline (~34 KB) |
| `docs/pixi/docs-engine-bridge.md` | Docs ↔ Pixi engine guts (not product merge) |
| `docs/pixi/CHARACTER-SHEETS-PLAN.md` | Sheet vs telemetry + structured sections |
| `docs/pixi/ENGINE-GOBSTOPPER.md` / `CONTINUITY.md` | Engine layers + SoT / inject |
| `docs/plans/docs-wiki-pixi-scenario-2026-07-27.md` | Wiki + Pixi harness phases |
| `docs/plans/docs-smart-editor-feature-set-2026-07-27.md` | Docs tools (`@`, new doc, talk-to-doc) |
