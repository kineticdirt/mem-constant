#!/usr/bin/env node
/** Estimate region centroids from colored Canva overlay zones on the 4k source map. */
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

// Land mask: not pale blue water (high B, low R relative)
function isLand(i) {
  const o = i * 4;
  const r = data[o];
  const g = data[o + 1];
  const b = data[o + 2];
  if (b > 165 && r < 140 && g < 175) return false;
  if (b > 150 && r + g < b + 40) return false;
  return true;
}

// Overlay stroke pixels (saturated lines, not terrain)
function overlayKind(i) {
  const o = i * 4;
  const r = data[o];
  const g = data[o + 1];
  const b = data[o + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  if (sat < 0.35) return null;
  if (r > 140 && g < 100 && b < 100) return "red";
  if (g > 110 && r < 95 && b < 95) return "green";
  if (r > 90 && b > 90 && g < 85) return "purple";
  if (r > 150 && g > 130 && b < 90) return "yellow";
  return null;
}

// Flood-fill enclosed green-grid cells bordered by red (region parcels).
const visited = new Uint8Array(W * H);
const regions = [];

function idx(x, y) {
  return y * W + x;
}

for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    const i = idx(x, y);
    if (visited[i] || !isLand(i)) continue;
    if (overlayKind(i) !== null) continue;

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
      const ci = idx(cx, cy);
      if (visited[ci]) continue;
      if (!isLand(ci)) continue;
      if (overlayKind(ci) !== null) continue;
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

    const area = count;
    const boxW = maxX - minX;
    const boxH = maxY - minY;
    if (area < 800 || boxW < 12 || boxH < 12) continue;
    if (area > W * H * 0.12) continue;

    regions.push({
      cx: sumX / count,
      cy: sumY / count,
      area,
      boxW,
      boxH,
      x_pct: +((sumX / count / W) * 100).toFixed(2),
      y_pct: +((sumY / count / H) * 100).toFixed(2),
    });
  }
}

regions.sort((a, b) => a.cy - b.cy || a.cx - b.cx);

const payload = {
  version: 1,
  source: path.basename(input),
  width: W,
  height: H,
  method: "flood-fill land parcels between overlay lines",
  generated_at: new Date().toISOString().slice(0, 10),
  parcels: regions,
};

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
console.log(`Found ${regions.length} land parcels → ${outPath}`);
regions.forEach((r, n) => {
  console.log(`  ${String(n + 1).padStart(2)}  ${r.x_pct}% , ${r.y_pct}%  area=${r.area}`);
});
