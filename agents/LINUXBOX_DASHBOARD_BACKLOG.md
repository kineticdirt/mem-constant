# Linuxbox dashboard backlog

Agent (`agent-cycle-think`, **meta lane**) implements **one** unchecked item per tick.
Spec: **`agents/LINUXBOX_DASHBOARD_TASK.md`** · UI: `scripts/linuxbox/linuxbox-status/`

Human may add items via **System** tab (Observability / backlog) or edit here.

## Open

### Meta: Systems design + daily deslop visibility
- [x] **Meta-sys:** Meta tab Systems design card + `/api/agent` `meta_lane.systems_design_board` / `daily_deslop_open` (2026-08-10). Board SoT: `agents/SYSTEMS_DESIGN_BOARD.md`.
- [x] **Meta-lane-sync:** Replace Meta philosophy/path cards with live lane-sync panel (heartbeats · locks · conflict rules · pick order); move papercuts + meta-harness + open backlog to System bottom (2026-08-10). Holder `hub-meta-lane-sync-panel`.
- [x] **Meta-skill:** Philosophy + conflict rules as skill/subagent (`lane-sync`) + `agents/META_LANE_SYNC.md`; think/Cursor inject; Meta philosophy fold; Observability triad verified live (2026-08-10). Holder `lane-sync-skill-run`.

### Hub: last fast (~30s crontab) and think (1m cron) activity on lane chips
Parent intent retained (was one multi-step bullet that timed out at ~300s on think ticks). Split 2026-07-24 into tick-sized steps — do **one** `[ ]` per tick; when all children are `[x]`, move this section under Done with a dated line.

- [x] **Hub-a:** Tick writers — sync+think already stamp `agents/state/sync-tick.last` / `think-tick.last` (fast lane removed 2026-08-01); optional `dashboard-lane-state.json` rollup deferred — 2026-08-10
- [x] **Hub-b:** API — expose sync/think `last_seen` on `/api/agent` as `lane_sync.last_seen` (+ locks / conflict rules) — 2026-08-10 (heartbeats already written by sync/think; fast lane removed)
- [x] **Hub-c:** UI — Hub lane chips render last sync + think (+ SSH duration) from `lane_sync` payload; Meta live lanes include SSH sessions — 2026-08-10 (holder `hub-c-ssh-lane-chips`; dash_build `db_20260810-hub-c-ssh-chips-r1`)
- [x] **Hub-d:** Verify — potato `curl 127.0.0.1:8790/api/agent` shows `lane_sync.last_seen` + conflict_rules (incl. ssh sessions); dash_build `db_20260810-hub-c-ssh-chips-r1` — 2026-08-10

- [ ] **Smoke:** after dashboard edits, run `bash scripts/linuxbox/run-dashboard-ui-smoke.sh`; triage fails into this backlog (see `agents/DASHBOARD_UI_SMOKE_TASK.md`)

## Done

- [x] **Hub:** last-run / what ran — Hub strip shows Last completed from `agents/state/run-index.jsonl` + lane heartbeats (ET); Meta tab enriched (what-it-does + live cards) — 2026-07-13
- [x] **Docs:** keyboard nav — `j`/`k` moves selection in report list; `Enter` opens in reader pane — 2026-07-13
- [x] **Docs:** remember last-open report in `sessionStorage` and restore on tab return — 2026-07-13 (already implemented in openReport + renderReports)
- [x] **Layout:** on viewports &lt; 768px, collapse sidebar rail to bottom icon bar (full width content) — 2026-07-13
- [x] **Visual:** accent pass — cyan `#6ec8ff` + lime `#b8e986` on active tab, next queue item, table headers only (no full-page glow) — 2026-07-13
- [x] **Chat:** persist chat bubbles in `sessionStorage` for the browser session (clear on explicit refresh button) — 2026-07-13
- [x] **Inbox:** after reply, show inline "Saved" on the item instead of full-page flash reload — 2026-07-13 (fixed: removed 1s setTimeout that raced with 20s poll tick — card moves to answered instantly)
- [x] **Campaigns:** clicking a report chip jumps to **Docs** tab with that report loaded in the reader — 2026-07-13 (already implemented at line 5656: `goTab("reports")` + `openReport()`)
- [x] **Fonts:** add robust system-ui fallback if Google Fonts CDN fails (no broken layout) — 2026-07-13 (already covered: `local()` @font-face with `font-display:swap` + `--font-sans` stack has `system-ui, -apple-system, … , sans-serif`; `--font-mono` has `ui-monospace, monospace`)
- [x] **Hub:** replace static lane summary with one-line "next up" from first pending campaign task (if any) — 2026-07-13 (ops-sub shows "Next up — Campaign: item" when pending; falls back to current_task_status)
- [x] **Stories layout:** character panel + toolbar + body flex column (no prose overlap) — 2026-07-02
- [x] **Smoke harness:** Playwright tab walk + overlap/console checks — `.staging/portfolio-redesign/_screenshots/dashboard-ui-smoke.mjs` — 2026-07-02

- [x] Show last agent-cycle success/fail and timestamp on Hub (lane pills) — 2026-06-07
- [x] Poll `/api/agent` faster when Chat tab is waiting for reply — 2026-06-07
- [x] Dashboard v2 — Hub, Inbox Q&A, Reports markdown viewer, chat profile picker — 2026-06-07
- [x] Dashboard v2.1 — full viewport, sidebar rail, split-pane Docs reader, IBM Plex utilitarian grid — 2026-06-07
