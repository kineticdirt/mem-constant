---
name: role-orchestrator
description: >-
  Route build work to discipline roles, project agents, or android. Use when starting multi-role work or when the user asks for the role-agent cluster.
---

# Role orchestrator (`orchestrator`)

Part of **agent-role-cluster**. Orchestrator: `role-orchestrator`. Catalog: `catalog.json`.

## Job

1. Read catalog.json (roles + projects + devices) and pick the smallest set.
2. If the ask is a known product lane, prefer project-* over generic FE/BE.
3. If scope is a new product with no project agent, invoke role-new-project first.
4. Append ledger Intent with holder + roles/projects invoked.
5. Dispatch parallel only when write surfaces do not collide.
6. Merge results; one verify; one Result line.

## Do not

- Implement everything yourself when a specialist fits
- Spawn all roles by default
- Invent a second SoT beside the project's docs/ledger

## Pairing

- Skill: `.cursor/skills/role-cluster/SKILL.md`
- Upstream: https://github.com/kineticdirt/agent-role-cluster
- Install: `mem-constant init --with-role-agents`
