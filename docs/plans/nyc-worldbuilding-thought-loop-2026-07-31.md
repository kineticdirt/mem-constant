# NYC worldbuilding thought loop (2026-07-31)

**Goal:** AI **justifies** setting choices and **argues with itself** before filling detail — broad compelling strokes first, lifelike texture second. Not another list of SoT bullet points.

**Holder:** `nyc-worldbuilding-thought-loop`

**Status:** Implemented v1 (2026-08-01) — scaffold + locks + era-law pack; drip continues on potato.

**Related SoT:** `campaigns/nyc-mafia-dnd/LOCKS.md` · `SETTING-PROHIBITION-MAGIC.md` · `SETTING-MAGITECH-DIVERGENCE.md` (§C grammar, §D seeds) · `SETTING-ANCESTRIES-WARDS.md` · `agents/NYC_MAFIA_DND_TASK.md`

**Ponytail constraint:** Smallest loop that produces **readable artifacts** Hermes can continue on free ticks. No new product silo — reuse `campaigns/nyc-mafia-dnd/reports/` + Hub Docs scope + existing think lane.

---

## 1. Why / success criteria

### Problem

Current stack is strong on **setting points** (era, law, magitech grammar, ward table) but weak on **dialectic**:

| What we have | What’s missing |
|--------------|----------------|
| Locked SoT frames | AI rarely shows *why* fork A beats fork B |
| Think lane writes one report/tick | Reports tend toward **assertions**, not thesis/antithesis |
| §C simulation grammar | Grammar is **post-choice** — no “broad stroke” gate before inventing |
| Potato has 30+ legacy drafts (superseded era) | No **justification chain** or **vignette pack** tied to locked strokes |

**Engaged worldbuilding** means the AI **thinks in public**: names a fork, argues against itself, picks a synthesis, then only then drills into magitech/ward detail and writes stories that **only work if** those strokes are true.

### Success criteria (verifiable artifacts)

| Artifact | Definition | Done when |
|----------|------------|-----------|
| **Stroke doc** | 1–2 page **locked broad stroke** (e.g. “BCC monopoly + bootleg salon epidemic”) with explicit rejected alternatives | File exists under `worldbuilding/strokes/`; GM checkbox or ledger line |
| **Justification chain** | Structured dialectic: **Thesis → Antithesis → Synthesis → Residual risks** for each stroke | Same file or sibling `*-justification.md`; ≥1 fork fully argued |
| **Vignette pack** | 3–5 **self-contained** micro-stories (300–600 words each) that assume strokes true; a reader can spot contradictions if strokes change | `worldbuilding/vignettes/<stroke-slug>/` |
| **Detail fill** | Devices/places run through §C grammar + ward map; divergence seed in header | Linked from stroke doc; no enchanted-iPhone violations |
| **Hub-readable pack** | Index page linking strokes → vignettes → promoted `story/` candidates | Docs scope `nyc-mafia-dnd` tree; optional `reports/README.md` row |

**Anti-success (do not ship):** Another flat lore dump; modern tech smuggled in; vignettes that work with any setting; dialectic performed once then ignored on next tick.

---

## 2. What already exists vs gap

### Exists (PC + potato)

| Layer | Location | Role |
|-------|----------|------|
| Era + Prohibition parallel | `SETTING-PROHIBITION-MAGIC.md` | GM vision lock; supersedes present-day think drafts |
| Magitech grammar + domain table + §D seeds | `SETTING-MAGITECH-DIVERGENCE.md` | **How** to invent devices after a need is chosen |
| Wards + ancestries + family recruitment | `SETTING-ANCESTRIES-WARDS.md` | **Where** and **who** once strokes are set |
| Think lane config | `agents/NYC_MAFIA_DND_TASK.md` | One report/tick; read SoT first; `reports/` only |
| Progress checklist | `reports/progress.md` | Phases A–B done (era now **superseded** by SoT); lane idle |
| Story seeds | `story/premise.md`, `story/factions.md` | Pre-Prohibition voice — **supersede** on promote |
| Legacy think drafts | Potato `reports/*.md` (~30 files) | NPC/family/location **ideas**; re-skin through SoT |
| Docs scope | Hub `nyc-mafia-dnd` | Wired; Beta = guardrail/Pixi-shape testbed (**not** this loop’s engine) |

### Gap

1. **No dialectic scaffold** — think task says “draft one report,” not “argue two forks.”
2. **No stroke lock workflow** — SoT lists GM forks but no machine-readable “accepted stroke” file.
3. **No vignette lane** — nothing requires self-encapsulated stories that test strokes.
4. **No broad-before-detail gate** — §C runs at device level, not at “which city shape are we building?”
5. **Progress.md Phase D** suggested in SoT but not expanded into thought-loop items.

---

## 3. Proposed loop design

High-level flow:

```text
GM fork list (SoT open questions)
        ↓
Phase A — Broad-stroke dialectic (AI vs AI)
        ↓
Phase B — Human gate → stroke doc
        ↓
Phase C — Detail fill (§C + wards)
        ↓
Phase D — Vignette pack (lifelike texture)
        ↓
Phase E — Promote to Docs / story / think lane
```

### Phase A — Broad-stroke dialectic

**Input:** One GM fork from SoT (e.g. year window, federal agency shape, visibility default).

**Process (single tick or Workshop session):**

1. **Thesis** — Best case for option A (play affordances, tone, crime drama hooks).
2. **Antithesis** — Steel-man option B; list what breaks if A is true.
3. **Synthesis** — Recommended stroke + what we **defer**.
4. **Self-critique** — Checklist pass (see §5): modern-tech leak, broad-before-detail, tone boundaries.

**Output:** Draft `worldbuilding/strokes/<YYYY-MM-DD>-<fork-slug>-draft.md` (not canon until Phase B).

**Scope:** **1–2 forks per cycle** — not the whole setting at once.

### Phase B — Lock stroke into SoT (human gate)

**Input:** Draft stroke + justification chain.

**GM actions (pick one cadence — see §7):**

- Approve → copy synthesis into `worldbuilding/strokes/<slug>.md` + optional one-line amend to parent SoT open-question section.
- Revise → comment in Hub Docs / ledger; re-run Phase A on same fork.
- Reject → mark draft `status: rejected` with reason (feeds next dialectic).

**Output:** `status: locked` stroke file; ledger `[PC]`/`[GM]` line.

**Rule:** Think lane **must not** treat draft strokes as canon; only `locked` strokes + existing `SETTING-*.md`.

### Phase C — Detail fill

**Input:** Locked stroke + `SETTING-MAGITECH-DIVERGENCE.md` §C + ward row(s).

**Process:**

1. Name concrete needs the stroke implies (e.g. “bootleg link epidemic” → raid tools, salon licensing, street price).
2. Run §C grammar per device/service.
3. Pick/log §D divergence seed once per batch.
4. Tie to **one ward** from ancestries table when location matters.

**Output:** `worldbuilding/details/<stroke-slug>-<topic>.md` or section appended to stroke doc.

### Phase D — Self-contained vignettes

**Input:** Locked stroke + detail notes.

**Process:** Write 3–5 vignettes that:

- Stand alone (no campaign metaplot required).
- **Fail the smell test** if the stroke is false (e.g. if magic is “polite denial,” a vignette can’t assume everyone talks openly about salons).
- Use period voice; no real-world gang glorification.
- Intimate/explicit content only if GM policy allows (see §7).

**Output:** `worldbuilding/vignettes/<stroke-slug>/01-<title>.md` …

**Optional:** One vignette run through **Docs Beta** as voice/guardrail check — not as primary author.

### Phase E — Promote

**Input:** Locked stroke + vignette pack + detail fill.

**Actions:**

1. Add row to `reports/README.md` index.
2. Hub Docs tree already indexes campaign folder — strokes appear under `worldbuilding/`.
3. Human promotes table-ready bits into `story/` (never auto-edit `story/`).
4. Re-open `reports/progress.md` **Phase E** checkboxes for think lane continuity (one item per promoted stroke).

---

## 4. Where it runs — options & recommendation

| Option | Pros | Cons | Best for |
|--------|------|------|----------|
| **Hermes think tick** | Free-first; already owns NYC lane; intermittent background progress | ~8m LLM throttle; exit 124 timeouts; one report/tick ≈ one phase slice | Phase A draft, Phase C detail, steady drip |
| **Hub Docs / Chat Workshop** | Human-triggered; rich thread; GM sees dialectic live | Manual; not on cron; competes with other Hub work | Phase A interactive; Phase B review |
| **Cursor `cursor:auto`** | Skills + longer context; better multi-step dialectic in one shot | Paid; explicit pick only; not on potato crons | Phase A+B batch when GM wants one sitting |
| **Offline script** (`scripts/.../nyc-worldbuilding-loop.sh`) | Deterministic file paths; template injection; no LLM for scaffolding | Still needs LLM for content; another script to maintain | Folder creation, progress.md updates, header templates |

### Recommended default (ponytail)

**Hybrid — script scaffold + Hermes think + Workshop gate:**

1. **Offline script (minimal):** Create `worldbuilding/{strokes,details,vignettes}/`, stamp template headers, append `progress.md` Phase E items — **no LLM**.
2. **Hermes think tick:** Primary engine for Phase A drafts, Phase C detail, Phase D vignettes (one artifact per tick; read locked strokes first).
3. **Hub Workshop:** Phase B human gate + optional “argue harder” re-prompt; GM picks fork from SoT open questions.
4. **Cursor `cursor:auto`:** Optional **burst** when free lane timeouts or GM wants full dialectic + 3 vignettes in one session — not default.

**Why not Docs Beta as the loop?** Beta is Pixi-shape/guardrail testbed — useful for **one vignette voice check**, not canonical worldbuilding SoT.

**Why not think-only?** Without Workshop/ledger gate, strokes never lock; dialectic becomes endless drafts.

---

## 5. Prompt / scaffold outline (not full prompts)

### File templates (headers only)

**Stroke draft** (`worldbuilding/strokes/...-draft.md`):

```markdown
---
fork: <SoT question id>
status: draft | locked | rejected
divergence_seed: <§D note or none>
---

## Thesis (option A)
## Antithesis (option B)
## Synthesis (recommendation)
## Residual risks / deferred forks
## Implications for play (3 bullets)
```

**Justification chain** — embedded in stroke file (preferred) or `*-justification.md` if tick splits.

**Vignette** (`worldbuilding/vignettes/<stroke-slug>/NN-title.md`):

```markdown
---
stroke: <slug>
ward: <from ancestries table or generic>
tests: <what setting truth this story proves>
---

## Scene
(prose)

## If this feels wrong, check stroke:
- <assumption 1>
- <assumption 2>
```

### Self-critique checklist (agent must answer before closing tick)

1. **Broad before detail?** Did we decide city-shape / law / visibility before naming gadgets?
2. **§C compliance?** Any new device run through grammar steps 1–5?
3. **Anti-modern-tech?** No phones, apps, CCTV cloud, crypto, skyscraper default?
4. **Dialectic real?** Antithesis must cite **play cost**, not strawman.
5. **Vignette encapsulation?** Story understandable without reading other reports?
6. **Tone?** Crime drama; no gang glorification; NSFW only if stroke pack flagged `explicit: allowed`.
7. **Ward respect?** No ancestry ↔ ethnicity 1:1 mapping?

### Think lane addendum (outline for `NYC_MAFIA_DND_TASK.md` later)

- Read order: `SETTING-*.md` → `worldbuilding/strokes/*locked*` → `progress.md` first open Phase E item.
- Tick types rotate: `dialectic` | `detail` | `vignette` (encoded in progress checkbox id).
- Reports still allowed in `reports/` for backward compatibility; **new work prefers `worldbuilding/`**.

---

## 6. Todos — smallest implementable steps (no code yet)

Checklist for a future implementation session. Order matters.

### 6.1 Structure (filesystem only)

- [ ] **T-1** Create `campaigns/nyc-mafia-dnd/worldbuilding/README.md` — explains stroke → vignette flow; links SoT files.
- [ ] **T-2** Create empty dirs: `worldbuilding/strokes/`, `worldbuilding/details/`, `worldbuilding/vignettes/`.
- [ ] **T-3** Add `worldbuilding/strokes/_TEMPLATE-draft.md` and `worldbuilding/vignettes/_TEMPLATE-vignette.md` (headers from §5).

### 6.2 Progress / lane wiring

- [ ] **T-4** Extend `reports/progress.md` with **Phase E — Thought loop** items (see below).
- [ ] **T-5** Update `agents/NYC_MAFIA_DND_TASK.md` — read locked strokes; write paths under `worldbuilding/`; tick type rotation.
- [ ] **T-6** Add one-line pointer in each `SETTING-*.md` § “Think lane” → this plan + `worldbuilding/README.md`.

**Suggested Phase E checkboxes (first pass):**

- [ ] **E-1** Dialectic draft: **year window** (1928 / 1931 / 1933) → `worldbuilding/strokes/...-year-draft.md`
- [ ] **E-2** Dialectic draft: **magic visibility** (common knowledge vs polite denial)
- [ ] **E-3** Dialectic draft: **federal face** (BCC-only vs OTR + local occult squad)
- [ ] **E-4** Lock first approved stroke (GM gate) → rename draft to `status: locked`
- [ ] **E-5** Detail fill for first locked stroke (§C + one ward)
- [ ] **E-6** Vignette pack (3 scenes) for first locked stroke
- [ ] **E-7** Index row in `reports/README.md` + ledger Result

### 6.3 Scaffold script (optional, ponytail)

- [ ] **T-7** `scripts/linuxbox/nyc-worldbuilding-scaffold.sh` — args: `--fork <slug> --type dialectic|vignette`; creates dated file from template; does **not** call LLM.
- [ ] **T-8** Document script in `worldbuilding/README.md`; no cron — manual or think-prep only.

### 6.4 Hub / human gate (minimal)

- [ ] **T-9** Hub Chat Workshop **mode hint** (one paragraph in existing Workshop template): paste stroke draft, ask for harder antithesis — **text change only**, no new API.
- [ ] **T-10** Ledger convention: `[GM] Stroke locked: <slug>` / `[PC] Stroke draft: <slug>` for Phase B.

### 6.5 Quality / guardrails

- [ ] **T-11** Add `worldbuilding/LINT.md` — human-readable checklist (§5) for GM review.
- [ ] **T-12** Optional: one Docs Beta scenario seed per vignette pack for voice check — **manual**, not automated.

### 6.6 Defer (explicitly out of scope for v1)

- [ ] ~~New Hub tab “Worldbuilding”~~ — use Docs tree.
- [ ] ~~Meta-Harness scoring of dialectic quality~~ — until v1 artifacts exist.
- [ ] ~~Auto-promote to `story/`~~ — human only.

---

## 7. Open questions for GM

**Resolved 2026-08-01** — see `campaigns/nyc-mafia-dnd/LOCKS.md` and brief § LOCKED.

1. ~~Cadence~~ → **Batch** core strokes + **drip** with steer options  
2. ~~Human gate~~ → **Soft** (parallel draft; Workshop/drip lock)  
3. ~~Fork priority~~ → **Era/law first** (era-law pack locked)  
4. ~~NSFW~~ → **Full depravity allowed, measured**  
5. ~~Legacy reports~~ → **Reskin pass**  
6. ~~Stroke conflicts~~ → **Auto-supersede**  
7. ~~Pilot scope~~ → **NYC only**  
8. ~~Discord~~ → **Proceed without**

## 8. Implementation notes (when approved)

- **Resource governance:** Default Hermes think + free models; Cursor burst only on GM request.
- **Correctness:** No “done” without file on disk + `worldbuilding/progress.md` checkbox + ledger Result.
- **Multitask:** `worldbuilding/` is not `characters-registry.json` — no disk lock unless merging registry later.
- **Docs Beta:** Stays separate — optional vignette voice probe only.

### Implemented (v1)

- [x] **T-1–T-3** `worldbuilding/` README, dirs, templates
- [x] **T-4** `worldbuilding/progress.md` (separate from potato `reports/progress.md`)
- [x] **T-5** `agents/NYC_MAFIA_DND_TASK.md` updated
- [x] **T-6** `LOCKS.md` + SETTING cross-refs
- [x] **T-7–T-8** `nyc-worldbuilding-scaffold.sh` + checklist
- [x] **E-1** `strokes/era-law-pack.md` locked
- [ ] **E-2–E-7** drip continues on potato

---

*Plan author: PC agent · 2026-07-31 · No code shipped.*
