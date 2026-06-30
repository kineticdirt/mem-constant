#!/usr/bin/env node
/**
 * Single command: split → upscale panels (parallel CPU) → stitch → global grade → pyramid.
 *
 *   cd scripts/tableslop && npm run map
 *
 * Canva 1080p export example:
 *   npm run map -- --input ../../campaigns/tropic-gooner/map/source/canva-master.png
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import sharp from "sharp";
import { parseArgs } from "./lib/args.mjs";
import {
  splitPanels,
  enhancePanels,
  stitchPanels,
  applyGlobalGrade,
  writeContactSheet,
  writeThumb,
  resolvePanelOpts,
  resolveGlobalOpts,
  defaultParallelism,
  processWholeImage,
} from "./lib/panels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const mapRoot = path.resolve(args["map-root"] || path.join(__dirname, "../../campaigns/tropic-gooner/map"));
const pipelineRoot = path.join(mapRoot, "pipeline");
const rawDir = path.join(pipelineRoot, "panels", "raw");
const enhancedDir = path.join(pipelineRoot, "panels", "enhanced");
const outputDir = path.join(pipelineRoot, "output");
const manifestPath = path.join(pipelineRoot, "manifest.json");

const defaultInput = path.join(mapRoot, "output-onlinetools4k.png");
const input = path.resolve(args.input || defaultInput);

if (!fs.existsSync(input)) {
  console.error(`Input not found: ${input}`);
  console.error("");
  console.error("Examples:");
  console.error("  npm run map");
  console.error("  npm run map -- --input ../../campaigns/tropic-gooner/map/source/canva-master.png");
  process.exit(1);
}

const panelMax = parseInt(args["panel-max"] || "1024", 10);
const cols = args.cols ? parseInt(args.cols, 10) : null;
const rows = args.rows ? parseInt(args.rows, 10) : null;
const parallel = args.parallel ? parseInt(args.parallel, 10) : defaultParallelism();
const panelOpts = resolvePanelOpts(args);
const globalOpts = resolveGlobalOpts(args);
const noSplit = Boolean(args["no-split"]);

sharp.concurrency(parallel);
fs.mkdirSync(pipelineRoot, { recursive: true });

const masterLocal = path.join(outputDir, "master-enhanced.png");
const stitchedRaw = path.join(outputDir, "master-stitched-raw.png");

console.log("");
console.log("=== tableslop map pipeline ===");
console.log(`Input:     ${input}`);
console.log(`Workdir:   ${pipelineRoot}`);
console.log(`Mode:      ${noSplit ? "whole image (no panel split)" : "panel split + stitch"}`);
console.log(`CPU jobs:  ${parallel} parallel (libvips/sharp — not GPU)`);
console.log(`Panels:    upscale ${panelOpts.scale}x, sharpen ${panelOpts.sharpen} (no per-panel color)`);
console.log(`Global:    contrast ${globalOpts.contrast}, saturation ${globalOpts.saturation ?? 1}, sharpen ${globalOpts.sharpen}`);
console.log("");

let manifest = { version: 2, sourcePath: input, source: path.basename(input) };

if (noSplit) {
  console.log("[1/4] Processing whole image (upscale + global grade)…");
  await processWholeImage(input, masterLocal, panelOpts, globalOpts);
  manifest.mode = "whole";
} else {
  console.log("[1/6] Splitting source into panels…");
  manifest = await splitPanels(input, rawDir, { cols, rows, panelMax });
  console.log(`      ${manifest.cols}×${manifest.rows} = ${manifest.panels.length} panels`);

  console.log("[2/6] Upscaling panels (parallel CPU)…");
  manifest = await enhancePanels(manifest, rawDir, enhancedDir, panelOpts, (n, total, id) => {
    console.log(`      [${n}/${total}] ${id}`);
  }, parallel);

  console.log("[3/6] Stitching (no color seams)…");
  manifest = await stitchPanels(manifest, enhancedDir, stitchedRaw);
  console.log(`      → ${stitchedRaw} (${manifest.outWidth}×${manifest.outHeight})`);

  console.log("[4/6] Global color grade (once, full image)…");
  await applyGlobalGrade(stitchedRaw, masterLocal, globalOpts);
  console.log(`      → ${masterLocal}`);
  manifest.globalEnhance = globalOpts;
  manifest.mode = "panels";
}

console.log(`[${noSplit ? 2 : 5}/6] Building tile pyramid…`);
const masterDeploy = path.join(mapRoot, "master-enhanced.png");
fs.copyFileSync(masterLocal, masterDeploy);
const tilesDir = path.join(mapRoot, "tiles");
const pyramidPath = path.join(mapRoot, "pyramid.json");
run("build-pyramid.mjs", ["--input", masterDeploy, "--out-dir", tilesDir, "--manifest", pyramidPath]);

console.log(`[${noSplit ? 3 : 6}/6] Writing previews…`);
const contactSheet = path.join(outputDir, "contact-sheet.jpg");
const thumb = path.join(outputDir, "thumb.jpg");
if (!noSplit && manifest.panels) {
  await writeContactSheet(manifest, enhancedDir, contactSheet);
} else {
  await writeThumb(masterLocal, contactSheet, 1280);
}
await writeThumb(masterLocal, thumb);

manifest.master = masterLocal;
manifest.pyramid = pyramidPath;
manifest.previews = { contactSheet, thumb };
manifest.finishedAt = new Date().toISOString();
manifest.cpuParallel = parallel;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log("");
console.log("=== Done — review these files ===");
console.log(`  Full map thumb:     ${thumb}`);
console.log(`  Master PNG:         ${masterLocal}`);
if (!noSplit) {
  console.log(`  Stitched (pre-grade): ${stitchedRaw}`);
  console.log(`  Contact sheet:      ${contactSheet}`);
  console.log(`  Panels:             ${enhancedDir}`);
}
console.log("");
console.log("GPU: this pipeline uses CPU only (Sharp/libvips). Parallel flag speeds up panel step.");
console.log("Try --no-split if panel mode still shows issues (single consistent pass).");
console.log("");

function run(script, scriptArgs) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script), ...scriptArgs], {
    stdio: "inherit",
    cwd: __dirname,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
