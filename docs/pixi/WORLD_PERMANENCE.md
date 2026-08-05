# World permanence — system map

**Scope:** Pixi chat-ui (`ObsidianWriterStack/PixiApp/chat-ui/`).  
**Companion:** [`CONTINUITY.md`](./CONTINUITY.md) (SoT priority + Send inject).  
**Code surface:** `static/world_permanence.mjs` (public facade) → implementations in `static/session_turn_augment.mjs` + server `observed_world_hygiene.py` / PUT preserve.

## What “permanence” means

Facts about **people**, **objects**, and **events** that must survive the next Send even when the model omits a rich `<<<WORLD_DELTA>>>` footer.

| Kind | Mechanical SoT | Fill when WD is sparse | Inject on Send |
|------|----------------|------------------------|----------------|
| Character | `observed_world.people` | aka resolve + salvage people/outfit; Cast hides `canonical_id` stubs | `scene_presence`, `present_cast_state`, `identity_continuity` |
| Object | `observed_world.objects` | salvage props from prose; refresh known objects | `scene_props` |
| Event | `objects` with `kind:"event"` (+ memo archive) | salvage scene header → event row; `seedEventObjectsFromMemo` | memo (index) + props list |

Sheets/Wiki are **not** Send-visible unless copied into `observed_world` + an inject layer.

## Pipeline (one system)

```text
Assistant reply
    │
    ├─ parse <<<WORLD_DELTA>>>  (preferred)
    │       └─ if people-only / missing objects → salvageWorldDeltaFromAssistantProse
    │
    ▼
mergeObservedWorldIntoRpg  →  observed_world
    │
    ├─ collapseAliasPeopleStubs   (Emily → lin-mei; stub gets canonical_id)
    ├─ applyContinuityHygiene     (ages, outfits, places, edges, sheets)
    │     └─ includes seedEventObjectsFromMemo + aka scrub
    │
    ▼
Persist session JSON
    │
    ├─ PUT preserve denser people/objects (stale tab must not wipe)
    └─ BG: cast_sheet_enrich / character_record (Wiki density; between posts)

Next Send
    └─ buildForegroundChatSystemPayload layers read observed_world
```

## Public API (prefer these names)

| Function | Role |
|----------|------|
| `resolveCanonicalPersonId` | Aka-before-name; follow `canonical_id` |
| `collapseAliasPeopleStubs` | Soft-hide nickname rows under canon |
| `filterCastVisibleRoster` | Cast UI drops stubs / alias losers |
| `salvageWorldDeltaFromAssistantProse` | Mint people/objects/events from prose |
| `seedEventObjectsFromMemo` | Memo beats → `kind:event` objects |
| `applyContinuityHygiene` | Full load/Send SoT repair orchestrator |
| `applyWorldPermanencePass` | Narrow aka + event seed (subset) |

Import via `world_permanence.mjs` or `PixiSessionTurnAugment` (mount merges both).

## Server mirrors

| Piece | File |
|-------|------|
| Aka merge plan (Emily→Lin Mei) | `observed_world_hygiene.py` → `_plan_aka_merges` |
| Dense cast/object PUT preserve | `server.py` → `_preserve_dense_cast_on_put` |

## Failure modes (fixed / watch)

1. **Aka fork** — primary-name stub wins before aka → Cast shows Lin Mei + Emily. Fix: aka-before-name + collapse + Cast filter.
2. **Empty objects loop** — salvage only when `new_people` empty → props never indexed. Fix: also salvage when `new_objects` empty.
3. **Stale tab wipe** — client PUT with thin OW overwrites enrich/salvage. Fix: PUT preserve.
4. **Event_memo only** — demoted vs scene presence; never became SoT. Fix: `kind:event` objects from salvage + memo seed.

## One-shots

Live session merges / backfills live under `PixiApp/chat-ui/scripts/one-shots/` (not importable runtime). Do not leave `_tmp_*` at chat-ui root.
