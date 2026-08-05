# Ponytail cleanup lane

Recurring **ops** job: fix and refine code using the [ponytail](https://github.com/DietrichGebert/ponytail) ladder — **without deleting files**.

## Board type

**Markdown kanban** (same pattern as `LINUXBOX_DASHBOARD_BACKLOG.md`):

| Section | Meaning |
|---------|---------|
| **Backlog** | `- [ ]` cards — agent picks first each tick |
| **In progress** | WIP (one card max) |
| **Blocked** | Needs human; question goes to inbox |
| **Done** | `[x]` + date + one-line result |

**Canonical:** `agents/PONYTAIL_CLEANUP_BOARD.md` in repo.

**On the drive (USB):** when `PERSONAL` is mounted on linuxbox:

```text
/media/abhinav/PERSONAL/agent-work/agent-dump/ponytail-board.md
```

Sync after edits:

```bash
bash ~/agent-dump/scripts/linuxbox/sync-ponytail-board-to-usb.sh
```

You can edit either copy; **repo wins** for the agent (pull/scp repo → box before ticks).

## Agent wiring

| Piece | Path |
|-------|------|
| Task spec | `agents/PONYTAIL_CLEANUP_TASK.md` |
| Board | `agents/PONYTAIL_CLEANUP_BOARD.md` |
| Pod | `ponytail-cleanup` in `agents/agent-pods.manifest.json` |
| Profile | `code` (GLM-5.2, ops pool) |
| Schedule | every **15m** via `agent-pod-scheduler.timer` |
| Logs | `agents/runs/pod-ponytail-cleanup-*.log` |

Hermes **kanban** (`~/.hermes/kanban.db`) is optional after upgrade; this markdown board works on Hermes **v0.14** today.

## vs dashboard backlog

| Lane | Focus |
|------|--------|
| **Dashboard backlog** | UI/UX on `:8790` |
| **Ponytail board** | Script hygiene, py3.9 compat, DRY helpers, doc drift — **no deletions** |

## Manual run

```bash
code chat -q "Ponytail cleanup: read agents/PONYTAIL_CLEANUP_TASK.md and agents/PONYTAIL_CLEANUP_BOARD.md; complete exactly ONE Backlog card; no file deletions."
```
