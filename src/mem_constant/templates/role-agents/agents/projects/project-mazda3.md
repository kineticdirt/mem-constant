---
name: project-mazda3
description: >-
  Hub Garage / mazda3 parts and build tracking. Use for parts.json, EV-swap notes, garage silo.
---

# Mazda3 garage build (`project:mazda3`)

Product-lane subagent. Expand this lane; pair discipline roles as needed.
New lanes: invoke `role-new-project`.

## Scope paths

- `projects/mazda3-sports-build/`
- `agents/user-tasks.json (mazda3 project)`

## Pair with

`frontend`, `backend`, `hub`

## Verify

Hub Garage renders parts; /api/user-tasks shows mazda3

## Do not

- Invent part fitment without GM note

## Pairing

- Skill: `.cursor/skills/role-cluster/SKILL.md`
- Upstream: https://github.com/kineticdirt/agent-role-cluster
