# Isla Primavera worldbuilding — finish checklist (2026-08-01)

> **GameSys alias:** setting docs for **GameSys**. SoT: [`gamesys-isla-primavera-2026-08-14.md`](gamesys-isla-primavera-2026-08-14.md).

**Status:** PLAN / inventory — deterministic docs & data only (no LLM citygen).  
**Parent:** `docs/plans/tableslop-dual-app-roadmap-2026-08-01.md` §9 **S1**.  
**Chronicle tree:** `campaigns/tropic-gooner/` (Tropic Gooner ∪ Hunter: The Reckoning).  
**Holder:** `tableslop-recalibrate-setup`

---

## Why this exists

GM locked Isla Primavera WB as an **active Setup→Beta workstream**. Phase 2 boxes in `reports/progress.md` are checked for *stubs*, but the island is **not** finished enough for a beta map product: empty/missing region pages, open GM favors question, hunter antagonist file missing on PC, vibes-only regions stubbed.

---

## Locked vs open (from `worldbuilding-decisions.md` + questions)

### Locked (do not re-ask)

| Topic | Decision |
|-------|----------|
| Rules | WoD 20th; Hunter defaults + lewd house rules later |
| In-game date | **2019** |
| Masquerade | Mortal party town — monsters hidden |
| Regions | Keep all **14** numbered map regions (+ vibes-only 15–17 exist on art) |
| PC home | Multiple / split party |
| Minerva / Harper | Both **NPC** (Harper still around) |
| Serial killer | Background thread |
| Discord | Guild **Tugridian United** `1469873840703144060`; scope = category `1137592539076120666`; play = **hybrid** |
| Stevens & Co. | Both — mundane cover + real work |
| Sasha base | **Paradise** |
| Threats | Cult, vampire, corrupt cops, serial killer, corporate/Stevens, + other factions |
| **Former-PC factions / favors (`wb-tg-factions`)** | **Closed 2026-08-01:** former PCs → NPCs; no quest-obligation favor anchors; ambient encounter texture; character flesh deferred |

### Still open / TBD

| Topic | Gap |
|-------|-----|
| Base map file Q4 | `output-onlinetools4k.png` marked done in progress — confirm still present on potato+PC |
| Orchid Falls / Nueva Vista | On Misc Notes / UI, **not** on `vibes.png` — decide: keep as soft regions or UI-only aliases |
| R15–R17 (Puckall, East Bayby, Research Islands) | vibes-only stubs — lore TBD |
| NSFW / map vs Discord vs Pixi | dual-app **D7** still open |
| Hunter antagonist roster file | `progress-hunter.md` still `[ ]` for `reports/open-threads.md` — **file missing on PC** (progress.md claims `[x]` — reconcile) |

### Closed this pass

| Topic | Decision |
|-------|----------|
| **wb-tg-factions** | **Closed 2026-08-01 (GM).** Former PCs → NPCs; barely peeked behind the veil. May owe favors in fiction later but **none locked as quest-obligation anchors now**. Ambient “people you might run into” if in the area — not quest NPCs. Sheets = kernels for place/world texture only; **full character flesh deferred**. Do not invent PC favor debts. |

---

## Missing / thin place pages

### Vault region notes (`Things and Places of Note/Regions/…`)

| Region | On-disk note | Gap |
|--------|--------------|-----|
| Paradise (R1) | `Paradise.md` **0 bytes** | **Write** — Sasha base + densest places-directory row |
| Porto Lujara (R2) | 4 lines | Expand or accept stub + directory row |
| Jackedsonville (R3) | ~67 lines | Strongest region page — use as depth bar |
| Villa Miel → InterFederal (R4–R14) | No dedicated vault files | Directory rows only — need ≥1 page or promoted `reports/places/<slug>.md` for beta pilot regions |
| Puckall / East Bayby / Research Islands | Directory stubs | Optional for beta if map HUD hides until lore exists |

### Index gaps (`places/INDEX.md`)

Regions **4–7, 9, 12–13, 15–17** lack dedicated vault notes (INDEX already says so).  
General Places: SwitchBack still **(TBD)** type.

### Orgs

Tier A majors written (`stevens-co`, `paradisio-crt`, `kindred-county`, `cidance`, `ash-list`). Tier B = `smatterings.md` only — **OK for beta** (`wb-tg-factions` closed: no org→PC obligation quests required; ambient former-PC NPCs only).

---

## “Finished enough for beta” (concrete)

Beta does **not** require Google-Maps depth or every PRI deep dive. Check all:

- [x] **Decisions:** `wb-tg-factions` closed 2026-08-01 — former PCs→NPCs; no quest-obligation favor anchors now; ambient encounter texture only; character flesh deferred (see `worldbuilding-decisions.md`)
- [x] **Paradise region page** non-empty — `Things and Places of Note/Regions/PARADISIO COUNTY/Paradise.md`
- [x] **Jackedsonville + Porto Lujara** usable as play regions — Jackedsonville OK; Porto expanded 2026-08-01 (holder `tableslop-s0-s1-impl`)
- [x] **places-directory** R1–R3 rows match vault/display names (`vibes.png` spellings win; aliases noted)
- [x] **Threat roster** (`reports/open-threads.md`) — restored on PC; hunter progress closed
- [x] **Soft regions:** Orchid Falls / Nueva Vista labeled soft/deferred in `places/INDEX.md` + places-directory; R15–R17 deferred past beta
- [x] **No LLM citygen** used to invent streets/fog — authored lists only when S2 starts
- [x] Soft clock stub referenced (parent plan S0) — `map/diegetic-clock.json`; WB copy notes 2019 diegetic year separately from IRL 48h/day

Out of beta scope: full Tier B org novels, R15–R17 lore, street graphs, live sim AI.

---

## Next 5 concrete writing / data tasks (no LLM citygen)

1. ~~**Answer or close `wb-tg-factions`**~~ **done 2026-08-01 (GM)** — no quest-obligation favors; ambient former-PC NPCs; flesh deferred.
2. ~~Write Paradise.md~~ **done 2026-08-01** (holder `isla-wb-s1-start`).
3. ~~Create/restore `reports/open-threads.md`~~ **done 2026-08-01**.
4. ~~Promote two place deep-dives~~ **done** — `reports/places/galaxy-fitness.md` + `neon-flux.md`.
5. ~~Reconcile soft regions~~ **done** — INDEX + places-directory; R15–R17 past beta.

### S1 leftovers (after 2026-08-01 pass)

- ~~GM: **`wb-tg-factions`**~~ **closed** — S1 beta **decisions row** complete.
- ~~Expand **Porto Lujara** vault page~~ **done** (usable play stub).
- ~~Confirm places-directory R1–R3 spellings vs vibes~~ **done** (INDEX/vibes notes on R1–R3 headers).
- ~~Soft clock / S0 cross-ref~~ **done** (`map/diegetic-clock.json` + parent roadmap S0).
- Optional (not S1 blocker): Nelly's Book Nook third deep-dive; hunter map scene markers; character flesh (deferred post-S3 product focus).
- **Post-S1 product focus** (parent roadmap): dashboard + test/error framework + map HUD↔`vibes.png` art — not more character novels.

---

## Pointers

| Path | Role |
|------|------|
| `campaigns/tropic-gooner/reports/worldbuilding-questions.md` | Source questions |
| `campaigns/tropic-gooner/reports/worldbuilding-decisions.md` | Locked answers |
| `campaigns/tropic-gooner/reports/places-directory.md` | Expanded venue index |
| `campaigns/tropic-gooner/places/INDEX.md` | Region name SoT vs vibes |
| `campaigns/tropic-gooner/reports/faction-registry.md` | PRI-#### orgs |
| `campaigns/tropic-gooner/reports/progress.md` | Phase boxes (stubs done ≠ WB finished) |
| `campaigns/tropic-gooner/reports/progress-hunter.md` | Hunter-layer open boxes |

*Amend with ledger holder; do not fork a second Isla WB SoT.*
