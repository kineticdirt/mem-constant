# Character sheet baseline inventory — 2026-07-27

**Status:** read-only inventory (no implementation)  
**Holder:** char-sheet-baseline-inv  
**Why (interpretation):** GM wants one **baseline sheet schema** that (a) feeds Pixi Send/`observed_world`, (b) is editable/generatable from Docs wiki, and (c) can be beta-tested in Pixi RP — organized as six pillars: Look · Speech · Act · Think · Skills+sexuality+other · Backstory.

**Sibling plans:** `CHARACTER-SHEETS-PLAN.md` (sheet vs telemetry), `docs-wiki-pixi-scenario-2026-07-27.md` (Hub wiki ↔ Pixi bridge), `docs-smart-editor-feature-set-2026-07-27.md`, `pixi-rp-deterministic-sheet-plan.md` (canon vs LLM flavor).

---

## 0. Verdict (one screen)

| Question | Answer |
|----------|--------|
| Is there already a structured sheet schema? | **Yes — Pixi** `observed_world.people[*].body_profile` (~48 fields) + `character_dossier` (~35 text fields) + thin MD headings in `CHARACTER-SHEETS-PLAN.md` §3. |
| Is Hub/campaign md aligned to that schema? | **No.** Tropic Discord/hand sheets and SpaceQuest PC dossiers are **prose design-docs** with different section taxonomies; registry is **roster metadata only**. |
| Docs wiki ready to author sheets? | **Partial.** Docs MVP can tree/edit/save under `characters/` (allowlisted); no sheet template, no `@entity` autocomplete, no Pixi round-trip yet. |
| Top reuse for baseline? | **Extend Pixi dossier+body_profile + CHARACTER-SHEETS-PLAN §3 as the mechanical SoT**; map Docs H2 sections 1:1; borrow SpaceQuest Egri/voice blocks and Tropic Sasha SECTION depth for prose fill quality. |

---

## 1. What exists (by surface)

### 1.1 Pixi RP (runtime SoT — potato `~/pixi-rp`, mirrored docs in agent-dump)

| Artifact | Path / shape | Owns |
|----------|--------------|------|
| Continuity SoT map | `docs/pixi/CONTINUITY.md` | Priority: `observed_world` > package > transcript > sheets (UI) > memo > prose |
| Sheet vs chat contract | `docs/pixi/CHARACTER-SHEETS-PLAN.md` | Diegetic sheet vs `rpg.telemetry` / message ops |
| Permanence | `docs/pixi/WORLD_PERMANENCE.md` | Aka collapse, salvage, hygiene, PUT preserve |
| Gobstopper | `docs/pixi/ENGINE-GOBSTOPPER.md` | Peelable layers; full wiki = UI/disk, not Send dump |
| Kit / outfit WD | `docs/pixi/injection-packs/CONTRACT.md` | `current_outfit`, `inventory`, wear_slots |
| Mechanical people row | `session.rpg.observed_world.people[id]` | Identity locks + mutable scene/outfit/state |
| Structured anatomy | `body_profile.*` | See §2.1 |
| Structured dossier | `character_dossier.*` | See §2.2 |
| Sheet markdown | `rpg.character_sheets` / `character_record[].markdown` | Cast/Wiki human reading; **not** full Send inject |
| Voice inject | `present_cast_voices` | Caps voice/core/social/drive for **present** cast only |
| Outfit inject | `present_cast_state` | Live outfit / physical / activity |
| Package seed | scenario `people/*.md` + `authored_canon` | Identity/age/origin anchors (deterministic path shipped) |

**Important product rule (already decided):** Cast/Wiki sheets ≠ Send. Facts reach the model only via `observed_world` + inject layers. Any Docs→Pixi baseline must write **structured fields**, not only pretty markdown.

### 1.2 Campaign markdown (Hub Stories / Docs)

| Convention | Location | Shape |
|------------|----------|-------|
| Tropic Discord sheets | potato `campaigns/tropic-gooner/characters/discord/<slug>.md` | Ingest by `Name:`; registry `story_path` |
| Tropic hand sheet (design-doc grade) | e.g. `campaigns/tropic-gooner/characters/sasha.md` | SECTION 1–6: ID, Physical, Psych/Behavior, Skills, Psychosexual, Wardrobe |
| SpaceQuest PC dossiers | `campaigns/spacequest/characters/pcs/*.md` + `meta/00-framework.md` | Egri spine/need/contradiction · Truby · Story Circle · Voice quotes · Relationships · CHARML XML block |
| NYC | **No** `characters/` tree | Factions/premise under `story/` only |
| Index | Tropic `characters/INDEX.md`; SpaceQuest `characters/README.md` | Human TOC |

Discord sheet files are **not** in the PC workspace clone (potato/runtime); PC has Sasha + SpaceQuest PCs as local exemplars.

### 1.3 `characters-registry.json` (Tropic)

Path: `campaigns/tropic-gooner/characters-registry.json` (v31 at inventory time).

**Roster fields only** (no Look/Speech/Act body):

`id`, `display_name`, `aliases`, `story_path`, `discord_*`, `player_name`, `status`, `role`, `hidden`, `canonical_id`, `can_proxy`, `notes`, `duplicate_paths`, `relations[]`, `doc_attachments`, `images`, `image_path`.

Versioning/merge: `docs/chars-registry-versioning.md` + multitask lock. Soft-hide stubs via `canonical_id` only.

**Gap:** registry is **not** a sheet schema — it points at sheet md + portraits + edges.

### 1.4 Docs wiki MVP (2026-07-27)

| Piece | Status |
|-------|--------|
| `scripts/linuxbox/linuxbox-docs-wiki.js` | Tree + allowlisted PUT; `characters/` in `WRITE_ROOTS` |
| Frontmatter parse | `id` / `kind` / `tags` / `@mentions` / `[[wikilinks]]` extracted |
| Sheet template | **None** — wiki-pixi plan proposed stub H2s only (`Identity`, `Appearance/clothing`, `Relationships`, `Established facts`) |
| Generate / enrich | Deferred (talk-to-doc, @autocomplete, Pixi harness) |
| Registry writes | Explicitly **forbidden** on Docs PUT |

### 1.5 AGENTS.md sheet preferences (binding product intent)

Must survive any baseline:

- Design-doc grade clothing (**cut / fabric / brand / stitching**); no truncated panels.
- Canonical age + life-stage inference; no invented timeline past age/clock.
- Alias → **one** canonical sheet; never fuzzy-merge distinct cast.
- Diegetic sheet data only (no telemetry).
- Sexual-partner / body-count map in SoT so LLMs do not invent partners.
- Present-cast sheets fully expanded after enrich; presence tags gate inject.
- NSFW explicit anatomy in-bounds; Venice helper optional outer Gobstopper layer.

---

## 2. Pixi structured field inventory (reuse candidates)

### 2.1 `body_profile` (Look / anatomy — mirror of `BODY_PROFILE_FIELD_IDS`)

`overview`, `height_cm`, `weight_kg`, `build`, `body_shape`, `body_spatial_map`, `neck_shoulders`, `back_torso_posterior`, `chest_detail`, `arms_hands`, `buttocks_glutes`, `legs_feet`, `oral_lips_teeth`, `ears_detail`, `measurements`, `bust_cup`, `underbust_cm`, `waist_cm`, `hips_cm`, `abdomen_torso`, `muscle_tone`, `veins_visible`, `skin_tone`, `skin_texture`, `nipples_areolae`, `hair_*`, `eye_color`, `face`, `facial_detail`, `eyes_detail`, genital cluster, hair clusters, `distinctive_marks`, `scars_damage`, **`age` (identity-locked)**.

Plus people-row: `appearance_notes`, `features_notes` (locked), `current_outfit` (mutable), clothing objects (`wear_slot`).

### 2.2 `character_dossier` (Speech / Act / Think / Skills / Sexuality / Backstory mix)

From `DOSSIER_TEXT_FIELD_IDS` / Wiki rows:

| Cluster | Keys |
|---------|------|
| Origin / backstory | `ethnicity`, `nationality`, `languages`, `origin_summary`, `life_timeline`, `world_backstory`, `occupation_before`, `residence_living_situation` |
| Personality / think | `personality_core`, `personality_social`, `personality_sketch`, `beliefs_values`, `desires_wants`, `needs_emotional_physical`, `regrets_shame`, `secrets_hooks` |
| Speech | `voice_speech` |
| Wardrobe (Look) | `wardrobe_undergarments` … `wardrobe_formal_occasion` (×6) |
| Kit / other | `carried_gear_habitual`, `property_possessions`, `household_inventory`, `vehicles_transport`, `daily_routines`, spatial env keys |
| Sexuality | `sexual_history`, `dating_relationship_history`, `psychosexual_profile`, `fetish_interests`, `stimulation_preferences`, `sex_toys_equipment`, `sexual_behavior`, `sexual_preferences` |

People `state.*`: `affect` (mood/stress/fear/hope), `goals.current_objective`, `social` (trust/fear) — **Act** live state, not biography.

### 2.3 CHARACTER-SHEETS-PLAN §3 target sections (player-facing order)

Identity → Appearance → Current outfit → Personality → Goals/drives → Relationships prose → Inventory → Scene history (open Q) → Secrets → Epistemic → Voice → Physical/wounds → Bonds → Cast activation.

---

## 3. Six-pillar gap matrix

Legend: **Strong** = structured + used · **Partial** = exists but thin/split/prose-only · **Gap** = missing or not round-trippable Docs↔Pixi.

| Pillar | User ask | Pixi structured | Campaign md exemplars | Docs wiki | Gap vs baseline |
|--------|----------|-----------------|----------------------|-----------|-----------------|
| **1. Look** | inventory, dress, modesty, gender presentation | **Strong** outfit + wardrobe×6 + body_profile; kit pack wear_slots | Sasha §2 Physical + §6 Wardrobe (design-doc) | Stub `## Appearance / clothing` only | **Modesty** + **gender presentation** not first-class keys (buried in notes/prose). Inventory exists but often sparse. Clothing granularity (cut/fabric/brand) is policy, not schema enforcement. |
| **2. Speech** | diction, lexicon, emotions | **Partial** — single `voice_speech` + inject caps; emotions live in `state.affect` | SpaceQuest §6 Voice & play behaviors (quoted lines = gold) | None | No split **diction / lexicon / emotional register**. Emotions split across affect (live) vs personality (durable). |
| **3. Act** | personality, emotions, behavior | **Partial** — `personality_*` + `state.goals` + agency_delay layer | SpaceQuest Egri/Truby; Sasha §3 Psych/Behavior | None | Behavior/play patterns not a dedicated field (quotes live in md). Emotions duplicate Speech. |
| **4. Think/parse** | mentality, personality, emotions | **Partial** — `personality_core` / beliefs / desires / secrets | Egri contradiction + need; Sasha internal state | None | No explicit **mentality / epistemic style / parse filter** (how they interpret the world). Personality overlaps Act. |
| **5. Skills + sexuality + other** | skills, sexuality, misc | Sexuality **Strong** (many dossier keys); Skills **Gap** in Pixi dossier; Other = gear/residence/routines **Partial** | Sasha §4 Skills & combat; §5 Psychosexual; SpaceQuest class/theme | None | **Skills / competencies** not in `character_dossier` keys. Partner/body-count **map** desired in AGENTS — not a dedicated SoT file yet (history prose only). |
| **6. Backstory** | meshes with above + worldbuilding | **Partial** — origin/timeline/world_backstory; deterministic canon guards; LLM enrich still invents if ungated | SpaceQuest §8–9 hooks/open Q; Tropic Discord seeds | Proposed `## Established facts` | Must mesh age/clock + package entities; no Docs→WD promote path yet. Scene history on sheet still open Q in CHARACTER-SHEETS-PLAN §7. |

### Cross-cutting gaps

1. **Three schemas, zero adapter** — Pixi JSON fields ↔ Tropic SECTION prose ↔ SpaceQuest Egri/CHARML. Docs plan stub H2s cover ~20% of dossier.
2. **Registry ≠ sheet** — Hub Chars edits roster/portraits; sheet body is separate md / Pixi session.
3. **Send visibility** — enriching Docs md alone does not fix RP forgetfulness; must land in `observed_world` + inject.
4. **Pillar overlap** — personality/emotions appear in Speech, Act, and Think; baseline should assign **one durable home** + **one live state home** to avoid triple writes.
5. **NYC has no character tree** — baseline schema useful only after Docs create-under-`characters/` (deferred from MVP).

---

## 4. Reuse candidates (ranked)

### A. Primary (recommended) — Pixi dossier + body_profile + CHARACTER-SHEETS-PLAN

**Reuse as the baseline mechanical schema.** Reasons:

- Already wired to merge, Wiki render, enrich, hygiene, identity locks.
- Gobstopper + CONTINUITY already define UI vs Send.
- Docs wiki-pixi plan already requires Hub sheets to **round-trip the same identity fields**.
- Deterministic/canon path (`authored_canon`, hybrid D1) is the anti-hallucination spine.

**Minimal extensions for the 6 pillars** (schema sketch only — not implementing):

| Pillar | Add or promote |
|--------|----------------|
| Look | `modesty_code`, `gender_presentation`; keep wardrobe×6 + `current_outfit` + inventory |
| Speech | Split or nest under `voice_speech`: `diction`, `lexicon`, `emotional_register` (or keep one prose blob + SpaceQuest quote examples in md) |
| Act | Keep `personality_social` + `state.*`; add optional `behavior_patterns` / play-beat notes |
| Think | Keep `personality_core` + beliefs/desires/secrets; optional `mentality` / worldview lens |
| Skills+sex+other | Add `skills` / `competencies` list; keep sexuality cluster; add `partner_map` / body-count SoT (AGENTS) |
| Backstory | Keep origin/timeline/world_backstory; Docs H2 `## Backstory` maps to those keys; clock-gated |

### B. Prose quality templates — Tropic Sasha + SpaceQuest framework

- **Sasha** = Look / Skills / Sexuality depth bar (uncomfortable specificity).
- **SpaceQuest `00-framework.md` + Aurora** = Speech quotes, Act spine, Think contradiction, relationship edges, machine CHARML block for parsers.

Use as **authoring/generation prompts + markdown section order**, not a second JSON schema.

### C. Docs wiki frontmatter stub (wiki-pixi §4)

Keep as **Docs-facing markdown envelope** that serializes to/from A:

```yaml
id / kind: character / aliases / campaign
```

Expand H2s to match pillars once schema locked — do not invent a parallel field set.

### D. Registry

Keep as **index** (`story_path`, aliases, relations, images). Do not stuff pillar prose into registry JSON.

### E. Do not reuse as SoT

- LLM free-invent enrich without canon gate (known hallucination source — see deterministic plan).
- Chat telemetry / HP bars / BG job status on sheet surfaces.
- Fuzzy alias merge heuristics.

---

## 5. Proposed baseline mapping (Docs H2 ↔ Pixi fields)

For a future template (inventory only):

| Docs H2 (pillar) | Pixi structured home | Live / mutable? |
|------------------|----------------------|-----------------|
| Identity (preamble) | `name`, `also_known_as`, `pronouns`, `role`, `body_profile.age` | Locked |
| Look | `appearance_notes`, `body_profile.*`, wardrobe_*, `current_outfit`, `inventory`, (+modesty/presentation) | Outfit/inventory mutable |
| Speech | `voice_speech` (+diction/lexicon split) | Mostly durable; affect live |
| Act | `personality_social`, `behavior_*`, `state.goals`, edges prose | Goals/affect live |
| Think | `personality_core`, beliefs, desires, secrets, mentality | Durable |
| Skills · Sexuality · Other | `skills` (new), sexuality_*, gear/residence/routines | Durable + inventory live |
| Backstory | origin_summary, life_timeline, world_backstory, dating_*, partner_map | Durable; clock-gated |
| Relationships | edges + dossier references | Accumulate |

---

## 6. Open questions (need GM before schema freeze)

1. **Pillar dedupe:** one home for “personality” and “emotions” — or allow Act/Think/Speech to share with clear write rules?
2. **Skills:** D&D-style lists (SpaceQuest) vs free prose competencies vs both?
3. **Partner/body-count map:** separate SoT file per campaign vs dossier field vs both?
4. **Modesty / gender presentation:** first-class keys or wardrobe/personality prose?
5. **Docs generate:** Chat talk-to-doc fill, think lane, or Pixi enrich only?
6. **Scene history on sheet:** curated bullets (CHARACTER-SHEETS-PLAN proposal) or transcript-only?
7. **Beta path:** Docs edit → export into Pixi package `people/*.md` → session, or live PATCH `observed_world` from Hub?

---

## 7. Non-goals (this inventory)

- No schema JSON file shipped.
- No Docs template or Pixi code changes.
- No registry mutation / multitask lock.
- No potato deploy.

---

## 8. File index (absolute, PC workspace)

| Path | Role |
|------|------|
| `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\docs\pixi\CHARACTER-SHEETS-PLAN.md` | Target sheet sections + telemetry split |
| `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\docs\pixi\CONTINUITY.md` | SoT + inject map |
| `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\docs\pixi\WORLD_PERMANENCE.md` | Permanence pipeline |
| `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\docs\pixi\ENGINE-GOBSTOPPER.md` | Layer architecture |
| `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\docs\pixi\injection-packs\CONTRACT.md` | Outfit/inventory WD |
| `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\pixi-rp-deterministic-sheet-plan.md` | Canon vs LLM flavor |
| `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\docs\plans\docs-wiki-pixi-scenario-2026-07-27.md` | Docs↔Pixi sheet bridge intent |
| `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\scripts\linuxbox\linuxbox-docs-wiki.js` | Docs edit allowlist incl. characters/ |
| `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\campaigns\tropic-gooner\characters-registry.json` | Roster index |
| `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\campaigns\tropic-gooner\characters\sasha.md` | Look/Skills/Sexuality prose bar |
| `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\campaigns\spacequest\characters\meta\00-framework.md` | Speech/Act/Think methodology |
| `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\campaigns\spacequest\characters\pcs\aurora.md` | Full dossier exemplar |
| `c:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\.staging\pixi-hygiene\session_turn_augment.mjs` | Field id sets (mirror of potato chat-ui) |

Live Pixi field code: potato `~/pixi-rp/ObsidianWriterStack/PixiApp/chat-ui/` (`body_profile.py`, `character_dossier.py`, `session_turn_augment.mjs`) — not fully mirrored as named files in agent-dump root; staging + docs are the PC evidence.

---

## 9. Suggested next step (after sign-off — not this pass)

Write a short **schema contract** doc (`docs/pixi/CHARACTER-SHEET-BASELINE.md`) that freezes pillar→field map + Docs H2 template, then one adapter: md frontmatter/H2 ↔ `people` row. Defer generate UI until contract exists.
