# Prompt — pack `world_storage` (objects · places · facts)

Paste **after** `00-SETUP.md`. Attach sources about inventories, place hierarchies, and object permanence — not combat systems.

---

Using only this notebook's sources and the injection-pack JSON contract, produce a pack for:

**`pack_id`: `world_storage`**

## Goals

1. Anything that must survive the next beat is written into `WORLD_DELTA`, not only prose.
2. Stable ids: lowercase `snake_case` from the thing (`black_leather_jacket`), never `object_1`. Reuse existing ids.
3. Every object has `location` (place id) **or** `holder` (person id); worn objects also have `wear_slot`.
4. Places nest via `parent` (fitting room ⊂ store ⊂ strip mall). Subdivide large spaces.
5. Established facts (jammed door, broken window, learned name) live on the row, not only in the paragraph.
6. Quantity and condition are mutable state — update when they change.

## Current baseline

```
- Persist past this beat → WORLD_DELTA. Described-but-not-listed objects do not exist next turn.
- Stable snake_case ids; reuse; never object_1.
- Objects: name + location|holder (+ wear_slot if worn).
- Places: name + parent when nested; subdivide large spaces.
- Facts on the relevant row.
- Quantity/condition are state; do not restate stale values.
```

## Deliver

JSON per contract. `match_keywords` should catch take/drop/stash/enter/exit/room/container language and avoid firing on pure emotional dialogue.

Include `world_delta_contract` with `place_fields` (`name`, `parent`, `notes`) and `object_fields`.

Prefer `mode: "diff"` when baseline holds.
