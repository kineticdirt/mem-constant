#!/usr/bin/env node
/**
 * Option A — deterministic tile pyramid (Deep Zoom style, 256px WebP tiles).
 *
 *   node build-pyramid.mjs --input master-lanczos-2x.png --out-dir ../../campaigns/tropic-gooner/map/tiles --manifest ../../campaigns/tropic-gooner/map/pyramid.json
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { parseArgs, requireArg } from "./lib/args.mjs";

const args = parseArgs(process.argv.slice(2));
const input = requireArg(args, "input");
const outDir = requireArg(args, "out-dir");
const manifestPath = args.manifest || path.join(path.dirname(outDir), "pyramid.json");
const tileSize = parseInt(args["tile-size"] || "256", 10);

if (!fs.existsSync(input)) {
  console.error(`Input not found: ${input}`);
  process.exit(1);
}

const meta = await sharp(input).metadata();
const W = meta.width;
const H = meta.height;
const maxZoom = Math.max(0, Math.ceil(Math.log2(Math.max(W, H) / tileSize)));

if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

let tileCount = 0;
for (let z = 0; z <= maxZoom; z++) {
  const factor = 2 ** z / 2 ** maxZoom;
  const levelW = Math.max(1, Math.round(W * factor));
  const levelH = Math.max(1, Math.round(H * factor));
  const cols = Math.ceil(levelW / tileSize);
  const rows = Math.ceil(levelH / tileSize);

  const levelBuf = await sharp(input)
    .resize(levelW, levelH, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const left = tx * tileSize;
      const top = ty * tileSize;
      const tw = Math.min(tileSize, levelW - left);
      const th = Math.min(tileSize, levelH - top);
      const dir = path.join(outDir, String(z), String(ty));
      fs.mkdirSync(dir, { recursive: true });
      await sharp(levelBuf)
        .extract({ left, top, width: tw, height: th })
        .webp({ quality: 85 })
        .toFile(path.join(dir, `${tx}.webp`));
      tileCount += 1;
    }
  }
  console.log(`  z=${z}  ${levelW}×${levelH}  ${cols}×${rows} tiles`);
}

const manifest = {
  version: 1,
  tileSize,
  format: "webp",
  width: W,
  height: H,
  minZoom: 0,
  maxZoom,
  urlTemplate: "/map-tiles/{z}/{y}/{x}.webp",
  source: path.basename(input),
  pipeline: "lanczos+pyramid",
  generated_at: new Date().toISOString().slice(0, 10),
};

fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`OK pyramid → ${outDir} (${tileCount} tiles, maxZoom=${maxZoom})`);
console.log(`OK manifest → ${manifestPath}`);
