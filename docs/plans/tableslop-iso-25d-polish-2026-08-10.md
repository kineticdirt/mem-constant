# Isla Primavera /3d — isometric 2.5D polish (atomized)

**Holder:** `tableslop-iso-25d-polish`  
**Locked product:** Option 2 — orthographic isometric board + painted heightmesh (not free-orbit voxels).  
**Hard locks:** never wipe `regions-ui.json` / frozen pins; 3D stays HUD overlay; potato serves static only.

## Why (user ask)

Current `/3d` is “iso mode + heightmesh” but still reads as a cliffy prototype. Goal: a **full 2.5D map board** — painted art readable, gentler relief, places/pins, pan/zoom board UX — built in **small verified atoms**, parallel audits, regular checks.

## Waves + atoms

### Wave 0 — Audit (parallel, read-only) ✅ gate before code

| ID | Atom | Owner | Verify |
|----|------|-------|--------|
| A0.1 | Inventory `/3d` files + CFG/camera/terrain entrypoints | audit | file list + line refs |
| A0.2 | Height bake quality (cliffiness, UV vs master, roadmask) | audit | stats + UV hypothesis |
| A0.3 | Pin/marker data path from `/api/map` usable in 3D | audit | fields + coords space |
| A0.4 | Smoke gaps for iso25d (camera, texture, no-rotate) | audit | checklist of asserts |
| A0.5 | HUD embed (`embed=1`) + potato serve routes | audit | curl 200 list |

### Wave 1 — Terrain reads as map (not voxel cliffs)

| ID | Atom | Verify |
|----|------|--------|
| T1.1 | Smooth heightfield lightly in bake **or** client (box blur 1–2) | center still high; coast still 0 |
| T1.2 | Scale relief (`blockH` ↓ or `reliefScale`) for board read | max peak ~1.5–2.5 vu (tunable) |
| T1.3 | Confirm UV: PNG top = viewBox y=0; screenshot roads align cities | visual + optional UV flip flag |
| T1.4 | Keep `MeshBasicMaterial` map albedo; no Lambert wash | smoke `textureUrl` set |
| T1.5 | Optional vertical skirt / softer cliff normals | no huge tris jump |

### Wave 2 — Board camera + chrome

| ID | Atom | Verify |
|----|------|--------|
| C2.1 | Frame island in ortho frustum on load | full island in first paint |
| C2.2 | Pan + zoom only; rotate stays off | smoke `enableRotate` false / camera ortho |
| C2.3 | Fog/sea tuned so painted ocean readable | screenshot |
| C2.4 | Hint/HUD copy matches controls | index.html |

### Wave 3 — Places on the board

| ID | Atom | Verify |
|----|------|--------|
| P3.1 | Lift existing region labels to sampleH | labels not buried |
| P3.2 | Pin markers from `/api/map` (read-only) at height | count matches API; no regions-ui write |
| P3.3 | Click pin → panel or reuse region panel | click smoke |

### Wave 4 — Roads emphasis (without yellow invents)

| ID | Atom | Verify |
|----|------|--------|
| R4.1 | Painted green roads already on texture — verify visible | screenshot |
| R4.2 | Optional thin dark ribbon from `roadmask` *on* mesh (not SVG yellow) | roadCells used; no regions wipe |
| R4.3 | Leave `?voxels=1` as debug only | documented |

### Wave 5 — Verify + deploy

| ID | Atom | Verify |
|----|------|--------|
| V5.1 | Local/tunnel Playwright smoke PASS + new iso asserts | exit 0 |
| V5.2 | SCP 3d + bake if changed; potato curl 200 | evidence |
| V5.3 | Aesthetic doc + ledger Result | docs + AI_GROUPCHAT |
| V5.4 | regions-ui version unchanged | potato+PC version match |

## Check cadence (during creation)

After **each atom**: one concrete check (script self-check, curl, or smoke subset).  
After **each wave**: full smoke or screenshot review before next wave.  
No “big bang” merge of T+C+P+R without gates.

## Out of scope (this holder)

- Draw-highways UI (T2 from hwy template plan)
- Player walk / avatars
- Replacing 2D map
- Babylon / second app

## Subagent lanes (parallel)

1. **terrain-audit** — bake + mesh + UV + cliff hypothesis  
2. **camera-chrome-audit** — ortho framing, controls, fog, embed  
3. **pins-api-audit** — `/api/map` markers → 3D placement contract  
4. **smoke-gap-audit** — asserts to add for iso25d  
5. **docs-audit** — aesthetic.md ↔ live code  
6. (after Wave 0) implementers per wave — one wave at a time, verify, then next

## Wave0 check log (live)

- **2026-08-11T02:10Z** — Plan written; 5 audit subagents launched (terrain, camera, pins, smoke, docs).
- **2026-08-11T02:12Z** — PC heightfield cliff proxy: maxH=32, mean_land≈19.7, p95_|dx|=19, p95_|dy|=14, cells with |Δ|≥8 ≈4k/axis. peak_vu@blockH0.14=**4.48**. Suggested blockH≈**0.0625** for ~2 vu peaks (T1.2). Potato LAN SSH timed out once; recheck via tailnet.
- **2026-08-11T02:15Z** — **A0.3 DONE** (pins audit): `/api/map` → `markers[]` with `x_pct`/`y_pct` in same 0–100 viewBox as `sampleHeightVu`. `/3d` only uses markers for `city_map` today. Wave3 = read-only sprites/meshes + hitMeshes → existing panel; never POST coords / touch regions-ui / registry. Frozen LOCKED pins stay read-only.
- **2026-08-11T02:16Z** — **A0.4 DONE** (smoke audit): soft mode/camera OR gate is buggy (passes if either ok). Need hard asserts: `mode===iso25d`, `camera===orthographic-iso`, `textureUrl` includes `/map-image`, expose `enableRotate=false` on stats. Scratch needs local `/map-image` for offline painted smoke. Rename orbit shot → pan/zoom. Pin count asserts wait for Wave3.
- **2026-08-11T02:16Z** — **Docs audit DONE**: aesthetic iso section matches defaults (ortho, MeshBasic, `?voxels=1`); under-documents `TERRAIN_CFG`, fog/frustum/zoom, UV north, roadmask-iso-vs-voxels. Patch at Wave5; intro should list `terrain.js`.
- **2026-08-11T02:17Z** — **A0.5 DONE** (camera/embed): ortho+pan/zoom already OK. Framing keys off **region poly bbox** not full 100×100 mesh → first-paint clip risk. Fog near≈2.4E can wash ocean; prefer farther fog or drop sea discs when texture set. `embed=1` hides hint with no replacement — Wave2: board-extent frustum, fog/sea, minimal embed hint. Curl list logged for V5.2.
- **2026-08-11T02:18Z** — **A0.1+A0.2 DONE** (terrain): cliffs = `blockH=0.14` (~4.5 vu) + hard water=0 + light σ=0.8 + high mean land. UV OK (`1-z/100`). Wave1 order: **T1.2 `blockH→0.06`** + **T1.1 bake σ≈1.5–2** (water stay 0); T1.3 visual only; T1.4 assert; T1.5 skirt optional. **Wave0 GATE CLOSED** → start Wave1.
- **2026-08-11T02:25Z** — **Wave1 in progress:** `blockH=0.06` (peak≈1.92 vu). Bake: post-stretch gaussian σ=1.75 + coast cap≤8. Cliff proxy p95_|Δ| **19→8**. `sampleH` round-aligned with mesh. SELF_CHECK_OK. T1.5 skirt deferred.
- **2026-08-11T02:28Z** — **Wave2 DONE:** board frustum (100×100, margin 1.45E); fog E*5.5/14; no Lambert sea in iso25d; embed hint visible; `stats.enableRotate=false`.
