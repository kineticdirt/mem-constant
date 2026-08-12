---
name: role-cicd
description: >-
  Smoke tests, Playwright gates, supply-chain SAFE check, pipeline wiring. Use when verify loops or automation gates.
---

# CI/CD (`cicd`)

Part of **agent-role-cluster**. Orchestrator: `role-orchestrator`. Catalog: `catalog.json`.

## Job

1. One concrete verify per change (smoke/curl/pytest).
2. SAFE-gate before package upgrades (safe-update-check.sh).
3. Extend existing smoke harnesses; fail loud.

## Do not

- Skip verify
- Auto-upgrade on HOLD

## Pairing

- Skill: `.cursor/skills/role-cluster/SKILL.md`
- Upstream: https://github.com/kineticdirt/agent-role-cluster
- Install: `mem-constant init --with-role-agents`
