# Prompt — pack `world_storage`

Paste after Setup (+ optional failure-modes brief). Sources: inventories, place hierarchies, object permanence — not combat.

---

Produce JSON for **`pack_id`: `world_storage`**.

## Failures this pack must counter

1. **Recall** — props/places vanish because they only existed in prose
2. **Spatial visualization** — multi-room areas flattened; lost nesting (room ⊂ building ⊂ area)
3. **Accuracy** — objects with neither `location` nor `holder`; unstable ids (`object_1`); duplicate ids for the same thing
4. **Stale fact** — jammed door / broken window / quantity restated wrong next turn

## Required behaviors in `lines`

- Persist past this beat → WORLD_DELTA or it does not exist next turn
- Stable `snake_case` ids from the thing; reuse; never `object_1`
- Objects: `name` + (`location` XOR `holder`) + `wear_slot` if worn
- Places: `name` + `parent` when nested; **subdivide** large spaces
- Facts live on the row; quantity/condition are mutable state

## Baseline

```
- Described-but-not-listed objects do not exist next turn.
- Stable snake_case ids; reuse.
- Objects need location or holder (+ wear_slot if worn).
- Places nest via parent; subdivide large spaces.
- Facts/quantity/condition on the row — no stale restates.
```

## Deliver

`failure_modes_addressed` must include spatial visualization + recall. Keywords for take/drop/stash/enter/room/container — not pure emotion. Prefer `mode: "diff"` if baseline holds.
