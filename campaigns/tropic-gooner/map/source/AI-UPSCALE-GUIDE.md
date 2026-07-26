# AI upscaling from a 2K Canva base

You **do not** need a 4K export from Canva. The pipeline is:

```text
Canva max PNG (1024–2048px)  →  AI 2×  →  ~4096px master  →  UI labels in browser
```

Canva caps export resolution on your plan. That is normal. AI upscaling is how you get a sharp 4K **terrain** layer for zoom/pan tiles.

## Step 1 — Export from Canva (best you can get)

1. Hide **text** and **border/region line** layers (terrain + relief only).
2. Export PNG at **maximum** resolution your plan allows.
3. Save as `map/source/canva-terrain.png`.

If you cannot hide borders yet, export the full map anyway — use **Labels OFF** in the HUD until terrain-only exists.

**Your current files:**

| File | Size | Role |
|------|------|------|
| `output-onlinetools-2k.png` | 1024×1044 | Low — avoid as AI input |
| `output-onlinetools4k.png` | 2048×2088 | **Best existing input** (already one web upscale) |
| `canva-terrain.png` | (you add) | **Best** — fresh Canva max, no baked labels |

## Step 2 — Install AI backend (PC, once)

**Recommended — PyTorch/CUDA** (no checkerboard, works on RTX 5070 Ti):

```bash
cd scripts/tableslop
npm run map:install-esrgan-py
```

Fallback — ncnn-vulkan (often tiles badly on dual-GPU):

```bash
npm run map:install-esrgan
```

## Step 3 — Run hybrid pipeline

```bash
cd scripts/tableslop
npm run map:hybrid              # PyTorch AI → 4K, UI labels
npm run map:hybrid -- --no-ai     # smooth native only (no GPU)
npm run map:hybrid -- --scale 2 --input ../../campaigns/tropic-gooner/map/source/canva-terrain.png
```

Deploy when happy:

```bash
bash scripts/linuxbox/push-tableslop-map.sh
```

## Backend order (automatic)

1. **PyTorch Real-ESRGAN** (`ai-upscale-pytorch.py`) — tile 512 + pad 32, seamless
2. ncnn-vulkan portable — if PyTorch missing; may checkerboard / OOM
3. **smooth Lanczos** — `--no-ai` or all AI failed

Env tuning (optional):

```bash
set REALESRGAN_TILE=512
set REALESRGAN_TILE_PAD=32
set REALESRGAN_GPU=0
```

## What not to use

- [Normal Map Upscaling](https://openmodeldb.info/collections/c-normal-map-upscaling) — RG0 normals only, not RGB maps.
- Chaining **two** AI upscales (2K web tool → another 2×) — mush. Prefer **one** AI pass from the cleanest Canva PNG.

## OpenModelDB (optional later)

Game-texture models ([RealisticRescaler](https://openmodeldb.info/models/4x-RealisticRescaler)) via **chaiNNer** if JPEG-heavy sources need deblocking — not wired into this pipeline yet.
