# Canva terrain-only export

For the **hybrid** map pipeline (smooth terrain raster + crisp UI labels in the viewer):

1. Open the Isla Primavera map design in Canva.
2. **Hide all text layers** (city names, region numbers).
3. **Hide border/region line layers** if they exist as separate groups (keeps terrain + relief only).
4. Export as PNG → save here as **`canva-terrain.png`** (same aspect ratio as the full map).

Optional: export borders alone (text hidden) → **`canva-borders.png`** for a future overlay layer.

Then rebuild:

```bash
cd scripts/tableslop
npm run map:hybrid
```

Until `canva-terrain.png` exists, hybrid falls back to `output-onlinetools4k.png` — baked borders stay on the raster and labels may **duplicate**. Use **Labels OFF** while comparing.

The pipeline now **does not 2× upscale** sources ≥2048px (avoids mush) and applies a light **smooth** pass on terrain only; city names render in the browser.

## Optional: Real-ESRGAN (AI terrain)

```bash
npm run map:install-esrgan   # once — downloads ncnn-vulkan portable
npm run map:hybrid           # auto-detects; falls back if Vulkan OOM
```

**Note:** ncnn-vulkan tiles the image and can show a checkerboard on some GPUs. If that happens, use `--no-ai` (smooth native upscale) until `canva-terrain.png` exists.

**Not for this map:** [Normal Map Upscaling](https://openmodeldb.info/collections/c-normal-map-upscaling) models expect **RG0 tangent normals** (B channel = 0), not RGB terrain. For compressed game textures, see [4x RealisticRescaler](https://openmodeldb.info/models/4x-RealisticRescaler) via chaiNNer — future option.

Force Lanczos only: `npm run map:hybrid -- --no-ai`
