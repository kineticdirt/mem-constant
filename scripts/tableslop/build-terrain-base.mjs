#!/usr/bin/env node
/** Strip baked overlays from master -> terrain-base.png + rebuild pyramid. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { parseArgs } from "./lib/args.mjs";
import { stripOverlaysFromRaster } from "./lib/strip-overlays.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const mapRoot = path.resolve(args["map-root"] || path.join(__dirname, "../../campaigns/tropic-gooner/map"));
const input = path.resolve(args.input || path.join(mapRoot, "master-enhanced.png"));
const maskSource = path.resolve(args["mask-source"] || path.join(mapRoot, "output-onlinetools4k.png"));
const terrainBase = path.join(mapRoot, "terrain-base.png");
const pyramidPath = path.join(mapRoot, "pyramid.json");
const tilesDir = path.join(mapRoot, "tiles");

if (!fs.existsSync(input)) {
  console.error(`Missing: ${input}`);
  process.exit(1);
}

console.log(`Strip overlays: ${path.basename(input)}`);
await stripOverlaysFromRaster(input, maskSource, terrainBase);
console.log(`  -> ${terrainBase}`);

const r = spawnSync(
  process.execPath,
  [
    path.join(__dirname, "build-pyramid.mjs"),
    "--input",
    terrainBase,
    "--out-dir",
    tilesDir,
    "--manifest",
    pyramidPath,
  ],
  { stdio: "inherit", cwd: __dirname }
);
if (r.status !== 0) process.exit(r.status ?? 1);

console.log("OK terrain-base + pyramid");
