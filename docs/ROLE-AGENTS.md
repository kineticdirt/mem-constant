# Role agents (`--with-role-agents`)

Programmatic **specialist Cursor subagents** (UI, UX, Frontend, Backend, CI/CD,
DevOps, Cloud, Orchestrator) with a machine-readable catalog.

## Upstream SoT

GitHub: **[kineticdirt/agent-role-cluster](https://github.com/kineticdirt/agent-role-cluster)**

mem-constant **bundles** a snapshot under `src/mem_constant/templates/role-agents/`
and prefers a **git clone** of that repo when reachable.

## Install

```bash
mem-constant init --with-role-agents --yes
# force a specific remote:
mem-constant init --with-role-agents --role-agents-repo git@github.com:kineticdirt/agent-role-cluster.git --yes
```

### What lands in the project

| Path | Role |
|------|------|
| `.cursor/agents/roles/role-*.md` | Callable Cursor agents |
| `.cursor/skills/role-cluster/` | Dispatch skill |
| `.mem-constant/role-agents/catalog.json` | Machine index + `dispatch_hints` |

## Dispatch

1. Read `.mem-constant/role-agents/catalog.json`.
2. Match the ask to a role `id` or a `dispatch_hints` key (e.g. `hub_clickthrough`).
3. Invoke the matching `role-*` agent (Task tool / Cursor custom agents).
4. Orchestrator (`role-orchestrator`) merges; one verify per domain.

## Regenerate bundled templates

From agent-dump (dogfood tree):

```bash
python scripts/pc/gen-role-agent-cluster.py
```

Keeps `../agent-role-cluster` and `src/mem_constant/templates/role-agents` in sync.

## Related (Hub-only, agent-dump)

Not part of this package — live in Linuxbox/agent-dump:

- `.cursor/skills/hub-ui-depth`
- `.cursor/skills/hub-drawer-sheet`
- `.cursor/agents/hub-dashboard-builder.md`
