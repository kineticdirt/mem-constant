#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const input = path.resolve(
  process.argv[2] || path.join(__dirname, "../../campaigns/tropic-gooner/map/output-onlinetools4k.png")
);
const outPath = path.resolve(
  process.argv[3] || path.join(__dirname, "../../campaigns/tropic-gooner/map/coords.json")
);

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;

function fillKind(i) {
  const o = i * 4;
  const r = data[o];
  const g = data[o + 1];
  const b = data[o + 2];
  if (r > 100 && b > 100 && g < 70) return "purple";
  if (r > 170 && g > 140 && b < 100) return "yellow";
  return null;
}

const visited = new Uint8Array(W * H);
const blobs = [];

function idx(x, y) {
  return y * W + x;
}

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    const kind = fillKind(i);
    if (!kind || visited[i]) continue;

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      const ci = idx(cx, cy);
      if (visited[ci] || fillKind(ci) !== kind) continue;
      visited[ci] = 1;
      sumX += cx;
      sumY += cy;
      count++;
      if (cx > 0) stack.push([cx - 1, cy]);
      if (cx < W - 1) stack.push([cx + 1, cy]);
      if (cy > 0) stack.push([cx, cy - 1]);
      if (cy < H - 1) stack.push([cx, cy + 1]);
    }
    if (count < 80) continue;
    blobs.push({
      kind,
      count,
      x_pct: +((sumX / count / W) * 100).toFixed(2),
      y_pct: +((sumY / count / H) * 100).toFixed(2),
    });
  }
}

blobs.sort((a, b) => a.y_pct - b.y_pct || a.x_pct - b.x_pct);

const payload = {
  version: 1,
  source: path.basename(input),
  width: W,
  height: H,
  method: "connected purple/yellow fill blobs from Canva overlay",
  blobs,
};

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
console.log(`blobs: ${blobs.length}`);
blobs.forEach((b, n) => console.log(`${n + 1}. ${b.kind} ${b.x_pct}%, ${b.y_pct}% (${b.count}px)`));
