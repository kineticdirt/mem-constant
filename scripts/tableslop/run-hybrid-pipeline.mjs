#!/usr/bin/env node
/**
 * Hybrid map pipeline: terrain raster (AI or Lanczos) + UI labels in viewer.
 *
 *   cd scripts/tableslop && npm run map:hybrid
 *
 * Prefers map/source/canva-terrain.png (text layers hidden in Canva).
 * Falls back to output-onlinetools4k.png until terrain export exists.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { applyGlobalGrade, resolveGlobalOpts, writeThumb } from "./lib/panels.mjs";
import { processMapImage } from "./lib/enhance.mjs";
import { patchMapJson } from "./lib/patch-map-json.mjs";
import { parseArgs } from "./lib/args.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const mapRoot = path.resolve(args["map-root"] || path.join(__dirname, "../../campaigns/tropic-gooner/map"));
const pipelineRoot = path.join(mapRoot, "pipeline");
const outputDir = path.join(pipelineRoot, "output");
const terrainDefault = path.join(mapRoot, "source", "canva-terrain.png");
const fallbackInput = path.join(mapRoot, "output-onlinetools4k.png");

let input = args.input ? path.resolve(args.input) : null;
if (!input) {
  input = fs.existsSync(terrainDefault) ? terrainDefault : fallbackInput;
}

if (!fs.existsSync(input)) {
  console.error(`Input not found: ${input}`);
  console.error("Export terrain-only from Canva → map/source/canva-terrain.png");
  process.exit(1);
}

const scale = parseInt(args.scale || "2", 10);
const globalOpts = resolveGlobalOpts({ preset: args.preset || "minimal", ...args });
const lanczosOnly = Boolean(args["no-ai"]);

fs.mkdirSync(outputDir, { recursive: true });

const terrainUpscaled = path.join(outputDir, "master-terrain-upscaled.png");
const masterLocal = path.join(outputDir, "master-enhanced.png");
const masterDeploy = path.join(mapRoot, "master-enhanced.png");
const mapJsonPath = path.join(mapRoot, "map.json");

const isTerrainOnly = /canva-terrain|terrain-only/i.test(path.basename(input));

console.log("");
console.log("=== tableslop hybrid pipeline ===");
console.log(`Terrain:   ${input}`);
console.log(`Terrain-only source: ${isTerrainOnly ? "yes" : "no (baked labels may duplicate UI labels)"}`);
console.log(`Upscale:   ${lanczosOnly ? "Lanczos only (--no-ai)" : "AI (Real-ESRGAN) → Lanczos fallback"}`);
console.log(`Scale:     ${scale}x`);
console.log(`Labels:    UI layer (map.json label_layer=ui)`);
console.log("");

console.log("[1/4] Upscaling terrain…");
if (lanczosOnly) {
  await processMapImage(input, terrainUpscaled, { scale, contrast: 1, sharpen: 0.08, saturation: 1 });
  fs.writeFileSync(
    terrainUpscaled + ".method.json",
    JSON.stringify({ method: "lanczos", scale, input }) + "\n"
  );
} else {
  runScript("ai-upscale-terrain.mjs", [
    "--input",
    input,
    "--output",
    terrainUpscaled,
    "--scale",
    String(scale),
  ]);
}

let upscaleMethod = "lanczos";
const methodFile = terrainUpscaled + ".method.json";
if (fs.existsSync(methodFile)) {
  try {
    upscaleMethod = JSON.parse(fs.readFileSync(methodFile, "utf8")).method || upscaleMethod;
  } catch {
    /* keep default */
  }
}

console.log("[2/4] Global grade (terrain, gentle)…");
await applyGlobalGrade(terrainUpscaled, masterLocal, globalOpts);
console.log(`      → ${masterLocal}`);

console.log("[3/4] Tile pyramid…");
fs.copyFileSync(masterLocal, masterDeploy);
const tilesDir = path.join(mapRoot, "tiles");
const pyramidPath = path.join(mapRoot, "pyramid.json");
runScript("build-pyramid.mjs", [
  "--input",
  masterDeploy,
  "--out-dir",
  tilesDir,
  "--manifest",
  pyramidPath,
]);

console.log("[4/4] map.json + previews…");
const relSource = path.relative(mapRoot, input).replace(/\\/g, "/");
const pipelineTag =
  upscaleMethod === "realesrgan" ? "hybrid:realesrgan+ui-labels" : "hybrid:lanczos+ui-labels";
patchMapJson(mapJsonPath, {
  label_layer: "ui",
  base_image: "map/master-enhanced.png",
  base_image_master: "map/master-enhanced.png",
  base_image_terrain: "map/master-enhanced.png",
  base_image_source: relSource,
  base_image_pipeline: pipelineTag,
  tile_pyramid: "map/pyramid.json",
});

const thumb = path.join(outputDir, "thumb.jpg");
await writeThumb(masterLocal, thumb);

const manifest = {
  version: 3,
  mode: "hybrid",
  sourcePath: input,
  source: path.basename(input),
  terrain_only: isTerrainOnly,
  upscale_method: upscaleMethod,
  scale,
  globalEnhance: globalOpts,
  master: masterLocal,
  pyramid: pyramidPath,
  label_layer: "ui",
  finishedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(pipelineRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log("");
console.log("=== Done ===");
console.log(`  Method:  ${upscaleMethod}`);
console.log(`  Master:  ${masterDeploy}`);
console.log(`  Thumb:   ${thumb}`);
if (!isTerrainOnly) {
  console.log("");
  console.log("Note: source still has baked labels — export Canva with text hidden:");
  console.log("  → campaigns/tropic-gooner/map/source/canva-terrain.png");
  console.log("  then re-run: npm run map:hybrid");
}
console.log("");

function runScript(script, scriptArgs) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script), ...scriptArgs], {
    stdio: "inherit",
    cwd: __dirname,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
