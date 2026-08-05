# Docs smart editor — feature set proposal (2026-07-27)

**Status:** proposal for human review — **do not implement** until sign-off  
**Holder:** docs-smart-editor-proposal  
**Inputs:** `docs-stories-wiki-inventory-2026-07-27.md`, `docs-wiki-pixi-scenario-2026-07-27.md`, silo Docs intent (`linuxbox-silo-*-2026-07-26.md`)  
**Phase 0 already shipped (tiny):** tropic `storyDirs` += `"story"` so Chat writes to `story/` show up in Stories (see wiki-pixi plan). Not expanded here.

---

## 1. One-liner vision

**Google Docs–style smart layer on campaign/ops markdown:** minimal chrome for reading/writing, plus tools that suggest, structure, link entities, and talk about the open doc — not a formatting toolbar farm.

Think: highlight → “change this because…”, `@entity` jump, outline / generate subtree, talk-to-doc — on top of the files you already have (`storyDirs`, `reports/`, `notes/`).

---

## 2. Today vs proposed

| | **Today** | **Proposed** |
|---|-----------|--------------|
| **Stories** | GET-only canon browser. Campaign picker → folder buckets (`storyDirs`) → render md. Toolbar = Interview / Brainstorm / Discuss / +Task → Ops Chat. Character Discord-link panel only. **No** create, edit, save, tree depth beyond 1 folder group. | Same files as SoT, but **writable** wiki chrome: nested tree, inline edit + autosave, smart tools (post-it, @mentions, outline, talk-to-doc). Stories stays **campaign-canon filter** until Docs hosts the same editor. |
| **Docs silo** | Flat recent reports (capped ~6/campaign → 16 global) + search filter + read body. **No** tree, create, edit. Silo Phase 2 still open: wiki links / nest Stories. | Primary **wiki shell** for cross-campaign + drafts (`reports/`, project docs) with the same editor chrome; Stories nested or scoped via campaign chip. |
| **Who writes md** | Think → `reports/`; Chat `CAMPAIGN_WRITE` → `notes/`/`story/`/…; Save chat → `notes/chat-*.md`. UI never writes lore. | UI writes allowlisted paths; agents keep writing; humans **approve** smart-tool patches (or auto-apply — decision). |
| **Structure** | Tropic looks like a wiki because folders exist. NYC looks frozen (`story/` = 2 files) while ~28 drafts live in Docs. | Tree indexes drafts + canon; “generate subtree” + promote draft→canon are explicit tools, not accidental side effects of think. |
| **Entities** | Chars registry + path heuristics for `/characters/`. No `@place` / `@org` graph in Hub. | Addressable `@slug` across characters, orgs, peoples, places, things, cultures — resolve to sheet/wiki md. |
| **Pixi** | Hub Pixi = status + link to `:8767`. Not part of Stories. | Optional adjacent phase: scenario test harness + sheet patches — **not** inside the Docs editor MVP. |

**Honest gap:** Stories feels “not generating” because it only mirrors `storyDirs` while think fills `reports/`. That is an IA/index problem first; a smart editor without tree+index still leaves NYC looking empty.

---

## 3. Feature set

Each item: **what** · **why** · **MVP vs later** · **risk**

### A. Core editing (minimal chrome)

#### A1. Nested tree (not flat folder buckets)
- **What:** Server walk → full path tree (topic → subtopic → doc). Campaign chip + optional “drafts” / “canon” filter. Docs silo hosts tree; Stories = same UI with canon-only scope until merge decision.
- **Why:** Flat `Story · 2` is why NYC feels dead; Tropic already proves folders work when indexed.
- **MVP:** Tree API + UI for existing `storyDirs` + `reports/` + `notes/` (read). **Later:** drag-reorder, virtual folders, multi-root ops wiki.
- **Risk:** Slow walk on large tropic trees; cache/index needed if depth grows. Cap depth (today ≤5) stay.

#### A2. Inline edit + Save / autosave
- **What:** Open md → textarea or light markdown editor → Save (and optional debounce autosave). `PUT` under allowlisted roots only. Refuse registry JSON / secrets paths.
- **Why:** Without this, “smart tools” still dump work into Chat fences — the spectator problem remains.
- **MVP:** Save button + dirty flag + reload verify. **Later:** CRDT/collaborative, version history UI, conflict merge with potato.
- **Risk:** Parallel writers (think + human) clobber; need mtime/`base_hash` check. Protected-path discipline.

#### A3. Create folder / new doc
- **What:** “New under this node” → mkdir + stub md (optional frontmatter `id`/`kind`).
- **Why:** Structure today only grows via Hermes/Chat; GM cannot scaffold NYC places/factions trees from Hub.
- **MVP:** New doc + new folder under allowlist. **Later:** templates per kind (character/place/org).
- **Risk:** Junk stubs if agents auto-mint; gate agent “generate subtree” behind confirm (see C2).

#### A4. Minimal chrome (anti-toolbar)
- **What:** Reader + edit toggle; outline sidebar; one “Tools” menu (post-it, ask, @insert, check). No font/color ribbon.
- **Why:** Google Docs smart layer, not Word 2003. Matches dashboard low-density rule.
- **MVP:** Edit toggle + Tools. **Later:** preview split, theme polish.
- **Risk:** Scope creep into “full Obsidian” — keep non-goals hard.

#### A5. Draft vs canon visibility
- **What:** Label files under `reports/` / `notes/` as **Draft**; `storyDirs` as **Canon**. One-click “Promote draft → canon path” (copy/move with confirm).
- **Why:** Fixes the Stories/Docs mismatch without forcing think to auto-edit imported Obsidian paths.
- **MVP:** Badges + open drafts in Docs tree. Promote = later if IA says promote is rare.
- **Risk:** Accidental promote overwrites canon — confirm + backup.

---

### B. Smart tools

#### B1. Suggest edit / post-it
- **What:** Highlight span → note “change this because R” → store annotation (`agents/state/wiki-annotations/…`) with span hash. Apply = patch md + mark applied; hash mismatch → re-queue.
- **Why:** Fast continuity fixes without rewriting the whole file in Chat.
- **MVP:** Create + list pending post-its on open doc; **apply requires Accept** (default until decision). **Later:** agent-proposed post-its from think; batch apply.
- **Risk:** Stale spans after edits; store must not live in chat-threads. Decision: auto-apply vs approve (checklist).

#### B2. Talk to document
- **What:** “Ask about this doc / selection” → grounded chat with focus path + excerpt. Label **Ops Chat · document** (≠ Pixi Send).
- **Why:** Interview/Brainstorm already bridge to Chat; deepen with selection + doc SoT instead of whole-campaign mush.
- **MVP:** Bridge to Ops Chat with `focus-docs` + selection (reuse existing bridges). **Later:** in-panel composer that still hits `/api/chat` (decision).
- **Risk:** Confusing with Pixi; free-model cost if overused. Banner discipline required.

#### B3. Outline / structure view
- **What:** Parse H1–H3 of open doc → clickable outline; optional “fix heading hierarchy” suggestion.
- **Why:** Long lore files are unusable without TOC; cheap and local (no LLM required for parse).
- **MVP:** Client-side outline from headings. **Later:** LLM “restructure sections.”
- **Risk:** Low. Don’t block on LLM.

#### B4. `@` mentions (insert + navigate)
- **What:** Type `@` → autocomplete from registry ∪ wiki index (frontmatter `id`/`aliases` ∪ filename slug). Insert link; click jumps to entity doc/sheet.
- **Why:** Continuity needs addressable cast/places without fuzzy merge mistakes (Vivian ≠ Yuna).
- **MVP:** Characters + places with frontmatter/`storyDirs` index. **Later:** orgs, peoples, things, cultures as first-class kinds.
- **Risk:** Fuzzy alias false merges; never auto-merge distinct cast. Slug collisions across campaigns.

#### B5. Consistency check
- **What:** Tool: scan open doc (or subtree) for name conflicts vs vibes/place SoT, age/stage contradictions, broken `@` links, duplicate headings.
- **Why:** Known failure modes (lore vs vibes names; sheet age invents). Catch before promote.
- **MVP:** Broken links + missing entity resolve (deterministic). **Later:** LLM continuity critique → post-its.
- **Risk:** Noisy false positives; keep deterministic first.

#### B6. Generate subtree
- **What:** On a topic node: “propose children + stub md” (LLM) → preview tree → Accept creates files.
- **Why:** NYC never grew places/orgs; GM wants structure without hand-mkdir twenty folders.
- **MVP:** Preview + Accept only (no silent write). **Later:** think-lane hook to maintain tree from progress.md.
- **Risk:** Junk NPCs / wrong lore; must not mint cast without epistemic gate. Cost on paid models.

---

### C. Knowledge graph / entities

#### C1. Entity kinds + frontmatter contract
- **What:** `kind: character|org|people|place|thing|culture` + `id` + `aliases` on wiki md. Resolver = registry ∪ frontmatter ∪ slug.
- **Why:** Sheets stay design-doc grade; non-character entities need the same addressability.
- **MVP:** Convention + resolver for characters + places. **Later:** graph panel (edges), backlinks UI.
- **Risk:** Second registry vs `characters-registry.json` drift — characters stay registry-primary; wiki md secondary.

#### C2. Soft graph (links only)
- **What:** Index `@` and markdown links → “referenced by” list on entity page. No Neo4j.
- **Why:** Enough for authorship; Graphify/MemPalace stay separate memory lanes.
- **MVP:** Later than tree+edit. **Later:** as above.
- **Risk:** Index rebuild cost; don’t block MVP.

#### C3. Bridge Chars / tableslop / Pixi (optional)
- **What:** Deep-link to Chars card / map `#cast` / Pixi sheet for same `id`. No duplicate CRUD in Docs.
- **Why:** One identity SoT; Hub wiki is not a second roster editor.
- **MVP:** Link-out buttons only. **Later:** shared graph (decision).
- **Risk:** Registry lock / wipe if Docs starts POSTing registry — forbid in MVP.

---

### D. Tree & generation (ops)

#### D1. Expand index roots (per campaign)
- **What:** Configure which dirs Stories/Docs walk (`storyDirs` + drafts). NYC: optionally index `reports/` / `notes/` so generation is visible.
- **Why:** Inventory root cause #1 — wrong surface. Cheap win before fancy editor.
- **MVP:** Config + tree includes drafts. **Later:** per-user pins.
- **Risk:** Docs noise (28+ NYC drafts); need filters (Draft badge, date).

#### D2. Progress evidence / promote loop (adjacent, not editor)
- **What:** Fix `` `<date>` `` reconcile so think closes when `*-five-families.md` exists; optional promote UX.
- **Why:** Inventory secondary bug — structure feels stuck while files exist.
- **MVP:** Can ship **without** smart editor (tiny ops fix). Listed so it isn’t forgotten.
- **Risk:** Low if glob is conservative.

#### D3. CAMPAIGN_WRITE allowlist parity
- **What:** Short-form paths match indexed dirs (`places/`, `Organizations/`, …) so Chat writes aren’t invisible.
- **Why:** Phase 0 fixed tropic `story/`; same class of bug elsewhere.
- **MVP:** Align allowlist with `storyDirs`. **Later:** full-path-only policy.
- **Risk:** Writing imported Obsidian paths — needs canon-write decision.

---

### E. Pixi adjacency (optional phase — clearly separate)

#### E1. Scenario test harness
- **What:** Hub Pixi panel: checklist (cast pair, beat, agency/clothing inject) → CTA to `:8767` or scripted N-turn report. **Not** Docs editor.
- **Why:** Validate creator vision without treating Ops Chat as RP.
- **MVP:** Out of Docs MVP. Phase 4 in wiki-pixi plan.
- **Risk:** Iframe bloat; false “live” claims without curl/Playwright.

#### E2. Character vision / sheet patch from test
- **What:** After scenario, patch sheet md / WORLD_DELTA; registry writes only with multitask lock.
- **Why:** Continuity loop: test → persist clothing/facts.
- **MVP:** Later. **Risk:** Registry clobber — lock mandatory.

---

## 4. Recommended MVP slice (after sign-off)

Ship **at most** these (order matters):

1. **D1 — Index drafts + nested tree (read)** — make NYC/Tropic generation visible; fixes “frozen Stories” without a full editor.
2. **A4 — Minimal chrome** — Docs/Stories share reader shell + Tools slot (even if tools stubbed).
3. **A2 — Inline edit + Save** — allowlisted PUT; dirty + `base_hash`.
4. **A3 — New doc / folder** — scaffold under allowlist.
5. **A5 — Draft vs canon badges** — optional promote deferred if you want thinner slice.
6. **B3 — Outline** — local headings TOC (no LLM).
7. **B2 — Talk-to-doc bridge** — selection → Ops Chat · document (reuse Interview/Discuss pattern).
8. **B1 — Post-it create + pending list** — apply = Accept only until you decide auto-apply.

**Explicitly not in first MVP:** B6 generate subtree, B5 LLM consistency, C2 graph UI, E1/E2 Pixi harness, full Stories→Docs merge (can nest nav without deleting Stories).

**Tiny parallel ops (can land anytime):** D2 progress `<date>` glob; D3 CAMPAIGN_WRITE allowlist — not “editor,” but unblock structure feel.

---

## 5. Decision checklist (human)

Open product questions — check one per row when decided:

### IA / merge
- [ ] **Stories vs Docs:** Docs absorbs Stories (one wiki + campaign chip) — *recommended default*
- [ ] **Stories vs Docs:** Stories stays forever as campaign-canon only; Docs = reports/projects only
- [ ] **Nest timing:** Nest Stories under Docs nav in next silo Phase 2 pass
- [ ] **Nest timing:** Keep dual tabs until editor MVP ships

### Writes / canon
- [ ] **UI may write** imported Obsidian paths (`Things and Places of Note/`, etc.)
- [ ] **UI may write** only `story/` + `notes/` + `reports/` until manual promote
- [ ] **Think** may promote accepted drafts into canon (with confirm task)
- [ ] **Think** never touches canon (status quo for Tropic/NYC policy)

### Post-its
- [ ] **Apply:** always queue → human Accept (safer default)
- [ ] **Apply:** auto-apply on Save when hash matches
- [ ] **Apply:** agent may queue; only human applies

### Talk-to-doc
- [ ] **Home:** deepen Ops Chat bridges only (MVP-friendly)
- [ ] **Home:** Docs-local composer that still uses `/api/chat`
- [ ] **Never** route talk-to-doc through Pixi Send

### Entities / graph
- [ ] **@entities:** Hub-only until bridged
- [ ] **@entities:** shared ids with tableslop `#cast` / Pixi sheets from day one (link-out OK either way)
- [ ] **Fuzzy alias merge:** never (confirm)

### Index / NYC
- [ ] **NYC Stories** should index `reports/` (+ optionally `notes/`) so generation is visible
- [ ] **NYC** stays canon-only in Stories; drafts only in Docs tree
- [ ] **Scaffold** NYC topic folders (places/factions/…) via generate-subtree later vs hand templates now

### Pixi phase
- [ ] **Defer** scenario harness until after Docs MVP
- [ ] **Schedule** Pixi Phase 4 in parallel (separate holder)
- [ ] **Host:** potato `:8767` only vs also PC chat-ui

### Non-goals (confirm still true)
- [ ] No full Obsidian clone this cycle
- [ ] No chat-threads wipe; no blind registry overwrite
- [ ] No Pixi iframe inside Hub

---

## 6. Non-goals (repeat)

- Formatting ribbon / WYSIWYG Word clone  
- Graph database / Graphify as blocker  
- Rewriting 9k-line `index.html` into a multi-file SPA just for this  
- Auto-rewriting all potato place filenames (vibes sync = separate)  
- Treating Docs editor as Pixi RP  

---

## 7. Related paths

| Doc / code | Role |
|------------|------|
| `docs/plans/docs-stories-wiki-inventory-2026-07-27.md` | Root-cause: Stories vs reports mismatch |
| `docs/plans/docs-wiki-pixi-scenario-2026-07-27.md` | Phased plan + Phase 0 ship + open Qs |
| `docs/plans/linuxbox-silo-dashboard-2026-07-26.md` | Docs silo; Phase 2 wiki deferred |
| `scripts/linuxbox/linuxbox-status-server.js` | `storyDirs`, `/api/stories*`, CAMPAIGN_WRITE |
| `scripts/linuxbox/linuxbox-status/index.html` | Stories/Docs UI today |

---

## 8. Suggested review order for you

1. Skim **Today vs proposed** — is the diagnosis right?  
2. Tick **Decision checklist** (especially Stories vs Docs, post-it apply, talk-to-doc home, NYC index).  
3. Accept / cut **MVP slice** (8 items) — say what to drop.  
4. Only then: implementation ticket from signed MVP (separate holder).
