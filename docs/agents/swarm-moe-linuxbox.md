# Swarm MoE on linuxbox (hacked mixture-of-experts)

A **file-based task queue** + **expert router** on top of existing Hermes profiles. No Kanban upgrade required (v0.14-safe).

## Architecture

```text
cursor.com/agents ──push──► GitHub Linuxbox/main
                                │
                                ▼ git-pull-and-deploy.sh (~30s)
                         ~/agent-dump
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
  agent-pod-scheduler    swarm-dispatch.sh      hermes-gateway
  (cron pods, 30s)       (queue tasks, 60s)     (Discord hunter)
         │                      │
         └──────────┬───────────┘
                    ▼
            Hermes profiles (MoE experts)
            fast | think | code | meta | hunter | spacequest | tropic
```

| Component | File | Role |
|-----------|------|------|
| Expert registry | `agents/swarm-experts.json` | expert id → profile, pool, role |
| Task queue | `agents/swarm-queue.json` | `ready` → dispatch → `done` |
| Run log | `agents/state/swarm-runs.jsonl` | append-only dispatch history |
| Dispatcher | `scripts/linuxbox/swarm-dispatch.sh` | one task per tick, flock |
| Cron pods | `agent-pod-scheduler.sh` | unchanged — schedule-based lanes |

**Concurrency:** `max_concurrent: 1` (2 GB RAM). Queue and pod scheduler both flock; avoid running both LLM calls simultaneously in practice.

## Enqueue a task (PC, cloud agent, or box)

```json
{
  "id": "task-1751688000",
  "status": "ready",
  "source": "cursor-cloud",
  "expert": "cloud",
  "goal": "Verify inbox merge shows 17 open cards on loopback :8790",
  "priority": 60,
  "created_at": "2026-07-05T05:00:00Z"
}
```

Or on linuxbox:

```bash
bash ~/agent-dump/scripts/linuxbox/swarm-dispatch.sh \
  --enqueue "Swarm smoke: reply IDLE only" --source smoke --expert fast
```

## Routing

If `expert` is omitted, `source` maps via `swarm-experts.json` → `routing.by_source`:

| source | expert |
|--------|--------|
| `cursor-cloud` | `cloud` (meta profile) |
| `smoke` | `fast` |
| `code` | `coder` |
| `campaign-hunter` | `hunter` |

## Install on linuxbox

```bash
bash ~/agent-dump/scripts/linuxbox/install-swarm-dispatch-timer.sh
```

## Test

```bash
# Dry-run routing
bash ~/agent-dump/scripts/linuxbox/swarm-dispatch.sh --enqueue "IDLE smoke test" --source smoke --expert fast
bash ~/agent-dump/scripts/linuxbox/swarm-dispatch.sh --dry-run

# Real dispatch (uses Qwen free on fast)
bash ~/agent-dump/scripts/linuxbox/swarm-dispatch.sh --once
tail -1 ~/agent-dump/agents/state/swarm-runs.jsonl
```

## Cloud agent handoff template

```text
Repo: github.com/kineticdirt/Linuxbox branch main.
When done: commit+push. Add a ready task to agents/swarm-queue.json:
  source=cursor-cloud, expert=cloud, goal=<one verifiable step on linuxbox>.
Do not SSH to potato. Box pulls and swarm-dispatch runs within ~60s.
```

## Related

- `docs/repo-split-linuxbox-memconstant.md` — Linuxbox vs mem-constant
- `docs/agents/hermes-swarm-keys-investigation.md` — upstream Kanban path (future)
- `agents/agent-pods.manifest.json` — budget pools (RP vs ops vs free)
