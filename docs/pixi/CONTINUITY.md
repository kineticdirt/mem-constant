# Pixi continuity — source of truth

**Scope:** Pixi RP chat-ui (`ObsidianWriterStack/PixiApp/chat-ui/`).  
**Code owners:** sibling fix agents (merge/inject). This doc is the operator map.  
**Status (2026-07-17):** Outfit + cast-status inject live (`outfit-state-v1`, `cast-status-v1`). **Age / identity lock + established-facts Send inject live** (`age-identity-v1`). **Continuity hygiene pass live** (`continuity-hygiene-v1`): load/Send bootstraps ages/outfits/places from sheets + appearance_notes, prunes zero-stub Relations edges, syncs `cast_activation`/`known_to_pc` from thin package API, trims bloated sheets.

Companion runtime maps live in the Pixi tree:  
`ObsidianWriterStack/docs/pixi/RUNTIME_CODEBASE.md`, `RELATIONSHIP_CONTINUITY.md`, `RESPONSE_GUARDRAILS.md`.  
Homelab routing only: [`../pixi-local-bonsai.md`](../pixi-local-bonsai.md).

---

## 1. Sources of truth (priority)

| Layer | Path / shape | What it is | Wins when? |
|-------|----------------|------------|------------|
| **Mechanical SoT** | `session.rpg.observed_world` (`people` / `objects` / `places`) | Merged WORLD_DELTA rows. Persisted in `sessions/<uuid>.json`. | Conflicts with prose, sheets, or memo about **current** outfit/scene/holder/qty/state. |
| **Identity seed** | Scenario package `scenarios/<id>/` (`scenario.json`, cast, RAG, `inject/*.md`) | Opening cast, lore anchors, `cast_activation`, spatial inject. | First appearance / unmet vs present; package IDs must not invent mid-scene. |
| **Transcript** | `session.messages[]` (esp. scene headers `[Day N \| time \| Place]`) | Diegetic clock + who spoke. | Scene presence / knowledge when memo or stale WD disagree. |
| **Sheets / record** | `rpg.character_sheets`, `rpg.character_record[id].markdown` | Cast/Wiki UI + BG enrich (`character_record` job). | **Human reading Cast/Wiki.** **Not** in Send prompt today. |
| **Memo / plan** | `event_memo`, `director_plan`, `director_inbox` | Archive + forward pressure. | Background only; lose to presence list + latest header. |
| **Prose** | Assistant narration (WORLD_DELTA fence stripped for display) | Flavor. | Never SoT for facts the model forgot — fix via WD + inject. |

`server.py` header (mechanical SoT): `rpg.observed_world` + `<<<WORLD_DELTA>>>` footer. MemPalace is out of band for this RP loop.

---

## 2. Identity-locked vs mutable

Defined in `static/session_turn_augment.mjs` → `IDENTITY_LOCKED_FIELDS_BY_BUCKET` + merge in `mergeObservedWorldIntoRpg`. Mirror: `observed_world_merge.py`.

### People

| Kind | Fields | Merge rule |
|------|--------|------------|
| **Locked (first non-empty wins)** | `name`, `pronouns`, `appearance_notes`, `features_notes` | Later WD contradictions → `appearance_history` / prune ledger; do **not** overwrite. |
| **Mutable (latest wins)** | `scene`, `place_id`, `location`, `activity`, `physical`/`condition`, `notes` (union), `state.*`, `current_outfit` (+ aliases `clothing`/`worn`) | Outfit must **not** freeze into locked `appearance_notes`. |
| **Structured accumulate** | `body_profile.*` (incl. **`age`**), `character_dossier.*` | `mergeBodyProfile` / dossier merges. **`age` is people identity-locked** (first-wins); `body_profile.age` first-wins. Injected on Send via `[Identity continuity — LOCKED established facts]` (`age-identity-v1`). |

### Objects

| Locked | Mutable |
|--------|---------|
| `name`, `kind`, `material`, `description` | `location`, `holder`, `qty`, `notes`, `condition`, **`wear_slot`** (on/off body) |

Clothing: `kind: clothing` + `holder` = person id + `wear_slot`. Clear holder/slot when removed.

### Places

| Locked | Mutable |
|--------|---------|
| `name`, `parent`, `geography`, `description` | `notes` / scene-adjacent state |

---

## 3. What Send injects vs Cast UI only

Assembly: `static/app.js` → `buildForegroundChatSystemPayload()` → `pushLayer(...)`.  
Server gate: `server.py` `_INJECT_LAYER_ENV_KEYS` / `CHAT_UI_INJECT_*` (missing key ⇒ always on).

### Injected on Send (typical order)

| Layer id | Builder | Role |
|----------|---------|------|
| *(core)* | system textarea + simulation charter + player inject | Scenario card |
| `apartment_spatial` / `field_travel_spatial` | scenario `inject/` | Spatial |
| `scene_presence` | scene roster | Who may act on-screen |
| `scene_props` | observed objects in scene | Props |
| `nsfw_game_scope` | static | Scope |
| `game_clock` | header clock | Diegetic time |
| `daylight_budget` | scenario inject | Daylight |
| `present_cast_voices` | `buildPresentCastVoiceSystemBlock` | Voice/coping for present |
| `present_cast_state` | `buildPresentCastStateSystemBlock` | **Live outfit / physical / activity** for present |
| `knowledge_bounds` | epistemic fog | Absent cast knowledge |
| `off_screen_activity` | off-screen rows | Parallel beats |
| `relationship_continuity` | intimacy / edges | Relationship memory |
| `identity_continuity` | `buildIdentityContinuitySystemBlock` | Locked name/pronouns (roster) |
| `world_pack` | `buildWorldPackageInjectionFromScenario` | Lore package slice |
| `dormant_cast_guard` | cast_activation / unmet | Block unmet auto-intro |
| `setup_planner` | setup window | Opening only |
| `director_runtime` | `buildDirectorRuntimePlanningBody` | WORLD_DELTA contract |
| `event_memo` | BG memo | Archive index |
| `director_plan` / `director_inbox` | BG | Pressure / Qs |
| `world_delta_streamline` | compact WD hint | Token hygiene |
| `cast_guard` / `continuity_guard` | scenario inject | Scenario rules |
| *(scenario-specific)* | e.g. mother_*, POW camp_* | Per package |
| `direction_contract` | direction | Beat contract |
| `regenerate_*` | regen meta | Only on Regenerate |

**Not injected:** full `character_sheets` / `character_record` markdown, Wiki body_profile tables, Cast card UI fields unless also copied into `observed_world` + a layer above.

**Cast ≠ Send:** Opening the Cast/Wiki tab does **not** put sheet text in the model prompt. A fact is Send-visible only when it lives in `observed_world` (or package inject) **and** a layer above includes it (e.g. `present_cast_state`, `identity_continuity`, `dormant_cast_guard`). Continuity hygiene (`applyContinuityHygiene` on load/Send) copies sheet ages / appearance outfits into `observed_world` so Cast and Send stay aligned.

### Cast / Wiki UI only

- Sheets established by `establishCharacterSheetsFromObserved` after WD merge (thin MD + outfit section).
- BG job `character_record` thickens markdown / dossier.
- Operator sees age/outfit in Wiki; model sees them **only** if present in inject layers or transcript window.

---

## 4. How WORLD_DELTA must update facts

Footer contract: `buildDirectorRuntimePlanningBody()` in `session_turn_augment.mjs`.

| Fact | WD action |
|------|-----------|
| **Age / body** | `new_people[].body_profile.age` (and other profile keys) when established. Do not flip later. After fix: merge should first-wins lock. |
| **Outfit** | `people.current_outfit` short string **and/or** clothing `new_objects` with `holder` + `wear_slot`. Never rewrite locked `appearance_notes` for a clothing change. |
| **Place** | Person `scene` / `place_id`; place rows via `new_places` with stable ids + `parent`. |
| **Object** | `new_objects` reuse id; move via `location`/`holder`/`qty`. |
| **Presence** | Every Present id needs a row touch (`scene`/`activity`/affect) each turn. |
| **Relations** | `new_edges`, optional `intimacy_state` / `relationship_carry_forward`. |

Client merge: `mergeObservedWorldIntoRpg` (browser). Server parity: `observed_world_merge.py` + retro job `world_delta_retro`.

---

## 5. Failure modes

| Symptom | Likely cause | Where to look |
|---------|--------------|---------------|
| Age 23 → model says 18 | Was: sheets held age but `observed_world` missing row; identity inject omitted age; package seeded teens. **Fixed** (`age-identity-v1`): age lock + sheet seed into people + Send established-facts + package `lin-mei.md` → 23 | Hard-refresh Pixi; confirm inject lists ages before next Send |
| “Wearing X” forgotten | Empty `current_outfit`; clothing stuck in locked `appearance_notes`; `present_cast_state` empty | Hygiene bootstraps outfit from appearance_notes + clothing object; then WD / Cast “Wearing now” |
| Sheets look right, Send wrong | Sheets are UI-only — Cast ≠ Send | Hygiene seeds people ages/outfits into `observed_world`; confirm inject layer |
| Unmet cast walks on | Package `cast_activation` / dormant guard skipped; zero-stub Relations | Hygiene syncs package tags + prunes zero stubs; `dormant_cast_guard` |
| Specialist / unmet in Relations | All-zero PC→NPC stubs treated as ties | `pruneZeroStubSocialEdges` on load/Send (`continuity-hygiene-v1`) |
| Bloated Elena/Specialist sheets | BG `character_record` dumped transcript into markdown | `trimBloatedCharacterSheetMarkdown` in hygiene |
| Leave mid-Send | Phone tab closes during OR call | `telemetry.pending_turn` + provisional assistant (`server.py` `_mark_pending_turn`, `_persist_provisional_assistant_turn`); other tab polls status |
| Hygiene wipe / empty reply | Reasoning tokens / strip | `response_hygiene.py`, revision `hygiene-reasoning-off-*` |
| Duplicate people/places | Alias / slug minting | hygiene plan + `world_delta_*_merges` telemetry |

---

## 6. Operator checklist — “fact established, model forgot”

1. **Confirm SoT row** — Cast/World → person/object/place id; check `observed_world` fields (not only sheet MD).
2. **Confirm inject path** — For outfit: `present_cast_state`. For pronouns/name: `identity_continuity`. For age: after fix, identity or present-state — if still missing, fact never reaches the model.
3. **Force a WD patch** — Next Send (or OOC): require footer with the correct field on the **same id**.
4. **Hard-refresh** UI (`Ctrl+Shift+R`) after potato deploy so `session_turn_augment.mjs` cache-busts.
5. **Check pending_turn** — If leave mid-Send: reopen session; wait for `pending_turn.status` → `done` / provisional → final save.
6. **Do not** paste Cast sheet into Turn guidance as the product fix — that is babysitting; fix SoT + inject.
7. **Verify revision** — `GET /api/config` → `chat_api_revision` matches ledger Result (outfit / cast-status / age-identity / continuity-hygiene).

---

## 7. Continuity hygiene (`continuity-hygiene-v1`)

Runs on **session load** and **before Send** via `runContinuityHygienePass` → `applyContinuityHygiene` in `session_turn_augment.mjs`.

| Step | Helper | Effect |
|------|--------|--------|
| Sheet → people ages | `seedPeopleIdentityFromSheets` | PC/NPC ages from Cast MD into `observed_world` |
| Appearance → outfit/age | `bootstrapOutfitAndAgesFromAppearance` | `current_outfit` + soft age + `kind:clothing` objects |
| Scene headers → places | `seedPlacesFromSceneHeaders` | Place rows from `[Day \| … \| Place]` |
| Package cast tags | `syncCastActivationFromPackage` + `GET /api/scenarios/package/<id>` | Fill blank `cast_activation` / `known_to_pc` |
| Relations prune | `pruneZeroStubSocialEdges` | Persist-delete all-zero stubs (not UI-hide only) |
| Sheet bloat | `trimBloatedCharacterSheetMarkdown` | Cap History dumps (~6k) |

---

## 8. Key files

| File | Role |
|------|------|
| `PixiApp/chat-ui/static/session_turn_augment.mjs` | WD parse/merge, identity locks, present_cast_state, director contract, sheets establish, **continuity hygiene** |
| `PixiApp/chat-ui/static/app.js` | Send layer list, pending_turn client sync, Cast/Wiki render, hygiene on load/Send |
| `PixiApp/chat-ui/server.py` | `/api/chat`, `/api/scenarios/package/<id>`, inject env gates, pending_turn / provisional persist, BG jobs |
| `PixiApp/chat-ui/observed_world_merge.py` | Server merge parity |
| `PixiApp/chat-ui/character_record.py` | BG sheet enrich |
| `PixiApp/chat-ui/tests/session_turn_augment.test.mjs` | Lock / outfit / cast / hygiene tests |
| `PixiApp/chat-ui/tests/test_pending_turn.py` | Leave-mid-Send durability |
| `sessions/<uuid>.json` | Live SoT on disk (gitignored / deploy-excluded) |

Deploy potato: `scripts/pc/deploy-pixi-linuxbox.sh` (agent-dump). Sessions **not** copied.

---

## 9. Verify-after-fix

Confirm:

- [x] `body_profile.age` (or top-level age) first-wins / identity-locked in merge tests
- [x] Established age appears in Send `identity_continuity` layer
- [x] Hygiene bootstraps outfits/places/prunes zeros; package cast sync
- [ ] Hard-refresh Pixi after deploy; `chat_api_revision=20260717-continuity-hygiene-v1`
- [ ] Session `78bb2b84` backfilled (ages/outfits/places/cast/prune/trim)
