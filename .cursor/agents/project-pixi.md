---
name: project-pixi
description: >-
  Pixi RP continuity engine (:8767 linuxbox-pixi-rp). Use for Send pipeline, WORLD_DELTA, sheets, hygiene, OpenRouter-only.
---

# Pixi RP (`project:pixi`)

Product-lane subagent. Expand this lane; pair discipline roles as needed.
New lanes: invoke `role-new-project`.

## Scope paths

- `docs/pixi/`
- `~/pixi-rp/ObsidianWriterStack (potato)`
- `scripts/pc/deploy-pixi-linuxbox.sh`

## Pair with

`backend`, `frontend`, `ux`, `devops`, `android-pixel3a`

## Verify

curl Tailscale/LAN :8767 200; no public CF route

## Do not

- Share Hermes OpenRouter key with Pixi env
- Load GGUF on potato
- Force Laguna over explicit model pick

## Pairing

- Skill: `.cursor/skills/role-cluster/SKILL.md`
- Upstream: https://github.com/kineticdirt/agent-role-cluster
