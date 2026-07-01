import fs from "fs";
import path from "path";
import sharp from "sharp";

/**
 * Line/overlay mask shared by reinject + strip passes.
 */
export function buildLineMask(data, pixelCount) {
  const mask = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;

    const redBorder = r > 140 && g < 110 && b < 110;
    const greenGrid = g > 100 && r < 90 && b < 90;
    const purpleLine = r > 90 && b > 90 && g < 80;
    const yellowLine = r > 150 && g > 120 && b < 80;
    const darkInk = max < 55 && min < 40;
    const saturated = sat > 0.42;

    mask[i] = redBorder || greenGrid || purpleLine || yellowLine || darkInk || saturated ? 255 : 0;
  }
  return mask;
}

export async function maskBufferFromSource(sourcePath, outW, outH, soften = 0.4) {
  const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = buildLineMask(data, info.width * info.height);
  return sharp(mask, { raw: { width: info.width, height: info.height, channels: 1 } })
    .resize(outW, outH, { kernel: sharp.kernel.nearest })
    .blur(soften)
    .png()
    .toBuffer();
}

/** Remove baked borders/roads/labels from upscaled terrain (heal lines with local blur). */
export async function stripOverlaysFromRaster(rasterPath, maskSourcePath, outputPath) {
  const meta = await sharp(rasterPath).metadata();
  const maskBuf = await maskBufferFromSource(maskSourcePath, meta.width, meta.height, 1.2);
  const heal = await sharp(rasterPath).blur(4).toBuffer();
  const healMasked = await sharp(heal).joinChannel(maskBuf).png().toBuffer();

  const outPath = path.resolve(outputPath);
  const tmp = outPath + ".strip-tmp.png";
  await sharp(rasterPath).composite([{ input: healMasked, blend: "over" }]).png({ compressionLevel: 6 }).toFile(tmp);
  fs.renameSync(tmp, outPath);
  return { outW: meta.width, outH: meta.height };
}
