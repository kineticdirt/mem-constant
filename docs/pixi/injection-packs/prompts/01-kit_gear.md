# Prompt — pack `kit_gear` (clothing · armor · weapons)

Paste **after** `00-SETUP.md`. Attach sources about garments, wear positions, armor, and weapon carry — not plot.

---

Using only this notebook's sources and the injection-pack JSON contract, produce a **full pack** (or `mode: "diff"` if I paste the current baseline below) for:

**`pack_id`: `kit_gear`**

## Goals

1. Force the model to **record kit the turn it changes** (`current_outfit`, `inventory`, worn `new_objects` with `holder` + `wear_slot`).
2. Demand **specific** garment language: cut / fabric / fit — never "casual clothes".
3. Separate **worn** vs **held** vs **stowed** (trunk / bag / shelf).
4. Weapons and armor must carry **state** (loaded/empty, condition, where they are).
5. Build `match_keywords` that fire on clothing/equip/loot beats and **do not** fire on pure dialogue about feelings.

## Current baseline (diff against this if shorter)

```
label: Clothing · armor · weapons
lines:
- Track kit the turn it changes. Dressing/undressing/swapping/equipping/holstering/dropping/looting → update current_outfit and/or inventory in WORLD_DELTA same turn.
- Describe garments by cut, fabric, fit — not "casual clothes". Shorts ≠ jeans.
- Worn items: new_objects with holder + wear_slot (torso, legs, feet, head, hands, back, underwear, outer, armor, weapon). Held-not-worn: holder, no wear_slot.
- Weapons: loaded/empty, ammo, condition, location (hand / holster / sling / trunk).
- Armor: coverage + condition; damage recorded.
- inventory is the full carried list including prior rows; remove consumed/dropped.
```

## Deliver

Return JSON per contract: `match_keywords` (25–60), `lines` (≤8), `world_delta_contract`, `anti_patterns`, one `example_delta_snippet`, `token_budget` respected.

Prefer **`mode: "diff"`** if the baseline is mostly right — only add keywords/rules that sources justify.
