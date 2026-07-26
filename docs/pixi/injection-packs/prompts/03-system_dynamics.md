# Prompt — pack `system_dynamics`

Paste after Setup (+ optional failure-modes brief). Sources: clocks/fronts, attrition, faction ticks — not magic systems.

---

Produce JSON for **`pack_id`: `system_dynamics`**.

## Failures this pack must counter

1. **Soft reset** — scene change wipes hunger/noise/injury/reputation pressure
2. **Off-screen freeze** — world waits politely while the PC is elsewhere
3. **Recall of consequence** — choices from earlier beats stop mattering
4. **Unexplained jumps** — state changes with no named cause
5. **Random escalation** — chaos for spectacle instead of earned pressure

## Required behaviors in `lines`

- Off-screen forces advance; show them when the scene rejoins
- Pressures **tick** when fiction implies; **record** the move on a relevant row / event object
- Consequences compound across scene changes
- Cause before effect
- Escalation earned; quiet may stay quiet

## Engine note

Do not invent a parallel global schema. Use place/person/event notes or optional `world_delta_contract.extensions` marked optional. Setting-specific pressure names → `scenario_notes_template`.

## Baseline

```
- World runs off-screen; show it on rejoin.
- Pressures tick; record moves.
- Consequences compound.
- Cause before effect.
- Escalation earned.
```

## Deliver

`failure_modes_addressed` emphasizing soft-reset + off-screen freeze. Prefer `mode: "diff"`.
