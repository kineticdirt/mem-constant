#!/usr/bin/env node
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

function classify(i) {
  const o = i * 4;
  const r = data[o];
  const g = data[o + 1];
  const b = data[o + 2];
  if (g > 100 && r < 80 && b < 80) return "green-line";
  if (r > 130 && g < 90 && b < 90) return "red-line";
  if (r > 100 && b > 100 && g < 70) return "purple-fill";
  if (r > 170 && g > 140 && b < 100) return "yellow-fill";
  if (b > 160 && r < 150) return "water";
  return "terrain";
}

const counts = {};
for (let i = 0; i < W * H; i++) {
  const k = classify(i);
  counts[k] = (counts[k] || 0) + 1;
}
console.log("pixel counts", counts);

// Cluster purple-fill and yellow-fill centroids via grid buckets
for (const kind of ["purple-fill", "yellow-fill"]) {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (classify(i) === kind) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  if (n) {
    console.log(kind, "centroid", ((sx / n / W) * 100).toFixed(1), ((sy / n / H) * 100).toFixed(1), "n=", n);
  }
}

// Sample grid of overlay density for manual mapping
const step = Math.floor(W / 20);
console.log("\ngrid sample (green-line density):");
for (let gy = 0; gy < 10; gy++) {
  let row = "";
  for (let gx = 0; gx < 10; gx++) {
    let g = 0;
    let t = 0;
    for (let y = gy * step; y < (gy + 1) * step && y < H; y++) {
      for (let x = gx * step; x < (gx + 1) * step && x < W; x++) {
        t++;
        if (classify(y * W + x) === "green-line") g++;
      }
    }
    row += g / t > 0.02 ? "#" : ".";
  }
  console.log(row);
}
