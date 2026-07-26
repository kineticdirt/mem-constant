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
import sharp from "sharp";
import { parseArgs } from "./lib/args.mjs";
import { smoothTerrainImage } from "./lib/enhance.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const input = args.input;
const output = args.output;
const scale = parseInt(args.scale || "2", 10);
const smooth = args.smooth != null ? parseFloat(args.smooth) : 0.7;
const aiSmooth = args["ai-smooth"] != null ? parseFloat(args["ai-smooth"]) : 0;

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
  const bundled = path.join(__dirname, "tools", "realesrgan-ncnn-vulkan", "realesrgan-ncnn-vulkan.exe");
  if (process.platform === "win32" && fs.existsSync(bundled)) return bundled;
  const bundledUnix = path.join(__dirname, "tools", "realesrgan-ncnn-vulkan", "realesrgan-ncnn-vulkan");
  if (fs.existsSync(bundledUnix)) return bundledUnix;
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

function runPytorch(inPath, outPath, s) {
  const pyScript = path.join(__dirname, "ai-upscale-pytorch.py");
  if (!fs.existsSync(pyScript)) return false;
  const tile = process.env.REALESRGAN_TILE || "1024";
  const tilePad = process.env.REALESRGAN_TILE_PAD || "64";
  const gpu = process.env.REALESRGAN_GPU || "0";
  const model = process.env.REALESRGAN_MODEL || "realesr-general-x4v3";
  const py = process.env.PYTHON || "python";
  const r = spawnSync(
    py,
    [
      pyScript,
      "--input",
      inPath,
      "--output",
      outPath,
      "--scale",
      String(s),
      "--model",
      model,
      "--tile",
      tile,
      "--tile-pad",
      tilePad,
      "--gpu",
      gpu,
    ],
    { stdio: "inherit", cwd: __dirname }
  );
  return r.status === 0 && fs.existsSync(outPath);
}

function runRealEsrganNcnn(bin, inPath, outPath, s) {
  const binDir = path.dirname(bin);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const model = process.env.REALESRGAN_MODEL || "realesrgan-x4plus";
  // ponytail: small tiles → checkerboard; huge tiles → VK OOM on some dual-GPU boxes
  const tile = process.env.REALESRGAN_TILE || "512";
  const gpu = process.env.REALESRGAN_GPU || "0";
  const args = ["-i", inPath, "-o", outPath, "-n", model, "-s", String(s), "-t", tile, "-g", gpu];
  const r = spawnSync(bin, args, { stdio: "inherit", cwd: binDir });
  return r.status === 0 && fs.existsSync(outPath);
}

/** ncnn-vulkan can OOM on dual-GPU setups and write black tile blocks — reject those. */
async function outputLooksValid(outPath) {
  if (!fs.existsSync(outPath)) return false;
  const st = fs.statSync(outPath);
  if (st.size < 200_000) return false;
  const stats = await sharp(outPath).stats();
  const mean =
    (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;
  return mean > 8;
}

fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });

const useNcnn = process.env.REALESRGAN_BACKEND === "ncnn";
const bin = useNcnn ? findRealEsrgan() : null;
let method = "lanczos";

if (!useNcnn && runPytorch(path.resolve(input), path.resolve(output), scale)) {
  if (await outputLooksValid(output)) {
    method = "realesrgan-pytorch";
  } else {
    console.warn("PyTorch output invalid — trying ncnn or Lanczos.");
    fs.unlinkSync(path.resolve(output));
  }
}

if (method === "lanczos" && bin) {
  console.log(`Real-ESRGAN ncnn: ${bin} (scale ${scale}x, tile ${process.env.REALESRGAN_TILE || "512"})`);
  if (runRealEsrganNcnn(bin, path.resolve(input), path.resolve(output), scale)) {
    if (await outputLooksValid(output)) {
      method = "realesrgan-ncnn";
    } else {
      console.warn("ncnn output invalid (black/tiny) — using smooth Lanczos.");
      fs.unlinkSync(path.resolve(output));
    }
  } else {
    console.warn("Real-ESRGAN ncnn failed — falling back to Lanczos.");
  }
} else if (method === "lanczos" && !bin && !useNcnn) {
  console.log("PyTorch Real-ESRGAN unavailable — npm run map:install-esrgan-py");
}

if (method === "lanczos" && useNcnn && !bin) {
  console.log("Real-ESRGAN ncnn not found (set REALESRGAN_BIN) — using Lanczos.");
}

if (method === "lanczos") {
  const r = await smoothTerrainImage(input, output, {
    scale,
    autoScale: !args["force-scale"],
    smooth,
    contrast: 1,
    saturation: 1,
  });
  method = "smooth-lanczos";
  fs.writeFileSync(
    path.resolve(output) + ".method.json",
    JSON.stringify({ method, scale: r.scaleUsed, smooth, input: path.resolve(input) }) + "\n"
  );
} else {
  if (aiSmooth > 0) {
    await smoothTerrainImage(output, output, {
      scale: 1,
      autoScale: false,
      smooth: aiSmooth,
      contrast: 1,
      saturation: 1,
    });
  }
  fs.writeFileSync(
    path.resolve(output) + ".method.json",
    JSON.stringify({
      method,
      scale,
      smooth: aiSmooth,
      model: "RealESRGAN_x4plus",
      input: path.resolve(input),
    }) + "\n"
  );
}

console.log(`OK method=${method} → ${output}`);
