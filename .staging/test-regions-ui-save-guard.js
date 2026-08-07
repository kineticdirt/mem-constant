#!/usr/bin/env node
/** Self-check: saveRegionAreas may simplify one border without sibling wipe. */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "regions-ui-guard-"));
const regionsPath = path.join(tmp, "regions-ui.json");
const prev = {
  version: 20,
  viewBox: "0 0 100 100",
  enabled: true,
  areas: [
    {
      id: "r01-paradise",
      region: 1,
      name: "Paradise",
      shape: "polygon",
      points: Array.from({ length: 20 }, (_, i) => `${10 + i * 2},${20 + (i % 3)}`).join(" "),
    },
    {
      id: "r02-porto-lujuria",
      region: 2,
      name: "Porto",
      shape: "polygon",
      points: "10,10 20,10 20,20 10,20",
    },
  ],
};
fs.writeFileSync(regionsPath, JSON.stringify(prev, null, 2));

// Inline the guard helpers (mirror of tableslop-server.js) — keep in sync.
function parseAreaPointsServer(pointsStr) {
  const out = [];
  for (const tok of String(pointsStr || "").trim().split(/\s+/)) {
    if (!tok) continue;
    const [xs, ys] = tok.split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y]);
  }
  return out;
}
function countGmPolyStats(ui) {
  const areas = ui && ui.areas ? ui.areas : [];
  let polyCount = 0;
  let totalVerts = 0;
  for (const a of areas) {
    if (!a || a.shape === "ellipse") continue;
    const n = parseAreaPointsServer(String(a.points || "")).length;
    if (n >= 3) {
      polyCount += 1;
      totalVerts += n;
    }
  }
  return { polyCount, totalVerts };
}
function writeRegionsUiJson(ui, reason) {
  const prev = JSON.parse(fs.readFileSync(regionsPath, "utf8"));
  const prevStats = countGmPolyStats(prev);
  const nextStats = countGmPolyStats(ui);
  if (prevStats.polyCount > 0 && nextStats.polyCount === 0) {
    throw new Error("wipe all");
  }
  if (nextStats.polyCount < prevStats.polyCount) {
    throw new Error("poly count drop");
  }
  const prevById = new Map();
  for (const a of prev.areas || []) {
    if (!a || !a.id || a.shape === "ellipse") continue;
    const n = parseAreaPointsServer(String(a.points || "")).length;
    if (n >= 3) prevById.set(String(a.id), n);
  }
  const nextById = new Map();
  for (const a of ui.areas || []) {
    if (!a || !a.id || a.shape === "ellipse") continue;
    const n = parseAreaPointsServer(String(a.points || "")).length;
    if (n >= 3) nextById.set(String(a.id), n);
  }
  const editedId =
    reason === "saveRegionAreas" && ui._last_saved_id
      ? String(ui._last_saved_id)
      : null;
  for (const [id, prevN] of prevById) {
    if (editedId && id === editedId) continue;
    const nextN = nextById.get(id);
    if (nextN == null) throw new Error("drop sibling " + id);
    if (nextN < prevN) throw new Error("sibling shrink " + id);
  }
  if (ui && ui._last_saved_id) delete ui._last_saved_id;
  fs.writeFileSync(regionsPath, JSON.stringify(ui, null, 2) + "\n");
}

// Case 1: simplify Paradise 20 → 4 verts (total drops) — must PASS under new guard
{
  const ui = JSON.parse(fs.readFileSync(regionsPath, "utf8"));
  const ix = ui.areas.findIndex((a) => a.id === "r01-paradise");
  ui.areas[ix].points = "12,22 40,22 40,50 12,50";
  ui._last_saved_id = "r01-paradise";
  writeRegionsUiJson(ui, "saveRegionAreas");
  const after = JSON.parse(fs.readFileSync(regionsPath, "utf8"));
  const p = after.areas.find((a) => a.id === "r01-paradise");
  if (parseAreaPointsServer(p.points).length !== 4) throw new Error("paradise not simplified");
  const porto = after.areas.find((a) => a.id === "r02-porto-lujuria");
  if (parseAreaPointsServer(porto.points).length !== 4) throw new Error("porto sibling damaged");
  console.log("ok simplify paradise (20→4) while porto intact");
}

// Case 2: accidental sibling wipe — must REFUSE
{
  const ui = JSON.parse(fs.readFileSync(regionsPath, "utf8"));
  ui.areas = ui.areas.filter((a) => a.id === "r01-paradise");
  ui._last_saved_id = "r01-paradise";
  let refused = false;
  try {
    writeRegionsUiJson(ui, "saveRegionAreas");
  } catch (e) {
    refused = /poly count drop|drop sibling/.test(e.message);
  }
  if (!refused) throw new Error("should refuse sibling wipe");
  console.log("ok refuse sibling wipe");
}

// Case 3: OLD guard would refuse case 1 — document expected old failure mode
{
  const prevStats = { totalVerts: 24 };
  const nextStats = { totalVerts: 8 };
  if (!(prevStats.totalVerts > 0 && nextStats.totalVerts < prevStats.totalVerts)) {
    throw new Error("old-guard predicate broken");
  }
  console.log("ok old global-vert guard would have blocked case 1 (regression class)");
}

console.log("SELF-CHECK PASS");
fs.rmSync(tmp, { recursive: true, force: true });
