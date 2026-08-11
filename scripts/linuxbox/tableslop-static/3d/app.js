/**
 * Isla Primavera 3D — stylized procedural cities from GM-drawn region polygons.
 * Spec: docs/tableslop-3d-aesthetic.md (palette, ratios, height bands, seeding).
 * Data: GET /api/map → regions_ui_data.areas[] (viewBox-space polygons).
 * Optional: GET /api/cities/<region-id> (generated district maps) — when that route
 * is not mounted the page degrades to region-wide styling (see INTEGRATION-NOTE.md).
 * No build step; three.js is vendored next to this file (import map in index.html).
 */
import * as THREE from 'three';
import { OrbitControls } from '/3d/vendor/three/OrbitControls.js';
import { loadHeightField, addPaintedHeightMesh, addVoxelTerrain, TERRAIN_CFG } from '/3d/terrain.js';

const QS = new URLSearchParams(location.search);
const WANT_VOXELS = QS.get('voxels') === '1';

/* ---- Aesthetic constants (keep in sync with docs/tableslop-3d-aesthetic.md) ---- */
const CFG = {
  scale: 2,               // world units per viewBox unit
  storyH: 0.42,           // vu per story
  inset: 0.55,            // vu centroid-shrink inset → street ring at borders
  targetLots: 150,        // buildable-lot target per region (drives grid cell size)
  minCell: 0.9,           // vu — hamlet block (tiny regions still get lots)
  maxCell: 3.4,           // vu — big city block
  emptyLotChance: 0.12,   // parks / plazas / parking
  courtyardPalmChance: 0.5,
  gabledChance: 0.32,     // barrel-tile share; rest are flat roofs
  trimRoofChance: 0.3,    // share of flat roofs that get deco-white slabs
  palmSpacing: 2.4,       // vu along region border
  palmChance: 0.7,
  maxBorderPalms: 42,
  groundLift: 0.02,       // vu — region ground above island blob (fallback without heightmap)
  blockH: TERRAIN_CFG.blockH, // synced with terrain.js Minecraft columns
  palette: {
    walls: ['#a8d8b9', '#f2997b', '#f2d383', '#8fcfc9', '#f5ebd7', '#f4b8c1', '#f2c4a0', '#cfe0a8'],
    barrelRoofs: ['#b5523f', '#c96a4a', '#a84638', '#c25b45'],
    flatRoofs: ['#c9bfa9', '#d6cbb2'],
    trim: ['#faf6ec'],
    landmark: ['#faf6ec', '#e8788a', '#7fb8d8'],
    palmTrunk: '#8a6a4a',
    palmCrowns: ['#3e8a5a', '#4aa06a', '#357a50'],
    sand: '#eee2bd',
    wetSand: '#dfcaa2',
    shallow: '#8fd8cc',
    midSea: '#3fb3c6',
    deepSea: '#2a90ba',
    sky: '#63c5f0',
    fog: '#a8e0f2',
    sun: '#fff2cf',
  },
};

/* ---- tiny deterministic PRNG: xmur3 hash → mulberry32 ---- */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Seed = region id + raw points (+ city map text when loaded) → same inputs, same
 *  city; a border edit or district edit ⇒ new city. */
function rngForArea(area, extra) {
  return mulberry32(xmur3(area.id + '|' + String(area.points) + '|' + (extra || ''))());
}

/* ---- geometry helpers (all in viewBox units "vu" unless noted) ---- */
function parsePoints(raw) {
  const out = [];
  if (!raw) return out;
  const push = (x, y) => {
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  };
  if (Array.isArray(raw)) {
    // tolerate flat ["x","y",...] or ["x,y", ...] forms
    if (raw.length && String(raw[0]).includes(',')) {
      for (const pair of raw) {
        const [x, y] = String(pair).split(',');
        push(Number(x), Number(y));
      }
    } else {
      for (let i = 0; i + 1 < raw.length; i += 2) push(Number(raw[i]), Number(raw[i + 1]));
    }
  } else {
    for (const pair of String(raw).trim().split(/\s+/)) {
      const [x, y] = pair.split(',');
      push(Number(x), Number(y));
    }
  }
  // drop consecutive dupes / closing echo (earcut dislikes zero-length edges)
  return out.filter((p, i) => {
    const q = out[(i + 1) % out.length];
    return i === out.length - 1 || Math.abs(p.x - q.x) > 1e-4 || Math.abs(p.y - q.y) > 1e-4;
  });
}
function centroid(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}
function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}
function pointInPoly(pt, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > pt.y) !== (b.y > pt.y) &&
        pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
/** ponytail: centroid-shrink approximates a true polygon offset; lots are still PIP-tested
 *  against the ORIGINAL polygon, so buildings never escape borders. Upgrade path: clipper offset. */
function insetPolygon(pts, dist) {
  const c = centroid(pts);
  return pts.map((p) => {
    const dx = c.x - p.x, dy = c.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const t = Math.min(dist / len, 0.9);
    return { x: p.x + dx * t, y: p.y + dy * t };
  });
}
function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}
/** convex hull (monotone chain) — the "low-poly island blob" under everything */
function convexHull(pts) {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
/** data-driven district profile from polygon area (vu²) — no per-region hardcodes */
function profileFor(areaVu) {
  if (areaVu >= 60) return { kind: 'core', minS: 2, maxS: 5, landmarkS: [8, 10] };
  if (areaVu >= 20) return { kind: 'town', minS: 1, maxS: 4, landmarkS: [6, 8] };
  return { kind: 'village', minS: 1, maxS: 3, landmarkS: [4, 6] };
}

/* ---- region styling (content skin over the generic generator) ----
 * Default = Havana/Honolulu pastel (CFG.palette). Three named regions get their own
 * treatment per GM direction; geometry/seeding rules stay generic. */
const INDUSTRIAL = {
  walls: ['#b8b2a4', '#a89f8e', '#c4bda6', '#93a1a8', '#b09482', '#8f8578'],
  flatRoofs: ['#7d8a92', '#98a4a8', '#6e7a80'],
};
const DOCKS_RE = /muelle|dock|warehouse|lonja|wharf|harbor|puerto/i;
const STYLE_PROFILES = {
  'r01-paradise': { // Paradise — havana-vieja art deco: pastel stucco, generous white trim
    label: 'art deco',
    trimRoofChance: 0.48,
  },
  'r02-porto-lujuria': { // Porto Lujara — working industrial docks
    label: 'docks',
    walls: INDUSTRIAL.walls,
    flatRoofs: INDUSTRIAL.flatRoofs,
    barrelRoofs: ['#8a5a48'],
    gabledChance: 0.08,
    trimRoofChance: 0.06,
    palmChance: 0.32,
    courtyardPalmChance: 0.22,
    crates: 14,
    cratePalette: ['#a85a3f', '#5a7a8a', '#8a6a3a', '#4a6a5a', '#7a4a58'],
  },
  'r03-crimson-quay': { // Jackedsonville — the neon crimson quay
    label: 'neon',
    walls: ['#6a4a62', '#4a5a72', '#7a3a4e', '#3e4a5e', '#8a4a5a', '#5a3e5e'],
    flatRoofs: ['#2e2438', '#3a2f45'],
    barrelRoofs: ['#7a2e3e', '#8e3446'],
    gabledChance: 0.15,
    trimRoofChance: 0.55,
    trim: ['#ff2e6e', '#ff71ce', '#01cdfe', '#b967ff'],
    neonTrim: true,
    palmChance: 0.5,
  },
};
function styleFor(id) {
  return Object.assign({
    label: 'tropical',
    walls: CFG.palette.walls,
    flatRoofs: CFG.palette.flatRoofs,
    barrelRoofs: CFG.palette.barrelRoofs,
    trim: CFG.palette.trim,
    gabledChance: CFG.gabledChance,
    trimRoofChance: CFG.trimRoofChance,
    palmChance: CFG.palmChance,
    courtyardPalmChance: CFG.courtyardPalmChance,
    crates: 0,
    cratePalette: [],
    neonTrim: false,
  }, STYLE_PROFILES[id] || {});
}

/** unit gabled-roof prism: ridge along X at y=1, open bottom (sits on wall box) */
function makeGableGeometry() {
  const v = [
    // south slope
    [0.5, 0, 0.5], [-0.5, 0, 0.5], [-0.5, 1, 0],
    [0.5, 0, 0.5], [-0.5, 1, 0], [0.5, 1, 0],
    // north slope
    [-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 1, 0],
    [-0.5, 0, -0.5], [0.5, 1, 0], [-0.5, 1, 0],
    // gable ends
    [-0.5, 0, 0.5], [-0.5, 0, -0.5], [-0.5, 1, 0],
    [0.5, 0, -0.5], [0.5, 0, 0.5], [0.5, 1, 0],
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v.flat(), 3));
  geo.computeVertexNormals(); // non-indexed → per-face normals → flat look
  return geo;
}

/* ---- boot ---- */
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayMsg = document.getElementById('overlayMsg');
const stats = { regions: [], skipped: [], meshes: {}, totals: {}, drawCalls: 0, triangles: 0 };
window.__ts3d = { ready: false, error: null, stats };

function fail(title, msgHtml) {
  overlayTitle.textContent = title;
  overlayMsg.innerHTML = msgHtml;
  window.__ts3d.error = title;
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (err) {
  fail('WebGL unavailable', 'This device/browser cannot create a WebGL context.');
  throw err;
}

init().catch((err) => {
  console.error(err);
  fail('could not load the island', `${String((err && err.message) || err)} — try the <a href="/">2D map</a>.`);
});

async function init() {
  const res = await fetch('/api/map');
  if (!res.ok) {
    fail('map data unavailable', res.status === 401
      ? 'Login required — sign in on the <a href="/">2D map</a> first.'
      : `/api/map returned HTTP ${res.status}.`);
    return;
  }
  const data = await res.json();
  const rui = data.regions_ui_data || {};
  const areas = (Array.isArray(rui.areas) ? rui.areas : [])
    .map((a) => ({ a, pts: parsePoints(a && a.points) }))
    .filter(({ a, pts }) => {
      const ok = a && a.id && (!a.shape || a.shape === 'polygon') && pts.length >= 3;
      if (!ok && a && a.id) stats.skipped.push(a.id);
      return ok;
    });
  if (!areas.length) {
    fail('no region borders yet', 'Draw region borders on the <a href="/">2D map</a> first.');
    return;
  }

  // Optional generated city maps (map/cities/<id>.json via /api/cities/<id>) add
  // per-district styling. /api/map already flags which regions have one (marker
  // .city_map), so we only fetch those — regions without a file never 404.
  // Route is an integration option: non-OK ⇒ region-wide style.
  const cityIds = new Set(
    (Array.isArray(data.markers) ? data.markers : [])
      .filter((m) => m && m.city_map && typeof m.id === 'string')
      .map((m) => m.id),
  );
  const cityMaps = {}, seedExtra = {};
  await Promise.all(areas.filter(({ a }) => cityIds.has(a.id)).map(async ({ a }) => {
    try {
      const r = await fetch(`/api/cities/${a.id}`);
      if (!r.ok) return;
      const txt = await r.text();
      cityMaps[a.id] = JSON.parse(txt);
      seedExtra[a.id] = txt;
    } catch { /* degrade: region-wide styling */ }
  }));
  stats.citiesLoaded = Object.keys(cityMaps).length;

  const S = CFG.scale;
  const P = CFG.palette;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('scene').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.sky);
  const world = new THREE.Group();
  world.scale.set(S, S, S); // everything below is authored in viewBox units
  scene.add(world);

  const allPts = areas.flatMap(({ pts }) => pts);
  const isle = bboxOf(allPts);
  // Poly bbox for city layout; board camera uses full 100×100 when heightmesh present
  const isleC = { x: (isle.x0 + isle.x1) / 2, y: (isle.y0 + isle.y1) / 2 };
  const extentVu = Math.max(isle.x1 - isle.x0, isle.y1 - isle.y0, 1);
  let camC = { ...isleC };
  let extentCamVu = extentVu;
  const Epoly = extentVu * S;

  scene.add(new THREE.HemisphereLight(new THREE.Color(P.sky), new THREE.Color(P.sand), 1.0));
  const sun = new THREE.DirectionalLight(new THREE.Color(P.sun), 1.7);
  sun.position.set(isleC.x * S + Epoly * 0.6, Epoly * 1.1, isleC.y * S + Epoly * 0.35);
  scene.add(sun);

  /* ---- 2.5D painted heightmesh (default) or ?voxels=1 columns ---- */
  const heightField = await loadHeightField();
  const sampleH = heightField
    ? heightField.sampleHeightVu
    : () => CFG.groundLift;
  if (heightField) {
    stats.heightmap = true;
    if (WANT_VOXELS) {
      stats.terrain = addVoxelTerrain(world, heightField);
    } else {
      stats.terrain = await addPaintedHeightMesh(world, heightField);
    }
    stats.mode = stats.terrain.mode || (WANT_VOXELS ? 'voxels' : 'iso25d');
    if (stats.mode === 'iso25d') {
      camC = { x: 50, y: 50 };
      extentCamVu = 100;
    }
  } else {
    stats.heightmap = false;
    stats.mode = 'flat';
  }
  const E = extentCamVu * S;

  // Fog after mode is known — iso board: far/light so painted ocean stays readable
  if (stats.mode === 'iso25d') {
    scene.fog = new THREE.Fog(new THREE.Color(P.fog), E * 5.5, E * 14);
  } else {
    scene.fog = new THREE.Fog(new THREE.Color(P.fog), E * 1.3, E * 3.0);
  }

  /* ---- sea + island base (layered discs + convex-hull blob) ---- */
  const flatY = (geo, y) => { geo.rotateX(-Math.PI / 2); geo.translate(0, y, 0); return geo; };
  const lam = (color, extra) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
  const disc = (r, color, y) => {
    const geo = flatY(new THREE.CircleGeometry(r, 56), y);
    const m = new THREE.Mesh(geo, lam(color));
    m.position.set(isleC.x, 0, isleC.y);
    world.add(m);
  };
  // Painted heightmesh already shows ocean — skip Lambert sea discs in iso25d
  if (stats.mode !== 'iso25d') {
    disc(extentVu * 1.9, P.deepSea, -0.06);
    disc(extentVu * 1.35, P.midSea, -0.045);
    disc(extentVu * 1.12, P.shallow, -0.03);
  }
  // Flat sand blob only when no heightfield (painted/voxel terrain replaces it)
  if (!heightField) {
    const hull = convexHull(allPts);
    const hullC = centroid(hull);
    const hullScaled = (f) => hull.map((p) => ({ x: hullC.x + (p.x - hullC.x) * f, y: hullC.y + (p.y - hullC.y) * f }));
    const blob = (pts, color, y) => {
      const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y)));
      world.add(new THREE.Mesh(flatY(new THREE.ShapeGeometry(shape), y), lam(color, { side: THREE.DoubleSide })));
    };
    blob(hullScaled(1.1), P.wetSand, -0.028);
    blob(hullScaled(1.045), P.sand, -0.015);
  }

  /* ---- per-region generation (entries tagged with regionIdx for click lookup) ---- */
  const walls = [], flatRoofs = [], gabled = [], trunks = [], crowns = [], crates = [], neon = [];
  const hitMeshes = [];
  const groundMeshes = [];

  areas.forEach(({ a, pts }, regionIdx) => {
    const rng = rngForArea(a, seedExtra[a.id]);
    const pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
    const areaVu = polyArea(pts);
    const prof = profileFor(areaVu);
    const sty = styleFor(a.id);
    const districts = (cityMaps[a.id]?.districts || [])
      .map((d) => ({ d, pts: parsePoints(d.points) }))
      .filter(({ pts: dp }) => dp.length >= 3);
    const districtOf = (lot) => {
      const hit = districts.find(({ pts: dp }) => pointInPoly(lot, dp));
      return hit ? hit.d : null;
    };
    const c = centroid(pts);
    const inset = insetPolygon(pts, CFG.inset);
    const bb = bboxOf(inset);
    // Sit region on heightmap (Minecraft terrain); tiny regionIdx epsilon avoids z-fight
    const groundY = sampleH(c.x, c.y) + 0.02 + regionIdx * 0.0012;

    // grid-over-polygon subdivision → buildable lots (centers inside inset AND original)
    const cell = Math.min(CFG.maxCell, Math.max(CFG.minCell, Math.sqrt(areaVu / CFG.targetLots)));
    const lots = [];
    for (let gx = bb.x0; gx + cell <= bb.x1 + 1e-6; gx += cell) {
      for (let gz = bb.y0; gz + cell <= bb.y1 + 1e-6; gz += cell) {
        const ctr = { x: gx + cell / 2, y: gz + cell / 2 };
        if (pointInPoly(ctr, inset) && pointInPoly(ctr, pts)) lots.push(ctr);
      }
    }

    // landmark = buildable lot nearest the region centroid
    let landmarkLot = null, best = Infinity;
    for (const lot of lots) {
      const d = (lot.x - c.x) ** 2 + (lot.y - c.y) ** 2;
      if (d < best) { best = d; landmarkLot = lot; }
    }

    const placePalm = (x, z, y) => {
      const tilt = (rng() - 0.5) * 0.16;
      const h = 0.5 + rng() * 0.35;
      trunks.push({ x, y, z, w: 1, h, d: 1, rot: rng() * Math.PI * 2, tilt, color: P.palmTrunk, regionIdx });
      crowns.push({ x, y: y + h, z, w: 0.9 + rng() * 0.4, h: 0.5, d: 0.9 + rng() * 0.4, rot: rng() * Math.PI * 2, tilt, color: pick(P.palmCrowns), regionIdx });
    };

    let buildings = 0, palms = 0, maxY = 0;
    for (const lot of lots) {
      const lotY = sampleH(lot.x, lot.y) + 0.02 + regionIdx * 0.0012;
      if (rng() < CFG.emptyLotChance) {
        if (rng() < sty.courtyardPalmChance) { placePalm(lot.x, lot.y, lotY); palms++; }
        continue;
      }
      const isLandmark = lot === landmarkLot;
      const dst = districts.length ? districtOf(lot) : null;
      const docks = !!(dst && DOCKS_RE.test(`${dst.name || ''} ${dst.note || ''}`));
      const wallsPal = docks ? INDUSTRIAL.walls : sty.walls;
      const flatPal = docks ? INDUSTRIAL.flatRoofs : sty.flatRoofs;
      const gabledCh = docks ? sty.gabledChance * 0.3 : sty.gabledChance;
      const stories = isLandmark
        ? prof.landmarkS[0] + Math.floor(rng() * (prof.landmarkS[1] - prof.landmarkS[0] + 1))
        : prof.minS + Math.floor(rng() * (prof.maxS - prof.minS + 1));
      const h = stories * CFG.storyH;
      const w = cell * (0.58 + rng() * 0.22), d = cell * (0.58 + rng() * 0.22);
      const x = lot.x + (rng() - 0.5) * cell * 0.16, z = lot.y + (rng() - 0.5) * cell * 0.16;
      const rot = (rng() - 0.5) * 0.06;
      walls.push({ x, y: lotY + h / 2, z, w, h, d, rot, color: isLandmark ? pick(P.landmark) : pick(wallsPal), regionIdx });
      const trimBucket = sty.neonTrim ? neon : flatRoofs; // neon trim = unlit slabs that read as signage
      if (isLandmark) {
        // deco stepped cap: two shrinking trim slabs
        trimBucket.push({ x, y: lotY + h + 0.05, z, w: w * 0.72, h: 0.1, d: d * 0.72, rot, color: pick(sty.trim), regionIdx });
        trimBucket.push({ x, y: lotY + h + 0.15, z, w: w * 0.45, h: 0.1, d: d * 0.45, rot, color: pick(sty.trim), regionIdx });
      } else if (rng() < gabledCh) {
        gabled.push({ x, y: lotY + h, z, w: w * 1.07, h: 0.22 + rng() * 0.18, d: d * 1.07, rot: rng() < 0.5 ? 0 : Math.PI / 2, color: pick(sty.barrelRoofs), regionIdx });
      } else {
        const decoTrim = rng() < sty.trimRoofChance;
        (decoTrim ? trimBucket : flatRoofs).push({ x, y: lotY + h + 0.045, z, w: w * 1.08, h: 0.09, d: d * 1.08, rot, color: decoTrim ? pick(sty.trim) : pick(flatPal), regionIdx });
      }
      maxY = Math.max(maxY, lotY + h + 0.25);
      buildings++;
    }

    // border palms — walk the boundary by ARC LENGTH (GM polys have dense short
    // segments; per-edge spacing would starve), jittered, nudged inland
    let planted = 0;
    let acc = 0;
    let nextAt = CFG.palmSpacing * (0.6 + rng() * 0.8);
    for (let i = 0; i < pts.length && planted < CFG.maxBorderPalms; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % pts.length];
      const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      while (segLen > 1e-9 && acc + segLen >= nextAt && planted < CFG.maxBorderPalms) {
        const t = (nextAt - acc) / segLen;
        if (rng() < sty.palmChance) {
          const px = p0.x + (p1.x - p0.x) * t, py = p0.y + (p1.y - p0.y) * t;
          // fixed-distance inland pull (proportional pull strands palms on tiny polys)
          const dx = c.x - px, dy = c.y - py;
          const dl = Math.hypot(dx, dy) || 1;
          const pull = Math.min(0.4, dl * 0.5);
          const ix = px + (dx / dl) * pull + (rng() - 0.5) * 0.15;
          const iy = py + (dy / dl) * pull + (rng() - 0.5) * 0.15;
          if (pointInPoly({ x: ix, y: iy }, pts)) {
            placePalm(ix, iy, sampleH(ix, iy) + 0.02 + regionIdx * 0.0012);
            planted++;
            palms++;
          }
        }
        nextAt += CFG.palmSpacing * (0.85 + rng() * 0.4);
      }
      acc += segLen;
    }

    // dockside clutter: crate/container stacks near random lots (working-port texture)
    let crateCount = 0;
    for (let i = 0; i < (sty.crates || 0) && lots.length; i++) {
      const lot = lots[Math.floor(rng() * lots.length)];
      const s = 0.28 + rng() * 0.3;
      const cx = lot.x + (rng() - 0.5) * cell * 0.9, cz = lot.y + (rng() - 0.5) * cell * 0.9;
      if (!pointInPoly({ x: cx, y: cz }, pts)) continue;
      crates.push({ x: cx, y: sampleH(cx, cz) + 0.02 + regionIdx * 0.0012 + s / 2, z: cz, w: s, h: s, d: s, rot: rng() * Math.PI, color: pick(sty.cratePalette), regionIdx });
      crateCount++;
    }

    // region ground tint — whisper only in 2.5D so painted map stays readable
    const tint = new THREE.Color(a.fill || '#cccccc').lerp(new THREE.Color(P.sand), 0.62);
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y)));
    const ground = new THREE.Mesh(
      flatY(new THREE.ShapeGeometry(shape), groundY),
      lam(tint, {
        side: THREE.DoubleSide,
        transparent: !!heightField,
        opacity: heightField ? (stats.mode === 'iso25d' ? 0.12 : 0.28) : 1,
      }),
    );
    ground.userData.regionIdx = regionIdx;
    world.add(ground);
    groundMeshes.push(ground);
    hitMeshes.push(ground);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, groundY + 0.012, p.y)));
    world.add(new THREE.LineLoop(lineGeo, new THREE.LineBasicMaterial({ color: a.stroke || '#888888', transparent: true, opacity: 0.55 })));

    // floating label sprite above the tallest building
    const label = makeLabel(a.name || a.id);
    label.position.set(c.x, maxY + 2.6, c.y);
    world.add(label);

    stats.regions.push({ id: a.id, name: a.name, region: a.region, profile: prof.kind, style: sty.label, districts: districts.length, lots: lots.length, buildings, palms, crates: crateCount });
  });

  /* ---- instanced meshes: one draw call per archetype, per-instance colors ---- */
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
  const tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
  function buildInstanced(geo, entries, mat) {
    const im = new THREE.InstancedMesh(geo, mat || lam('#ffffff'), entries.length);
    im.userData.regionIdxOf = entries.map((e) => e.regionIdx);
    entries.forEach((e, i) => {
      tmpE.set(e.tilt || 0, e.rot || 0, (e.tilt || 0) * 0.7);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpV.set(e.x, e.y, e.z), tmpQ, tmpS.set(e.w, e.h, e.d));
      im.setMatrixAt(i, tmpM);
      im.setColorAt(i, tmpC.set(e.color));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    world.add(im);
    hitMeshes.push(im);
    return im;
  }
  const trunkGeo = new THREE.CylinderGeometry(0.05, 0.075, 1, 5);
  trunkGeo.translate(0, 0.5, 0); // base at origin so scale-y grows upward
  const crownGeo = new THREE.IcosahedronGeometry(0.5, 0);
  crownGeo.scale(1, 0.55, 1);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  let instancedMeshes = 0;
  const addInst = (geo, entries, mat) => { if (entries.length) { buildInstanced(geo, entries, mat); instancedMeshes++; } };
  addInst(boxGeo, walls);
  addInst(boxGeo, flatRoofs);
  addInst(makeGableGeometry(), gabled);
  addInst(trunkGeo, trunks);
  addInst(crownGeo, crowns);
  addInst(boxGeo, crates);
  addInst(boxGeo, neon, new THREE.MeshBasicMaterial({ color: '#ffffff' })); // unlit = neon glow
  stats.meshes = { instanced: instancedMeshes, grounds: groundMeshes.length, borderLines: areas.length, labels: areas.length };
  stats.totals = { buildings: walls.length, roofs: flatRoofs.length + gabled.length, palms: trunks.length, crates: crates.length, neon: neon.length };

  function makeLabel(text) {
    const pad = 30, fs = 46;
    const cv = document.createElement('canvas');
    const meas = cv.getContext('2d');
    meas.font = `${fs}px VT323, monospace`;
    cv.width = Math.ceil(meas.measureText(text).width) + pad * 2;
    cv.height = 76;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(13,2,33,0.55)';
    ctx.beginPath();
    ctx.roundRect(0, 6, cv.width, 64, 10);
    ctx.fill();
    ctx.font = `${fs}px VT323, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#0d0221';
    ctx.strokeText(text, cv.width / 2, 39);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, cv.width / 2, 39);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const hVu = 2.6;
    sp.scale.set((cv.width / cv.height) * hVu, hVu, 1);
    sp.renderOrder = 10;
    return sp;
  }

  /* ---- isometric 2.5D board: orthographic, pan+zoom only (no free orbit) ---- */
  const aspect0 = window.innerWidth / Math.max(1, window.innerHeight);
  // Iso foreshortening needs margin over AABB; frame full board when heightmesh
  let frustumSize = E * (stats.mode === 'iso25d' ? 1.45 : 1.15);
  const camera = new THREE.OrthographicCamera(
    (-frustumSize * aspect0) / 2,
    (frustumSize * aspect0) / 2,
    frustumSize / 2,
    -frustumSize / 2,
    0.1,
    E * 40,
  );
  const targetY = heightField ? E * 0.04 : 0;
  const look = new THREE.Vector3(camC.x * S, targetY, camC.y * S);
  const isoD = E * 1.55;
  camera.position.set(look.x + isoD, look.y + isoD * 0.92, look.z + isoD);
  camera.lookAt(look);
  camera.zoom = 1;
  camera.updateProjectionMatrix();

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(look);
  controls.enableRotate = false;
  controls.enablePan = true;
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.screenSpacePanning = true;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.touches = {
    ONE: THREE.TOUCH.PAN,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };
  controls.minZoom = 0.45;
  controls.maxZoom = 4.5;
  controls.update();
  stats.camera = 'orthographic-iso';
  stats.enableRotate = false;
  stats.frustumVu = extentCamVu;

  /* ---- click (not drag) → region corner panel ---- */
  const panel = document.getElementById('panel');
  const panelName = document.getElementById('panelName');
  const panelMeta = document.getElementById('panelMeta');
  const panelSwatch = document.getElementById('panelSwatch');
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 6) { downAt = null; return; }
    downAt = null;
    ndc.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(hitMeshes, false);
    if (!hits.length) { panel.hidden = true; return; }
    const hit = hits[0];
    const idx = hit.object.userData.regionIdx ?? hit.object.userData.regionIdxOf?.[hit.instanceId];
    if (idx == null) { panel.hidden = true; return; }
    const { a } = areas[idx];
    const st = stats.regions[idx];
    panelSwatch.style.background = a.fill || '#cccccc';
    panelName.textContent = a.name || a.id;
    panelMeta.textContent = `Region R${a.region} · ${st.profile} · ${st.style}${st.districts ? ` · ${st.districts} districts` : ''} · ${st.buildings} buildings · ${st.palms} palms${st.crates ? ` · ${st.crates} crates` : ''}`;
    panel.hidden = false;
  });

  window.addEventListener('resize', () => {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.left = (-frustumSize * aspect) / 2;
    camera.right = (frustumSize * aspect) / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
    stats.drawCalls = renderer.info.render.calls;
    stats.triangles = renderer.info.render.triangles;
  });
  overlay.classList.add('fade');
  setTimeout(() => { overlay.hidden = true; }, 400);
  window.__ts3d.ready = true;
}
