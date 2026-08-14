# GameSys — Isla Primavera (2026-08-14)

**Canonical product name:** **GameSys** (Isla Primavera chronicle runtime).  
**Brand surfaces:** tableslop map `https://map.tableslop.org/` · campaigns host `https://campaigns.tableslop.org/`.  
**Status:** NORTH STAR / PLAN — name lock + architecture. Implementation follows phased gates below.  
**Holder:** `gamesys-northstar-2026-08-14`  
**Hard locks:** NEVER wipe `regions-ui.json`. `/3d` shelved (2D map = working SoT). Potato = command node, not the only compute.

---

## 0. Why the GM is asking (intent)

Earlier “M1 roads” work was **scaffold plumbing**. GameSys is the actual product:

| Plane | Role |
|-------|------|
| **Discord** | Main **RP plane** — play, speech, scenes, social |
| **GameSys** (map + world SoT) | **Realtime truth** — where people are, what moved, weather, econ, logistics, combat outcomes, story clocks |
| **Linuxbox (potato)** | **Lightweight command node** — owns running instance + results; **divvies** heavy sim to external hardware |

Roads/lanes are not a paint layer alone — they are a **game system** (movement, logistics, travel time, blockages, board writeback). Same class as weather, economy, phone, NPC sim.

If this read is wrong, amend §8 before coding.

---

## 1. Name usage (required henceforth)

- Prefer **GameSys** in new docs, ledger lines, Hub tasks, agent prompts.
- Prior docs may still say “tableslop World / Isla map / Theme B” — treat those as **GameSys aliases**.
- One-line stamp for older plans:  
  `> **GameSys alias:** this document is part of GameSys (Isla Primavera). SoT: \`docs/plans/gamesys-isla-primavera-2026-08-14.md\`.`

---

## 2. Vision

**Immersive continuous world** over weeks/months:

1. Players RP on Discord.
2. GameSys **ingests** what matters (characters, locations, outcomes) into SoT.
3. GameSys **simulates** people (NPCs), world events, economics, weather, logistics, roads/movement, combat, story growth — generative + deterministic data science, not “LLM invents the island every tick.”
4. Map + phone + World UI **show** live truth; Discord stays the social stage.
5. Optional later **twist mode:** zombies (main story intact; opt-in branch).

**Bandwidth:** sim may be heavy and slow — that is fine. Story evolves on a **long clock**. Potato holds **results + dispatch**, not every compute job.

---

## 3. Architecture (command node + workers)

```text
Discord (RP plane)
    │  ingest / clarify / track
    ▼
GameSys SoT  ←── map.tableslop.org UI / phone / World
    │
    ▼
potato command node  (dispatch, locks, results store, public APIs)
    │
    ├── local light ticks (weather bias, board, roads status)
    └── external workers (PC / laptop / future nodes)
            heavy NPC batch · econ · logistics · combat resolve · story growth
```

| Piece | Owns |
|-------|------|
| **SoT** | `campaigns/tropic-gooner/` shards (roads, weather, board, logistics, phone, economy, registry with locks) |
| **Command node** | potato systemd + APIs; job queue; merge results with `base_version` |
| **Workers** | Pull job → run sim → POST result; idempotent; never write `regions-ui` |
| **Discord bots** | hunter-reckoning / tropic — **ingest + clarify**; GameSys is SoT, not Discord memory alone |

---

## 4. Discord ↔ GameSys (required systems)

### 4.1 Ingest players / characters

- Link Discord user ↔ PC/character (App A links + registry).
- Ingest sheet facts, loadout, last-known place into GameSys SoT (not transcript-only).
- Prefer existing registry + multitask locks; no blind overwrite.

### 4.2 Tracking (Discord with map; map = SoT)

- Discord may **propose** location/state (“we’re on the Boardwalk”).
- GameSys **commits** after validation (region, road graph, time, FOW).
- Map pins / presence tags / diegetic clock are authoritative for “where is X.”

### 4.3 Clarifying questions

- When RP is underspecified (where? who present? what time?), GameSys/bot asks **one** clear clarifying question (Inbox prose / INBOX_PROSE — no antithesis spam).
- Do not invent travel or combat outcomes without enough diegetic input **or** an explicit GM override.

---

## 5. Simulation domains (game systems)

Each domain is a **system** with SoT + tick + UI surface:

| Domain | Near SoT / hooks | Notes |
|--------|------------------|--------|
| **Roads / movement** | `roads/` shards, Bay Ring, Layers Roads | Travel time, closures, board impact — **game system**, not paint |
| **Logistics** | `logistics/` | Freight/ferry/bus corridors; delays feed board |
| **Weather** | `weather/` + phenomena | Biases next weather; feeds World |
| **Economics** | economy overlay / lived-in | Deterministic first |
| **NPCs / people** | registry + World cast | Background routines; agency (not wish-fulfillment) |
| **World events / board** | `board/` threads → World deltas | Mandatory writeback when impact=true |
| **Combat** | (future shard) | Resolve on workers; Discord narrates |
| **Story growth** | board + campaign notes | Months-scale arcs |
| **Phone** | phone HUD + SFX bank | Calls/texts **and** order/move apps — **light** app shells (note now; build phased) |
| **Zombies twist** | (later mode flag) | Opt-in branch; do not pollute main SoT until chosen |

---

## 6. Phone (note for now — light apps)

Modern-day phone on the map HUD:

- Call + text (already stubbed paths).
- **Order** (WcDonalds / IsleMart-class) and **move** (navigate island / rides) as **light applications** — not full native complexity.
- Prefer HOME launcher + small apps over one mega-panel.
- SFX bank already mounted; Foley assets optional later.
- Full commerce/inventory sims stay worker-side; phone UI is a **thin client** to GameSys.

Do not block GameSys road/Discord work on finishing every phone app.

---

## 7. Phased delivery (honest gates)

| Phase | Outcome | Verify |
|-------|---------|--------|
| **G0** | Name lock + this doc + pointers in prior plans | Doc exists; ledger Result |
| **G1** | Roads as game system v1 — closures ↔ board ↔ travel cost on Paradise/tri-city | API + map Layers + one board resolve smoke |
| **G2** | Discord ingest stub — character link → GameSys presence field | Fixture Discord id → SoT row; no registry wipe |
| **G3** | Clarify-question path — underspecified travel → one question | Scripted RP → inbox/bot ask once |
| **G4** | Command-node job envelope — potato dispatches one offload job, stores result | JSON job + result file; no Hub race |
| **G5** | Phone light apps skeleton — Order + Move icons (honest stubs OK) | UI smoke; no fake checkout |
| **G6+** | NPC batch / econ / combat / zombies mode flag | Separate milestones |

**M1 roads content (2026-08-14)** feeds **G1** — 52 features live; still not full sim.

---

## 8. Open GM decisions (ask before assuming)

1. First Discord guild for GameSys ingest — Hunter only, Tropic only, or both?
2. Clarify questions — bot in-channel vs Hub Inbox vs both?
3. First external worker — this Windows PC only, or any Tailscale node?
4. Soft clock — keep **48h IRL ≈ 1 world day**, or change for GameSys?
5. Zombies — design doc now, or park until post-G5?

---

## 9. Related docs (aliases)

| Doc | Relation |
|-----|----------|
| `docs/plans/tableslop-dual-app-roadmap-2026-08-01.md` | Themes A/B hosting; GameSys = Theme B play runtime |
| `docs/plans/tableslop-world-*-2026-08-12.md` | World M0–M4 package → GameSys world systems |
| `docs/plans/isla-primavera-wb-finish-checklist-2026-08-01.md` | Worldbuilding checklist under GameSys setting |
| `agents/tableslop-progress.md` | Continuous board — add GameSys ticks under G1+ |
| `.mem-constant/tableslop-map-goal.md` | Map ops pointer — now GameSys map surface |

---

## 10. Non-goals (this doc)

- Rewriting Hub into the game.
- Loading heavy sim on potato 1m crons.
- Wiping or agent-redrawing GM borders.
- Shipping zombies mode in G0–G5.
