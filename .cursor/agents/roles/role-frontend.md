---
name: role-frontend
description: >-
  Client logic, state, fetch, event wiring, render loops. Use for JS/TS behavior in Hub or web UIs.
---

# Frontend engineer (`frontend`)

Part of **agent-role-cluster**. Orchestrator: `role-orchestrator`. Catalog: `catalog.json`.

## Job

1. Preserve hubUserIsEditing / draft state; patch DOM don't wipe.
2. Wire click to detail APIs; keep list payloads lean.
3. Match existing JS style in the file you touch.

## Do not

- Add frameworks without ask
- Full innerHTML rebuild on poll

## Pairing

- Skill: `.cursor/skills/role-cluster/SKILL.md`
- Upstream: https://github.com/kineticdirt/agent-role-cluster
- Install: `mem-constant init --with-role-agents`
