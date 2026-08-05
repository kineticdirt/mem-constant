# Pixi docs (agent-dump)

Homelab / operator docs for Pixi RP. **Runtime deep-dives** live in the Pixi checkout:

`ObsidianWriterStack/docs/pixi/` (`RUNTIME_CODEBASE.md`, `RELATIONSHIP_CONTINUITY.md`, …).

| Doc | Purpose |
|-----|---------|
| [ENGINE-GOBSTOPPER.md](./ENGINE-GOBSTOPPER.md) | **Pixi engine north star** — UI vs engine, gobstopper layers, delaying gratification, anti-hardcode, package plug-in |
| [CONTINUITY.md](./CONTINUITY.md) | **SoT map** — observed_world vs sheets vs package; Send inject vs Cast UI; WORLD_DELTA; failure modes; operator checklist |
| [WORLD_PERMANENCE.md](./WORLD_PERMANENCE.md) | **Permanence system** — aka/objects/events pipeline; facade `world_permanence.mjs`; salvage + hygiene + PUT preserve |
| [CHARACTER-SHEETS-PLAN.md](./CHARACTER-SHEETS-PLAN.md) | Sheet vs chat telemetry; structured Cast/Wiki sections |
| [docs-engine-bridge.md](./docs-engine-bridge.md) | **Docs ↔ Pixi engine guts** (shared adapters; RP product stays `:8767`) |
| [../plans/character-sheet-baseline-2026-07-27.md](../plans/character-sheet-baseline-2026-07-27.md) | **Six-pillar Docs↔Pixi authoring baseline** + `campaigns/_templates/character-sheet.md` |
| [../pixi-local-bonsai.md](../pixi-local-bonsai.md) | PC Bonsai `:8000` + potato Pixi `:8767` OpenRouter-only routing |

Ledger: `AI_GROUPCHAT.md` (`[PC]` Pixi Result lines). Audit note (diagnose): `agent-artifacts/pixi-audit-2026-07-17.md`.
