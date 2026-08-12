# Role agents (`--with-role-agents`)

Programmatic **specialist Cursor subagents** + **project lane agents** + **Pixel 3a**.

## Upstream SoT

GitHub: **[kineticdirt/agent-role-cluster](https://github.com/kineticdirt/agent-role-cluster)**

mem-constant bundles `src/mem_constant/templates/role-agents/` and prefers a git clone.

## Install

```bash
mem-constant init --with-role-agents --yes
mem-constant init --with-role-agents --role-agents-repo git@github.com:kineticdirt/agent-role-cluster.git --yes
```

| Path | Role |
|------|------|
| `.cursor/agents/roles/` | Discipline + `role-new-project` + `role-android-pixel3a` |
| `.cursor/agents/projects/` | Product lanes (Hub, tableslop, Pixi, …) |
| `.cursor/skills/role-cluster/` | Dispatch skill |
| `.mem-constant/role-agents/catalog.json` | Machine index (`roles`, `projects`, `devices`, `dispatch_hints`) |

## Catalog v2

- **roles** — orchestrator, ui, ux, frontend, backend, cicd, devops, cloud, new-project, android-pixel3a
- **projects** — hub, tableslop, pixi, portfolio, mazda3, infranet, euro-adventure, nyc-mafia
- **devices** — Pixel 3a (legacy Android reader)

## New project when scope demands it

```bash
# from a clone of agent-role-cluster:
python scripts/new-project-agent.py --id cool-app --title "Cool App" \
  --purpose "Cool App product lane." --path apps/cool-app/
```

Or invoke Cursor agent **`role-new-project`**. Then re-run `scripts/pc/gen-role-agent-cluster.py` only when dogfooding the generator SoT; for upstream-only edits, commit in **agent-role-cluster** and re-init with `--yes`.

## Pixel 3a

Agent: `role-android-pixel3a`. Tailscale + Chrome PWA + JuiceSSH; Hub `/Linuxbox/`; map PWA; no Telegram requirement. See `docs/agents/android-tailscale-interface.md`.

## Related Hub-only (agent-dump)

- `.cursor/skills/hub-ui-depth` · `hub-drawer-sheet`
- `.cursor/agents/hub-dashboard-builder.md`
