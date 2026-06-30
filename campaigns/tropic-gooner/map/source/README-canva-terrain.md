# Canva terrain-only export

For the **hybrid** map pipeline (AI/Lanczos terrain + UI labels):

1. Open the Isla Primavera map design in Canva.
2. **Hide or delete all text layers** (city names, region numbers, title chrome on the map itself).
3. Keep terrain, borders, roads, and shaded relief visible.
4. Export as PNG → save here as **`canva-terrain.png`** (same aspect ratio as the full map).

Then rebuild:

```bash
cd scripts/tableslop
npm run map:hybrid
```

Until `canva-terrain.png` exists, hybrid falls back to `output-onlinetools4k.png` — UI labels will **duplicate** baked text on the raster. Toggle **Labels OFF** in the HUD while comparing.

## Optional: Real-ESRGAN (AI terrain)

Download [Real-ESRGAN ncnn-vulkan](https://github.com/xinntao/Real-ESRGAN/releases) and either:

- Add the binary to PATH, or
- Set `REALESRGAN_BIN=C:\path\to\realesrgan-ncnn-vulkan.exe`

Hybrid auto-detects it; otherwise Lanczos is used.

Force Lanczos only: `npm run map:hybrid -- --no-ai`
