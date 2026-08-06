#!/usr/bin/env node
/**
 * gen-city-maps.mjs — deterministic proposal-grade city maps for tableslop.
 *
 * Reads parent polygons from campaigns/tropic-gooner/map/regions-ui.json
 * (READ-ONLY — GM-owned) and writes campaigns/tropic-gooner/map/cities/<region-id>.json.
 *
 * Layout: wedge sectors around the city center (half-plane clips of the parent
 * polygon, so districts tile the parent exactly by construction), seeded PRNG
 * per region id so re-runs reproduce the same city. Content (names, kinds)
 * lives in PLANS below — GM edits to the JSON files win over re-generation.
 *
 * Usage: node scripts/tableslop/gen-city-maps.mjs [--force]
 *   --force  overwrite files the GM has edited (generated.gm_touched marker)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parsePoints,
  fmtPoints,
  round2,
  polygonArea,
  polygonCentroid,
  bbox,
  pointInPolygon,
  insideWithEps,
  clipHalfPlane,
  lerp,
  bestInteriorPoint,
  polylineSamplesOk,
} from "./lib/city-geo.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REGIONS_JSON = path.join(REPO, "campaigns", "tropic-gooner", "map", "regions-ui.json");
const OUT_DIR = path.join(REPO, "campaigns", "tropic-gooner", "map", "cities");
const FORCE = process.argv.includes("--force");

/** In y-down percent space: 0 = east, PI/2 = south, PI = west, -PI/2 = north. */
const N = -Math.PI / 2;
const S = Math.PI / 2;
const E = 0;

const PLANS = {
  "r01-paradise": {
    cityName: "Paradise",
    blurb: "Resort strip on the middle bay — tourist face over old town bones.",
    water: S,
    tie: "desc",
    districts: [
      { name: "CiDance Tower District", note: "Glass hotel towers over the swim-up bars; buffet below, discretion above." },
      { name: "Boardwalk Strip", note: "Day-crowd tourism: wristbands, taffy, festival crates staged for CRT optics." },
      { name: "Marina / Gilded Anchor", note: "Yacht money and gala philanthropy; Elysium-adjacent after hours." },
      { name: "Casco Viejo", note: "Whitewashed old town — dominoes, chapels, and doors that stay shut." },
      { name: "CRT Substation Block", note: "Police substation and staging yard; riot gear behind festival bunting." },
      { name: "PIU South Campus", note: "Hospitality interns in pressed linen staffing every hotel front desk." },
    ],
    ring: "Malecón Circuit",
    radialStreets: [
      "Avenida de las Palmas",
      "Calle del Sol",
      "Anchor Way",
      "Calle Vieja",
      "Substation Road",
      "Camino del Campus",
    ],
    alleys: ["Java Lane", "Callejón de la Marea"],
    landmarks: [
      { d: "Marina / Gilded Anchor", name: "The Gilded Anchor Yacht Club", kind: "dock", desc: "Masts and gala money; kindred-friendly after dark." },
      { d: "Marina / Gilded Anchor", name: "Muelle de los Sueños", kind: "dock", desc: "Charter skiffs and sunset-cruise touts." },
      { d: "Boardwalk Strip", name: "Java Jump", kind: "bar", desc: "Iced coffee by day, rum under the counter by night." },
      { d: "Boardwalk Strip", name: "Galaxy Fitness", kind: "civic", desc: "Beachfront gym; influencers and off-duty security." },
      { d: "Boardwalk Strip", name: "Mercado del Malecón", kind: "market", desc: "Fruit stalls and festival-wristband resellers." },
      { d: "CiDance Tower District", name: "CiDance Paradise Tower", kind: "hotel", desc: "Buffet lunches below Floor 14; companion packages above it." },
      { d: "CiDance Tower District", name: "Hotel Coralina", kind: "hotel", desc: "Mid-rise with the island's loudest pool deck." },
      { d: "CRT Substation Block", name: "Paradise CRT Substation", kind: "civic", desc: "Riot crates staged for festival optics." },
      { d: "PIU South Campus", name: "PIU South Campus Gate", kind: "civic", desc: "Intern shuttle loop and the good empanada cart." },
      { d: "Casco Viejo", name: "Iglesia de Santa Marea", kind: "church", desc: "Whitewashed chapel booked solid with dock weddings." },
      { d: "Casco Viejo", name: "El Escondite", kind: "hideout", desc: "Back-room card game behind an empanada counter." },
      { d: "Casco Viejo", name: "Bar La Concha", kind: "bar", desc: "Dominoes and aguardiente; no wristbands served." },
    ],
  },
  "r02-porto-lujuria": {
    cityName: "Porto Lujara",
    blurb: "Working port at the south tip of the middle bay — nets, manifests, hills.",
    water: N,
    tie: "asc",
    districts: [
      { name: "Muelle Viejo", note: "Old docks and the harbormaster's ledgers; everything lands here first." },
      { name: "La Lonja", note: "Fish auction at dawn; the smell reaches the hills by noon." },
      { name: "Warehouse Row", note: "Bonded stores and missing-manifest cages." },
      { name: "Casco Antiguo", note: "Colonial grid of posadas and chapels above the wharves." },
      { name: "Las Lomas", note: "Hill streets of captains' houses looking down at the bay." },
    ],
    ring: "Ronda del Puerto",
    radialStreets: [
      "Calle del Puerto",
      "Calle de las Redes",
      "Avenida del Almacén",
      "Calle Real de Lujara",
      "Cuesta de la Virgen",
    ],
    alleys: ["Callejón de los Siete Mares", "Bajada del Pescador"],
    landmarks: [
      { d: "Muelle Viejo", name: "Capitanía del Puerto", kind: "civic", desc: "Harbormaster's office — mooring fees and quiet bribes." },
      { d: "Muelle Viejo", name: "Muelle de Carga", kind: "dock", desc: "Rust cranes unloading copra, rum, and unlisted crates." },
      { d: "La Lonja", name: "La Lonja Fishmarket", kind: "market", desc: "Dawn auction; buy the catch or broker someone else's." },
      { d: "La Lonja", name: "Bar El Ancla Rota", kind: "bar", desc: "Net-menders' bar; dice on the zinc counter." },
      { d: "Warehouse Row", name: "Almacén Siete Mares", kind: "hideout", desc: "Bonded warehouse with a cage the auditors never open." },
      { d: "Warehouse Row", name: "Depósito del Norte", kind: "civic", desc: "Customs stores, perpetually audited, never closed." },
      { d: "Casco Antiguo", name: "Iglesia de la Virgen del Muelle", kind: "church", desc: "Sailors light candles here before the crossing." },
      { d: "Casco Antiguo", name: "Posada del Pescador", kind: "hotel", desc: "Twelve rooms, one parrot, no questions." },
      { d: "Las Lomas", name: "Mirador de las Lomas", kind: "civic", desc: "Hilltop lookout over the whole middle bay." },
      { d: "Las Lomas", name: "Casa de Cartas", kind: "hideout", desc: "Quinta with a cellar game the police pretend not to know." },
    ],
  },
  "r03-crimson-quay": {
    cityName: "Jackedsonville",
    blurb: "The island's big harbor city — ferry quay, foundries, and a market that never fully closes.",
    water: E,
    tie: "desc",
    districts: [
      { name: "The Quay", note: "Ferry front and ferry-town money; the city's handshake with the bay." },
      { name: "Centro", note: "Downtown blocks around the clocktower; clerks, fixers, reporters." },
      { name: "Foundry Row", note: "Industrial waterfront — smoke, union hall, deep-water piers." },
      { name: "Loma Vista", note: "Residential hill above the port; bougainvillea and quiet money." },
      { name: "Mercado Central", note: "Arcade of stalls spilling into side streets; best mangoes on the island." },
      { name: "Barrio Alto", note: "Upper-west blocks of rooftop radios and domino leagues." },
    ],
    ring: "Quayside Loop",
    radialStreets: [
      "Crimson Boulevard",
      "Avenida Jackedson",
      "Foundry Road",
      "Subida de la Loma",
      "Calle del Mercado",
      "Calle de las Flores",
    ],
    alleys: ["Callejón Sin Nombre", "Paso del Carbón"],
    landmarks: [
      { d: "The Quay", name: "Crimson Quay Ferry Terminal", kind: "dock", desc: "Hourly ferries across the middle bay; the old name survives here." },
      { d: "The Quay", name: "The Rusty Pelican", kind: "bar", desc: "Longshoremen and off-shift ferry crews." },
      { d: "The Quay", name: "Hotel Miramar", kind: "hotel", desc: "Bay-view balconies and lobby ceiling fans since forever." },
      { d: "Foundry Row", name: "Foundry Union Hall", kind: "civic", desc: "Strike banners folded behind the meeting-room bar." },
      { d: "Foundry Row", name: "El Sótano", kind: "hideout", desc: "Basement card room under a shuttered chandlery." },
      { d: "Foundry Row", name: "Muelle Grande", kind: "dock", desc: "Deep-water pier for the coastal freighters." },
      { d: "Centro", name: "Torre del Reloj", kind: "civic", desc: "Clocktower; city-hall clerks smoke on the steps." },
      { d: "Centro", name: "Catedral de la Bahía", kind: "church", desc: "Twin towers, cool stone, noon mass in Spanish." },
      { d: "Centro", name: "El Grifo Rojo", kind: "bar", desc: "Reporters, fixers, and off-duty magistrates." },
      { d: "Mercado Central", name: "Mercado Central Arcade", kind: "market", desc: "Stalls under iron and glass; haggle or pay double." },
      { d: "Loma Vista", name: "Estación de la Loma", kind: "civic", desc: "Hilltop stop on the coastal line; bougainvillea platform." },
      { d: "Barrio Alto", name: "Bar Las Antenas", kind: "bar", desc: "Rooftop radio heads and the domino league finals." },
    ],
  },
};

const DISTRICT_FILLS = [
  ["#7a8a5a", "#55603e"],
  ["#5a7a8a", "#3e5560"],
  ["#8a7a5a", "#60553e"],
  ["#6a8a6a", "#4a604a"],
  ["#8a6a6a", "#604a4a"],
  ["#7a6a8a", "#554e60"],
  ["#8a8a4a", "#606033"],
  ["#4a7a7a", "#335555"],
];

function hashSeed(s) {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slug(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function angDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** Half-planes through center C bounding the wedge swept from angle a0 to a1 (a0 < a1, span <= PI). */
function wedgeHalfPlanes(C, a0, a1) {
  // With y down, increasing angle sweeps visually clockwise.
  // cross(dir(ang), p-C) = -sin*x + cos*y + (sin*Cx - cos*Cy)
  const hp = (ang, keepPositive) => {
    const s = Math.sin(ang);
    const c = Math.cos(ang);
    const k = s * C.x - c * C.y;
    // cross >= 0 ⟺ -s*x + c*y >= -k ⟺ s*x - c*y <= k
    // cross <= 0 ⟺ -s*x + c*y <= -k
    return keepPositive ? { A: s, B: -c, C: k } : { A: -s, B: c, C: -k };
  };
  return [hp(a0, true), hp(a1, false)];
}

function ensureInsidePolyline(line, parent, C) {
  const ok = (p) => insideWithEps(p, parent, 0.05);
  for (let iter = 0; iter < 15; iter++) {
    if (polylineSamplesOk(line, ok)) return line;
    // Move the vertex farthest from C that participates in a failing segment toward C.
    let worst = -1;
    let worstD = -1;
    for (let i = 0; i < line.length; i++) {
      if (pointInPolygon(line[i], parent)) continue;
      const d = Math.hypot(line[i].x - C.x, line[i].y - C.y);
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst < 0) {
      // All vertices inside but an edge bows out (concave span): pull the midpoint in.
      let done = false;
      for (let i = 0; i + 1 < line.length && !done; i++) {
        for (let s = 1; s < 16 && !done; s++) {
          const p = lerp(line[i], line[i + 1], s / 16);
          if (!ok(p)) {
            const far = Math.hypot(line[i].x - C.x, line[i].y - C.y) >
              Math.hypot(line[i + 1].x - C.x, line[i + 1].y - C.y)
              ? i
              : i + 1;
            line[far] = lerp(line[far], C, 0.12);
            done = true;
          }
        }
      }
      if (!done) return line;
    } else {
      line[worst] = lerp(line[worst], C, 0.12);
    }
  }
  return line;
}

function generateCity(regionId, parentArea, plan) {
  const seed = hashSeed(regionId);
  const rng = mulberry32(seed);
  const parent = parsePoints(parentArea.points);
  const bb = bbox(parent);
  let C = polygonCentroid(parent);
  if (!pointInPolygon(C, parent)) {
    C = bestInteriorPoint(parent, 64) || C;
  }

  // Wedge boundaries: equal sectors starting half-a-sector behind the water
  // direction, jittered per-seed, order preserved with a minimum gap.
  const nD = plan.districts.length;
  const step = (Math.PI * 2) / nD;
  const start = plan.water - step / 2;
  const bounds = [];
  for (let i = 0; i < nD; i++) {
    bounds.push(start + i * step + (rng() - 0.5) * 0.11);
  }

  const districts = [];
  for (let i = 0; i < nD; i++) {
    const a0 = bounds[i];
    const a1 = i + 1 < nD ? bounds[i + 1] : bounds[0] + Math.PI * 2;
    let poly = parent;
    for (const hp of wedgeHalfPlanes(C, a0, a1)) {
      poly = clipHalfPlane(poly, hp.A, hp.B, hp.C);
      if (!poly.length) break;
    }
    if (poly.length < 3 || Math.abs(polygonArea(poly)) < 1e-4) {
      throw new Error(`${regionId}: wedge ${i} produced empty district — adjust plan`);
    }
    districts.push({ poly, centroid: polygonCentroid(poly) });
  }

  // Assign plan names: most water-facing sector first; ties broken by angle.
  const tieSign = plan.tie === "asc" ? 1 : -1;
  const order = districts
    .map((d, i) => {
      const ang = Math.atan2(d.centroid.y - C.y, d.centroid.x - C.x);
      return { i, rank: angDiff(ang, plan.water), ang };
    })
    .sort((a, b) => a.rank - b.rank || tieSign * (a.ang - b.ang));

  const districtAreas = [];
  const districtEntries = order.map(({ i }, k) => {
    const [fill, stroke] = DISTRICT_FILLS[k % DISTRICT_FILLS.length];
    const meta = plan.districts[k];
    const poly = districts[i].poly;
    districtAreas.push(Math.abs(polygonArea(poly)));
    return {
      id: `${regionId}-d-${slug(meta.name)}`,
      name: meta.name,
      shape: "polygon",
      points: fmtPoints(poly),
      fill,
      stroke,
      note: meta.note,
      _poly: poly,
    };
  });

  // Streets: ring (ray-cast loop at ~70% of boundary distance from C — star-shaped,
  // so it survives the parent's concave necks) + one radial per district + two alleys.
  const anchorFor = (entry) =>
    bestInteriorPoint(entry._poly, 40) || polygonCentroid(entry._poly);

  const rayBoundaryDist = (ang) => {
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    let best = Infinity;
    for (let i = 0, j = parent.length - 1; i < parent.length; j = i++) {
      const a = parent[j];
      const b = parent[i];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const den = dx * ey - dy * ex; // cross(d, e)
      if (Math.abs(den) < 1e-12) continue;
      const wx = a.x - C.x;
      const wy = a.y - C.y;
      const t = (wx * ey - wy * ex) / den; // cross(a-C, e)/cross(d, e)
      const s = (wx * dy - wy * dx) / den; // cross(a-C, d)/cross(d, e)
      if (t > 1e-9 && s >= -1e-9 && s <= 1 + 1e-9 && t < best) best = t;
    }
    return best;
  };

  const streets = [];
  const RAYS = 36;
  const ringPts = [];
  for (let k = 0; k < RAYS; k++) {
    const ang = (Math.PI * 2 * k) / RAYS;
    const t = rayBoundaryDist(ang);
    const r = Number.isFinite(t) ? t * 0.7 : Math.max(bb.w, bb.h) * 0.1;
    ringPts.push({ x: C.x + Math.cos(ang) * r, y: C.y + Math.sin(ang) * r });
  }
  ringPts.push({ ...ringPts[0] }); // close the loop as a polyline
  const ringLine = ensureInsidePolyline(ringPts, parent, C);
  ringLine[ringLine.length - 1] = { ...ringLine[0] }; // re-close after nudges
  streets.push({
    id: `${regionId}-s-${slug(plan.ring)}`,
    name: plan.ring,
    kind: "main",
    _line: ringLine,
  });

  const anchors = districtEntries.map(anchorFor);
  districtEntries.forEach((entry, k) => {
    const A = anchors[k];
    const line = [C, lerp(C, A, 0.55), lerp(C, A, 0.88)];
    streets.push({
      id: `${regionId}-s-${slug(plan.radialStreets[k])}`,
      name: plan.radialStreets[k],
      kind: k < 3 ? "main" : "side",
      _line: ensureInsidePolyline(line, parent, C),
    });
    entry._anchor = A;
  });

  for (let a = 0; a < 2; a++) {
    const i = Math.floor(rng() * districtEntries.length);
    const j = (i + 1 + Math.floor(rng() * (districtEntries.length - 2))) % districtEntries.length;
    const line = [lerp(C, anchors[i], 0.6), lerp(C, anchors[j], 0.6)];
    streets.push({
      id: `${regionId}-s-${slug(plan.alleys[a])}`,
      name: plan.alleys[a],
      kind: "alley",
      _line: ensureInsidePolyline(line, parent, C),
    });
  }

  // Landmarks: inside their stated district, jittered off the anchor, with a
  // minimum pin separation so markers never overlap in the city view.
  const byName = new Map(districtEntries.map((d) => [d.name, d]));
  const minSep = Math.max(bb.w, bb.h) * 0.045;
  const placed = [];
  const landmarks = plan.landmarks.map((lm) => {
    const district = byName.get(lm.d);
    if (!district) throw new Error(`${regionId}: landmark '${lm.name}' refs unknown district '${lm.d}'`);
    const anchor = district._anchor;
    let p = null;
    for (let attempt = 0; attempt < 20 && !p; attempt++) {
      let q = lerp(anchor, C, 0.1 + rng() * 0.3);
      q = { x: q.x + (rng() - 0.5) * 0.5, y: q.y + (rng() - 0.5) * 0.5 };
      let guard = 0;
      while (!pointInPolygon(q, district._poly) && guard++ < 12) q = lerp(q, anchor, 0.2);
      if (placed.every((o) => Math.hypot(o.x - q.x, o.y - q.y) >= minSep)) p = q;
    }
    if (!p) p = anchor; // ponytail: dense district — anchor is always valid, slight overlap accepted
    placed.push(p);
    return {
      id: `${regionId}-l-${slug(lm.name)}`,
      name: lm.name,
      kind: lm.kind,
      district: district.id,
      x: round2(p.x),
      y: round2(p.y),
      desc: lm.desc,
    };
  });

  // Label anchor = max-clearance interior point (safe for concave sectors).
  for (const d of districtEntries) {
    d.label_x = round2(d._anchor.x);
    d.label_y = round2(d._anchor.y);
    delete d._poly;
    delete d._anchor;
  }

  const margin = Math.max(bb.w, bb.h) * 0.05;
  const vb = {
    x: round2(bb.minX - margin),
    y: round2(bb.minY - margin),
    w: round2(bb.w + margin * 2),
    h: round2(bb.h + margin * 2),
  };

  return {
    _doc: "GENERATED proposal-grade city map — GM edits win. Districts/streets/landmarks are a seeded starting layout the GM can edit by hand; re-running gen-city-maps.mjs overwrites unless generated.gm_touched is set true. Coords share the island image-percent space (0..100, y down).",
    version: 1,
    region_id: regionId,
    name: plan.cityName,
    blurb: plan.blurb,
    viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}`,
    parent_region: {
      id: parentArea.id,
      name: parentArea.name,
      shape: parentArea.shape || "polygon",
      points: parentArea.points,
      fill: parentArea.fill,
      stroke: parentArea.stroke,
      _doc: "Read-only reference copy of the GM-drawn region polygon from regions-ui.json. Edit the original, never this copy.",
    },
    center: { x: round2(C.x), y: round2(C.y) },
    districts: districtEntries,
    streets: streets.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      points: fmtPoints(s._line),
    })),
    landmarks,
    generated: {
      by: "k3-city-map-gen",
      at: new Date().toLocaleDateString("en-CA"),
      seed,
      gm_touched: false,
    },
  };
}

function main() {
  const regions = JSON.parse(fs.readFileSync(REGIONS_JSON, "utf8"));
  const areasById = new Map((regions.areas || []).map((a) => [a.id, a]));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const [regionId, plan] of Object.entries(PLANS)) {
    const parent = areasById.get(regionId);
    if (!parent || !parent.points) throw new Error(`${regionId}: parent polygon missing in regions-ui.json`);
    const out = path.join(OUT_DIR, `${regionId}.json`);
    if (fs.existsSync(out) && !FORCE) {
      try {
        const prev = JSON.parse(fs.readFileSync(out, "utf8"));
        if (prev?.generated?.gm_touched) {
          console.log(`skip ${regionId} (gm_touched)`);
          continue;
        }
      } catch {
        /* unreadable — regenerate */
      }
    }
    const city = generateCity(regionId, parent, plan);
    fs.writeFileSync(out, JSON.stringify(city, null, 2) + "\n");
    console.log(
      `wrote ${path.relative(REPO, out)}  districts=${city.districts.length} streets=${city.streets.length} landmarks=${city.landmarks.length} seed=${city.generated.seed}`
    );
  }
}

main();
