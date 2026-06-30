#!/usr/bin/env node
/**
 * Run stitch (optional) → Lanczos upscale → tile pyramid.
 *
 * Single Canva export:
 *   node run-pipeline.mjs --input ../../campaigns/tropic-gooner/map/source/canva-master.png
 *
 * Grid tiles from Canva:
 *   node run-pipeline.mjs --stitch-dir ../../campaigns/tropic-gooner/map/source/tiles --cols 2 --rows 2
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { parseArgs } from "./lib/args.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const mapRoot = path.resolve(
  args["map-root"] || path.join(__dirname, "../../campaigns/tropic-gooner/map")
);
const sourceDir = path.join(mapRoot, "source");
const scale = parseFloat(args.scale || "2");
const preset = args.preset || "map-default";

fs.mkdirSync(sourceDir, { recursive: true });

let master = args.input ? path.resolve(args.input) : null;

if (args["stitch-dir"]) {
  const stitched = path.join(sourceDir, "master-stitched.png");
  const cols = args.cols || "2";
  const rows = args.rows || "2";
  run("stitch-tiles.mjs", [
    "--input",
    path.resolve(args["stitch-dir"]),
    "--output",
    stitched,
    "--cols",
    cols,
    "--rows",
    rows,
  ]);
  master = stitched;
}

if (!master || !fs.existsSync(master)) {
  console.error("Provide --input <canva-master.png> or --stitch-dir <tiles/>");
  process.exit(1);
}

const enhancedOut = path.join(sourceDir, `master-enhanced-${scale}x.png`);
const processArgs = ["--input", master, "--output", enhancedOut, "--scale", String(scale)];
if (args.preset) processArgs.push("--preset", args.preset);
else processArgs.push("--preset", preset);
run("process-map.mjs", processArgs);

const tilesDir = path.join(mapRoot, "tiles");
const manifest = path.join(mapRoot, "pyramid.json");
run("build-pyramid.mjs", ["--input", enhancedOut, "--out-dir", tilesDir, "--manifest", manifest]);

const flatOut = path.join(mapRoot, "master-enhanced.png");
fs.copyFileSync(enhancedOut, flatOut);

console.log("");
console.log("Next steps:");
console.log(`  1. Set map.json → "base_image": "map/master-enhanced.png", "tile_pyramid": "map/pyramid.json"`);
console.log("  2. scp map/tiles + pyramid.json + master-lanczos.png to linuxbox");
console.log("  3. sudo systemctl restart linuxbox-tableslop");

function run(script, scriptArgs) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script), ...scriptArgs], {
    stdio: "inherit",
    cwd: __dirname,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
