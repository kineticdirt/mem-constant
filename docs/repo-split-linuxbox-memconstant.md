# Repo split: Linuxbox (homelab) vs mem-constant (memory tool)

**You were right to question mem-constant as the homelab sync hub.** They are separate products.

| Repo | Purpose | Branch | Consumers |
|------|---------|--------|-----------|
| **[kineticdirt/Linuxbox](https://github.com/kineticdirt/Linuxbox)** | Always-on homelab: Hermes pods, swarm MoE, dashboard, campaigns, `agents/` | **`main`** | linuxbox `~/agent-dump`, cursor.com/agents, PC/laptop |
| **[kineticdirt/mem-constant](https://github.com/kineticdirt/mem-constant)** | Published **context memory tool** for AI (PyPI) | **`release/v*`** versioned branches; package tags | `pip install mem-constant`, downstream users |

## Rules

1. **Never** store personal homelab state (campaigns, inbox, infra topology) on mem-constant release branches.
2. **linuxbox** `git pull` tracks **`Linuxbox` `main`** — not mem-constant `master`.
3. mem-constant version bumps live on `release/v0.4.x` (or similar) and merge to package publish flow only.
4. PC SCP (`push-linuxbox.sh`) remains valid for gitignored binaries and urgent deploys.

## PC workflows

| Goal | Command |
|------|---------|
| Publish homelab to GitHub | `bash scripts/pc/publish-linuxbox-repo.sh` |
| Deploy to potato (SCP) | `bash scripts/pc/push-linuxbox.sh --finished` |
| Repoint box git remote | `bash scripts/linuxbox/repoint-agent-dump-remote.sh` (on box) |

## cursor.com/agents

Point cloud agents at **`github.com/kineticdirt/Linuxbox`** branch **`main`**.  
On task complete: commit → push → append a swarm queue task in `agents/swarm-queue.json` if you want the box to execute via MoE.

## Migration note (2026-07-05)

Historically homelab and mem-constant were commingled in one working tree with origin `mem-constant`. Linuxbox repo was empty; bootstrap had pointed at stale mem-constant `master`. This split corrects that.
