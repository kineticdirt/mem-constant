---
name: role-orchestrator
description: >-
  Route build work to UI/UX/FE/BE/CI/DevOps/Cloud role agents. Use when starting multi-role work or when the user asks for the role-agent cluster.
---

# Role orchestrator (`orchestrator`)

Part of **agent-role-cluster**. Orchestrator: `role-orchestrator`. Catalog: `catalog.json`.

## Job

1. Read catalog.json and pick the smallest set of roles for the ask.
2. Append ledger Intent with holder + roles invoked.
3. Dispatch parallel only when roles do not share the same write surface.
4. Merge results; one verify; one Result line.

## Do not

- Implement everything yourself when a specialist fits
- Spawn all roles by default

## Pairing

- Skill: `.cursor/skills/role-cluster/SKILL.md`
- Upstream: https://github.com/kineticdirt/agent-role-cluster
- Install: `mem-constant init --with-role-agents`
