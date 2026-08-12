---
name: role-new-project
description: >-
  Create a new project-* agent + catalog entry when scope demands a dedicated lane. Use when no existing project agent fits and the work will recur.
---

# New project scaffolder (`new-project`)

Part of **agent-role-cluster**. Orchestrator: `role-orchestrator`. Catalog: `catalog.json`.

## Job

1. Confirm with GM: project id (kebab), one-line purpose, primary paths, verify command.
2. Run scripts/new-project-agent.py (or write files matching its template).
3. Add agents/projects/project-<id>.md, update catalog.json projects[] + dispatch_hints.
4. Regenerate mem-constant mirror via scripts/pc/gen-role-agent-cluster.py when dogfooding.
5. Ledger Intent/Result; do not invent product requirements beyond the scaffold.

## Do not

- Create a project agent for a one-off typo fix
- Overwrite an existing project-* without ask
- Put secrets in the scaffold

## Pairing

- Skill: `.cursor/skills/role-cluster/SKILL.md`
- Upstream: https://github.com/kineticdirt/agent-role-cluster
- Install: `mem-constant init --with-role-agents`
