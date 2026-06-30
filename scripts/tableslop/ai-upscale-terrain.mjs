#!/usr/bin/env node
/**
 * Terrain upscale — tries Real-ESRGAN NCNN if installed, else Lanczos (Sharp).
 *
 *   node ai-upscale-terrain.mjs --input terrain.png --output out.png --scale 2
 *
 * Set REALESRGAN_BIN to the ncnn-vulkan binary path if not on PATH.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { parseArgs } from "./lib/args.mjs";
import { processMapImage } from "./lib/enhance.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const input = args.input;
const output = args.output;
const scale = parseInt(args.scale || "2", 10);

if (!input || !output) {
  console.error("Usage: ai-upscale-terrain.mjs --input <png> --output <png> [--scale 2|4]");
  process.exit(1);
}
if (!fs.existsSync(input)) {
  console.error(`Input not found: ${input}`);
  process.exit(1);
}

function findRealEsrgan() {
  const env = process.env.REALESRGAN_BIN;
  if (env && fs.existsSync(env)) return env;
  const names =
    process.platform === "win32"
      ? ["realesrgan-ncnn-vulkan.exe", "realesrgan-ncnn-vulkan"]
      : ["realesrgan-ncnn-vulkan"];
  for (const name of names) {
    const r = spawnSync(process.platform === "win32" ? "where" : "which", [name], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    if (r.status === 0 && r.stdout.trim()) {
      const first = r.stdout.trim().split(/\r?\n/)[0];
      if (fs.existsSync(first)) return first;
    }
  }
  return null;
}

function runRealEsrgan(bin, inPath, outPath, s) {
  const tmpDir = path.dirname(outPath);
  fs.mkdirSync(tmpDir, { recursive: true });
  const r = spawnSync(bin, ["-i", inPath, "-o", outPath, "-s", String(s)], {
    stdio: "inherit",
    cwd: __dirname,
  });
  return r.status === 0 && fs.existsSync(outPath);
}

fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });

const bin = findRealEsrgan();
let method = "lanczos";

if (bin) {
  console.log(`Real-ESRGAN: ${bin} (scale ${scale}x)`);
  if (runRealEsrgan(bin, path.resolve(input), path.resolve(output), scale)) {
    method = "realesrgan";
  } else {
    console.warn("Real-ESRGAN failed — falling back to Lanczos.");
  }
} else {
  console.log("Real-ESRGAN not found (set REALESRGAN_BIN) — using Lanczos.");
}

if (method === "lanczos") {
  await processMapImage(input, output, { scale, contrast: 1, sharpen: 0.08, saturation: 1 });
}

fs.writeFileSync(
  path.resolve(output) + ".method.json",
  JSON.stringify({ method, scale, input: path.resolve(input) }) + "\n"
);
console.log(`OK method=${method} → ${output}`);
