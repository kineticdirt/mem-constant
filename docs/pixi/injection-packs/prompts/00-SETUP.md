# Paste this FIRST (once per notebook)

You are designing a **compact injection pack** for Pixi, a text roleplay engine.

## Why these packs exist

Language models are reliably bad at:

1. **Recall** — forgetting outfits, inventory, place layout, prior consequences within a few turns
2. **Accuracy** — inventing wrong fabric/weapon state, swapping who holds what, soft-resetting clocks
3. **Spatial visualization** — treating a building as one vague room; losing nested places and where objects sit
4. **Consistent generation** — restating stale kit; upgrading powers; describing changes without updating state
5. **Decision commitment** — asking the player clarifying questions instead of deciding

Your pack must **compensate for those failures**, not write literary advice.

## Product facts (do not invent alternatives)

- Persistence = JSON footer `WORLD_DELTA` → `observed_world` (`people`, `objects`, `places`)
- Packs are short system blocks: **≤8 bullets / ~1800 characters**, max **2 packs** fire per turn
- No live campaign character names as examples — use `npc:example`, `place:store`, `obj:jacket`
- Ground only in attached sources + this contract; if sources conflict, prefer the stricter rule

## Response format

1. One fenced `json` block matching the contract (full or `mode: "diff"`)
2. Include a `failure_modes_addressed` array listing which weaknesses the pack targets
3. After JSON: ≤8 lines human rationale — not ingested

If you cannot produce valid JSON, reply `BLOCKED:` and say what source is missing.
