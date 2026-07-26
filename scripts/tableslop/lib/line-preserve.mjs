import fs from "fs";
import path from "path";
import sharp from "sharp";
import { buildLineMask } from "./strip-overlays.mjs";

/**
 * Re-inject crisp map overlays (borders, roads) from source onto AI-upscaled terrain.
 * AI softens thin colored lines; nearest-neighbor source + saturation mask keeps them even.
 */
export async function reinjectMapLines(sourcePath, aiPath, outputPath, opts = {}) {
  const strength = opts.strength ?? 0.92;
  const baseMeta = await sharp(aiPath).metadata();
  const outW = baseMeta.width;
  const outH = baseMeta.height;

  const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = buildLineMask(data, info.width * info.height);

  const maskBuf = await sharp(mask, { raw: { width: info.width, height: info.height, channels: 1 } })
    .resize(outW, outH, { kernel: sharp.kernel.nearest })
    .blur(0.4)
    .linear(strength, 0)
    .png()
    .toBuffer();

  const crisp = await sharp(sourcePath)
    .resize(outW, outH, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();

  const linesWithAlpha = await sharp(crisp).joinChannel(maskBuf).png().toBuffer();

  const outPath = path.resolve(outputPath);
  const tmp = outPath + ".lines-tmp.png";
  await sharp(aiPath).composite([{ input: linesWithAlpha, blend: "over" }]).png({ compressionLevel: 6 }).toFile(tmp);
  fs.renameSync(tmp, outPath);
  return { outW, outH };
}

/** Mild unsharp tuned for map detail (after line reinject). */
export async function sharpenMapDetail(inputPath, outputPath, sigma = 0.65) {
  const inPath = path.resolve(inputPath);
  const outPath = path.resolve(outputPath);
  if (inPath === outPath) {
    const tmp = outPath + ".sharp-tmp.png";
    await sharp(inPath)
      .sharpen({ sigma, m1: 0.85, m2: 0.35, x1: 2, y2: 12 })
      .linear(1.04, -5)
      .png({ compressionLevel: 6 })
      .toFile(tmp);
    fs.renameSync(tmp, outPath);
  } else {
    await sharp(inPath)
      .sharpen({ sigma, m1: 0.85, m2: 0.35, x1: 2, y2: 12 })
      .linear(1.04, -5)
      .png({ compressionLevel: 6 })
      .toFile(outPath);
  }
}
