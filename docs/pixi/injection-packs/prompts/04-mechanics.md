# Prompt — pack `mechanics` (science · magic · infection · tech)

Paste **after** `00-SETUP.md`. Attach **one coherent system** of sources (e.g. infection-only, or hard-magic-only). Do not mix contradicting cosmologies in the same notebook.

---

Using only this notebook's sources and the injection-pack JSON contract, produce a pack for:

**`pack_id`: `mechanics`**

## Goals

1. The setting's system has **rules that hold across beats** — consistency over spectacle.
2. Every effect has **cost, limit, and visible tell**.
3. Established mechanics are canon; do not quietly upgrade them.
4. Epistemic fog: characters only know what they have observed.
5. Mechanical state changes land in WORLD_DELTA (charges burned, infection contracted, circuit fried).
6. Failure is legitimate.

## Split the output

- `lines` = **generic** mechanics discipline (works for any system).
- `scenario_notes_template` = **setting-specific** bullets grounded in THIS notebook's sources (infection stages, magic costs, etc.). Humans paste that into `session.rpg.injection_pack_notes.mechanics`.

## Current baseline (generic only)

```
- Systems have rules that hold across beats.
- Cost, limit, visible tell; no free power.
- Established mechanics are canon; limits push back.
- Unknowns stay unknown unless earned in-fiction.
- Record mechanical state in WORLD_DELTA.
- Failure is legitimate.
```

## Deliver

JSON per contract + `scenario_notes_template` (≤6 bullets). Prefer `mode: "diff"` for generic `lines`.
