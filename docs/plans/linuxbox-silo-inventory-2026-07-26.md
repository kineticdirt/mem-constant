# Linuxbox dashboard → silo inventory (2026-07-26)

**Scope:** read-only map of *current* Hub UI + APIs to proposed silos.  
**No dashboard HTML/JS edits** (architecture agent owns mutations).  
**Sources:** `scripts/linuxbox/linuxbox-status/index.html`, `linuxbox-status-server.js`, `linuxbox-systems.js`, `agents/linuxbox-systems.json`, `docs/dashboard-ui-architecture.md`, `agents/user-tasks.json`, prior IA `projects/dashboard-ux-redesign/ia-map.md`.

**Proposed silos:** System · Tasks · Chat · News · Docs · Pixi RP · Mazda3 · Meta (TBD) · Maps/tableslop (**external — leave Hub**).

**Shell today:** one rail + one `<section id="{tab}">` per tab inside `index.html` (monolith; no separate JS modules on disk — modules are inline script functions). Viewer/public Intel: Docs + News only.

---

## 1. Current rail → recommended silo

| Rail label | `data-tab` / `#section` | Primary APIs | Recommended silo | Reuse vs retire |
|------------|-------------------------|--------------|------------------|-----------------|
| **Hub** | `hub` | `GET /api/agent`, `/api/think-live`, `/api/model-budget`, `/api/machines`, `/api/host-resources` (partial), `POST /api/tasks` (Fix this) | **Split** → System + Tasks + Chat + Meta | **Reuse** panels; **retire** Hub as a dump of everything. Keep a thin home *or* land default on Tasks/System. |
| **Systems** | `systems` | `GET /api/systems`, `/api/systems/{id}/detail`, `/api/host-resources`, `/api/machines`, `POST /api/systems/control`, temp-auth APIs | **System** | **Reuse** as System silo core. |
| **Inbox** | `inbox` | `GET /api/inbox`, `POST /api/inbox/reply` | **Meta** (or Tasks satellite) | **Reuse**. Human answers for agent lanes — not Chat. Prefer Meta; if Meta stays TBD, park under Tasks “Human answers”. |
| **Docs** | `reports` | `GET /api/reports/{campaign}`, `/api/reports/public`, situation-monitor / code-discovery prefixes | **Docs** | **Reuse** (rail already labeled Docs; id still `reports`). |
| **News** | `news` | `GET /api/intel`, `/api/news`, `/api/news/brief` | **News** | **Reuse** as-is (Briefs / Markets / Social / Trackers). |
| **Camp** | `campaigns` | `GET /api/campaigns/*`, `/api/agent` campaign bars | **Docs** (campaign shelf) + link to Maps | **Reuse** progress/detail; **retire** any map iframe mindset (already CTA → map.tableslop.org). |
| **Map** | `map` | none (static link-out) | **Maps/tableslop (external)** | **Retire rail tab** — duplicate of Camp CTA. Leave Hub; open `https://map.tableslop.org/`. |
| **Stories** | `stories` | `GET /api/stories`, `/api/stories/doc`, bridges → Chat/Tasks | **Docs** (canon) | **Reuse** as Docs sub-nav “Story canon”; keep Interview/Brainstorm → Chat deep-links. |
| **Chars** | `characters` | `/api/characters-registry*` | **Maps/tableslop** (cast SoT) + Hub thin link | **Reuse** APIs; **prefer** map `#cast` as product roster; Hub Chars = admin merge/resolve until map owns full CRUD. Do not wipe registry. |
| **Chat** | `chat` | `/api/chat*`, `/api/chat/threads*`, `/api/model-budget`, `/api/chat/offload` | **Chat** | **Reuse** whole panel as Chat silo. |
| **Tasks** | `tasks` | `/api/user-tasks`, `/api/user-projects`, `POST /api/tasks`, `/api/agent` active-now | **Tasks** | **Reuse** as Tasks silo. |
| **Build** | `garage` | `GET /api/garage` → `projects/mazda3-sports-build/parts.json` | **Mazda3** | **Reuse**; rename rail Build → Mazda3. |
| **Meta** | `backlog` | backlog via `/api/agent` meta block; `POST /api/dashboard/suggest` | **Meta (TBD)** | **Reuse** backlog UI; expand Meta TBD (harness, smoke, Fix-this). |

**Chrome (all admin tabs):** topbar Running now (`/api/agent` + `/api/think-live`), lane chips, display sizing — belongs primarily to **System** (ops pulse) with a **Tasks** mirror of Active now.

---

## 2. Hub sub-surfaces (today’s kitchen sink)

| Hub block | DOM / behavior | Recommended silo | Note |
|-----------|----------------|------------------|------|
| Ops headline + KPIs | `#ops-*`, `#kpi-*` | System / Tasks | Drill-downs already `data-tab` to Tasks/News/etc. |
| Running now + Worker Log | `#hub-running-now`, Goal/Step + “Show full log” | **Tasks** (work) + **System** (health) | Goal+Step default; full log toggle stays. |
| Machines & sync | `#machines-bar` (+ Pixi/Bonsai hints) | **System** | Pixi up/down here is **orphan product** signal — also feed **Pixi RP** silo. |
| Campaign progress / Agent lanes | `#campaign-bars`, `#lane-bars` | **Tasks** | Lane focus = continuous lanes, not host metrics. |
| Quick actions | `#action-list` | stay distributed | Per-target silo CTAs. |
| Model spend / token usage | `#hub-spend-panel` | **System** (budget) or Chat footnote | Already moved off Systems once; keep one home (prefer System). |
| Chat models routing | `#hub-models` | **Chat** | Hub should not own Auto free/paid picks. |
| Fix this | `#fix-this` → user-task LINUXBOX | **Meta** | Ops queue, not Chat. |
| Debug JSON | `#debug-json` | System (dev) | Optional. |

---

## 3. Systems panel → System silo

| Surface | API / data | Silo |
|---------|------------|------|
| Temp viewer links | `GET/POST /api/auth/temp-accounts`, redeem, revoke | System (auth ops) |
| Machines & sync (duplicate of Hub) | `GET /api/machines` | System — **dedupe** vs Hub |
| Host resources (CPU/RAM/swap/storage/procs) | `GET /api/host-resources`, `/metrics` | System |
| Service cards + Details + start/stop/restart | `GET /api/systems`, `…/detail`, `POST /api/systems/control` | System |
| Registry refs | `agents/linuxbox-systems.json` | System |

**Service refs (do not lose):** `tunnel-abhinavall`, `tunnel-tableslop`, `portfolio`, `hub`, `tableslop`, **`pixi`**, `hermes`, `hunter`, `scheduler`.

Pixi card (`ref=pixi`, `:8767`) is health/control only — **not** a product UI. Product work → **Pixi RP** silo (link-out).

---

## 4. API catalog by silo

### System
`/api/session`, `/api/status`, `/api/systems*`, `/api/host-resources`, `/metrics`, `/api/machines`, `/api/auth/temp-*`, `/icons/*.svg`, spend slice of `/api/model-budget` + `/api/agent` host/ops fields.

### Tasks
`/api/user-tasks`, `/api/user-projects`, `POST /api/tasks` (campaign progress append), `/api/agent` (`work_pipeline`, active work, lanes), `/api/think-live`, Inbox *if* parked here.

### Chat
`/api/chat`, `/api/chat/status|modes|models|focus-docs|threads*`, `/api/chat/offload`, model-budget **write**, thread promote/save-note/branch/message CRUD.

### News
`/api/intel`, `/api/news`, `/api/news/brief` (+ viewer-safe prefixes).

### Docs
`/api/reports/*`, `/api/reports/public`, `/api/stories*`, campaign report trees under `reports/` + campaign markdown via stories.

### Pixi RP *(new silo — almost no Hub UI today)*
No dedicated tab. Touch points to gather:
- Systems card `pixi` + control
- Machines bar `local_pixi` / desktop pixi URL
- `agents/user-tasks.json` project `pixi-rp` + tasks `pixi-*`
- Specs: `agents/PIXI_RP_TASK.md`, `agents/PIXI_RP_PROGRESS.md`, `docs/pixi/ENGINE-GOBSTOPPER.md`
- Runtime: potato `linuxbox-pixi-rp` `:8767` (Tailscale/LAN only)

**Recommend:** silo = status CTA → Pixi URL + open pixi tasks + link to Gobstopper docs. Do **not** iframe the RP UI into Hub.

### Mazda3
`GET /api/garage` ↔ `projects/mazda3-sports-build/parts.json`; Chat `PROJECT_WRITE` / extractMazdaFacts; user-tasks project `mazda3-sports-build`; cron `mazda3-price-monitor` → `reports/mazda3/`.

### Meta (TBD)
`/api/dashboard/suggest`, Meta cards from `/api/agent` (backlog path, smoke path, last meta tick), Fix-this, Inbox, `agents/LINUXBOX_DASHBOARD_BACKLOG.md` + `LINUXBOX_DASHBOARD_TASK.md`, meta-harness rollups under `agents/meta-harness/` / `reports/meta-harness/` (not a first-class Hub panel yet).

### Maps/tableslop (external)
Leave Hub. Product: `https://map.tableslop.org/` (`linuxbox-tableslop` `:8765`), cast `#cast`, availability `https://campaigns.tableslop.org/` (`:8768`). Hub Map/Camp = link-out only. Characters-registry remains potato-owned shared SoT (lock/version rules unchanged).

---

## 5. Orphan / split data (watch list)

| Data | Where it lives today | Orphan risk | Silo home |
|------|----------------------|-------------|-----------|
| **user-tasks `projects[]`** | `agents/user-tasks.json` — infranet, mazda3, dashboard-ux, tableslop, linuxbox, portfolio, research-bookmarks, **pixi-rp** | Tasks UI lists all; product silos need filters/deep-links | Tasks index + per-silo “open tasks for X” |
| **Pixi health** | Systems `pixi` + Hub machines `local_pixi` | No product silo | **Pixi RP** |
| **Mazda3 parts** | `/api/garage` + Build tab | OK if Build→Mazda3 | **Mazda3** |
| **`reports/`** | Docs tab + News briefs overlap situation-monitor | Dual entry | Docs = archives; News = intel briefs |
| **Intel RSS / markets** | News + public `/Intel/` | OK | **News** |
| **Host metrics** | Systems + optional Hub resources CSS | Duplicated UX | **System** only |
| **Campaign boards** | Tasks board + Camp + Hub bars | Triple surface | **Tasks** primary; Camp/Docs secondary |
| **Chars registry** | Hub Chars + map cast | Two UIs, one SoT | Maps product + Hub admin tools |
| **Chat catalog** | Hub models + Chat picker + `agents/model-budget/chat-catalog.json` | Split brain | **Chat** owns routing UI |
| **Meta-harness / smoke** | Meta cards paths only | Under-surfaced | **Meta TBD** |
| **Hunter Discord** | Systems `hunter` | Campaign ops vs System | System health; Camp/Docs for lore |

---

## 6. Auth / visibility (do not break)

| Audience | Tabs |
|----------|------|
| Admin (`/Linuxbox/`) | all rail tabs |
| Viewer / temp viewer | Docs + News (admin-only CSS hide) |
| Public Intel | `/Intel*` → viewer-safe GETs (`/api/intel`, news, public reports) |

Silo remap must preserve viewer surface = News + Docs.

---

## 7. Top move recommendations (for architecture agent)

1. **Stand up Pixi RP silo** — gather Systems `pixi` health, machines link, `pixi-rp` tasks, Gobstopper/docs links; CTA to `:8767` (no iframe).
2. **Rename Build → Mazda3** — keep `/api/garage` + parts.json; optional deep-link from Tasks project filter.
3. **Retire Map rail tab** — external Maps only; Camp keeps one “Open map” CTA.
4. **Move Chat models (+ spend policy UI)** off Hub into **Chat** (spend totals may stay on System).
5. **Collapse Hub** — Running now / Worker Log / Fix-this / spend / machines redistribute; Hub becomes thin home or disappears into System landing.
6. **Systems → System silo** — host Task Manager bars + service refs; dedupe machines panel with Hub.
7. **Tasks silo owns Active now + campaign queues + user-projects** — including filters for mazda3 / pixi-rp / tableslop / linuxbox.
8. **Stories → Docs sub-nav**; keep Chat bridges (Interview / Brainstorm / Discuss).
9. **Chars → admin tools under Maps link-out** (or Docs “cast admin”); do not invent a second registry; honor lock/version.
10. **Flesh Meta TBD** — backlog + Fix-this + Inbox + smoke/meta-harness cards; stop treating Meta as “backlog textarea only”.

---

## 8. Explicit non-goals (this inventory)

- No edits to `index.html` / server JS.
- No Maps product UI inside Hub.
- No Pixi OpenRouter key sharing with Hermes.
- No characters-registry wipe/merge without multitask lock.

---

## 9. File pointers

| Path | Role |
|------|------|
| `scripts/linuxbox/linuxbox-status/index.html` | All panels (monolith) |
| `scripts/linuxbox/linuxbox-status-server.js` | REST `/api/*` |
| `scripts/linuxbox/linuxbox-systems.js` | Systems health/control |
| `agents/linuxbox-systems.json` | Service registry + `ref`s |
| `docs/dashboard-ui-architecture.md` | Form families + Inbox machine |
| `docs/agents/linuxbox-systems-panel.md` | Systems runbook |
| `agents/user-tasks.json` | projects[] + tasks[] |
| `projects/mazda3-sports-build/parts.json` | Garage SoT |
| `projects/dashboard-ux-redesign/ia-map.md` | Older 11-tab IA (pre–Map/Chars; pre-silo names) |
