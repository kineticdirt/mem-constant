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
import { smoothTerrainImage } from "./lib/enhance.mjs";
import { reinjectMapLines, sharpenMapDetail } from "./lib/line-preserve.mjs";
import { stripOverlaysFromRaster } from "./lib/strip-overlays.mjs";
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

const scale = args.scale != null ? parseInt(args.scale, 10) : 2;
const globalOpts = resolveGlobalOpts({ preset: args.preset || "terrain-smooth", ...args });
const lanczosOnly = Boolean(args["no-ai"]);
const terrainSmooth = args.smooth != null ? parseFloat(args.smooth) : globalOpts.smooth ?? 0.7;

const isTerrainOnly = /canva-terrain|terrain-only/i.test(path.basename(input));
const lineReinject = args.lines === "true";
const stripBaked = args["no-strip"] !== "true";
const sharpenDetail = args["no-sharpen"] !== "true";

fs.mkdirSync(outputDir, { recursive: true });

const terrainUpscaled = path.join(outputDir, "master-terrain-upscaled.png");
const terrainBase = path.join(mapRoot, "terrain-base.png");
const terrainBaseLocal = path.join(outputDir, "terrain-base.png");
const masterLocal = path.join(outputDir, "master-enhanced.png");
const masterDeploy = path.join(mapRoot, "master-enhanced.png");
const mapJsonPath = path.join(mapRoot, "map.json");

console.log("");
console.log("=== tableslop hybrid pipeline ===");
console.log(`Terrain:   ${input}`);
console.log(`Terrain-only source: ${isTerrainOnly ? "yes" : "no (baked labels may duplicate UI labels)"}`);
console.log(`Upscale:   ${lanczosOnly ? "smooth terrain (--no-ai)" : "PyTorch AI + HTML UI overlays"}`);
console.log(`Strip:     ${stripBaked && !isTerrainOnly ? "remove baked lines from raster" : "skip"}`);
console.log(`Lines:     ${lineReinject ? "legacy raster reinject (--lines)" : "HTML/SVG only"}`);
console.log(`Sharpen:   ${sharpenDetail ? "detail pass after composite" : "off"}`);
console.log(`Labels:    UI layer (map.json label_layer=ui)`);
console.log("");

console.log("[1/6] AI terrain upscale…");
if (lanczosOnly) {
  const r = await smoothTerrainImage(input, terrainUpscaled, {
    scale,
    autoScale: true,
    smooth: terrainSmooth,
    contrast: 1,
    saturation: 1,
  });
  fs.writeFileSync(
    terrainUpscaled + ".method.json",
    JSON.stringify({
      method: "smooth-lanczos",
      scale: r.scaleUsed,
      smooth: terrainSmooth,
      input,
    }) + "\n"
  );
} else {
  runScript("ai-upscale-terrain.mjs", [
    "--input",
    input,
    "--output",
    terrainUpscaled,
    "--scale",
    String(scale),
    "--smooth",
    String(terrainSmooth),
    "--ai-smooth",
    String(args["ai-smooth"] != null ? parseFloat(args["ai-smooth"]) : 0),
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

let gradedFrom = terrainUpscaled;
if (lineReinject) {
  const terrainLines = path.join(outputDir, "master-terrain-lines.png");
  console.log("[2/6] Legacy line reinject (--lines)…");
  await reinjectMapLines(input, terrainUpscaled, terrainLines);
  gradedFrom = terrainLines;
} else if (stripBaked && !isTerrainOnly) {
  console.log("[2/6] Strip baked overlays -> terrain template…");
  await stripOverlaysFromRaster(terrainUpscaled, input, terrainBaseLocal);
  fs.copyFileSync(terrainBaseLocal, terrainBase);
  gradedFrom = terrainBaseLocal;
  console.log(`      -> ${terrainBase}`);
} else {
  console.log("[2/6] Terrain-only source — no strip");
  fs.copyFileSync(terrainUpscaled, terrainBaseLocal);
  fs.copyFileSync(terrainBaseLocal, terrainBase);
  gradedFrom = terrainBaseLocal;
}

console.log("[3/6] Light grade (no extra blur)…");
await applyGlobalGrade(gradedFrom, masterLocal, {
  ...globalOpts,
  scale: 1,
  sharpen: 0,
  smooth: 0,
});
console.log(`      -> ${masterLocal}`);

if (sharpenDetail && /realesrgan/.test(upscaleMethod)) {
  console.log("[4/6] Detail sharpen (map-tuned unsharp)…");
  await sharpenMapDetail(masterLocal, masterLocal);
} else {
  console.log("[4/6] Skip detail sharpen");
}

console.log("[5/6] Tile pyramid…");
fs.copyFileSync(masterLocal, masterDeploy);
fs.copyFileSync(masterLocal, terrainBase);
const pyramidInput = terrainBase;
const tilesDir = path.join(mapRoot, "tiles");
const pyramidPath = path.join(mapRoot, "pyramid.json");
runScript("build-pyramid.mjs", [
  "--input",
  pyramidInput,
  "--out-dir",
  tilesDir,
  "--manifest",
  pyramidPath,
]);

console.log("[6/6] map.json + previews…");
const relSource = path.relative(mapRoot, input).replace(/\\/g, "/");
const pipelineTag = /realesrgan/.test(upscaleMethod)
  ? `hybrid:${upscaleMethod}+html-ui`
  : "hybrid:terrain-template+html-ui";
patchMapJson(mapJsonPath, {
  label_layer: "ui",
  overlay_layer: "ui",
  base_image: "map/terrain-base.png",
  base_image_master: "map/terrain-base.png",
  base_image_terrain: "map/terrain-base.png",
  base_image_source: relSource,
  base_image_pipeline: pipelineTag,
  tile_pyramid: "map/pyramid.json",
  base_image_status: "terrain template + HTML areas/cities/labels",
  regions_ui: "map/regions-ui.json",
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
  strip_baked: stripBaked,
  line_reinject: lineReinject,
  detail_sharpen: sharpenDetail,
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
