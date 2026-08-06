#!/usr/bin/env node
/**
 * check-city-maps.mjs — geometry sanity gate for generated city maps.
 *
 * Per city file in campaigns/tropic-gooner/map/cities/:
 *   1. every district vertex inside parent polygon (eps tolerance)
 *   2. pairwise district overlap ~ 0 (grid-sample estimate)
 *   3. districts tile the parent: sum(district areas) ~= parent area
 *   4. every street polyline (densely sampled) stays inside parent
 *   5. every landmark pin inside its stated district (point-in-polygon)
 *   6. referential sanity: unique ids, landmark->district refs, viewBox covers parent
 *
 * Prints PASS/FAIL per city; exit 1 on any FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parsePoints,
  polygonArea,
  bbox,
  pointInPolygon,
  insideWithEps,
  distToPolygonEdge,
  polylineSamplesOk,
} from "./lib/city-geo.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CITIES_DIR = path.join(REPO, "campaigns", "tropic-gooner", "map", "cities");
const REGIONS_JSON = path.join(REPO, "campaigns", "tropic-gooner", "map", "regions-ui.json");

const EPS_PARENT = 0.08; // percent-units tolerance at the parent boundary
const EPS_DISTRICT = 0.04;

/** Estimated overlap area of two polygons via a fixed 64x64 sample grid over the smaller bbox. */
function estimateOverlap(a, b) {
  const bba = bbox(a);
  const bbb = bbox(b);
  const minX = Math.max(bba.minX, bbb.minX);
  const minY = Math.max(bba.minY, bbb.minY);
  const maxX = Math.min(bba.maxX, bbb.maxX);
  const maxY = Math.min(bba.maxY, bbb.maxY);
  if (minX >= maxX || minY >= maxY) return 0;
  const N = 64;
  let hits = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const p = {
        x: minX + ((maxX - minX) * (i + 0.5)) / N,
        y: minY + ((maxY - minY) * (j + 0.5)) / N,
      };
      if (pointInPolygon(p, a) && pointInPolygon(p, b)) hits++;
    }
  }
  return (hits / (N * N)) * (maxX - minX) * (maxY - minY);
}

function checkCity(file, regionsById) {
  const problems = [];
  const city = JSON.parse(fs.readFileSync(file, "utf8"));
  const tag = city.region_id || path.basename(file);

  const parentEntry = regionsById.get(city.region_id);
  if (!parentEntry || !parentEntry.points) {
    return { tag, problems: [`parent region ${city.region_id} missing in regions-ui.json`] };
  }
  const parent = parsePoints(parentEntry.points);
  const parentArea = Math.abs(polygonArea(parent));
  const parentBb = bbox(parent);

  if ((city.districts || []).length < 4 || city.districts.length > 8) {
    problems.push(`district count ${city.districts?.length} outside 4..8`);
  }
  if ((city.streets || []).length < 6 || city.streets.length > 14) {
    problems.push(`street count ${city.streets?.length} outside 6..14`);
  }
  if ((city.landmarks || []).length < 8 || city.landmarks.length > 15) {
    problems.push(`landmark count ${city.landmarks?.length} outside 8..15`);
  }

  const ids = new Set();
  for (const coll of ["districts", "streets", "landmarks"]) {
    for (const item of city[coll] || []) {
      if (ids.has(item.id)) problems.push(`duplicate id ${item.id}`);
      ids.add(item.id);
    }
  }

  // viewBox covers parent bbox
  const vb = String(city.viewBox || "").split(/\s+/).map(Number);
  if (
    vb.length !== 4 ||
    vb.some((n) => !Number.isFinite(n)) ||
    vb[0] > parentBb.minX + 1e-6 ||
    vb[1] > parentBb.minY + 1e-6 ||
    vb[0] + vb[2] < parentBb.maxX - 1e-6 ||
    vb[1] + vb[3] < parentBb.maxY - 1e-6
  ) {
    problems.push(`viewBox "${city.viewBox}" does not cover parent bbox`);
  }

  const districts = (city.districts || []).map((d) => ({ ...d, _poly: parsePoints(d.points) }));

  // 1. district vertices inside parent
  for (const d of districts) {
    if (d._poly.length < 3) {
      problems.push(`district ${d.id} has <3 vertices`);
      continue;
    }
    for (const p of d._poly) {
      if (!insideWithEps(p, parent, EPS_PARENT)) {
        problems.push(
          `district ${d.id} vertex (${p.x},${p.y}) outside parent (dist ${distToPolygonEdge(p, parent).toFixed(3)})`
        );
      }
    }
  }

  // 2. pairwise overlap
  for (let i = 0; i < districts.length; i++) {
    for (let j = i + 1; j < districts.length; j++) {
      const ov = estimateOverlap(districts[i]._poly, districts[j]._poly);
      const smaller = Math.min(
        Math.abs(polygonArea(districts[i]._poly)),
        Math.abs(polygonArea(districts[j]._poly))
      );
      if (ov > Math.max(0.02, smaller * 0.03)) {
        problems.push(`districts ${districts[i].id} / ${districts[j].id} overlap ~${ov.toFixed(3)} area units`);
      }
    }
  }

  // 3. tiling coverage
  const sumArea = districts.reduce((s, d) => s + Math.abs(polygonArea(d._poly)), 0);
  const covDiff = Math.abs(sumArea - parentArea) / parentArea;
  if (covDiff > 0.02) {
    problems.push(`district area sum ${sumArea.toFixed(2)} vs parent ${parentArea.toFixed(2)} (${(covDiff * 100).toFixed(1)}% off)`);
  }

  // 4. streets inside parent
  const streetKinds = new Set(["main", "side", "alley"]);
  for (const s of city.streets || []) {
    if (!streetKinds.has(s.kind)) problems.push(`street ${s.id} bad kind '${s.kind}'`);
    const line = parsePoints(s.points);
    if (line.length < 2) {
      problems.push(`street ${s.id} has <2 points`);
      continue;
    }
    if (!polylineSamplesOk(line, (p) => insideWithEps(p, parent, EPS_PARENT), 24)) {
      problems.push(`street ${s.id} (${s.name}) leaves parent bounds`);
    }
  }

  // 5. landmarks inside stated district
  const districtById = new Map(districts.map((d) => [d.id, d]));
  const lmKinds = new Set(["bar", "dock", "hotel", "church", "market", "civic", "hideout"]);
  for (const lm of city.landmarks || []) {
    if (!lmKinds.has(lm.kind)) problems.push(`landmark ${lm.id} bad kind '${lm.kind}'`);
    const d = districtById.get(lm.district);
    if (!d) {
      problems.push(`landmark ${lm.id} references unknown district ${lm.district}`);
      continue;
    }
    const p = { x: lm.x, y: lm.y };
    if (!pointInPolygon(p, d._poly) && distToPolygonEdge(p, d._poly) > EPS_DISTRICT) {
      problems.push(`landmark ${lm.id} (${lm.name}) not inside district ${d.name}`);
    }
  }

  return { tag, problems, counts: { d: districts.length, s: (city.streets || []).length, l: (city.landmarks || []).length } };
}

function main() {
  const regions = JSON.parse(fs.readFileSync(REGIONS_JSON, "utf8"));
  const regionsById = new Map((regions.areas || []).map((a) => [a.id, a]));
  const files = fs
    .readdirSync(CITIES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(CITIES_DIR, f));
  if (!files.length) {
    console.error("FAIL: no city files in", CITIES_DIR);
    process.exit(1);
  }
  let failed = 0;
  for (const file of files.sort()) {
    const { tag, problems, counts } = checkCity(file, regionsById);
    if (problems.length) {
      failed++;
      console.log(`FAIL ${tag}  (districts=${counts?.d ?? "?"} streets=${counts?.s ?? "?"} landmarks=${counts?.l ?? "?"})`);
      for (const p of problems.slice(0, 12)) console.log(`  - ${p}`);
      if (problems.length > 12) console.log(`  - …and ${problems.length - 12} more`);
    } else {
      console.log(`PASS ${tag}  districts=${counts.d} streets=${counts.s} landmarks=${counts.l}`);
    }
  }
  console.log(failed ? `\n${failed} city file(s) FAILED` : `\nAll ${files.length} city files PASS`);
  process.exit(failed ? 1 : 0);
}

main();
