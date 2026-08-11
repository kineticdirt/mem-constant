# Plan: agent-role-cluster + mem-constant --with-role-agents (2026-08-11)

**Holder:** `agent-role-cluster`  
**Status:** local SoT ready; GitHub remote pending create+push

## Why

Build work needs a **callable cluster** of specialist agents (not one mega-prompt). Hub depth (UI/UX drawers) is one consumer; CI/DevOps/cloud are siblings. Pullable GitHub SoT keeps mem-constant thin.

## Layout

| Layer | Path |
|-------|------|
| New GitHub SoT | `~/…/agent-role-cluster` → `kineticdirt/agent-role-cluster` |
| mem-constant bundle | `src/mem_constant/templates/role-agents/` |
| mem-constant runtime | `.mem-constant/role-agents/` + `.cursor/agents/roles/` |
| CLI | `mem-constant init --with-role-agents [--role-agents-repo URL]` |
| Docs | `docs/ROLE-AGENTS.md` |
| Generator | `scripts/pc/gen-role-agent-cluster.py` |

## Roles (8)

orchestrator · ui · ux · frontend · backend · cicd · devops · cloud

## Remaining

1. Create empty GitHub repo `kineticdirt/agent-role-cluster` (public MIT)
2. `git push -u origin main` from local tree
3. Re-run install to verify clone path
4. Optional: publish mem-constant minor with new flag
