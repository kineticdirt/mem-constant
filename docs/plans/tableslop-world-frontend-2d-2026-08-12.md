# Tableslop World — frontend 2D deliverables (2026-08-12)

> **GameSys alias:** part of **GameSys** (Isla Primavera). SoT: [`gamesys-isla-primavera-2026-08-14.md`](gamesys-isla-primavera-2026-08-14.md).


**Status:** PLAN ONLY — no product code in this delivery.  
**Role:** `role-frontend` (agent-role-cluster)  
**Product:** Theme B — `map.tableslop.org` (Isla Primavera / tropic-gooner)  
**Hard locks:** NEVER mutate `regions-ui.json`. **/3d shelved** (2D map is working SoT; height/3d transfer later). GM borders/pins sacred.  
**Holder:** `tableslop-world-frontend-2d`

**Consumes (do not fork contracts):**  
`docs/plans/tableslop-world-sot-apis-2026-08-12.md` · `docs/plans/tableslop-world-ux-flows-2026-08-12.md` · `docs/plans/tableslop-world-verify-issues-2026-08-12.md`

**Existing FE anchors (extend, do not rewrite):**  
`tableslop-server.js` map HUD (`buildLayerStack`, `placeHighways`, `initRoadsToggle`, dock Phone) · `scripts/linuxbox/tableslop-static/phone/` (beep-only today)

---

## Why this exists

Backend shards/APIs and UX flows are planned; this doc locks **what the 2D client must ship** so implementers touch the fewest files, keep poll/patch hygiene (no full `innerHTML` wipe of open Phone/Layers), and pass verify **O1–O5 / G4** without touching borders or advertising `/3d` as product SoT.

---

## Out of scope (explicit)

| Item | Rule |
|------|------|
| `regions-ui.json` Draw/Save/sync | NEVER open write paths; overlays are not borders |
| `/3d` product path | Shelved — hide or demote `map3dToggle` from Layers story; no acceptance that requires 3D |
| TTS / voice generation in browser | Forbidden — playback of SoT-cached URLs only |
| Full Action Board / `/world` chrome | UX L2 exists elsewhere; FE here only keeps map Layers + Phone dock |
| Pin radiate rings (UX Flow 5) | Deferred unless already trivial; not M1 blocker |

---

## 1. 2D map GMaps-style highway/road layer

### Goal

Roads/highways are the **primary spatial read** on the 2D stage (green freeway/highway strokes + optional local road strokes), fed by working SoT — not region polys, not 3D mesh.

### Data consumer contract

| Source | Client use |
|--------|------------|
| `map/highways.json` (+ wireframe URL if present) | **Baseline** green art verts — keep `placeHighways` path |
| `roads/meta/highway-overlay-ref.json` | Pointer only — do not duplicate verts into FE |
| `GET /api/world/roads` index + region shard | **Local / named roads** polylines when shard present; load **visible region(s)** only (index first ≤ ~64 KB) |
| Missing shard / 404 | Empty-state string in Layers sheet; baseline hwy wire still usable |

### CSS / DOM classes (proposed — match existing `map-layer--*` pattern)

| Class / attr | Role |
|--------------|------|
| `.map-stack` | Existing transform root |
| `.map-layer.map-layer--highways` | Highway/freeway strokes (existing); `data-layer-id="highways"` |
| `.map-layer.map-layer--roads-local` | **New** local/arterial from roads shards |
| `.hwy-svg` | Existing SVG overlay inside highways layer |
| `.road-path--freeway` / `.road-path--highway` / `.road-path--arterial` / `.road-path--local` | Stroke weight/color variants (GMaps-ish: thick green freeway → thinner arterial → thin local) |
| `.road-path.is-hit` | Keyboard/pointer highlight |
| `.is-hidden` | Layer visibility (existing pattern) |

### Z-order (bottom → top)

Lock in `layers_manifest` / `buildLayerStack` `z` values (illustrative; keep relative order):

1. `terrain-base` (map image)  
2. `wind` (pattern canvas/SVG)  
3. `water` (pattern canvas/SVG)  
4. `logistics` (route strokes/markers)  
5. `highways` + `roads-local` (transport SoT)  
6. region fills / areas (existing — **read-only** consume; never write)  
7. `pins` / `labels` / economy sites (highest interactive)

**Hit targets:** wind/water/logistics default `pointer-events: none` except optional legend pick mode. Highways/roads: `pointer-events: stroke` on paths (or invisible fat hit-stroke under paint stroke). Pins keep `pointer-events: auto`. Pan/zoom stay on stage — overlays must not steal scroll while Layers/Phone L1 focused (UX invariant).

### Deliverables

- [ ] D1.1 Manifest entries for `wind`, `water`, `logistics`, `roads-local` with stable `z`.  
- [ ] D1.2 Render pipeline: index → visible bbox/region → draw paths in viewBox units (same transform as green art — no screen-px drift).  
- [ ] D1.3 Hit-test: click road → L1 inspector stub (name/kind/id) without navigating away.  
- [ ] D1.4 Roads toggle drives both `highways` and `roads-local` (or split toggles with shared “Roads” master — prefer one master + optional detail in Layers sheet).

---

## 2. Overlay toggle UI (wind · water · roads · logistics · pins)

### Goal

Independent layer switches with L0 glance + L1 checklist (UX Flow 2). Session remember via existing client profile / `localStorage` (later account).

### Chrome

| Layer | Control |
|-------|---------|
| **L0** | Replace/extend lone `#roadsToggle` with **Layers** chip + active-count badge (`N on`). Keep short one-click Roads affordance optional. |
| **L1** | Side Sheet / right-dock checklist: Roads, Wind, Water, Logistics, Pins — each `role="switch"` + On/Off text + legend swatch. “Solo this layer” helper. |
| **Not in Layers** | `/3d` entry; region-border edit; World studio (World chip stays separate nav). |

### State rules

- Toggle flips `is-hidden` / visibility flag only — **patch DOM**, do not rebuild entire `#mapStack` on every flip.  
- Poll/refresh of weather/logistics: update pattern params or path `d` attributes; if Layers sheet open, do not remount it (same class as Hub `hubUserIsEditing`).  
- All-on soft warn in L1 only (“Dense view — try Solo”); never auto-disable.  
- Mobile: Bottom Sheet; targets ≥44px.

### Deliverables

- [ ] D2.1 Layers chip + badge wired to five booleans.  
- [ ] D2.2 L1 sheet open/close/focus/Escape restores focus to chip.  
- [ ] D2.3 Live region announce (“Roads on”).  
- [ ] D2.4 Persist prefs in profile (`showRoads`, `showWind`, `showWater`, `showLogistics`, `showPins`).  
- [ ] D2.5 Empty/fail copy when SoT missing (pointer to UX Flow 6 strings).

---

## 3. Wind / water canvas or SVG pattern rendering

### Goal

Translucent environmental read from weather SoT + phenomenon bag — not a second map product.

### Approach (choose one primary; document ceiling)

| Option | When | Notes |
|--------|------|-------|
| **A. Single offscreen canvas** (preferred M1) | Wind + water share one `#envOverlayCanvas` sized to stage CSS box, redrawn on zoom-end / weather tick | Cheapest composite; one `drawImage` into layer |
| **B. SVG `<pattern>` + rects** | Sparse vectors / few streamlines | Crisp at zoom; costly if thousands of nodes |
| **C. CSS repeating gradient** | Decorative only | Insufficient for directional wind — reject as sole SoT read |

**Recommendation:** Option A for wind field + water wash; optional SVG streamlines **capped** (see bounds).

### Data → paint

| Input | Paint |
|-------|-------|
| City `wind_mph` / `wind_dir` (+ phenomenon `wind_anomaly`) | Hatch or particle streaks oriented by dir; opacity ∝ intensity |
| Rain / flood_watch / water bodies summary | Cool wash + sparse ripple dots in affected `region_ids` bbox |
| No weather yet | Layer on but empty-state in L1; canvas clear |

### Perf bounds (potato + mid laptop)

| Bound | Limit | Upgrade path |
|-------|-------|--------------|
| Canvas CSS pixels | ≤ **1280** on long edge (downscale from stage; upscale via CSS) | Raise only after FPS measure |
| Redraw cadence | On **zoom/pan settle** (≥100 ms debounce) + weather version change — not every pointermove | rAF only while “scrubbing intensity” slider if ever added |
| Particles / streamlines | ≤ **400** wind streaks; ≤ **200** water ripples | LOD by zoom: hide local detail when zoomed out |
| `prefers-reduced-motion` | Static hatch; no animated particles | — |
| Memory | One canvas + one ImageData scratch; no per-city canvases | — |

`ponytail:` comment when implementing: global single canvas = ceiling; upgrade = WebGL only if FPS &lt; 20 on potato with caps hit.

### Deliverables

- [ ] D3.1 `map-layer--wind` / `map-layer--water` with canvas (or SVG) mount.  
- [ ] D3.2 Bind to `GET /api/world/weather` (+ phenomena when present); ignore `updated_at` for equality.  
- [ ] D3.3 Debounced redraw + reduced-motion path.  
- [ ] D3.4 FPS/self-check note in smoke (optional `performance.now` assert in headless — soft).

---

## 4. Logistics overlay drawing

### Goal

Show shipping / bus / supply edges from `logistics/index.json` + `routes.ndjson` as a distinct layer under roads, over env patterns.

### Visual

| Element | Style |
|---------|-------|
| Route polyline | Dashed stroke (amber/violet — not highway green); class `.logistics-route` / `.logistics-route--sea` / `--land` / `--air` |
| Node / hub | Small diamond or square at endpoints; `.logistics-hub` |
| Load pressure (optional M1.1) | Dot weight or label count from `loads.ndjson` — only when Routes on |

### Behavior

- Default `pointer-events: none`; optional “Inspect logistics” in L1 enables hits → show route id/mode in inspector.  
- Load by index; fetch routes for visible region or full island if file small (&lt; ~1 MB).  
- Missing data → empty state, not fake ellipses.

### Deliverables

- [ ] D4.1 `map-layer--logistics` + draw from SoT.  
- [ ] D4.2 Toggle independence from Roads.  
- [ ] D4.3 Z-order under highways; over wind/water.  
- [ ] D4.4 No write to logistics SoT from map click (read-only overlay in M1).

---

## 5. Phone UI — emergency call chrome vs beep-only

### Today

`phone.js`: `AudioContext` oscillators (`beep` / `ringback`); call states mostly ringing → connected/voicemail; **no 911 triage / dispatch hold chrome**.

### Target (UX Flow 4)

| State | UI | Audio |
|-------|-----|-------|
| Dial 911 | Confirm Dialog (“Call emergency dispatch?”) | — |
| Connecting | Distinct **Emergency** chrome (label + color + icon, not color-only) | Ringback **or** cached ring asset |
| Triage | Location / nature chips / severity → Submit | Optional hold loop from cache |
| Dispatch live | Timer, mute, end, optional share-pin; L0 Phone chip badge in-call | `<audio>` dispatcher lines from manifest |
| Hold / busy | Queue + retry; diegetic hold — not infinite spinner | Hold tone URL or soft beep fallback |
| Non-emergency | Existing calm Call path; **no** triage | Beep/ringback OK |

### FE rules

- Patch call panel DOM by state machine; do not rebuild entire Phone HOME on tick.  
- Mid-call navigate to `/world`: park session server-side; banner “Call in progress — return to map.”  
- Accidental 911: confirm before connect.  
- Text-only fallback when voice URL 404 (Flow 6 copy).

### Deliverables

- [ ] D5.1 State machine: `idle → confirm → ringing → triage → live | hold | busy | ended`.  
- [ ] D5.2 Triage form UI + submit → session API (when BE ready; stub local until then).  
- [ ] D5.3 Visual distinction emergency vs non-emergency chrome.  
- [ ] D5.4 L0 dock badge while in-call.  
- [ ] D5.5 Keep beep path as **fallback** when cache miss / user muted beeps.

---

## 6. Voice playback hooks (no gen in browser)

### Contract

Consume `phone/voice-manifest.json` (SoT) → URLs under `/phone/voice/<id>.ogg` (or served campaign path). **PC generates offline; potato serves static.** FE never calls TTS APIs.

### Client pieces

| Piece | Behavior |
|-------|----------|
| Hidden or dock-scoped `<audio id="phoneVoice">` | Single element; replace `src` per utterance |
| `VoiceCache` helper | `get(utteranceId)` → manifest URL; memory Map of object URLs optional; **no** WebAudio synthesis for speech |
| Prefetch | On emergency connect, prefetch `911-greeting` + hold tone; fail soft |
| Events | `playUtterance(id)`, `stopVoice()`, `onended` → next script line or text fallback |
| Hygiene | User “tap to toggle beeps” remains; voice channel respects same mute |

### Deliverables

- [ ] D6.1 Manifest fetch + version-aware reload on 409/stale.  
- [ ] D6.2 `<audio>` wiring in call live/hold states.  
- [ ] D6.3 404 → transcript/script line; papercut-class log only if recurrent.  
- [ ] D6.4 Zero code paths that generate audio blobs from models in-browser.

---

## 7. File touch list (names only)

Implementers should stay inside this set unless orchestrator expands scope.

### `scripts/linuxbox/tableslop-static/`

| Path | Touch |
|------|-------|
| `phone/phone.js` | Emergency state machine, audio element hooks, triage UI logic |
| `phone/phone.css` | Emergency / hold / triage chrome |
| `phone/index.html` | Markup slots for triage + `<audio>` |
| `phone/contacts.js` | Only if emergency directory stubs needed |
| `phone/apps-data.js` | Only if HOME labels/badges change |
| `phone/voice/` | **New dir** — static cached audio (synced, not generated here) |
| `phone/INTEGRATION-NOTE.md` | Wiring note update (short) |

Do **not** require edits under `tableslop-static/3d/**` for M1.

### Map HUD in `scripts/linuxbox/tableslop-server.js`

Names only (functions / ids / classes to extend):

| Symbol / id | Role |
|-------------|------|
| `buildLayerStack` / `getMapStack` / `layerEl` | Add wind/water/logistics/roads-local layers |
| `placeHighways` / `initRoadsToggle` / `syncRoadsLayerVisibility` | GMaps roads SoT consumer + master toggle |
| `#roadsToggle` → Layers chip / `#layersToggle` | Overlay toggle entry |
| `map-layer--highways` (+ new `--wind` `--water` `--logistics` `--roads-local`) | Layer DOM |
| `layers_manifest` (API/map payload) | z-order SoT for stack |
| Dock: `#dockPhone`, `DOCK_URLS.phone`, dock iframe | Phone embed cache-bump `?v=` |
| `map3dToggle` / `map-3d-overlay` | Demote/hide from product Layers story (shelved) |
| Client profile `saveProfile` / `showRoads` | Extend prefs keys |
| Weather fetch helpers (existing World weather UI bits) | Reuse for env overlay bind — do not fork |

**Never:** any Save/Draw path that writes `regions-ui.json`; any `sync-overlay-coords` apply from this workstream.

---

## 8. Acceptance tests ↔ verify doc

Tie FE done-ness to `docs/plans/tableslop-world-verify-issues-2026-08-12.md`. Map IDs 1:1.

### Overlay / roads (verify §3 → gate **G4**)

| Verify | FE acceptance |
|--------|----------------|
| **O1** | With Roads on, freeway/highway strokes visible on 2D without opening 3D |
| **O2** | Layers toggles for roads / wind / water / logistics / pins each flip visibility; no full-page nav |
| **O3** | If 3D control still in DOM: must not be required; must not become product SoT navigation |
| **O4** | Pins stay at label coords with overlays on; no agent drag |
| **O5** | Session before/after: no write to `regions-ui.json`; optional `tableslop-gm-borders-guard.sh` still PASS |
| **O6** | Deploy notes: overlay assets via normal map push **excluding** regions-ui |

Preflight: `curl` `:8765/` → 200 (not a substitute for O1–O5).

### Phone / voice (verify §1–§2 → gates **G1–G2**)

| Verify / calendar | FE acceptance |
|-------------------|---------------|
| Dial matrix tags **P-911** / **P-NEM** | UI exposes emergency vs non-emergency paths (chrome + triage vs calm call) |
| `bug-phone-beep-only-audio` | Fixed when live/hold can play manifest `<audio>` with beep fallback only |
| `feat-phone-911` | Confirm → triage → live/hold states reachable from keypad |
| Engine self-check G1 | FE does not break `lookupNumber` contract; uses session API when present |

### Explicit non-goals in acceptance

- Weather determinism **G3** = engine/API (FE only binds paint).  
- Board→World **G5** = not this FE slice.  
- `/3d` FPS / height bake = shelved.

### Suggested FE smoke (implement later)

| Smoke | Assert |
|-------|--------|
| Short Playwright on `:8765` | Layers open; toggle Roads/Wind; screenshot or `is-hidden` class flip; pin still present |
| Phone embed | Dial 911 → confirm visible; cancel works; (when stubbed) triage Submit → live chrome + `#phoneVoice` `src` set or text fallback |
| Guard | No network/PUT to `regions-ui` during smoke |

Fail → file `bug-*` / `feat-*` per verify §6 (`dev-calendar`), not silent papercut for player-visible breaks.

---

## Implementation order (FE)

1. Layer stack + z-order + Roads SoT consumer (D1) → verify O1.  
2. Layers chip/sheet toggles (D2) → O2.  
3. Wind/water canvas caps (D3) → O2 env half.  
4. Logistics draw (D4).  
5. Phone emergency chrome (D5) → P-911 path.  
6. Voice `<audio>` + manifest (D6) → beep-only bug close.  
7. Smoke + borders guard (O5) before any potato deploy.

---

## Clarifications for GM / orchestrator (ask before coding if unclear)

1. **Roads master:** one “Roads” switch for hwy+local, or separate Hwy wire vs Local streets?  
2. **Layers L1 host:** new Side Sheet in `tableslop-server.js` HUD, or reuse right dock over Cast?  
3. **911 confirm:** always, or only when no PC linked?  
4. **Voice URL base:** `/phone/voice/` static vs campaign-mounted path from SoT plan?

Until answered, default: (1) one master Roads + detail checkboxes, (2) L1 Side Sheet from Layers chip, (3) always confirm 911, (4) `/phone/voice/` as in SoT §6.

---

## Related

- UX: `docs/plans/tableslop-world-ux-flows-2026-08-12.md` (Flows 2, 4, 6)  
- SoT: `docs/plans/tableslop-world-sot-apis-2026-08-12.md` (roads / logistics / phone voice)  
- Verify: `docs/plans/tableslop-world-verify-issues-2026-08-12.md` (§3 O1–O6, G4, phone matrix)  
- Hwy history: `docs/plans/tableslop-hwy-template-trace-2026-08-10.md`
