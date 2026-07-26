# Prompt — ALL packs: failure-mode brief (optional shared context)

Paste into each notebook **after Setup**, before the pack-specific prompt, if you want the same failure framing everywhere.

---

## Model failure modes this project cares about

| Failure | Symptom in RP | Pack that should fix it |
|---------|---------------|-------------------------|
| Kit amnesia | Outfit/inventory wrong or empty after a change beat | `kit_gear` |
| Vague generation | "casual clothes", "a gun", no cut/fabric/state | `kit_gear` |
| Object evanescence | Described prop never enters `new_objects` | `world_storage` |
| Spatial mush | Store/apartment/fitting-room collapsed into one place | `world_storage` |
| Soft reset | Pressures/clocks ignore earlier noise, injury, promises | `system_dynamics` |
| Off-screen freeze | World waits while PC is elsewhere | `system_dynamics` |
| Rule upgrade | Magic/infection/tech quietly gets stronger | `mechanics` |
| Omniscient NPCs | Non-present cast know things they shouldn't | `mechanics` (+ knowledge bounds elsewhere) |
| Interview mode | NPC answers player choice with another question | (decision_commit layer — not a pack; ignore here) |

When writing `lines` and `match_keywords`, prefer rules that **force state writes** and **forbid the failure**, not tips for prettier prose.
