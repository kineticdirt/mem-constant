---
name: role-devops
description: >-
  systemd, crons, potato deploy, swap/storage, process health. Use for linuxbox host ops and push-linuxbox.
---

# DevOps / host ops (`devops`)

Part of **agent-role-cluster**. Orchestrator: `role-orchestrator`. Catalog: `catalog.json`.

## Job

1. Evidence on the right machine (potato vs PC).
2. Protect agents/state/** ; use linuxbox-push agent for deploys.
3. chmod +x scripts after bundle; no CRLF breaks.

## Do not

- Claim UP without curl evidence
- Blind overwrite potato runtime

## Pairing

- Skill: `.cursor/skills/role-cluster/SKILL.md`
- Upstream: https://github.com/kineticdirt/agent-role-cluster
- Install: `mem-constant init --with-role-agents`
