---
name: role-cluster
description: >-
  Programmatic role-agent cluster (UI, UX, Frontend, Backend, CI/CD, DevOps,
  Cloud, Orchestrator, Android Pixel 3a) plus project-* lane agents and
  role-new-project scaffolder. Use when dispatching specialist Cursor agents.
---

# Role-agent cluster

## Purpose

Callable **specialists** + **project lanes** with `catalog.json` so orchestrators
can spawn the right agent without a monolith prompt.

## Install

```bash
mem-constant init --with-role-agents --yes
mem-constant init --with-role-agents --role-agents-repo https://github.com/kineticdirt/agent-role-cluster.git --yes
```

Lands under:

- `.cursor/agents/roles/` — discipline + android + new-project
- `.cursor/agents/projects/` — product lane agents
- `.cursor/skills/role-cluster/`
- `.mem-constant/role-agents/catalog.json`

## Dispatch

1. Read `.mem-constant/role-agents/catalog.json`.
2. Prefer `projects[]` when the ask names a product (Hub, tableslop, Pixi, …).
3. Else match discipline `roles[]` / `dispatch_hints`.
4. Pixel / phone / PWA / JuiceSSH → `android-pixel3a` (+ ux).
5. No project fits but work will recur → `role-new-project`.
6. One verify per domain; orchestrator merges.

## New project

```bash
python scripts/new-project-agent.py --id my-lane --title "My Lane" --purpose "…"
```

Or invoke the `role-new-project` agent.

## Hub depth example

`project-hub` + `ux` + `ui` + `frontend` + `backend` + `cicd` + `android-pixel3a`.
