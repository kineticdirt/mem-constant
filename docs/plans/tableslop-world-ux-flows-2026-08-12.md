# Tableslop Isla Primavera — World UX flows (2026-08-12)

> **GameSys alias:** part of **GameSys** (Isla Primavera). SoT: [`gamesys-isla-primavera-2026-08-14.md`](gamesys-isla-primavera-2026-08-14.md).


**Status:** PLAN ONLY — no product code in this delivery.  
**Role:** `role-ux` (agent-role-cluster)  
**Product:** Theme B — `map.tableslop.org` (Isla Primavera / tropic-gooner)  
**Depth model:** NN/g progressive disclosure — **L0 summary → L1 panels (Side Sheet / dock) → L2 full pages**  
**Hard locks:** NEVER mutate `regions-ui.json`. **/3d shelved** (2D map is working SoT; transfer later). GM borders/pins sacred.

**Related:**  
`docs/plans/tableslop-worldeditor-2026-08-07.md` · `docs/plans/tableslop-dual-app-roadmap-2026-08-01.md` · `docs/plans/tableslop-hwy-template-trace-2026-08-10.md` · skills `hub-ui-depth` / `hub-drawer-sheet` (chrome vocabulary)

---

## Why this exists

GM needs World tools, overlays, Phone emergency realism, and pin-density mental models without turning the **map** into a second Hub or burying authoring in HUD chips. This plan locks **interaction contracts** (open/close/focus/scroll) and **empty/failure copy** so FE/BE implement against one UX spine.

### Depth vocabulary (tableslop-adapted)

| Layer | Chrome (NN/g) | Tableslop use |
|-------|---------------|---------------|
| **L0** | Map stage + HUD chip strip | Glance: active overlays, clock, role chrome, dock icons |
| **L1** | **Side Sheet** / right dock panel / overlay stack | Temporary depth over map (Phone app, overlay legend, pin ring inspector) — Escape/Back restores map focus |
| **L2** | **Full page** destination | `/world`, Action Board — must feel like a **new view**, not a HUD flyout |
| **Dialog** | Short interrupt only | Confirm resolve/discard; never long logs or board lanes |

**Do not:** duplicate map silo nav as a second Drawer Menu; use modal Dialogs for thread boards or call logs.

### Shared open/close/focus/scroll invariants

1. **Open L1:** set open flag; focus heading or Back; light focus trap inside sheet/dock.  
2. **Close L1:** Back · Escape · backdrop (if modal) · optional swipe — restore focus to opener chip.  
3. **Scroll:** L1 body owns overflow; map pan/zoom does not steal scroll while sheet focused.  
4. **Poll/refresh:** patch text nodes; do not remount open sheet (same class as Hub `hubUserIsEditing`).  
5. **Open L2:** full navigation (URL change); map HUD unmounts or parks; Back returns to map URL with prior camera when possible.  
6. **Role gate:** anon/`user` never see GM Action Board edit chrome or World SoT editors; Phone may be diegetic for linked PCs.

---

## Flow 1 — Map HUD → Enter `/world` (NEW VIEW)

### User goals

- GM/admin leaves the play surface and enters a **dedicated world control plane** (Cast / Places / Stories / systems modules / board entry).  
- Player/`user` never mistakes World for “another map panel.”  
- Return to map is one clear action; camera/context is not silently lost without feedback.

### Depth map

| Layer | Surface |
|-------|---------|
| L0 | HUD chip **World** (owner/admin only) — label + one-line “World studio” |
| L1 | Optional brief “Leaving map” toast or confirm **only if** unsaved map edits (Draw verts) — not a sheet of content |
| L2 | Full page `https://map.tableslop.org/world` — new chrome, larger typography, module rail |

### Happy path

1. On map, logged-in **admin/owner** sees **World** in HUD (not buried in overflow).  
2. Click **World** → browser navigates to `/world` (or hard route change).  
3. First paint: distinct title “Isla Primavera · World”, module rail (Cast / Places / Stories / Weather… / **Action Board** entry), no map canvas behind translucent chrome.  
4. User works modules (Overview → Detail → Advanced per worldeditor contract).  
5. Click **Back to map** / brand home → returns to `/` with last camera (lat/zoom) restored when stored.

### Edge cases

| Case | Behavior |
|------|----------|
| Unsaved Draw verts on map | Dialog: Save / Discard / Cancel — cancel stays on map |
| `user` / anon clicks World URL | 403 page or redirect to map + Login CTA — no empty studio |
| Legacy `/worldeditor` | 302 → `/world` |
| Mid-Phone call | Leaving map parks call state server-side; World shows “Call in progress — return to map” banner if applicable |
| Slow load | Skeleton modules + error region; never blank black with no Back |

### Accessibility

- World chip: visible label (not icon-only); `aria-label="Open World studio"`.  
- L2 page: skip link “Skip to modules”; focus lands on H1.  
- Contrast: vaporwave HUD accents must meet WCAG AA on L2 forms.  
- Keyboard: Tab through module rail; Enter activates; Escape does **not** trap user on L2 (use explicit Back).

### Acceptance checklist

- [ ] World is a **full page** (URL `/world`), not a Side Sheet over the map.  
- [ ] Removing the map HUD chrome still leaves a branded World destination (brand test).  
- [ ] Non-editors cannot reach edit surfaces.  
- [ ] Back restores map; unsaved Draw is gated.  
- [ ] No Hub Chars escape hatch on `/world`.  
- [ ] NEVER writes `regions-ui.json` from World flows.

---

## Flow 2 — 2D map overlay toggles (roads · wind · water · logistics · pins)

### User goals

- Read the island like Google Maps: **roads/highways** as primary spatial truth.  
- Layer environmental/sim overlays (wind, water, logistics) without drowning pins.  
- Toggle layers independently; remember preference per browser session (and later account).

### Depth map

| Layer | Surface |
|-------|---------|
| L0 | Overlay chip group or single **Layers** chip with active-count badge (`3 on`) |
| L1 | Layers Side Sheet / dock: checklist + legend swatches + “Solo this layer” |
| L2 | Optional deep legend page under `/world` Transport (status-only) — not required for toggle |

**/3d:** shelved — no 3D toggle in this flow; do not advertise `/3d` as product path.

### Happy path

1. User opens **Layers** (L0 → L1).  
2. Toggles **Roads** on → GMaps-style strokes + shields from highway/road SoT (`layers.json` / highway track — **not** region border polys).  
3. Toggles **Wind** / **Water** / **Logistics** → translucent pattern overlays with legend.  
4. Toggles **Pins** → place markers + labels (frozen GM coords).  
5. Closes sheet; L0 badge reflects on-count; map remains interactive.

### Edge cases

| Case | Behavior |
|------|----------|
| Roads data missing | Empty state: “Road layer not loaded” + retry; map art still visible |
| Wind/weather not generated yet | See Flow 6 — “No weather yet” |
| All overlays on | Soft warn in L1: “Dense view — try Solo”; do not auto-disable |
| Logistics + pins clash | Z-order: roads under pins; logistics under pins; wind/water under roads |
| Mobile | L1 = Bottom Sheet or full-width Side Sheet; checkboxes ≥44px targets |
| Region borders | Out of scope for this toggle set — **never** clear/edit `regions-ui` here |

### Accessibility

- Each toggle: `role="switch"` + `aria-checked` + visible On/Off text.  
- Legend not color-only (pattern + label).  
- Announce layer change via polite live region (“Roads on”).  
- Keyboard: arrows move between toggles; Space flips.

### Acceptance checklist

- [ ] Roads read as primary GMaps-style layer when on.  
- [ ] Wind / water / logistics / pins independently toggleable.  
- [ ] L0 shows how many layers are active.  
- [ ] Missing data uses empty/failure copy (Flow 6), not silent blank.  
- [ ] No `/3d` entry in Layers UI.  
- [ ] No path touches `regions-ui.json`.

---

## Flow 3 — GM/admin Action Board (threads · beats · branches · resolve · World-delta)

### User goals

- GM sees **branching story threads** as a board (lanes + beat nodes), not a chat dump.  
- Resolve / advance a beat and **jump to World delta** impact (places/cast/systems) without leaving the mental model.  
- Players may see read-only status later (GM decision); default plan: **GM/admin only** for edit.

### Depth map

| Layer | Surface |
|-------|---------|
| L0 | Map HUD chip **Board** (admin/owner) — open thread count + hottest beat title |
| L1 | Compact lane strip Side Sheet: thread titles + status dots (scan) |
| L2 | Full **Action Board** page (prefer under `/world/board` or World module) — lanes, nodes, weights, resolve |

### Happy path

1. GM opens Board from HUD or World rail → **L2** board (not a Dialog).  
2. Sees **thread lanes** (columns or swimlanes): e.g. Carnival / Patrol / Rival.  
3. Clicks a **beat node** → detail pane (master–detail on desktop; Side Sheet on mobile): summary, branch options, **weights**, linked entities.  
4. Adjusts branch weight / picks outcome → **Resolve**.  
5. Confirm Dialog (short): “Write World delta?” → Yes commits; UI offers **Open World delta** jump (Cast/Places/Weather patch list).  
6. Board node shows Resolved; L0 count decrements.

### Edge cases

| Case | Behavior |
|------|----------|
| Conflict / stale version | Refresh node; show “Board changed — reload” — no silent clobber |
| Resolve with no delta | Allowed but warn “No World writeback linked” (GM may still close beat) |
| Empty board | Empty state: “No open threads — seed from Stories or Inbox” |
| `user` role | Chip hidden; deep link → forbidden |
| Long resolve log | Scrollable pane in L2 detail — never a modal wall of text |
| Mandatory writeback policy | Product rule: resolve **should** attach World delta when entity-linked; UX blocks soft-resolve only if GM enabled “require delta” |

### Accessibility

- Lanes: keyboard reorder only if explicitly supported; otherwise Tab order = visual order.  
- Nodes: button semantics; selected state `aria-current`.  
- Weights: numeric steppers with text values, not drag-only.  
- Focus after Resolve: move to next open beat or delta jump CTA.

### Acceptance checklist

- [ ] Board is L2 (full page / World module), not HUD-only chips.  
- [ ] Thread lanes + beat nodes + branch weights visible.  
- [ ] Resolve path offers World-delta jump.  
- [ ] Short Dialog for confirm only; logs stay in L2 scroll panes.  
- [ ] Role-gated; version conflict surfaced.  
- [ ] NEVER wipes region borders as a side effect of delta.

---

## Flow 4 — Phone: keypad 911 → dispatch triage → live call (vs non-emergency)

### User goals

- Diegetic **emergency** path feels distinct from casual dial: urgency, triage, live voice channel.  
- Non-emergency calls/texts stay calm and app-like (Contacts / Recents).  
- Failure modes (busy circuits, robotic placeholder voice) are honest and diegetic (Flow 6).

### Depth map

| Layer | Surface |
|-------|---------|
| L0 | HUD **Phone** chip — orange idle → turquoise active; badge if in-call |
| L1 | Phone dock fills right panel: HOME launcher → Phone app keypad |
| L2 | Optional full-screen call UI on mobile (immersive); desktop can stay L1 expanded |

### Happy path — emergency (911)

1. Open Phone → HOME → **Phone** app → keypad.  
2. Dial **911** (or island emergency short code if authored) → primary CTA becomes **Emergency call** (distinct color/label from Call).  
3. Connect → **Dispatch triage** screen (L1/L2): location prompt (auto map pin if PC known), nature of emergency (chips), severity.  
4. Submit triage → **Live call** state: timer, dispatch voice/audio channel, mute/end, optional “share pin.”  
5. End call → Recents shows emergency entry with triage summary (GM-visible fields flagged).

### Happy path — non-emergency (contrast)

1. Keypad dial ordinary number / Contacts pick → **Call** (neutral).  
2. Ringing → connected without triage form.  
3. In-call chrome quieter (no severity chips); End → Recents normal.

### Edge cases

| Case | Behavior |
|------|----------|
| 911 with no weather / storm | Allow call; triage may note “circuits degraded” (Flow 6) |
| Dispatch busy | Queue UI + retry; diegetic hold tone — not infinite spinner |
| Not logged in / no PC linked | Can open Phone demo keypad; emergency may be sim-only with banner |
| Accidental 911 | Confirm Dialog before connect (“Call emergency dispatch?”) — one tap cancel |
| Mid-call navigate to World | Park call; banner to return (Flow 1) |
| Text-only mode | Keypad still works; show “Voice unavailable — transcript mode” |

### Accessibility

- Keypad buttons ≥44px; `aria-label` digits; announce typed number.  
- Emergency CTA not color-only (icon + text “Emergency”).  
- Live call: visible timer; End is always keyboard-reachable; do not rely on audio alone for state.  
- Reduce motion: skip pulsing emergency animations when `prefers-reduced-motion`.

### Acceptance checklist

- [ ] 911 path shows triage before live call.  
- [ ] Non-emergency skips triage and uses calmer chrome.  
- [ ] Accidental 911 confirm exists.  
- [ ] In-call state visible on L0 Phone chip.  
- [ ] Busy / robotic / no-voice failures use Flow 6 copy.  
- [ ] Phone dock resizable; fills dock on desktop (product HUD rule).

---

## Flow 5 — Pin radiate (core → belt → support → fringe)

### User goals

- GM authors/reads place density with a clear **mental model**: high foot-traffic core radiates outward.  
- UI mirrors rings so generators and pin tools do not feel random.  
- Inspecting a district shows which ring pins belong to — without editing frozen GM coords accidentally.

### Depth map

| Layer | Surface |
|-------|---------|
| L0 | Optional ring-mode glyph on Layers / Pins (“Rings”) when pin radiate view on |
| L1 | Pin inspector Side Sheet: place name, ring badge (core/belt/support/fringe), linked businesses/people counts |
| L2 | World Places detail or generator preview page with ring diagram + lists |

### Happy path

1. GM enables **Pin rings** (Layers or Pins tool).  
2. Map draws soft concentric / voronoi-tinted bands around a selected **core** (city foot-traffic seed).  
3. Pins colored/badged by ring: **core → belt → support → fringe**.  
4. Click pin → L1 inspector shows ring + “why here” (generator coupling stub).  
5. GM jumps L2 Places to edit entity metadata (not coordinates unless Edit mode + permission).

### Edge cases

| Case | Behavior |
|------|----------|
| No core selected | Prompt: “Select a city core pin first” |
| Overlapping cities | Rings scoped to active city; legend shows city name |
| Frozen pins | Drag disabled; message “Pins frozen — ask to unfreeze” |
| Empty fringe | Valid — show “Fringe sparse” not error |
| Generator not run | Rings visible as planned bands; pin list empty with CTA to run pregen (deterministic) |

### Accessibility

- Ring meaning in text badges, not only hue.  
- Inspector heading includes place + ring.  
- Keyboard: cycle pins in ring order (core first).

### Acceptance checklist

- [ ] Four rings named consistently: core, belt, support, fringe.  
- [ ] L1 inspector shows ring membership.  
- [ ] Does not move frozen pins.  
- [ ] NEVER rewrites `regions-ui` polys to “fit” rings.  
- [ ] Empty fringe is a valid empty state, not a failure.

---

## Flow 6 — Failure / empty states (weather · storm circuits · robotic voice)

### User goals

- Know **why** something is missing without leaving diegesis when possible.  
- Distinguish **not built yet** vs **busy/degraded** vs **placeholder audio**.  
- Always offer a next action (retry, open World weather, use text fallback).

### Shared empty-state pattern (L0 → L1)

| Severity | L0 | L1 |
|----------|----|----|
| Empty (not yet) | Quiet badge / muted chip | Title + one sentence + primary CTA |
| Degraded (busy) | Warning tone on chip | Explain + Retry / Wait |
| Placeholder | “Sim” / “Temp voice” tag | Honest: robotic TTS until PC voice pipeline |

### Copy contracts (lock wording intent — FE may tune)

| State | User-facing meaning | Next action |
|-------|---------------------|-------------|
| **No weather yet** | Diegetic clock/weather sim not seeded for this date | “Open World · Weather” (admin) / “Weather unavailable” (player) |
| **Storm — busy circuits** | Emergency/Phone capacity degraded during storm phenomenon | Retry · Text dispatch · Wait; show ETA if known |
| **Robotic voice placeholder** | Live call audio is stand-in TTS, not final PC voice/moans pipeline | Continue call · Switch to transcript · (GM) flag voice job |

### Happy path (recovery)

1. User hits empty/degraded state in Layers, Phone, or World Weather.  
2. L1 explains severity + cause class (empty vs busy vs placeholder).  
3. User takes CTA → success clears banner; L0 returns to nominal.

### Edge cases

| Case | Behavior |
|------|----------|
| Weather empty + 911 | Call still allowed; triage notes weather unknown |
| Placeholder voice + reduced motion | Prefer transcript emphasis |
| Repeated fail | After N retries, stop auto-retry; show “Report to GM” only if inbox wiring exists — no spam |
| Admin vs player | Admin CTAs deep-link World; players get diegetic wait/retry only |

### Accessibility

- Do not convey severity by color alone (icon + text).  
- Live region announces state changes once (no chatter).  
- Placeholder audio: visible caption/transcript option always.

### Acceptance checklist

- [ ] Three states distinguishable: no weather / busy circuits / robotic placeholder.  
- [ ] Each state has a next action.  
- [ ] 911 not hard-blocked solely by missing weather.  
- [ ] No silent failures (blank overlay with no copy).  
- [ ] Admin paths can reach World Weather without Hub detour.

---

## Cross-flow acceptance (ship bar)

- [ ] L0 stays scannable; long work lives in L1 sheets or L2 pages.  
- [ ] `/world` and Action Board feel like **new views** (URL + chrome change).  
- [ ] Phone emergency ≠ non-emergency chrome.  
- [ ] Overlay toggles never touch `regions-ui.json`; `/3d` not offered.  
- [ ] Pin radiate vocabulary matches generator docs (core→fringe).  
- [ ] Empty/failure copy implemented before “pretty” loading spinners.  
- [ ] Pixel 3a / ≤720px: Side Sheet or full-screen L2; targets ≥44px; Phone dock usable.  
- [ ] Focus restore on close; Escape closes L1 only; L2 uses explicit Back.

---

## Open GM questions (do not guess in code)

1. Action Board: **GM-only** forever, or read-only player visibility for some threads?  
2. Emergency short code: keep **911** diegetic, or island-specific number?  
3. Pin rings: visible to players or GM overlay only?  
4. Session persistence for Layers preferences: local only vs Discord-linked profile?

---

## Out of scope (this plan)

- Product implementation / API shapes (hand to `role-frontend` / `role-backend`).  
- Heightmap / `/3d` camera work (**shelved**).  
- Any edit, clear, or regenerate of `regions-ui.json`.  
- Hub embedding of map World tools (Hub remains link-out only).
