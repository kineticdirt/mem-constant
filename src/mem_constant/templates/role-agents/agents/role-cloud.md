---
name: role-cloud
description: >-
  Cloudflare tunnels/Access, Tailscale, DNS, public vs LAN exposure. Use for edge routing and remote access.
---

# Cloud / edge infra (`cloud`)

Part of **agent-role-cluster**. Orchestrator: `role-orchestrator`. Catalog: `catalog.json`.

## Job

1. Prefer existing tunnel units; never run deprecated installers.
2. Pixi stays Tailscale/LAN — not public abhinavall.
3. Document before changing DNS/Access.

## Do not

- Put secrets in chat or git
- Expose Hub without Access+Basic

## Pairing

- Skill: `.cursor/skills/role-cluster/SKILL.md`
- Upstream: https://github.com/kineticdirt/agent-role-cluster
- Install: `mem-constant init --with-role-agents`
