# Linuxbox lane sync design — aligned 2026-08-10

**Source chat:** Cursor **“Linuxbox lane sync design”**  
`4253b3a8-6c33-4c07-9cdd-a7a75b0ea959`  
**Align holder:** `lane-sync-design-align`  
**Potato verify (2026-08-10):** `dash_build=db_20260810-hub-c-ssh-chips-r1`, `lane_sync` last_seen + `ssh_sessions` + 7 conflict rules; hermes-gateway **active**; `cursor-lane-status.sh` OK.

This is a **record of decisions already shipped**, not a redesign. Implement against this + `agents/META_LANE_SYNC.md` + skill `.cursor/skills/lane-sync`.

## Decisions (from that chat)

1. **Meta rail stays** — becomes the **lane-sync systems design** surface (not a new rail, not philosophy/path soup).
2. **Papercuts · meta-harness · backlog** move to bottom of **System** (`#hub`) as the observability triad (same purpose, live scoreboard).
3. **Reuse first:** `SYSTEMS_DESIGN_BOARD` + Hub-a/b heartbeats (`sync-tick.last` / `think-tick.last`) + multitask locks — no parallel store.
4. **Philosophy becomes skill/subagent** (`.cursor/skills/lane-sync`, `.cursor/agents/lane-sync.md`, inject via think-setup + cursor-agent-run) — agents apply it while implementing; Hub Meta shows live state.
5. **Hub-a–d:** tick writers → API `lane_sync` → topbar chips from `lane_sync.last_seen` → verify on potato.
6. **SSH duration meld:** Hub Chat timew/`ssh-session-track` SoT surfaces as topbar **ssh** chip + Meta **SSH sessions** card; conflict rule #7; track `ssh-session-track.sh` in git.
7. **Deploy rule:** dashboard UI lands via **commit → linuxbox/main → bundle** (or `--dashboard` after commit). Never claim UI live from uncommitted SCP alone (minute apply resets tracked files).

## Shipped markers

| Piece | Marker / path |
|-------|----------------|
| Meta panel | `lane-sync-panel` in `linuxbox-status/index.html` |
| API | `/api/agent` → `lane_sync` |
| dash_build pair | `db_20260810-hub-c-ssh-chips-r1` |
| Skill | `.cursor/skills/lane-sync` |
| Inject compact | `agents/META_LANE_SYNC.md` |
| Backlog | Hub-a–d + Meta-lane-sync + Meta-skill **[x]** |

## Still open (not invent — ask GM)

- **Smoke** backlog item (Playwright after dashboard edits).
- **Stale multitask locks** on potato (`hub-si-dash-smoke`, `hub-si-intel-feeds` from older Cursor twins) — clear vs leave.
- SSH `active_count` may read 0 when sessions are Tailscale/LAN outside what `ssh-session-track` sees — expected until track coverage expands.
