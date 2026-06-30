#!/usr/bin/env node
/**
 * Lanczos upscale + contrast/sharpen (no AI).
 *
 *   node process-map.mjs --input ../../campaigns/tropic-gooner/map/output-onlinetools4k.png \\
 *     --output ../../campaigns/tropic-gooner/map/source/master-enhanced.png --preset map-default
 *
 *   node process-map.mjs --input in.png --output out.png --scale 2 --contrast 1.12 --sharpen 0.5
 */
import fs from "fs";
import path from "path";
import { parseArgs, requireArg } from "./lib/args.mjs";
import { processMapImage, PRESETS } from "./lib/enhance.mjs";

const args = parseArgs(process.argv.slice(2));
const input = requireArg(args, "input");
const output = requireArg(args, "output");

if (!fs.existsSync(input)) {
  console.error(`Input not found: ${input}`);
  process.exit(1);
}

let opts = {};
if (args.preset) {
  opts = { ...PRESETS[args.preset] };
  if (!opts || Object.keys(opts).length === 0) {
    console.error(`Unknown preset: ${args.preset}. Available: ${Object.keys(PRESETS).join(", ")}`);
    process.exit(1);
  }
}
if (args.scale != null) opts.scale = parseFloat(args.scale);
if (args.contrast != null) opts.contrast = parseFloat(args.contrast);
if (args.sharpen != null) opts.sharpen = parseFloat(args.sharpen);
if (args["no-normalize"]) {
  opts.normalizeLow = undefined;
  opts.normalizeHigh = undefined;
} else if (args["norm-low"] != null) {
  opts.normalizeLow = parseFloat(args["norm-low"]);
  opts.normalizeHigh = parseFloat(args["norm-high"] ?? "97");
}

if (opts.scale == null) opts.scale = 2;
if (opts.contrast == null) opts.contrast = 1.12;
if (opts.sharpen == null) opts.sharpen = 0.55;
if (opts.normalizeLow == null && !args["no-normalize"] && !args.preset) {
  opts.normalizeLow = 3;
  opts.normalizeHigh = 97;
}

fs.mkdirSync(path.dirname(output), { recursive: true });
const r = await processMapImage(input, output, opts);
console.log(
  `OK process-map → ${output} (${r.inW}×${r.inH} → ${r.outW}×${r.outH}, scale=${opts.scale}, contrast=${opts.contrast}, sharpen=${opts.sharpen})`
);
