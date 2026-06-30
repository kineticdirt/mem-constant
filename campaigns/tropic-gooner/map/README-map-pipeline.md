# Map asset pipeline (Options A + C)

## Hybrid mode (recommended)

**Terrain raster** (AI or Lanczos, whole-image — no panel seams) + **UI labels** in the browser from `map.json`.

```bash
cd scripts/tableslop
npm install   # once
npm run map:hybrid
```

- Prefers `map/source/canva-terrain.png` (Canva export with **all text hidden**).
- Falls back to `output-onlinetools4k.png` until terrain export exists.
- Sets `map.json` → `"label_layer": "ui"`.
- Optional AI: install [Real-ESRGAN ncnn-vulkan](https://github.com/xinntao/Real-ESRGAN/releases) or set `REALESRGAN_BIN`.
- Force Lanczos: `npm run map:hybrid -- --no-ai`

See `map/source/README-canva-terrain.md`.

---

## One command (panel mode — legacy)

```bash
cd scripts/tableslop
npm install   # once
npm run map
```

Splits the source into ~1024px panels, enhances **each panel** (Lanczos + contrast + sharpen), stitches, builds tiles, writes previews to **`map/pipeline/output/`**.

Default input: `map/output-onlinetools4k.png`

**Review output:** `map/pipeline/output/contact-sheet.jpg` (all panels), `thumb.jpg`, `master-enhanced.png`

Options: `--preset map-gentle`, `--panel-max 768`, `--cols 2 --rows 2`

---

**PC-only** — run on desktop, deploy outputs to linuxbox. No AI.

## Why this exists

- **Option C (Lanczos):** 2× upscale from your Canva export — sharp text, no hallucinated labels.
- **Option A (tile pyramid):** deep zoom without loading a giant PNG — browser fetches 256px WebP tiles.

## Contrast + sharpen (no AI)

The blurry `output-onlinetools4k.png` is **2048×2088** (not true 4K). Re-process with:

```bash
node process-map.mjs \
  --input ../../campaigns/tropic-gooner/map/output-onlinetools4k.png \
  --output ../../campaigns/tropic-gooner/map/source/master-enhanced.png \
  --preset map-default
```

**Presets**

| Preset | Scale | Use when |
|--------|-------|----------|
| `map-default` | 2× | Blurry 1080p/2K Canva export (default) |
| `map-gentle` | 1.5× | Already sharp, just needs a lift |
| `contrast-only` | 1× | No resize — contrast + mild sharpen only |

Tune manually: `--scale 2 --contrast 1.15 --sharpen 0.4 --norm-low 2 --norm-high 98`

Full pipeline (enhance + tiles):

```bash
node run-pipeline.mjs --input ../../campaigns/tropic-gooner/map/output-onlinetools4k.png --preset map-default
```

Outputs **`master-enhanced.png`** (~4096×4176 from the 2048 source).

## Quick start

### 1. Install (once, on PC)

```bash
cd scripts/tableslop
npm install
```

### 2. Add your Canva master

**Best:** export **one PNG** from Canva (full map, max resolution) → save as:

`campaigns/tropic-gooner/map/source/canva-master.png`

**Or** export a **grid of tiles** (no overlap) into:

`campaigns/tropic-gooner/map/source/tiles/`

Name them in row order: `01.png`, `02.png`, … and note your grid size (e.g. 2×2).

### 3. Run pipeline

Single export:

```bash
cd scripts/tableslop
node run-pipeline.mjs --input ../../campaigns/tropic-gooner/map/source/canva-master.png
```

Grid stitch + pipeline:

```bash
node run-pipeline.mjs --stitch-dir ../../campaigns/tropic-gooner/map/source/tiles --cols 2 --rows 2
```

Optional `--scale 1.5` or `--scale 2` (default **2**).

### 4. Point map.json at outputs

After a successful run, edit `map/map.json`:

```json
"base_image": "map/master-lanczos.png",
"tile_pyramid": "map/pyramid.json"
```

Keep `base_image_2k` as fallback preview if you want; the viewer hides 2K/4K toggle when tiles are active.

### 5. Deploy to linuxbox

```bash
# from PC repo root — adjust if your paths differ
scp -i ~/.ssh/id_rsa_potato campaigns/tropic-gooner/map/master-lanczos.png \
  campaigns/tropic-gooner/map/pyramid.json \
  abhinav@100.122.108.94:~/agent-dump/campaigns/tropic-gooner/map/

scp -i ~/.ssh/id_rsa_potato -r campaigns/tropic-gooner/map/tiles \
  abhinav@100.122.108.94:~/agent-dump/campaigns/tropic-gooner/map/

scp -i ~/.ssh/id_rsa_potato scripts/linuxbox/tableslop-server.js \
  abhinav@100.122.108.94:~/agent-dump/scripts/linuxbox/

ssh -i ~/.ssh/id_rsa_potato abhinav@100.122.108.94 \
  "sudo systemctl restart linuxbox-tableslop"
```

Verify: `curl -s https://map.tableslop.org/api/map | grep tile_pyramid_ready`

## Outputs

| File | Purpose |
|------|---------|
| `source/master-stitched.png` | Grid stitch (if used) |
| `source/master-lanczos-2x.png` | Lanczos master |
| `master-enhanced.png` | Flat fallback for `/map-image` (~4096px after 2×) |
| `pyramid.json` | Tile metadata for viewer |
| `tiles/{z}/{y}/{x}.webp` | Deep-zoom tiles |

## Canva stitching tips

- Prefer **one PNG export** — avoids seam issues.
- If you must stitch crops: use **non-overlapping** grid exports; overlap needs manual alignment (not in this script yet).
- Export at **highest resolution** Canva allows before any AI upscale elsewhere.

## Individual steps

```bash
node stitch-tiles.mjs --input .../tiles --output .../master-stitched.png --cols 2 --rows 2
node upscale-traditional.mjs --input .../master-stitched.png --output .../master-lanczos-2x.png --scale 2
node build-pyramid.mjs --input .../master-lanczos-2x.png --out-dir .../tiles --manifest .../pyramid.json
```

## Viewer behavior

When `pyramid.json` exists and loads:

- Map uses **tile layer** + pan/zoom camera (loads only visible tiles).
- Pins stay **percent-based** on native width/height from pyramid manifest.
- `/map-image` still serves flat PNG as fallback.
