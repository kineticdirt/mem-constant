# Map system — automation, scale, 3D, and determinism

You (and LLMs) are **non-deterministic**; battle maps for play need **deterministic** outputs: same **spec + same generator version** → **same bytes** (SVG, glTF, collision mesh). The fix is **not** “let the model draw the map in the final step.” It is:

| Layer | Role | Deterministic? |
|-------|------|----------------|
| **Ideation** | Brainstorm wings, themes, beats; draft ASCII in chat | No — and that’s fine |
| **Spec** | Grid strings, tile catalog, entity seeds, version pin | **Yes** — canonical source (JSON/YAML in git) |
| **Generator** | `python …` → SVG / meshes / API payloads | **Yes** — no `random()` unless **seeded** and stored in spec |
| **Review** | Human edits spec; CI fails if spec invalid | Yes |

So: **use non-deterministic tools only to produce or edit the spec**, then **freeze** it and **regenerate** everything from that freeze.

---

## “More of the map” — the whole base

Session 1 today is one **floor graph** (22×31) in code. Scaling up:

1. **Floor = one spec file** — `cols`, `rows`, `cell_px`, `grid: string[]`, optional `layers[]`.
2. **Station = manifest** — ordered list of floors + offsets if you ever stitch a “map of maps” (or keep separate files per room).
3. **Generator** reads manifest → emits one SVG per floor (and later one glTF per floor, same inputs).

The **atom table** in [[vtt-platform-feature-breakdown]] still applies; you’re adding **many** `M-02` tiles worth of data, not changing the math.

---

## Interaction

| Stage | What |
|-------|------|
| **Now** | `map_studio_server.py` + regen from `build_session01_svgs.py` |
| **Next** | Web editor that **only edits JSON** (paint tiles → updates spec → regen) — still deterministic on save |
| **Play** | Planar Ally / your future client reads **image + grid metadata** exported from the same spec |

Nothing requires the LLM at runtime for the **published** artifact.

---

## 3D (same spec, extra backends)

One **logical grid** can drive:

| Output | Idea |
|--------|------|
| **2.5D** | Extrude wall cells to height `h`; floor = quad; export **glTF** or **OBJ** |
| **Heightmap** | Optional per-cell height in spec for ramps / stairs |
| **Viewer** | **Three.js** / **Godot** / **Blender** import — all deterministic from the same file |

**Rule:** 3D pipeline is another **pure function** `spec → mesh`, version-pinned with the spec. If you use an LLM to **suggest** wall heights, that suggestion becomes **numbers in the spec**, not a one-off mesh.

---

## LLM in the loop (safe pattern)

1. “Design me a 40×30 cargo wing with three choke points” → model outputs **draft ASCII + prose**.  
2. You paste into `cargo-wing-v0.json` (or merge via script).  
3. `validate_floor_spec.py` + `generate_from_spec.py` (evolving) → SVG.  
4. Diff in git. **No** “generate SVG directly from chat” as the only source.

That way **creativity** stays, **repeatability** stays.

---

## Artifacts in this repo

| Path | Purpose |
|------|---------|
| [[../sessions/session-01/maps/schemas/floor-spec.v1.schema.json]] | JSON Schema for one floor |
| [[../sessions/session-01/maps/tools/export_z0_grid_json.py]] | Dump current Z0 continuous grid to JSON (example for round-trip) |
| [[../sessions/session-01/maps/session-01-map-spec.json]] | Existing high-level contract (grid size, outputs) |

---

## Honest limit

A **full** 3D engine + live multiplayer is a product; this vault can hold **specs + deterministic exporters + docs**. The “non-deterministic being” (you + models) belongs in the **spec authoring** step — not in the **release build**.

---

## See also

- [[vtt-map-platform-proposal]] · [[vtt-platform-feature-breakdown]]
