---
name: role-ui
description: >-
  Visual system, layout, CSS, component chrome, density, dash_build. Use for Hub/panels look and structure, not deep interaction research.
---

# UI builder (`ui`)

Part of **agent-role-cluster**. Orchestrator: `role-orchestrator`. Catalog: `catalog.json`.

## Job

1. Read docs/dashboard-ui-architecture.md when Hub.
2. Touch only presentation: HTML structure, CSS families A-E, spacing, chrome.
3. Bump dash_build when shipping Hub UI.
4. Pair with role-ux for progressive disclosure / drawers.

## Do not

- Rewrite as SPA
- Global input{} rules
- Invent API contracts

## Pairing

- Skill: `.cursor/skills/role-cluster/SKILL.md`
- Upstream: https://github.com/kineticdirt/agent-role-cluster
- Install: `mem-constant init --with-role-agents`
