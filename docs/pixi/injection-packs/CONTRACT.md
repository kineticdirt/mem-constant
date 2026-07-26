# Injection pack return contract

Gemini / NotebookLM **must** return a single fenced JSON object (no surrounding essay,
or put the essay after the JSON). Agents ingest the JSON; prose is optional rationale.

```json
{
  "pack_id": "kit_gear",
  "label": "Clothing · armor · weapons",
  "summary": "≤120 chars — one line for Studio UI",
  "version": "2026-07-25",
  "failure_modes_addressed": [
    "recall",
    "accuracy",
    "vague_generation",
    "silent_state_change"
  ],
  "sources_used": ["title or URL short labels"],
  "match_keywords": [
    "wear", "wearing", "outfit", "… lowercase tokens/phrases, 25–60 items"
  ],
  "match_notes": "When to fire this pack; when NOT to (≤2 sentences)",
  "lines": [
    "**Kit — clothing, armor, weapons.**",
    "- Rule bullet 1 (imperative, field names in backticks)",
    "- Rule bullet 2"
  ],
  "world_delta_contract": {
    "person_fields": ["current_outfit", "inventory"],
    "object_fields": ["holder", "wear_slot", "location", "name", "condition"],
    "wear_slots": ["torso", "legs", "feet", "head", "hands", "back", "underwear", "outer", "armor", "weapon"],
    "inventory_item_shape": {
      "name": "string",
      "qty": 1,
      "slot": "weapon|armor|gear|null"
    }
  },
  "anti_patterns": [
    "Vague 'casual clothes'",
    "Narrating a clothing change without WORLD_DELTA rows"
  ],
  "example_delta_snippet": {
    "new_people": [
      {
        "id": "npc:example",
        "current_outfit": "dark-wash skinny jeans, soft gray oversized sweater",
        "inventory": [{ "name": "shopping bag", "qty": 1, "slot": "gear" }]
      }
    ],
    "new_objects": [
      {
        "id": "obj:gray_sweater",
        "name": "soft gray oversized sweater",
        "holder": "npc:example",
        "wear_slot": "outer"
      }
    ]
  },
  "token_budget": {
    "max_lines": 8,
    "max_chars_total": 1800
  }
}
```

## Hard constraints (tell the model these)

1. `pack_id` ∈ `kit_gear` | `world_storage` | `system_dynamics` | `mechanics`
2. `lines` length ≤ 8; total joined length ≤ ~1800 characters
3. Rules must reference Pixi fields: `current_outfit`, `inventory`, `new_objects`,
   `holder`, `wear_slot`, `location`, `parent` (places), WORLD_DELTA — not generic RPG jargon alone
4. No character names from any live campaign (no Mia/Emily/etc.) — keep generic
5. `match_keywords` are plain strings for regex OR-join; no regex metacharacters unless escaped
6. Prefer deletion over addition: if a baseline rule is already correct, say `"keep"` in
   `lines_diff` instead of rewriting everything (optional field)

## Optional diff mode (preferred for upgrades)

```json
{
  "pack_id": "kit_gear",
  "mode": "diff",
  "add_keywords": ["bralette", "camisole", "holstered"],
  "remove_keywords": [],
  "replace_lines": null,
  "add_lines": ["- New rule…"],
  "remove_line_substrings": ["old phrase to drop"],
  "anti_patterns_add": ["…"],
  "rationale": "≤5 sentences"
}
```
