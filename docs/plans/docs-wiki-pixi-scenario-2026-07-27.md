# Docs wiki + Pixi scenario harness (2026-07-27)

**Status:** plan + Phase 0 (generation index bug)  
**Holder:** docs-wiki-pixi-plan  
**Inventory sibling:** `docs/plans/docs-stories-wiki-inventory-2026-07-27.md` — **landed mid-flight** (2026-07-27T20:12Z). Merged: Stories GET-only; think → `reports/` (Docs), not Stories; NYC flat because `storyDirs=["story"]` only; CAMPAIGN_WRITE→`notes/`/`story/`; reconcile templates leave A-3…B-3 open (separate fix).

---

## Assumed “why” (confirm)

You want **creator authorship + continuity**, not a spectator Docs reader.

| Surface | Job |
|---------|-----|
| **Docs / Stories wiki** | Generate and maintain a **topic → subtopic tree**, edit fast, annotate spans (post-its), address entities (`@molepeople`), talk to the open doc — so lore stays **writable SoT**, not a dump of reports. |
| **Pixi RP silo** | Quick **scenario interaction tests** + **persist character mods** to sheet/SoT (registry lock if touching `characters-registry.json`) — validate creator vision without treating Hub Ops Chat as RP. |

If wrong: say so before Phase 1. Alternate readings we rejected: “pretty Markdown browser only,” “full Obsidian clone this week,” “Pixi iframe inside Hub.”

---

## Confirmed user wants (checklist)

### A. Docs / Stories (wiki, not passive reader)

1. **Generate & maintain** markdown as a **topic → subtopic tree** (not a flat STORY list).
2. **Edit quickly** — not read-only.
3. **Post-it edits**: highlight → “change this for reason R” → apply or queue durable annotation on the span.
4. **Entity graph**: character sheets (system-understood md) + orgs, peoples, groups, places, things, cultures — `@slug` addressable.
5. **Talk to documents** — chat grounded in open doc / selection (Ops Chat bridge OK if cleaner; label clearly **≠ Pixi RP**).

### B. Pixi RP silo

- Quick **scenario tests** for character interactions.
- Apply **character modifications** to sheet/SoT (respect registry locks).

---

## Target IA — Docs silo vs Stories tab

**Recommendation (default until you answer open Q1):**

| Surface | Owns | Does not own |
|---------|------|----------------|
| **Docs silo** (`#reports` → evolve to wiki shell) | Cross-campaign + non-campaign knowledge tree: `reports/`, project docs, ops runbooks, **plus** campaign wiki entry points | Pixi RP play; map product |
| **Stories** (secondary tab, nest under Docs in Phase 2+) | **Campaign canon subset** — current `storyDirs` trees (tropic Things/Places/…, nyc/spacequest `story/`) | Flat “all markdown everywhere”; Chars registry CRUD (stay Chars / map `#cast`) |
| **Ops Chat** | Talk-to-doc / brainstorm / CAMPAIGN_WRITE — banner **Ops Chat ≠ Pixi** | Diegetic Send / WORLD_DELTA |
| **Pixi RP silo** | Status + scenario harness CTAs → `:8767` | Full chat-ui embed in Hub |

**Merge rule:** Docs owns the **wiki chrome** (tree, edit, post-its, @resolve, talk-to-doc). Stories remains the **campaign-canon filter** until Docs can host the same editor with a campaign scope chip. Do **not** delete Stories in Phase 0–1.

Silo Phase 2 already deferred “Docs wiki links / nest Camp/Chars” — this plan owns the wiki product; silo plan stays nav-only.

---

## Current state (evidence)

| Fact | Evidence |
|------|----------|
| Stories = **GET-only** reader | `/api/stories`, `/api/stories/doc` only; UI: Interview / Brainstorm / Discuss / +Task — **no Create / Save / Edit** |
| Tropic has **no** `story/` dir | Intentional: `storyDirs` = Things and Places, Organizations, Plot Lines, characters, places |
| Potato Stories live | `/api/stories` 200; tropic **52** files, 8 groups |
| Chat **can** write md via `CAMPAIGN_WRITE` | `mkdirSync` + write under campaign; short form allows `notes/`, `story/`, `lore/`, `characters/` |
| **Phase 0 bug** | Short-form `story/` writes land under `campaigns/tropic-gooner/story/`, but tropic **`storyDirs` omitted `story`** → saves invisible in Stories |
| Think lane | `TROPIC_GOONER_TASK.md`: write `reports/` only; never auto-edit imported canon — not a missing-mkdir failure |
| Docs silo | Reports list + search filter; empty-state reader; no wiki tree |
| Pixi | potato `:8767` root **200** (health path 404); Hub Pixi panel = status/links only — **no** scenario harness yet |
| Place-md drift | PC has Jackedsonville/Porto Lujara; potato Stories still listed Crimzon Quay / Porto Lujuria — **sync**, not generation (out of Phase 0 unless you ask) |

---

## Data model (target)

### 1. Tree index

```text
wiki/
  index.json          # optional cache; regenerate from walk
  <campaign|global>/
    <topic>/
      <subtopic>/
        *.md
```

**v1 (ponytail):** no new root — reuse campaign folders + `storyDirs` (+ later Docs roots). Index = server walk → nested tree (not 1–2 level `groupStoryFiles` buckets).

```json
{
  "id": "tropic-gooner/places/paradisio",
  "label": "Paradisio",
  "kind": "topic|doc",
  "path": "campaigns/tropic-gooner/places/INDEX.md",
  "children": []
}
```

### 2. Post-it annotations

```json
{
  "id": "ann_…",
  "doc_path": "campaigns/…/foo.md",
  "span": { "start": 120, "end": 340, "hash": "sha1-of-slice" },
  "note": "change this for reason R",
  "status": "queued|applied|rejected",
  "created_at": "ISO",
  "applied_at": null
}
```

Store: `agents/state/wiki-annotations/<campaign>/` (runtime, gitignored) — **not** inside chat-threads. Apply = patch md + mark applied; conflict if hash mismatch → re-queue.

### 3. `@entity` resolution

| Kind | Primary SoT | Slug |
|------|-------------|------|
| character | sheet md + `characters-registry.json` | `@ellaine-mishpit` |
| place / org / group / culture / thing | wiki md frontmatter `id:` / `aliases:` | `@molepeople` |

Resolver: registry ids ∪ frontmatter ∪ filename slug. **Never** fuzzy-merge distinct cast (Vivian ≠ Yuna rule). Soft-hide only via `canonical_id`.

### 4. Sheet format (system-understood)

Frontmatter + H2 sections (diegetic only — no telemetry):

```markdown
---
id: ellaine-mishpit
kind: character
aliases: [Ellaine]
campaign: tropic-gooner
---
## Identity
## Appearance / clothing
## Relationships
## Established facts
```

Pixi sheets stay Gobstopper / CONTINUITY contract; Hub wiki sheets must **round-trip** the same identity fields when bridged.

### 5. Talk-to-doc

Reuse Ops Chat: `context_scope=doc|campaign+focus`, `focus-docs` API, existing Interview/Brainstorm bridges. UI copy: **“Ops Chat · document”** — never Pixi Send.

---

## Phased todos (small)

### Phase 0 — generation / index bug ✅ (this pass)

- [x] Ledger Intent
- [x] This plan
- [x] Add `"story"` to tropic `storyDirs` so `CAMPAIGN_WRITE` → `story/` is indexed
- [x] Seed `campaigns/tropic-gooner/story/INDEX.md` (landing + pointer to existing lore dirs)
- [x] Potato deploy server + story seed; verify `/api/stories` includes Story group
- [x] Ledger Result
- [x] Re-merge when `docs-stories-wiki-inventory-2026-07-27.md` lands (pointers above; NYC flat + think→reports noted)

### Phase 1 — tree + edit

- [ ] Nested tree API (`/api/stories` tree or `/api/wiki/tree`) from full path depth
- [ ] Docs + Stories: create folder/doc + **inline edit + Save** (`PUT` md under allowlisted dirs)
- [ ] Allowlist write roots: tropic storyDirs + `notes/` + `reports/` (drafts); refuse registry JSON
- [ ] Extend `CAMPAIGN_WRITE` short-form to `places/`, `Organizations/`, `Plot Lines/` (or force full path in prompts)
- [ ] Playwright: open → edit → reload shows text

### Phase 2 — post-its + @entities

- [ ] Selection → post-it UI → annotation store
- [ ] Apply/queue worker (or Chat tool) with span-hash guard
- [ ] Frontmatter `id`/`aliases` on new docs; `@slug` autocomplete from registry ∪ wiki index
- [ ] Entity kinds beyond characters (org/place/…)

### Phase 3 — talk-to-doc

- [ ] “Ask about selection” → Ops Chat thread with focus doc + selection excerpt
- [ ] Clear ≠ Pixi labeling on bridge
- [ ] Optional: save answer as post-it or CAMPAIGN_WRITE

### Phase 4 — Pixi scenario harness

- [ ] Hub Pixi panel: “Scenario test” checklist (cast pair, beat, assert agency/clothing inject) — CTA to `:8767`, not iframe
- [ ] Script or chat-ui hook: load package → N turns → report (Playwright or potato curl)
- [ ] Character mod path: edit sheet md / WD → persist; if registry → **multitask lock**
- [ ] Evidence required before “live” claims

---

## Explicit open questions (human)

1. **IA:** Docs absorbs Stories (one wiki), or Stories stays campaign-canon forever with Docs = reports+projects only?
2. **Canon write policy:** May the UI / Chat write **imported** Obsidian paths (`Things and Places of Note/…`), or only `story/` + `notes/` + `reports/` until you promote?
3. **Post-it apply:** auto-apply on Save, or always queue for your Accept?
4. **@entities:** Hub wiki graph shared with tableslop `#cast` / Pixi sheets, or Hub-only until bridged?
5. **Talk-to-doc home:** deepen Ops Chat bridges, or a Docs-local composer that still hits `/api/chat`?
6. **Pixi Phase 4 host:** potato `:8767` only, or also PC chat-ui for offline tests?
7. **Sibling inventory:** when `docs-stories-wiki-inventory-2026-07-27.md` lands, treat it as SoT for file counts / bugs — OK to amend this plan?

---

## Non-goals this week

- Full Obsidian clone (graph view, backlinks UI, plugins, sync protocol).
- Wipe or migrate `agents/state/chat-threads/`.
- Blind overwrite `characters-registry.json` / soft-delete GM NPCs.
- Iframe Pixi into Hub; claim Pixi features without curl/Playwright.
- Auto-rewrite all tropic place filenames on potato (vibes rename sync = separate task).
- Meta/News/Mazda3 scope creep.
- Rewriting 9k-line `index.html` into a multi-file SPA.

---

## Phase 0 ship notes

**Fix:** tropic `storyDirs` += `"story"`; add `campaigns/tropic-gooner/story/INDEX.md`.  
**Why:** Chat `CAMPAIGN_WRITE` already mkdir+writes `story/`; Stories never listed it.  
**Not fixed here:** edit UI, tree depth, post-its, place-md potato drift, NYC progress reconcile ``<date>`` templates (inventory §3 — Phase 1-adjacent).
