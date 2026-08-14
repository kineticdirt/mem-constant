#!/usr/bin/env node
/**
 * Sync map/cities/*.json streets (+ landmark stubs) → roads/shards/*.ndjson
 * Never touches regions-ui.json.
 *
 * Run: node scripts/tableslop/sync-city-roads-to-shards.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const CAMPAIGN = path.join(ROOT, "campaigns", "tropic-gooner");
const CITIES = path.join(CAMPAIGN, "map", "cities");
const ROADS = path.join(CAMPAIGN, "roads");

const FOCUS = [
  { region_id: "r01-paradise", file: "r01-paradise.json" },
  { region_id: "r02-porto-lujuria", file: "r02-porto-lujuria.json" },
  { region_id: "r03-crimson-quay", file: "r03-crimson-quay.json" },
];

function parsePoints(points) {
  return String(points || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return [Number(x), Number(y)];
    })
    .filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
}

function kindFromStreet(kind) {
  const k = String(kind || "local").toLowerCase();
  if (k === "main" || k === "arterial") return "arterial";
  if (k === "hwy" || k === "highway") return "hwy";
  return "local";
}

function dist2(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function nearestDistrictLabel(lm, districts) {
  let best = null;
  let bestD = Infinity;
  const p = [Number(lm.x), Number(lm.y)];
  for (const d of districts || []) {
    if (d.label_x == null || d.label_y == null) continue;
    const q = [Number(d.label_x), Number(d.label_y)];
    const dd = dist2(p, q);
    if (dd < bestD) {
      bestD = dd;
      best = q;
    }
  }
  return best;
}

function cityToFeatures(city, regionId, now) {
  const features = [];
  for (const s of city.streets || []) {
    const coords = parsePoints(s.points);
    if (coords.length < 2) continue;
    features.push({
      id: String(s.id || `rd-${regionId}-${features.length}`).replace(/^r0\d-[^-]+-s-/, "rd-"),
      region_id: regionId,
      kind: kindFromStreet(s.kind),
      name: s.name || s.id,
      ring: 0,
      refs: [`map/cities/${regionId}.json`, "streets"],
      coords,
      updated_at: now,
    });
  }
  for (const lm of city.landmarks || []) {
    if (lm.x == null || lm.y == null) continue;
    const anchor = nearestDistrictLabel(lm, city.districts);
    if (!anchor) continue;
    const tip = [Number(lm.x), Number(lm.y)];
    if (dist2(tip, anchor) < 0.05) continue;
    features.push({
      id: `rd-spur-${String(lm.id || lm.name).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      region_id: regionId,
      kind: "local",
      name: `${lm.name || lm.id} approach`,
      ring: 0,
      refs: [`landmark:${lm.id || lm.name}`],
      coords: [anchor, tip],
      meta: { spur: true },
      updated_at: now,
    });
  }
  return features;
}

function bayRingFeature(centers, now) {
  // Paradise → Jackedsonville → Porto Lujara → Paradise (bay ring from STREETS.md)
  const p = centers["r01-paradise"];
  const j = centers["r03-crimson-quay"];
  const o = centers["r02-porto-lujuria"];
  return {
    id: "rd-isla-bay-ring",
    region_id: "island",
    kind: "hwy",
    name: "Bay Ring Road",
    ring: 0,
    refs: ["worldbuilding/STREETS.md", "hwy:green"],
    coords: [
      [p.x, p.y],
      [(p.x + j.x) / 2, (p.y + j.y) / 2 - 1.5],
      [j.x, j.y],
      [(j.x + o.x) / 2, (j.y + o.y) / 2 + 1.2],
      [o.x, o.y],
      [(o.x + p.x) / 2, (o.y + p.y) / 2 + 0.8],
      [p.x, p.y],
    ],
    meta: { note: "Tri-city bay ring corridor (proposal geometry from city centers)" },
    updated_at: now,
  };
}

function writeNdjson(abs, rows) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

function main() {
  const now = new Date().toISOString();
  const centers = {};
  const shards = [];
  const regionToShard = {};

  for (const focus of FOCUS) {
    const abs = path.join(CITIES, focus.file);
    const city = JSON.parse(fs.readFileSync(abs, "utf8"));
    centers[focus.region_id] = city.center;
    const features = cityToFeatures(city, focus.region_id, now);
    const shardRel = `shards/${focus.region_id}.ndjson`;
    const shardAbs = path.join(ROADS, shardRel);
    writeNdjson(shardAbs, features);
    shards.push({
      id: focus.region_id,
      path: shardRel,
      feature_count: features.length,
      bytes: fs.statSync(shardAbs).size,
    });
    regionToShard[focus.region_id] = focus.region_id;
    console.log(focus.region_id, "features", features.length);
  }

  const islandFeats = [bayRingFeature(centers, now)];
  const islandRel = "shards/island-corridors.ndjson";
  const islandAbs = path.join(ROADS, islandRel);
  writeNdjson(islandAbs, islandFeats);
  shards.push({
    id: "island-corridors",
    path: islandRel,
    feature_count: islandFeats.length,
    bytes: fs.statSync(islandAbs).size,
  });
  regionToShard.island = "island-corridors";

  const index = {
    version: 2,
    updated_at: now,
    campaign: "tropic-gooner",
    shards,
    region_to_shard: regionToShard,
    notes:
      "Synced from map/cities streets+landmark spurs; Bay Ring hwy; 2D SoT; /3d shelved; regions-ui untouched",
  };
  fs.writeFileSync(path.join(ROADS, "index.json"), JSON.stringify(index, null, 2) + "\n", "utf8");
  console.log("SYNC_CITY_ROADS_OK", "shards", shards.length, "total_features", shards.reduce((n, s) => n + s.feature_count, 0));
}

main();
