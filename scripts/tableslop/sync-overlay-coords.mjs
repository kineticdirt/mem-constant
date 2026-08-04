#!/usr/bin/env node
/**
 * Assign each of 14 regions a unique Canva overlay zone → pin + selectable ellipse.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mapRoot = path.resolve(__dirname, "../../campaigns/tropic-gooner/map");
const input = path.join(mapRoot, "output-onlinetools4k.png");

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;

function zoneKind(i) {
  const o = i * 4;
  const r = data[o];
  const g = data[o + 1];
  const b = data[o + 2];
  if (r > 100 && b > 100 && g < 70) return "purple";
  if (r > 170 && g > 140 && b < 100) return "yellow";
  return null;
}

const visited = new Uint8Array(W * H);
const zones = [];

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const kind = zoneKind(i);
    if (!kind || visited[i]) continue;
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
      if (visited[ci] || zoneKind(ci) !== kind) continue;
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
    if (count < 80) continue;
    zones.push({
      kind,
      count,
      cx: +(((sumX / count) / W) * 100).toFixed(2),
      cy: +(((sumY / count) / H) * 100).toFixed(2),
      rx: +((((maxX - minX + 1) / W) * 100) / 2).toFixed(2),
      ry: +((((maxY - minY + 1) / H) * 100) / 2).toFixed(2),
    });
  }
}

/** Seed hint (x,y) — names = vibes.png SoT (not lore rebrands). */
const REGIONS = [
  { id: "r01-paradise", region: 1, name: "Paradise", hint: [41, 55] },
  { id: "r02-porto-lujuria", region: 2, name: "Porto Lujara", hint: [41, 66] },
  { id: "r03-crimson-quay", region: 3, name: "Jackedsonville", hint: [33, 61] },
  { id: "r04-villa-miel", region: 4, name: "Villa Miel", hint: [21, 71] },
  { id: "r05-culovera", region: 5, name: "San Aurelio", hint: [34, 95] },
  { id: "r06-seaside-springs", region: 6, name: "Seaside Springs", hint: [61, 53] },
  { id: "r07-orchid-falls", region: 7, name: "Orchid Falls", hint: [60, 46] },
  { id: "r08-sierra-dorado", region: 8, name: "Sierra Dorado", hint: [43, 43] },
  { id: "r09-ruby-harbor", region: 9, name: "Ruby Harbor", hint: [30, 91] },
  { id: "r10-lagoona-seica", region: 10, name: "Lagooni Seika", hint: [51, 84] },
  { id: "r11-black-sand-preserve", region: 11, name: "Black Sand Beach Preserve", hint: [48, 15] },
  { id: "r12-nueva-vista", region: 12, name: "Nueva Vista", hint: [49, 52] },
  { id: "r13-portview", region: 13, name: "Portview", hint: [55, 71] },
  { id: "r14-federal-shores", region: 14, name: "InterFederal Shores", hint: [31, 38] },
];

const MANUAL = {
  // Vibes.png pin SoT (2026-07-26). Do NOT reintroduce lore display names.
  "r02-porto-lujuria": { cx: 41.0, cy: 66.0, rx: 3.2, ry: 2.6, kind: "purple" },
  "r06-seaside-springs": { cx: 61.0, cy: 53.0, rx: 8, ry: 7, kind: "yellow" },
  "r07-orchid-falls": { cx: 60.0, cy: 46.0, rx: 7, ry: 6, kind: "yellow" },
  // Sierra Dorado selectable area is a hand-digitized gold polygon in regions-ui.json —
  // this ellipse is only a fallback if someone re-runs sync without preserving polygons.
  "r08-sierra-dorado": { cx: 43.0, cy: 43.0, rx: 6.5, ry: 5.5, kind: "yellow" },
  "r10-lagoona-seica": { cx: 51.0, cy: 84.0, rx: 7, ry: 6, kind: "purple" },
  "r11-black-sand-preserve": { cx: 48.0, cy: 15.0, rx: 8, ry: 6, kind: "yellow" },
  "r14-federal-shores": { cx: 31.0, cy: 38.0, rx: 10, ry: 5, kind: "yellow" },
};

const used = new Set();
const assignments = [];

for (const reg of REGIONS) {
  if (MANUAL[reg.id]) {
    assignments.push({ reg, zone: MANUAL[reg.id] });
    continue;
  }
  const [hx, hy] = reg.hint;
  let bestIdx = -1;
  let bestD = Infinity;
  zones.forEach((z, zi) => {
    if (used.has(zi)) return;
    const d = Math.hypot(z.cx - hx, z.cy - hy);
    if (d < bestD) {
      bestD = d;
      bestIdx = zi;
    }
  });
  if (bestIdx < 0) {
    assignments.push({ reg, zone: { cx: hx, cy: hy, rx: 6, ry: 5, kind: "purple" } });
    continue;
  }
  used.add(bestIdx);
  assignments.push({ reg, zone: zones[bestIdx] });
}

const STROKE = { purple: "#b967ff", yellow: "#fffb96" };
const FILL = { purple: "rgba(185,103,255,0.18)", yellow: "rgba(255,251,150,0.18)" };

const regions = {};
const areas = [];

for (const { reg, zone } of assignments) {
  const kind = zone.kind || "purple";
  regions[reg.id] = {
    x_pct: zone.cx,
    y_pct: zone.cy,
    anchor: "overlay-zone-unique",
  };
  areas.push({
    id: reg.id,
    region: reg.region,
    name: reg.name,
    shape: "ellipse",
    cx: zone.cx,
    cy: zone.cy,
    rx: Math.max(4.5, +(zone.rx * 0.95).toFixed(2)),
    ry: Math.max(3.5, +(zone.ry * 0.95).toFixed(2)),
    stroke: STROKE[kind] || "#ff71ce",
    fill: FILL[kind] || "rgba(255,113,206,0.14)",
  });
  console.log(`R${reg.region} ${reg.name} → ${zone.cx}%, ${zone.cy}%`);
}

const coords = {
  version: 1,
  projection: "image-percent",
  source: "output-onlinetools4k.png",
  method: "unique Canva overlay zone per region; pin at zone centroid (label anchor)",
  updated_at: new Date().toISOString().slice(0, 10),
  regions,
};

const regionsUi = {
  version: 2,
  viewBox: "0 0 100 100",
  _doc: "Selectable ellipses — one unique overlay zone each; click to select region.",
  areas,
};

fs.writeFileSync(path.join(mapRoot, "coords.json"), JSON.stringify(coords, null, 2) + "\n");

const regionsUiPath = path.join(mapRoot, "regions-ui.json");
let skipRegionsUiWrite = false;
if (fs.existsSync(regionsUiPath)) {
  const existing = JSON.parse(fs.readFileSync(regionsUiPath, "utf8"));
  const hasGmPoly = (existing.areas || []).some((a) => {
    if (!a || a.shape === "ellipse") return false;
    const pts = a.points;
    if (typeof pts === "string" && pts.trim().length > 2) return true;
    return Array.isArray(pts) && pts.length >= 3;
  });
  if (hasGmPoly) {
    console.error(
      "REFUSE: regions-ui.json has GM polygons — sync-overlay-coords updates coords.json + map.json only (see REGIONS-UI-LOCK.md)."
    );
    skipRegionsUiWrite = true;
  }
}

if (!skipRegionsUiWrite) {
  fs.writeFileSync(regionsUiPath, JSON.stringify(regionsUi, null, 2) + "\n");
}

const mapJson = JSON.parse(fs.readFileSync(path.join(mapRoot, "map.json"), "utf8"));
mapJson.markers = (mapJson.markers || []).map((m) => {
  const c = regions[m.id];
  if (!c) return m;
  const next = {
    ...m,
    x_pct: c.x_pct,
    y_pct: c.y_pct,
    coord_status: "overlay-label",
  };
  // One coord pair — do not reintroduce label_* offsets.
  delete next.label_x_pct;
  delete next.label_y_pct;
  delete next.label_dy_pct;
  return next;
});
mapJson.updated_at = coords.updated_at;
fs.writeFileSync(path.join(mapRoot, "map.json"), JSON.stringify(mapJson, null, 2) + "\n");
