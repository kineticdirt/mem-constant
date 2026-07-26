# Prompt — pack `system_dynamics` (pressures · clocks · off-screen)

Paste **after** `00-SETUP.md`. Attach sources about TTRPG clocks/fronts, attrition, faction ticks — not magic systems.

---

Using only this notebook's sources and the injection-pack JSON contract, produce a pack for:

**`pack_id`: `system_dynamics`**

## Goals

1. The world runs off-screen: threats, factions, resources, weather advance between beats.
2. Standing pressures (hunger, fuel, noise, infection, heat, reputation) **tick** when fiction implies; record the move.
3. Consequences compound across scene changes — no soft resets.
4. Cause before effect; no unexplained state jumps.
5. Escalation is earned; quiet can stay quiet; loud draws lasting attention.

## Engine mapping (use these names in rules)

- Prefer recording pressure moves as notes on relevant `places` / `people` / `kind:"event"` objects, or in WORLD_DELTA person/place `notes` fields — do **not** invent a parallel global JSON schema unless sources demand one field name, then put it under `world_delta_contract.extensions` and mark it optional.
- Keep rules scenario-agnostic (no zombie-only language unless a source is infection-specific; if so, put setting-specific lines under a separate key `scenario_notes_template` the human can paste into `injection_pack_notes`).

## Current baseline

```
- World runs off-screen; show it when the scene rejoins.
- Pressures tick; record moves.
- Consequences compound across scene changes.
- Cause before effect.
- Escalation earned.
```

## Deliver

JSON per contract. Keywords for time-skip / travel / resource / noise / faction language. Prefer `mode: "diff"`.
