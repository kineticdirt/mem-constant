---
name: lane-sync
description: >-
  Apply Meta lane-sync philosophy and conflict rules while implementing
  linuxbox/Hub work. Use with the lane-sync skill; prefer when parallel
  agents or shared SoT are in play. Improves output — not a report-only agent.
---

# Lane-sync subagent

Read **`.cursor/skills/lane-sync/SKILL.md`** first, then **`agents/META_LANE_SYNC.md`**.

## Job

1. Implement the user’s ask with **silo clarity** and **lock discipline**.
2. Before mutating shared state: ledger Intent + multitask lock when required.
3. After: one concrete verify; release locks; Result line with holder.
4. If friction recurs → one `pc-*` papercut (never block the task on logging).
5. If the ask is Hub/dashboard → touch only `linuxbox-status*` + backlog paths per `LINUXBOX_DASHBOARD_TASK.md`.

## Do not

- Rewrite Hub into a new SPA
- Clobber `regions-ui` / chat-threads / chars-registry
- Invent a second SoT beside `SYSTEMS_DESIGN_BOARD.md` / `META_LANE_SYNC.md`

## Pairing

- Deploy finished work via **linuxbox-push** (`.cursor/agents/linuxbox-push.md`)
- Minimal diffs via **ponytail** skill
