---
name: role-cluster
description: >-
  Programmatic role-agent cluster (UI, UX, Frontend, Backend, CI/CD, DevOps,
  Cloud, Orchestrator). Use when dispatching specialist Cursor agents for
  build/infra work, or when mem-constant --with-role-agents is installed.
---

# Role-agent cluster

## Purpose

Callable **specialist subagents** with a machine-readable `catalog.json` so
orchestrators (and humans) can spawn the right role without a monolith prompt.

## Install

```bash
mem-constant init --with-role-agents
# optional refresh from GitHub:
mem-constant init --with-role-agents --role-agents-repo https://github.com/kineticdirt/agent-role-cluster.git --yes
```

Lands under:

- `.cursor/agents/roles/*.md`
- `.cursor/skills/role-cluster/`
- `.mem-constant/role-agents/catalog.json` (pointer copy)

## Dispatch

1. Read `.mem-constant/role-agents/catalog.json` (or package catalog).
2. Match ask → `dispatch_hints` or role `when` text.
3. Invoke Cursor Task / agent with the matching `role-*` file.
4. One verify per role's domain; orchestrator merges.

## Hub depth example

Click-through Tasks L2 → roles **ux** (sheet/IA) + **ui** (chrome) + **frontend** (wire) + **backend** (detail API) + **cicd** (smoke).

## Related Hub skills (agent-dump)

- `hub-ui-depth` · `hub-drawer-sheet` · `hub-dashboard-builder`
