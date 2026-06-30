#!/usr/bin/env node
/**
 * Grid-stitch Canva tile exports into one master PNG (no overlap).
 *
 *   node stitch-tiles.mjs --input ../../campaigns/tropic-gooner/map/source/tiles --output ../../campaigns/tropic-gooner/map/source/master-stitched.png --cols 2 --rows 2
 *
 * Files are sorted by name (name tiles 01.png, 02.png … row-major).
 * Prefer a single Canva PNG export when possible — stitching is for split exports only.
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { parseArgs, requireArg } from "./lib/args.mjs";

const args = parseArgs(process.argv.slice(2));
const inputDir = requireArg(args, "input");
const output = requireArg(args, "output");
const cols = parseInt(args.cols || "2", 10);
const rows = parseInt(args.rows || "2", 10);

const files = fs
  .readdirSync(inputDir)
  .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
  .sort()
  .map((f) => path.join(inputDir, f));

if (files.length === 0) {
  console.error(`No images in ${inputDir}`);
  process.exit(1);
}
if (files.length !== cols * rows) {
  console.error(`Expected ${cols * rows} tiles, found ${files.length}: ${files.map(path.basename).join(", ")}`);
  process.exit(1);
}

const metas = await Promise.all(files.map((f) => sharp(f).metadata()));
const cellW = Math.max(...metas.map((m) => m.width));
const cellH = Math.max(...metas.map((m) => m.height));
const totalW = cellW * cols;
const totalH = cellH * rows;

const composites = files.map((f, i) => {
  const col = i % cols;
  const row = Math.floor(i / cols);
  return { input: f, left: col * cellW, top: row * cellH };
});

fs.mkdirSync(path.dirname(output), { recursive: true });
await sharp({
  create: { width: totalW, height: totalH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
})
  .composite(composites)
  .png({ compressionLevel: 6 })
  .toFile(output);

console.log(`OK stitch → ${output} (${totalW}×${totalH}, ${cols}×${rows} grid)`);
