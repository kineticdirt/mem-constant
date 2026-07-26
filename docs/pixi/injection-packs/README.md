# Injection packs — Gemini Notebook / NotebookLM handoff

**Why:** Packs (`kit_gear`, `world_storage`, `system_dynamics`, `mechanics`) are the durable
domain rules for Pixi Send. Agents cannot use signed-in Google UIs. You run NotebookLM /
Gemini with sources; we ingest the structured return on PC/potato.

**Runtime SoT:** potato `~/pixi-rp/.../session_turn_augment.mjs` → `INJECTION_PACKS`  
**This folder:** design + prompts + ingest staging (agent-dump).

## Workflow (one pack at a time)

```text
1. You: create/open a NotebookLM notebook (or Gemini with Files).
2. You: add 2–6 sources (links / PDFs / notes) for THAT pack domain only.
3. You: paste the matching prompt from prompts/ (after the Setup prompt once).
4. You: export/copy the model reply → save as returns/<pack_id>-YYYYMMDD.md
        (or .json if it already matches CONTRACT.md).
5. PC/potato: run ingest → dry-run → merge into INJECTION_PACKS → bump rev → restart pixi.
```

**Do not** dump all four domains into one notebook. Grounding dilutes; each pack should
have its own source set.

## What to upload as sources (by pack)

| Pack | Good sources | Avoid |
|------|--------------|-------|
| `kit_gear` | garment anatomy / wear-slot taxonomies, mil-surplus / armor plates primers, firearm carry positions (holster/sling/trunk), fashion fabric glossaries | full novels, character sheets from your live session |
| `world_storage` | entity-component / inventory DB schemas, place-hierarchy examples (room⊂building⊂region), object permanence notes from TTRPG GMing | plot spoilers for your campaign |
| `system_dynamics` | clock/pressure systems (Blades clocks, Fronts), resource attrition essays, off-screen faction tick patterns | one-shot adventure modules wholesale |
| `mechanics` | **setting-specific** — infection progression notes, magic-system essays, hard-sci constraints you want canon | contradicting systems in the same notebook |

You said you can provide links — paste them under the pack section in
`sources/LINKS.md` before you run, or just drop them into NotebookLM and tell us which
pack they belong to.

## Return path

1. Save the Gemini/NotebookLM answer under `docs/pixi/injection-packs/returns/`  
   naming: `kit_gear-20260725.md` (or `.json`).
2. Tell the agent: **"ingest kit_gear return"** (or whatever pack).
3. Agent runs `scripts/pixi/ingest-injection-pack.py --pack kit_gear --file … --dry-run`  
   then applies to potato after you OK.

## Current live packs (v1 baseline)

Already on potato rev `20260725-kit-packs-v2`:

- Relevance gated (≥2 keyword hits), max **2** packs per Send
- Studio pin/mute UI
- Compact rule lines only — **no novels in the prompt**

Notebook upgrades should refine: keyword `match` lists, rule lines, optional
`scenario_notes_template`, and **WORLD_DELTA field contracts** — not longer prose.
