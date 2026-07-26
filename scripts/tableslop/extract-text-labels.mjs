#!/usr/bin/env node
/** Find baked map label centroids (light text on terrain) → coords draft. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const input = path.resolve(
  process.argv[2] || path.join(__dirname, "../../campaigns/tropic-gooner/map/output-onlinetools4k.png")
);

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;

function isTextPixel(i) {
  const o = i * 4;
  const r = data[o];
  const g = data[o + 1];
  const b = data[o + 2];
  const lum = (r + g + b) / 3;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  // white/cream label strokes + pink label fill
  if (lum > 200 && sat < 0.35) return true;
  if (r > 200 && g > 160 && b > 160 && sat < 0.25) return true;
  if (r > 180 && g < 120 && b > 120 && sat > 0.25) return true; // pink text
  return false;
}

function isOverlayLine(i) {
  const o = i * 4;
  const r = data[o];
  const g = data[o + 1];
  const b = data[o + 2];
  if (g > 100 && r < 80 && b < 80) return true;
  if (r > 130 && g < 90 && b < 90) return true;
  if (r > 100 && b > 100 && g < 70) return true;
  if (r > 170 && g > 140 && b < 100) return true;
  return false;
}

const visited = new Uint8Array(W * H);
const blobs = [];

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (visited[i] || !isTextPixel(i) || isOverlayLine(i)) continue;

    let minX = x;
    let maxX = x;
    let minY = y;
    let maxY = y;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    const stack = [[x, y]];

    while (stack.length) {
      const [cx, cy] = stack.pop();
      const ci = cy * W + cx;
      if (visited[ci] || !isTextPixel(ci) || isOverlayLine(ci)) continue;
      visited[ci] = 1;
      sumX += cx;
      sumY += cy;
      count++;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      if (cx > 0) stack.push([cx - 1, cy]);
      if (cx < W - 1) stack.push([cx + 1, cy]);
      if (cy > 0) stack.push([cx, cy - 1]);
      if (cy < H - 1) stack.push([cx, cy + 1]);
    }

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (count < 40 || count > 8000) continue;
    if (bw < 8 || bh < 4) continue;
    if (bw > W * 0.25 || bh > H * 0.08) continue;

    blobs.push({
      count,
      bw,
      bh,
      x_pct: +((sumX / count / W) * 100).toFixed(2),
      y_pct: +((sumY / count / H) * 100).toFixed(2),
    });
  }
}

blobs.sort((a, b) => a.y_pct - b.y_pct || a.x_pct - b.x_pct);
console.log(`text-like blobs: ${blobs.length}`);
blobs.forEach((b, n) => console.log(`${n + 1}. ${b.x_pct}%, ${b.y_pct}% (${b.count}px ${b.bw}x${b.bh})`));
