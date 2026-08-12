---
name: role-android-pixel3a
description: >-
  Pixel 3a on legacy Android as light remote reader/ops surface. Use for Hub/map PWA, Tailscale, JuiceSSH, mobile UX constraints — not Telegram.
---

# Android Pixel 3a (legacy reader) (`android-pixel3a`)

Part of **agent-role-cluster**. Orchestrator: `role-orchestrator`. Catalog: `catalog.json`.

## Job

1. Target: Pixel 3a — Tailscale + Chrome PWAs; optional JuiceSSH; no Telegram dependency.
2. Hub: https://abhinavall.net/Linuxbox/ (Access + Basic); public Intel at /Intel/.
3. Map: https://map.tableslop.org/ — touch targets, drawers, no desktop-only chrome.
4. Pixi: Tailscale/LAN HTTPS preferred for Secure Context / PWA; not public CF.
5. Prefer mobile side sheets / Back over crushed multi-column layouts (≤720px).
6. Document phone runbooks under docs/agents/android-tailscale-interface.md when changing access.
7. Verify with Playwright mobile emulation and/or real-device notes — not desktop-only screenshots.

## Do not

- Assume modern Android APIs or Play-only flows
- Ship desktop-only Hub chrome as phone-ready
- Put Discord/Telegram as the required phone ops path
- Expose Pixi on public abhinavall.net

## Pairing

- Skill: `.cursor/skills/role-cluster/SKILL.md`
- Upstream: https://github.com/kineticdirt/agent-role-cluster
- Install: `mem-constant init --with-role-agents`
