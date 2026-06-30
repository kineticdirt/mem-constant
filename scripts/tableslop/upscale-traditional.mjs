#!/usr/bin/env node

/**

 * Option C — traditional Lanczos upscale (no AI, preserves text better than diffusion).

 * Prefer process-map.mjs for contrast/sharpen.

 */

import fs from "fs";
import path from "path";
import { parseArgs, requireArg } from "./lib/args.mjs";
import { processMapImage } from "./lib/enhance.mjs";



const args = parseArgs(process.argv.slice(2));

const input = requireArg(args, "input");

const output = requireArg(args, "output");

const scale = parseFloat(args.scale || "2");



if (!fs.existsSync(input)) {

  console.error(`Input not found: ${input}`);

  process.exit(1);

}

if (!(scale > 0 && scale <= 4)) {

  console.error("--scale must be 0 < scale <= 4");

  process.exit(1);

}



fs.mkdirSync(path.dirname(output), { recursive: true });

const r = await processMapImage(input, output, { scale, contrast: 1, sharpen: 0 });

console.log(`OK lanczos ${scale}x → ${output} (${r.inW}×${r.inH} → ${r.outW}×${r.outH})`);

