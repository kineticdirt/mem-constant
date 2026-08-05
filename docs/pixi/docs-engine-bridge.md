# Docs ↔ Pixi engine bridge (not product merge)

**Status:** Phase 1 callable path (2026-07-27)  
**Plan:** [`../plans/character-sheet-baseline-2026-07-27.md`](../plans/character-sheet-baseline-2026-07-27.md)  
**Template:** [`../../campaigns/_templates/character-sheet.md`](../../campaigns/_templates/character-sheet.md)  
**Adapter script:** [`../../scripts/pixi/sheet-to-dossier.py`](../../scripts/pixi/sheet-to-dossier.py)

## Architecture one-liner

**Share Pixi engine guts (`body_profile` / `character_dossier` / merge·hygiene·heading adapters) for Docs character authoring, beta dry-runs, and sheet generate/modify on linuxbox — keep Pixi RP as a separate product on `:8767` (`linuxbox-pixi-rp`). Do not merge UIs.**

| Surface | Owns | Does not own |
|---------|------|----------------|
| **Docs Hub** (`:8790` silo) | Pillar markdown create/edit/comments; `@` resolve; New character sheet; adapter dry-run CTA | Full RP Send / Cast / Wiki chrome |
| **Pixi RP** (`:8767`) | Live play, WORLD_DELTA, Send inject, Cast/Wiki UI | Docs tree / talk-to-doc authorship |
| **Shared guts** | Field ids, merge rules, scrub/hygiene, `sheet-to-dossier.py` heading→field preview | A second full Pixi UI under Hub |

## Callable path (linuxbox)

```bash
# Dry-run: pillar md → dossier field preview (no :8767, no registry write)
python3 scripts/pixi/sheet-to-dossier.py --path campaigns/tropic-gooner/characters/_pilot-mira-vale-example.md

# Self-check
python3 scripts/pixi/sheet-to-dossier.py --self-check

# Optional LLM modify proposal (OpenRouter key from Pixi or Hermes env)
python3 scripts/pixi/sheet-to-dossier.py --path <sheet.md> --generate \
  --instruction "From Docs comments: fix Look clothing cut/fabric; keep age clock-locked"
```

Hub CTAs: Docs toolbar **Beta-test** → `POST /api/docs/character-beta` (sheet inject + OpenRouter scene; Pixi env key preferred). Pixi silo **Beta-test character (engine)** remains the dry-run script pointer. Not an iframe of `:8767`.

Versions: `agents/state/doc-versions/` (protected runtime). Save opens a unified diff before Accept; history slider on open docs.

Promote: **Promote from reports** → `POST /api/docs/propose-from-reports` (deterministic evidence append; optional LLM).

### Docs comments → next gen

1. Highlight span in Docs → Comment (+ optional suggested text).
2. Accept apply patches the md (live).
3. Queued / applied notes are the **correction signal** — paste into `--instruction` or feed a future generate-modify job.
4. Do not auto-write registry; do not invent faces.

## Where the guts live

| Module (Pixi checkout) | Role |
|------------------------|------|
| `PixiApp/chat-ui/body_profile.py` | Anatomy / Look structured fields |
| `PixiApp/chat-ui/character_dossier.py` | Dossier text fields incl. sexuality cluster + `sexual_partners` render |
| `PixiApp/chat-ui` merge / hygiene / sheet scrub helpers | Continuity SoT; empty-block scrub |
| Live potato tree | `~/pixi-rp/ObsidianWriterStack/PixiApp/chat-ui/` |
| `scripts/pixi/sheet-to-dossier.py` | Docs-side heading→field dry-run (+ optional `--generate`) |

Prefer calling/porting Pixi field merge logic over re-declaring keys. This script maps **names** for preview; live seed into `observed_world` is still Phase 2.

## Grade references for fill quality

| Ref | Path |
|-----|------|
| Campaign prose bar | `campaigns/tropic-gooner/characters/sasha.md` |
| Largest Pixi people baseline | `…/scenarios/fictionlab-cocksleeve/people/lauren-fictionlab-complete.md` (PC ObsidianWriterStack + potato `~/pixi-rp/…`) |
| Expanded template | `campaigns/_templates/character-sheet.md` (+ `.example.md`) |
| Non-clobbering pilot | `campaigns/tropic-gooner/characters/_pilot-mira-vale-example.md` (not live cast; Sasha untouched) |

## Docs create / index

| Action | How |
|--------|-----|
| New sheet | Hub Docs → **New character sheet** → `POST /api/docs/character-sheet` → `campaigns/<id>/characters/<slug>.md` |
| NYC index | `storyDirs` includes `characters` · `campaigns/nyc-mafia-dnd/characters/` |
| `@slug` | `GET /api/docs/resolve?q=` + Docs **@ resolve** (exact id/alias/slug only) |
| Smart filter | `kind:character` · `sex:` · `role:` · `tag:` · `@slug` |

## Adapter contract (remaining Phase 2)

1. Read Docs `characters/<slug>.md` with six H2 pillars (+ pillar 5 H3s from template). ✅ dry-run via `sheet-to-dossier.py`
2. Map → people row + `body_profile` + `character_dossier` **writes** for Pixi seed — still deferred.
3. Never invent faces; never fuzzy-merge aliases.
4. Send inject remains selective slices; full pillar markdown stays disk/UI.

## Non-goals

- Hub iframe / second Pixi RP UI
- Dumping full six-pillar markdown into every Send
- Forking a new JSON schema beside CHARACTER-SHEETS-PLAN / CONTINUITY
- Overwriting living sheets (e.g. `sasha.md`) without explicit GM ask + backup
