import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { processMapImage, PANEL_PRESETS, GLOBAL_PRESETS } from "./enhance.mjs";

/** Even grid split — edge panels absorb remainder pixels. */
export function panelBounds(col, row, cols, rows, width, height) {
  const left = Math.floor((col * width) / cols);
  const top = Math.floor((row * height) / rows);
  const right = col === cols - 1 ? width : Math.floor(((col + 1) * width) / cols);
  const bottom = row === rows - 1 ? height : Math.floor(((row + 1) * height) / rows);
  return { left, top, width: right - left, height: bottom - top };
}

export function gridFromPanelMax(width, height, panelMax = 1024) {
  const cols = Math.max(1, Math.ceil(width / panelMax));
  const rows = Math.max(1, Math.ceil(height / panelMax));
  return { cols, rows };
}

export function resolvePanelOpts(args) {
  const preset = args["panel-preset"] || "upscale-only";
  const opts = { ...(PANEL_PRESETS[preset] || PANEL_PRESETS["upscale-only"]) };
  if (args.scale != null) opts.scale = parseFloat(args.scale);
  if (args.sharpen != null) opts.sharpen = parseFloat(args.sharpen);
  return opts;
}

export function resolveGlobalOpts(args) {
  const preset = args.preset || args["global-preset"] || "map-gentle";
  const opts = { ...(GLOBAL_PRESETS[preset] || GLOBAL_PRESETS["map-gentle"]) };
  if (args.contrast != null) opts.contrast = parseFloat(args.contrast);
  if (args.sharpen != null && args["panel-sharpen"] == null) opts.sharpen = parseFloat(args.sharpen);
  if (args.saturation != null) opts.saturation = parseFloat(args.saturation);
  if (args.smooth != null) opts.smooth = parseFloat(args.smooth);
  if (args["no-normalize"]) {
    opts.normalizeLow = undefined;
    opts.normalizeHigh = undefined;
  }
  return opts;
}

export function defaultParallelism() {
  return Math.max(2, Math.min(8, os.cpus()?.length || 4));
}

async function runPool(items, limit, fn) {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

export async function splitPanels(input, rawDir, { cols, rows, panelMax = 1024 }) {
  const meta = await sharp(input).metadata();
  const W = meta.width;
  const H = meta.height;
  if (!cols || !rows) {
    ({ cols, rows } = gridFromPanelMax(W, H, panelMax));
  }

  fs.mkdirSync(rawDir, { recursive: true });
  const panels = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const id = `r${row}-c${col}`;
      const b = panelBounds(col, row, cols, rows, W, H);
      const out = path.join(rawDir, `${id}.png`);
      await sharp(input)
        .extract({ left: b.left, top: b.top, width: b.width, height: b.height })
        .png({ compressionLevel: 6 })
        .toFile(out);
      panels.push({ id, row, col, file: `${id}.png`, ...b });
    }
  }

  return {
    version: 2,
    stage: "split",
    source: path.basename(input),
    sourcePath: input,
    width: W,
    height: H,
    cols,
    rows,
    panelMax,
    panels,
  };
}

/** Upscale panels in parallel — color grade happens AFTER stitch. */
export async function enhancePanels(manifest, rawDir, enhancedDir, panelOpts, onProgress, parallel = 4) {
  fs.mkdirSync(enhancedDir, { recursive: true });
  const scale = panelOpts.scale ?? 1;
  const total = manifest.panels.length;

  await runPool(manifest.panels, parallel, async (p, i) => {
    const inPath = path.join(rawDir, p.file);
    const outFile = `e-${p.id}.png`;
    const outPath = path.join(enhancedDir, outFile);
    if (onProgress) onProgress(i + 1, total, p.id);
    const r = await processMapImage(inPath, outPath, panelOpts);
    p.enhancedFile = outFile;
    p.outWidth = r.outW;
    p.outHeight = r.outH;
    p.outLeft = Math.round(p.left * scale);
    p.outTop = Math.round(p.top * scale);
  });

  manifest.stage = "enhanced";
  manifest.panelEnhance = panelOpts;
  manifest.outWidth = Math.round(manifest.width * scale);
  manifest.outHeight = Math.round(manifest.height * scale);
  manifest.parallel = parallel;
  return manifest;
}

export async function stitchPanels(manifest, enhancedDir, outputPath) {
  const composites = manifest.panels.map((p) => ({
    input: path.join(enhancedDir, p.enhancedFile),
    left: p.outLeft,
    top: p.outTop,
  }));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await sharp({
    create: {
      width: manifest.outWidth,
      height: manifest.outHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 6 })
    .toFile(outputPath);

  manifest.stage = "stitched";
  manifest.stitchedRaw = outputPath;
  return manifest;
}

export async function applyGlobalGrade(inputPath, outputPath, globalOpts) {
  const r = await processMapImage(inputPath, outputPath, globalOpts);
  return r;
}

export async function writeContactSheet(manifest, enhancedDir, outputPath, cellMax = 320) {
  const thumbs = await Promise.all(
    manifest.panels.map(async (p) => {
      const buf = await sharp(path.join(enhancedDir, p.enhancedFile))
        .resize(cellMax, cellMax, { fit: "inside", kernel: sharp.kernel.lanczos3 })
        .jpeg({ quality: 88 })
        .toBuffer();
      const m = await sharp(buf).metadata();
      return { buf, w: m.width, h: m.height, row: p.row, col: p.col };
    })
  );

  const cellW = Math.max(...thumbs.map((t) => t.w));
  const cellH = Math.max(...thumbs.map((t) => t.h));
  const sheetW = cellW * manifest.cols;
  const sheetH = cellH * manifest.rows;

  const composites = thumbs.map((t) => ({
    input: t.buf,
    left: t.col * cellW + Math.floor((cellW - t.w) / 2),
    top: t.row * cellH + Math.floor((cellH - t.h) / 2),
  }));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await sharp({
    create: { width: sheetW, height: sheetH, channels: 3, background: { r: 20, g: 8, b: 33 } },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(outputPath);
}

export async function writeThumb(inputPath, outputPath, maxWidth = 1920) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await sharp(inputPath)
    .resize(maxWidth, null, { fit: "inside", kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 90 })
    .toFile(outputPath);
}

/** Whole-image path — no panel split (best when source fits in RAM). */
export async function processWholeImage(input, output, panelOpts, globalOpts) {
  const tmp = output.replace(/\.png$/i, ".stitched-raw.png");
  await processMapImage(input, tmp, panelOpts);
  await processMapImage(tmp, output, globalOpts);
  return tmp;
}
