# Prompt — pack `kit_gear`

Paste after `00-SETUP.md` (+ optional `00b-FAILURE-MODES.md`). Sources: garments, wear positions, armor, weapon carry — not plot.

---

Produce JSON for **`pack_id`: `kit_gear`** (full or `mode: "diff"`).

## Failures this pack must counter

1. **Recall** — forgetting what someone is wearing / carrying after they changed
2. **Accuracy** — wrong holder, wrong wear_slot, weapon “in hand” when it’s in the trunk
3. **Vague generation** — “casual clothes”, “armor”, “a gun” with no cut/fabric/state
4. **Silent change** — narrating a dress/equip/loot beat without WORLD_DELTA rows

## Required behaviors in `lines`

- Kit updates **the same turn** it changes: `current_outfit`, `inventory`, worn `new_objects` (`holder` + `wear_slot`)
- Specificity: cut / fabric / fit; shorts ≠ jeans
- Worn vs held vs stowed (hand / holster / sling / bag / trunk)
- Weapons & armor carry **state** (loaded/empty, condition, where)
- `inventory` is the **full** carried list (merge unions; omit = not carried)

## Baseline (diff against if mostly right)

```
- Track kit the turn it changes → current_outfit / inventory / worn objects same turn.
- Cut, fabric, fit — never "casual clothes". Shorts ≠ jeans.
- Worn: holder + wear_slot. Held-not-worn: holder only. Stowed: location, not holder-in-hand.
- Weapons/armor: state + where. Damage recorded.
- inventory = full list including prior rows; remove dropped/consumed.
```

## Deliver

`failure_modes_addressed`, `match_keywords` (25–60; clothing/equip/loot — not pure emotion talk), `lines` ≤8, `world_delta_contract`, `anti_patterns`, one `example_delta_snippet`, stay under ~1800 chars.
