# Dashboard UX redesign — Phase 0 study

Self-contained project for **Linuxbox Hub** (`scripts/linuxbox/linuxbox-status/`) information architecture and clutter reduction. **Study + screenshots only** until human sign-off on Phase 1.

## Problem

- **11 flat rail tabs** (admin) with label drift (Docs vs Reports, Camp vs Campaigns).
- **News** has triple navigation: rail → 4-mode toolbar (Briefs/Markets/Social/Trackers) → list groups → reader.
- No **collapse**, **grouped nav**, or **drag layout**; mobile horizontal scroll is crowded.
- Related: inbox answers live on linuxbox but agent/task follow-through has gaps — see `inbox-task-gap-audit.md`.

## Goals (human request, 2026-07-07)

1. Dropdown / grouped tabs (reduce rail clutter).
2. Minimize / collapse sections (especially News sub-panels).
3. Eventually drag-and-drop layout with persistence.
4. Version **Systems registry** and dashboard UI semver.

## Artifacts in this folder

| File | Purpose |
|------|---------|
| `ia-map.md` | Current tabs, roles, mobile behavior |
| `clutter-audit.md` | News + rail diagnosis |
| `reference-patterns.md` | Grafana, Notion, VS Code, etc. |
| `phased-plan.md` | Phase 0–3 scope and exit criteria |
| `inbox-task-gap-audit.md` | Where answers went; task lane gaps |
| `screenshot-index.md` | Capture manifest + status |
| `CHANGELOG.md` | UX release notes (starts at study baseline) |
| `screenshots/` | Baseline PNGs |

## Verify (Phase 0 complete when)

- [ ] All shots in `screenshot-index.md` marked captured or N/A (admin auth).
- [ ] Human picks rail grouping taxonomy (see `phased-plan.md` open questions).
- [ ] `agents/linuxbox-systems.json` has `schema_version` / `registry_version`.

## Links

- Architecture: `docs/dashboard-ui-architecture.md`
- Dashboard lane: `agents/LINUXBOX_DASHBOARD_TASK.md`
- Smoke harness: `.staging/portfolio-redesign/_screenshots/dashboard-ui-smoke.mjs`
