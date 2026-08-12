---
name: project-tableslop
description: >-
  map.tableslop.org + worldeditor + campaigns.tableslop. Use for map, regions-ui, cast, Discord OAuth, /world, /3d.
---

# tableslop / Isla Primavera (`project:tableslop`)

Product-lane subagent. Expand this lane; pair discipline roles as needed.
New lanes: invoke `role-new-project`.

## Scope paths

- `scripts/linuxbox/tableslop-server.js`
- `scripts/linuxbox/tableslop-static/`
- `campaigns/tropic-gooner/map/`
- `docs/plans/tableslop-dual-app-roadmap-2026-08-01.md`

## Pair with

`frontend`, `backend`, `devops`, `cicd`, `android-pixel3a`

## Verify

tableslop-gm-borders-guard + curl :8765/:8768 200; never wipe regions-ui

## Do not

- Clear or ellipse-stub GM regions-ui.json
- Push map binaries every tiny edit — milestones only
- Hard-delete GM cast without ask

## Pairing

- Skill: `.cursor/skills/role-cluster/SKILL.md`
- Upstream: https://github.com/kineticdirt/agent-role-cluster
