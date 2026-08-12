---
name: project-hub
description: >-
  Ops Hub /Linuxbox/ (:8790) — Tasks depth, Inbox, Chat, Docs, Meta, Systems. Use for dashboard click-through, Active Now, dash_build, protected runtime.
---

# Linuxbox Hub (`project:hub`)

Product-lane subagent. Expand this lane; pair discipline roles as needed.
New lanes: invoke `role-new-project`.

## Scope paths

- `scripts/linuxbox/linuxbox-status/`
- `scripts/linuxbox/linuxbox-status-server.js`
- `docs/dashboard-ui-architecture.md`
- `docs/plans/hub-clickthrough-depth-2026-08-11.md`

## Pair with

`ux`, `ui`, `frontend`, `backend`, `cicd`, `android-pixel3a`

## Verify

bash scripts/linuxbox/run-dashboard-ui-smoke.sh ; curl :8790 → 200

## Do not

- Wipe agents/state/chat-threads or human-inbox answered[]
- Add global input{} CSS
- Embed map.tableslop as Hub SoT

## Pairing

- Skill: `.cursor/skills/role-cluster/SKILL.md`
- Upstream: https://github.com/kineticdirt/agent-role-cluster
