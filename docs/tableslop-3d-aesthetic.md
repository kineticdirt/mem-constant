# Tableslop 3D — aesthetic spec (Isla Primavera)

Stylized 3D view of the GM-drawn region borders at `map.tableslop.org/3d`.
Implementation: `scripts/linuxbox/tableslop-static/3d/` (`index.html`, `app.js`),
vendored three.js inside it at `vendor/three/` (pinned, see its README). Server mount
is owned by central integration — see `scripts/linuxbox/tableslop-static/3d/INTEGRATION-NOTE.md`.
Rendering is 100% client-side; the server only streams statics + `/api/map`
(+ optional `/api/cities/<id>`).

Direction: **American Hawaii / Cuba** — Havana meets Honolulu. Pastel stucco, red
barrel tile + flat parapet roofs, art-deco trim, palms, hard bright sun, saturated
sky. Flat-shaded low-poly. Charming, not realistic. Three named regions diverge on
purpose (GM direction): Paradise leans havana-vieja art deco, Porto Lujara is a
working industrial dock town, Jackedsonville (Crimson Quay) glows neon.

All generation constants live in `CFG` at the top of `app.js` — **keep this doc and
`CFG` in sync.** Distances below are in viewBox units (`vu`, map viewBox `0 0 100 100`);
the world root scales vu × `CFG.scale` (2) for display.

## Base palette (default "tropical" profile)

| Role | Hexes |
|---|---|
| Walls (pastel stucco) | mint `#a8d8b9` · coral `#f2997b` · butter `#f2d383` · faded turquoise `#8fcfc9` · cream `#f5ebd7` · pink `#f4b8c1` · pale peach `#f2c4a0` · faded lime `#cfe0a8` |
| Barrel-tile roofs | `#b5523f` · `#c96a4a` · `#a84638` · `#c25b45` |
| Flat roofs (concrete) | `#c9bfa9` · `#d6cbb2` |
| Deco trim | `#faf6ec` (warm white) |
| Landmark accents | trim white `#faf6ec` · deco pink `#e8788a` · deco blue `#7fb8d8` |
| Palms | trunk `#8a6a4a` · crowns `#3e8a5a` `#4aa06a` `#357a50` |
| Island | sand `#eee2bd` · wet-sand shelf `#dfcaa2` |
| Sea (layered discs) | shallow `#8fd8cc` · mid `#3fb3c6` · deep `#2a90ba` |
| Sky / fog / sun | sky `#63c5f0` · fog `#a8e0f2` · sunlight `#fff2cf` |

Region ground tint = area `fill` lerped 62% toward sand, so districts keep their 2D
map identity as a whisper (fills are saturated — stronger lerp keeps the pastel read).
Border lines use the area `stroke` at 55% opacity — GM borders stay visible.
Beach band: convex-hull blob scaled ×1.045 (sand) over ×1.10 (wet sand) — slim,
so the sea gradient stays visible from the default camera.

## Region style profiles (`STYLE_PROFILES` in `app.js`)

Default profile = "tropical" (base palette + base ratios). Overrides:

| Region | Label | Skin |
|---|---|---|
| `r01-paradise` | art deco | Base palette; `trimRoofChance` 0.48 — nearly half the flat roofs wear warm-white deco slabs; landmarks keep their two-step caps. Havana-vieja read. |
| `r02-porto-lujuria` | docks | Weathered industrial walls (concrete/zinc/brick `#b8b2a4` `#a89f8e` `#c4bda6` `#93a1a8` `#b09482` `#8f8578`); metal flat roofs `#7d8a92` `#98a4a8` `#6e7a80`; `gabledChance` 0.08, `trimRoofChance` 0.06, `palmChance` 0.32 (a working port has few palms); **14 crate/container stacks** (`#a85a3f` `#5a7a8a` `#8a6a3a` `#4a6a5a` `#7a4a58`) scattered on lots. |
| `r03-crimson-quay` | neon | Jackedsonville after dark-in-the-sun: deeper stucco (plum/wine/slate `#6a4a62` `#4a5a72` `#7a3a4e` `#3e4a5e` `#8a4a5a` `#5a3e5e`), dark roof slabs `#2e2438` `#3a2f45`, `trimRoofChance` 0.55 with **neon trim palette** `#ff2e6e` `#ff71ce` `#01cdfe` `#b967ff` rendered as **unlit (MeshBasicMaterial) slabs** so they read as glowing signage; landmark caps are neon too. |

Style is a skin over the generic generator: geometry, subdivision, height bands and
seeding stay region-agnostic. New region styles go in `STYLE_PROFILES` — not into
the placement code.

## City maps (district-level styling, optional)

When `/api/cities/<region-id>` is mounted (INTEGRATION-NOTE §2) and a generated city
map exists (`campaigns/tropic-gooner/map/cities/<id>.json`), each lot is tested against
that region's district polygons (same viewBox space). Lots in a district whose
name/note matches `DOCKS_RE` (`muelle|dock|warehouse|lonja|wharf|harbor|puerto`) are
built with the industrial walls/metal-roof set and 30% of the region's gabled chance —
e.g. Porto's Warehouse Row and Muelle Viejo read as working docks while Casco Antiguo
stays colonial. Without the route (404), the page degrades to region-wide styling.
The fetched city file text joins the seed, so GM district edits reseed that region.

## Ratios

- **Roofs:** `gabledChance` 0.32 barrel-tile prism; the rest flat slabs (9% overhang
  = parapet read). Of flat roofs, `trimRoofChance` 0.3 get warm-white deco slabs.
  (Per-profile overrides in the table above.)
- **Empty lots:** `emptyLotChance` 0.12 (plazas/parking); half of those get a courtyard palm.
- **Footprint:** 58–80% of the block cell per axis; ±8% position jitter; ±0.03 rad
  rotation jitter (grid reads as Havana blocks, not graph paper).

## Height bands (stories; `storyH` = 0.42 vu)

District profile is derived from polygon **area** — data-driven, no per-region hardcodes:

| Profile | Area (vu²) | Buildings | Landmark (1 per region, nearest centroid) |
|---|---|---|---|
| village | < 20 | 1–3 stories | 4–6 stories |
| town | 20–60 | 1–4 stories | 6–8 stories |
| core | ≥ 60 | 2–5 stories | 8–10 stories |

Landmarks wear a landmark accent color and a two-step deco cap (72% then 45% footprint
trim slabs — neon slabs in the neon profile). Everything else follows its profile palette.

## Palms

- Border walk: one palm site every `palmSpacing` 2.4 vu along each region edge by
  accumulated arc length (GM polys have dense short segments), kept with `palmChance`
  0.7 (per-profile override), pulled a fixed 0.4 vu inland (proportional pulls strand
  palms on tiny polygons), capped at `maxBorderPalms` 42 per region.
- Courtyard palms: 50% of empty lots (`courtyardPalmChance`, per-profile override).
- Form: 5-sided tapered cylinder trunk (0.5–0.85 vu tall, ≤9° lean) + flattened
  icosahedron crown (scale-y 0.55). Two global instanced meshes total.

## Seeding (determinism)

`seed = xmur3(area.id + '|' + String(area.points) + '|' + cityMapTextOrEmpty)` →
`mulberry32`. The raw points string is in the hash, so **the same polygon always
yields the same city**, and any GM border edit reseeds (and regenerates) only that
region; a loaded city map joins the hash so district edits reseed too. One PRNG
stream per region, consumed in fixed order: lot loop (empty-lot roll, courtyard palm,
stories, footprint, jitter, wall color, roof rolls) → border palms → crates.
Insert new consumption at the END of the stream or you reshuffle the city.

## Generation algorithm (as built)

1. Parse area points (string `"x,y …"` or flat array forms tolerated), dedupe
   closing echo, skip areas with < 3 points.
2. Inset the polygon 0.55 vu by centroid-shrink; lot centers must be inside the
   inset AND the original polygon (centroid-shrink is approximate — PIP against the
   original is the real guard; upgrade path: clipper offset).
3. Grid-over-polygon subdivision: cell = clamp(sqrt(area/150), 0.9, 3.4) vu →
   block centers that pass PIP become buildable lots (0.9 floor = hamlet blocks,
   so even ~6 vu² regions like Puckall get a few lots).
4. Place one building mass per lot (box extrusion, height by profile band),
   12% empty lots, landmark at the most-central lot; palette/roof rules come from
   the region style profile, with docks-keyword districts switching to industrial.
5. Palms per the palm rules; crates per the docks profile; region ground tint +
   border line; canvas-sprite label floats 2.6 vu above the tallest building.

## Mesh / draw-call budget

Everything per archetype is one `InstancedMesh` with per-instance colors:
walls, flat roofs (+deco caps), gabled roofs, palm trunks, palm crowns, crates,
neon trim (unlit basic material) = **≤ 7 draw calls for all geometry**, plus per
region: ground, border line, label sprite (~3 × N regions), plus 6 sea/island base
meshes. ≈ 40 draw calls, well under 100k triangles, pixel ratio capped at 2 —
phone-safe (SwiftShader CI included).

## Artist upgrade path — GLTF slot per archetype

The seven archetypes (wall mass, flat roof, gabled roof, palm trunk, palm crown,
crate, neon trim) are deliberately boring primitives so a future artist can swap in
real models:

1. Export one GLB per archetype, authored to the same **1×1×1 vu bounding box**
   (base at y=0, centered in XZ) so existing instance matrices apply unchanged.
2. Load with `GLTFLoader` (vendor `examples/jsm/loaders/GLTFLoader.js` like
   OrbitControls), take `gltf.scene`, and replace the geometry in the matching
   `buildInstanced(...)` call — or use one `InstancedMesh` per GLB sub-mesh.
3. Keep per-instance `instanceColor` as a tint over a mostly-white albedo, or bake
   4–6 color variants per archetype and index them with the same `pick(palette)` calls.
4. Budget rule stays: archetypes are instanced, never per-building scene nodes.

Other planned upgrades (not built, noted for honesty): true polygon-offset inset
(clipper), concave island hull (alpha shape over the convex blob), soft shadows
(shadow map off for phone), day/night to match the 2D Day toggle (the neon profile
is the natural night mode for Crimson Quay), streets layer from city-map `streets[]`.

## Minecraft-like elevation + roads (2026-08-10)

The 2D map art is a **guide** for ground height and freeways — not flat chrome.

| Piece | Path / rule |
|-------|-------------|
| Bake | `scripts/tableslop/bake-isla-heightmap.py` → `map/heightmap-256.bin` + `roadmask-256.bin` + `heightmap-256.json` |
| Serve | `/map-heightmap-256.json`, `/map-heightmap-256.bin`, `/map-roadmask-256.bin` |
| Runtime | `scripts/linuxbox/tableslop-static/3d/terrain.js` |
| Grid | 256×256 over viewBox `0..100`; `maxH` 32; `blockH` 0.14 vu |

Never mutate `regions-ui.json` or frozen pins from this path.

## Isometric 2.5D board (default, 2026-08-10)

Product default is a **map board**, not a free-orbit voxel sandbox:

| Piece | Rule |
|-------|------|
| Terrain | Displaced plane textured with `/map-image?res=2k` (painted master) |
| Camera | `OrthographicCamera`, classic isometric tilt; **pan + zoom only** (`enableRotate=false`) |
| Cities | Existing pastel blocks/palms still sit on sampled height |
| Region tints | Very light (≈12% opacity) so the painted map stays readable |
| Debug | `?voxels=1` restores Minecraft column terrain |

HUD hint: drag to pan · scroll to zoom · click a district.
