#!/usr/bin/env node
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const input = path.resolve(__dirname, "../../campaigns/tropic-gooner/map/output-onlinetools4k.png");

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;

function isContent(i) {
  const o = i * 4;
  const r = data[o];
  const g = data[o + 1];
  const b = data[o + 2];
  // not uniform pale water/sky margin
  if (b > 175 && r > 120 && g > 140) return false;
  return true;
}

let minX = W;
let minY = H;
let maxX = 0;
let maxY = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!isContent(y * W + x)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}

console.log("image", W, H);
console.log("content bbox px", { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY });
console.log("content bbox pct", {
  left: ((minX / W) * 100).toFixed(2),
  top: ((minY / H) * 100).toFixed(2),
  right: ((maxX / W) * 100).toFixed(2),
  bottom: ((maxY / H) * 100).toFixed(2),
});
