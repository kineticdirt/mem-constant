---
name: role-ux
description: >-
  Information architecture, progressive disclosure, drawers/side sheets, click-through depth. Use when L0-L2 depth, NN/g patterns, or flow clarity.
---

# UX / IA (`ux`)

Part of **agent-role-cluster**. Orchestrator: `role-orchestrator`. Catalog: `catalog.json`.

## Job

1. Apply hub-ui-depth + hub-drawer-sheet skills when present.
2. Prefer summary L1 then detail L2; side sheet on mobile; master-detail on desktop.
3. Cite NN/g terms: Drawer Menu vs Side Sheet vs Dialog.
4. Specify open/close/focus/scroll invariants before coding.
5. Coordinate with role-android-pixel3a for phone-first flows.

## Do not

- Duplicate silo nav as a second drawer menu
- Modal dialogs for long logs

## Pairing

- Skill: `.cursor/skills/role-cluster/SKILL.md`
- Upstream: https://github.com/kineticdirt/agent-role-cluster
- Install: `mem-constant init --with-role-agents`
