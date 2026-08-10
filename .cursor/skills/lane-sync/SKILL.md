---
name: lane-sync
description: >-
  Linuxbox lane coordination + Meta design philosophy. Use when implementing
  hub/ops/dashboard work, parallel Hermes∥Cursor ticks, shared-state edits
  (registry, inbox, regions-ui, chat-threads), or when the user mentions Meta,
  lane sync, systems design, observability, papercuts, or multitask locks.
  Improves output by forcing conflict-aware, siloed changes.
---

# Lane sync (Meta philosophy → skills)

**Not a dead Hub stub.** Philosophy and systems design live here so agents **apply** them while implementing. Hub **Meta** shows live sync state; Hub **System → Observability** shows papercuts / meta-harness / backlog.

## Design philosophy (apply every implement tick)

1. Prefer **clear silos** over Tasks soup — System sees everything; product lanes own their surfaces.
2. **Correctness over thrash** — one verify per change; never trade evidence for speed.
3. **Lane sync before write** — think · sync · Cursor Auto · pods share the box; do not step on shared SoT.
4. Observability hooks (papercuts, meta-harness, smoke, update gate) **serve process improvement** — log friction, score ticks, close backlog items with proof.
5. Reuse first: `agents/SYSTEMS_DESIGN_BOARD.md` · multitask lock · protected-runtime-paths · borders guard.

## When to read this skill

- Editing Hub Meta / System Observability / dashboard lane chips
- Any write to `characters-registry.json`, `regions-ui.json`, inbox, chat-threads
- Starting parallel Cursor + Hermes work on the same files
- Closing or triage of papercuts / meta-harness fails / dashboard backlog

## Before you touch shared state

1. Append `[PC]`/`[LINUX]` Intent + holder to `AI_GROUPCHAT.md`.
2. Acquire disk lock when the path requires it (`scripts/linuxbox/multitask-lock.sh`).
3. Read potato ∪ PC copies; merge by id; respect `version` / `base_version`.
4. Skip what conflict rules forbid (see Meta panel / `agents/META_LANE_SYNC.md`).

## Observability triad (same purpose — System panel)

| Surface | Role | Action |
|---------|------|--------|
| **Papercuts** | Friction log (`pc-*`) | Append on recur; fix open ones when safe |
| **Meta-Harness** | Per-pod score / intent | After lane work, leave a scored run when wired |
| **Backlog** | Dashboard self-improve queue | One `[ ]` item → implement → verify → Done |

Do **not** re-ask answered inbox seeds. Do **not** wipe runtime state on deploy.

## Compact SoT (inject / subagent)

- Philosophy + conflict rules (capped): `agents/META_LANE_SYNC.md`
- Product catalog: `agents/SYSTEMS_DESIGN_BOARD.md`
- Continuous lanes: `docs/agents/continuous-lanes.md`
- Papercuts usage: `docs/agents/papercuts.md`
- Cursor agent: `.cursor/agents/lane-sync.md`

## Output bar

When this skill applies, your Result line should name: **holder**, **what shared resource** (if any), **verify** (curl / smoke / lock release), and whether a **papercut** or backlog checkbox moved.
