# Linuxbox admin — silo dashboard (2026-07-26)

**Why:** Process-improvement hub needs clear ownership. Agents/humans dump everything into Tasks soup. System sees everything; product lanes (Pixi, map, mazda) are siloed; ops Chat stays distinct from RP.

**Constraint:** Ponytail — surgical IA/nav moves; reuse panels/APIs; do not rewrite 9k-line `index.html`. Preserve CF Access/auth + `agents/state/chat-threads/`.

---

## Confirmed silo map

| Silo | Purpose | Phase 1 surface |
|------|---------|-----------------|
| **System** | Ops glance: all silos + host (CPU/RAM/context) | Renamed Hub → System; silo glance strip + compact host snap; full host detail stays on Host tab |
| **Tasks** | Command & control (Active Now, user tasks, queues, inbox clarifications) | Existing Tasks panel kept; C2 direction not stripped |
| **Chat** | Talk to data / fix misconceptions / do tasks — **not** RP | Existing threads; labeled Ops Chat ≠ Pixi |
| **News** | Stocks + intel/RSS | Existing News/Intel panel (briefs/markets/social/trackers) |
| **Docs** | Reports + useful info (Obsidian-like browse) | Existing Docs (`#reports`) + lightweight search filter |
| **Pixi RP** | Roleplay engine `:8767` | New panel: status + Tailscale/LAN links (no full embed) |
| **Mazda3** | Sports build (parts/tasks) | Existing Garage/`/api/garage` + mazda3-scoped task links |
| **Meta** | Lane sync + systems design (locks, pick order, conflict rules) | Live panel from heartbeats + multitask locks + SYSTEMS_DESIGN_BOARD; observability (papercuts/harness/backlog) on **System** |
| **Maps** | tableslop / campaigns | **Off `/Linuxbox`** — open `map.tableslop.org` / `campaigns.tableslop.org` only |

**Secondary tabs (kept, not primary silos):** Inbox, Camp, Stories, Chars, Host (`systems` — Task Manager detail / services / temp viewers).

---

## Target IA (nav)

**Primary rail (silos):**
1. System (`hub`)
2. Tasks (`tasks`)
3. Chat (`chat`) — label “Ops Chat”
4. News (`news`)
5. Docs (`reports`)
6. Pixi RP (`pixi`) — new
7. Mazda3 (`garage`)
8. Meta (`backlog`)

**Secondary:** Inbox · Camp · Stories · Chars · Host

**Removed from rail:** Map (`map`) — section retained as external CTA only if deep-linked; no Hub map product.

Mobile `<select>` mirrors the same order.

---

## What moves where

| From | To |
|------|-----|
| Hub glance (ops headline, KPIs, Active/Running chrome, spend, Fix this, models) | **System** (same panel, relabeled) |
| Systems host CPU/RAM/GPU/services | **Host** tab (full); compact snap also on **System** (`#system-host-glance`, not `#hub-resources`) |
| Tasks Active Now / user tasks / campaign queues | Stay in **Tasks** (C2 home) |
| Inbox clarifications | Stay Inbox (secondary; Phase 2: Tasks C2 “clarifications” pane) |
| Chat threads | **Chat** silo (ops) |
| Reports list/reader | **Docs** (+ search) |
| News briefs/markets | **News** |
| Garage parts | **Mazda3** |
| Meta backlog + cards | **Meta** (+ philosophy stub) |
| Map tab / Camp map embeds | External CTAs only (already mostly link-out) |
| Pixi status (machines-bar / systems pixi ref) | **Pixi RP** silo panel |

---

## Removed from `/Linuxbox`

- **Map rail tab** (and mobile option) — do not present map as a Hub product.
- Do **not** delete `linuxbox-tableslop` / public map / campaigns avail services.
- Do not wipe Camp/Chars; Camp keeps “open on map.tableslop.org” CTAs.

---

## Non-goals (explicit)

- Meta product depth (philosophy stub + existing observability cards only).
- Full Pixi RP embed inside Hub.
- Greenfield C2 rebuild of Tasks (keep Active Now / queues; evolve later).
- Break CF Access / Basic auth / temp viewers.
- Touch `characters-registry.json` or wipe `agents/state/chat-threads/`.
- Rewrite `index.html` into multi-file SPA.
- Auto-deploy portfolio / change public tunnels.

---

## Phased todos

### Phase 1 — silos real in UI (this pass)

- [x] Ledger Intent + this plan
- [x] Rail reorder/relabel to silo map; remove Map from nav
- [x] System: silo glance + compact host snap (reuse `/api/systems` + `/api/host-resources` data paths)
- [x] Pixi RP panel (status + links)
- [x] Mazda3 label + surface existing garage + link Tasks filter
- [x] Chat ops banner (≠ Pixi)
- [x] Docs: list search filter
- [x] Meta: philosophy placeholder
- [x] Bump `DASH_BUILD` pair; update smoke for new tab / Map gone
- [x] Deploy potato; restart if server changed; curl + smoke evidence
- [x] Ledger Result

### Phase 2 — deepen ownership

- [ ] Tasks C2 panels: utilization, task-system health, clarification inbox w/ screenshots
- [ ] System: live per-silo health from one API (no duplicate polls)
- [ ] Docs: wiki-style cross-links / non-campaign docs tree
- [ ] News: expand stocks/RSS beyond current trackers
- [ ] Mazda3: parts + mazda3 user-tasks + chat threads scoped in one view
- [ ] Pixi: richer health (OR key/402, turn pipeline) without embedding chat-ui
- [ ] Hide or nest secondary tabs (Camp/Stories/Chars) under product silos
- [ ] Update `docs/dashboard-ui-architecture.md` § rail contract
- [ ] Meta observability layer (meta-harness rollup surface)

### Phase 3 — polish

- [ ] Extract CSS/JS modules if pain justifies
- [ ] Deep-link redirects (`?tab=map` → external)
- [ ] Viewer/Intel path stays News+Docs only

---

## Verify checklist

1. `curl` potato `:8790` /Linuxbox → 200; `dash_build` matches PC
2. Rail shows silos; **no Map button**
3. System has silo glance + host snap; Host tab still full metrics
4. Chat labeled ops; Pixi separate
5. Playwright `run-dashboard-ui-smoke.sh` (or PC-equivalent against potato)
6. Chat threads still list after deploy
