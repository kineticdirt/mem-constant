# Hermes parallel lanes (topology) — 2026-08-01

**Holder:** `pc-shutdown-after-lanes`  
**GM clarification:** parallel throughput = **two Hermes-style agents**, different engines — not two OpenRouter Hermes think flocks, and **not** a second Discord bot gateway.

| Lane | Name | Engine | How it runs |
|------|------|--------|-------------|
| **Agent 1** | Hermes think | **OpenRouter + ZenMux** (existing free-first / **C8** paid gate) | Crontab `agent-cycle-think-1m` → `agent-cycle-think-tick.sh` (sync every minute; LLM ~8m via `THINK_INTERVAL_SEC=480`). Single flock: `/tmp/agent-cycle-think.lock`. |
| **Agent 2** | Cursor Auto | **Cursor Auto SDK** on potato (`cursor:auto`, `CURSOR_SDK_AUTO_ONLY=1`) | Crontab `agent-cycle-cursor-5m` → `agent-cycle-cursor-tick.sh` (interval gate default **15m** via `CURSOR_INTERVAL_SEC`). Picks Cursor-lane user-tasks + work packets. Flock: `/tmp/agent-cycle-cursor.lock`. Also Hub Agent-coding / SSH `cursor-agent-run.sh`. Status: `bash scripts/linuxbox/cursor-lane-status.sh`. Logs: `/mnt/archive/logs/cursor-agent/`. |

Agent 2 is a **Hermes-shaped agent loop** (pick task → work packet → verify → stop) running on the Cursor Auto engine — not a second Hermes OpenRouter profile.

### What Agent 2 is *not*

- **Not** a second Hermes chat/think profile on OpenRouter.
- **Not** a second Discord bot / second `hermes-gateway-hunter-reckoning`. Hunter Discord stays **singular**.
- **Not** a second think crontab or second `/tmp/agent-cycle-think-*.lock` product flock.

If an earlier Intent mentioned “dual Hermes think flocks” (ops flock + product flock), **reframe**: that was the wrong model. Throughput lane 2 = **Cursor Auto**. Prefer documenting this topology over burning double OR think spend.

## Discord / gateways (unchanged)

| Unit | Role |
|------|------|
| `hermes-gateway` | Ops / think Hermes (no Discord bot token claim while hunter runs) |
| `hermes-gateway-hunter-reckoning` | **Only** live Discord bot for Hunter/Tropic |

Do **not** invent a second Discord bot gateway for “Agent 2”.

## Hub Chat parallelism (related, not the Agent 1/2 pair)

Hub already runs Cursor vs Hermes chat on **separate workers** (`CHAT_QUEUE` + `CURSOR_CHAT_QUEUE`) so Agent-coding does not serialize behind Hermes chat. That is orthogonal to think crontab ∥ nohup Cursor product work. See Result `parallel-cursor-hermes` (2026-08-01).

## Tableslop handoff split (example)

| Work | Owner |
|------|--------|
| Map leftover ellipses → polygons (`TRACE-NOTES.md`) | **Agent 2** Cursor — user-task `ts-map-boundaries-leftover` |
| App A/B dashboard UX + error/test framework | **Agent 1** Hermes think — user-task `ts-dashboard-ux-test` |

Canonical handoff: `docs/plans/tableslop-potato-handoff-2026-08-01.md`.

## Invoke cheatsheet (potato)

```bash
# Agent 1 — already scheduled
crontab -l | grep agent-cycle-think

# Agent 2 — nohup batch (example)
export CURSOR_SDK_AUTO_ONLY=1
nohup bash ~/agent-dump/scripts/linuxbox/cursor-agent-run.sh "…" \
  >> /mnt/archive/logs/cursor-agent/job.log 2>&1 &
echo $!

# Status both
bash ~/agent-dump/scripts/linuxbox/cursor-lane-status.sh
```

## Twin dispatch (2026-08-09)

When Hermes think or a pod (e.g. `ponytail-cleanup`) starts an LLM item,
`scripts/linuxbox/cursor-twin-dispatch.sh` fires Agent 2 with the **same goal**
(`CURSOR_PARALLEL=1`). Not either/or — Hermes ∥ Cursor Auto.

Routing for think / Fix-this / cleanup-eligible work:

**free OpenRouter → `cursor:auto` → paid Hermes (C8 only)**

- `THINK_CURSOR_BEFORE_PAID=1` — skip paid Hermes when Cursor key present; twin gets the work.
- Idle Cursor tick fills from `PONYTAIL_CLEANUP_BOARD.md` or `SELF_IMPROVE_PROGRESS.md` when user-tasks are empty.
- Kill-switch: `CURSOR_PARALLEL=0`. Memory gate inside twin dispatch (~500 MiB avail).

## Policy pointers

- Think C8 paid: `agents/THINK_SECURITY_CHECKS.md` + `CLAUDE.md`
- Cursor Auto-only: `CURSOR_SDK_AUTO_ONLY=1` in `cursor-agent-run.sh` / env
- Twin: `scripts/linuxbox/cursor-twin-dispatch.sh`
- Sibling plan (CLI lane history): `docs/plans/hermes-cursor-agent-lane-2026-07-29.md`
- Away-from-PC Cloud Agents (future): `docs/plans/cursor-auto-away-from-pc-2026-07-29.md`
