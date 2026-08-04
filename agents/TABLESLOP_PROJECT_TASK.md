# tableslop project lane (continuous map / v1 game)

**Profile:** `think` when `agents/tableslop-progress.md` has unchecked `[ ]`, or when `user-tasks.json` has `project_id: tableslop` open.  
**Boards:**  
- **Tick checklist (preferred):** `agents/tableslop-progress.md` — one `[ ]` per cycle  
- **Product SoT:** `projects/tableslop/manifest.json` + `projects/tableslop/regions.json` (update status lanes after meaningful steps)

**Cadence:** advance **one tick-sized progress item per think tick** when urgent `[ops]` / Fix-this are clear. Work on potato for live `:8765` verify; PC design preview OK; `push-tableslop-map.sh` only at milestones/handoff.

## Models — free-first (required)

- Run this lane on **free** models only (`poolside/laguna-xs-2.1:free` and other free think fallbacks).
- **Do not** spend paid models for routine map/UI/docs slices.
- Paid is allowed only when the item truly needs it (capability gap, image processing, free model failed after a concrete attempt). Record the reason in the progress Done line.

## Scope

Advance **tableslop · Isla Primavera** toward v1: map + regions + cast + session/Discord play loop (not map-only). Platform name = tableslop; HUD display name = Isla Primavera.

**Read:** this file, `agents/tableslop-progress.md`, `projects/tableslop/README.md`, `projects/tableslop/manifest.json`, `docs/tableslop-linuxbox.md`.

**Write:** flip one `[ ]`→`[x]` in `tableslop-progress.md`; optionally bump matching manifest/`regions.json` status; notes under `campaigns/tropic-gooner/reports/` — not Obsidian canon unless human promotes.

## Each tick

1. If `tableslop-progress.md` has open `[ ]`, do **exactly the first** unchecked item (anti-thrash may rotate after 3 fails).
2. Else open manifest — oldest task in **writing** or **testing** (skip **deferred**; skip **blocked** unless human unblocks). Split into a new tick-sized `[ ]` on the progress board rather than boiling the ocean.
3. One concrete implement + one verify (`curl` `:8765`, Playwright smoke under `campaigns/tropic-gooner/map/tableslop-smoke.mjs`, or documented human step).
4. Append `AI_GROUPCHAT.md` `[LINUX]`/`[PC]` line.
5. Stop. Do not batch.

## After any map / deploy touch (required)

Potato owns GM borders (`REGIONS-UI-LOCK.md`). **After** `push-tableslop-map.sh`, `push-linuxbox.sh`, bundle apply, or any edit under `campaigns/tropic-gooner/map/`:

```bash
bash scripts/linuxbox/tableslop-gm-borders-guard.sh
bash scripts/linuxbox/verify-runtime-state.sh --context tableslop-map
```

- **FAIL** if GM vert counts drop vs `regions-ui.gm-watermark.json` or live is empty while baks have polys.
- **Never** SCP empty/stub `regions-ui.json` toward potato; never run `sync-overlay-coords.mjs` / `digitize-region-polygons.mjs --apply` on live GM polys.
- After **GM Draw → Save** adds/changes borders, bump baseline only with explicit human/agent OK:

```bash
bash scripts/linuxbox/tableslop-gm-borders-guard.sh --accept
```

## Status lanes (manifest / regions)

`planning` | `writing` | `testing` | `blocked` | `done` | `deferred`

Do not invent new lane names without updating README + manifest header.

## Do not

- Commit Discord secrets / OAuth Client Secret.
- Delete campaign files or wipe `characters-registry.json` (multitask lock + merge-by-id if touching cast).
- Auto-enable Discord OAuth without human Client ID/Secret (`da-01`).
- Burn paid models on free-capable map work.
