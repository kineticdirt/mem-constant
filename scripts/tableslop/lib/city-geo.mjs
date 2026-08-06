/**
 * city-geo.mjs — small polygon helpers for city map generation + checking.
 * Coordinates live in the island map's "image-percent" space (0..100, y down),
 * same space as regions-ui.json polygons.
 */

export function parsePoints(str) {
  return String(str || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return { x, y };
    })
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

export function fmtPoints(pts) {
  return pts.map((p) => `${round2(p.x)},${round2(p.y)}`).join(" ");
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Signed area (shoelace). Positive when winding is clockwise in y-down space. */
export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function polygonCentroid(pts) {
  const a = polygonArea(pts);
  if (Math.abs(a) < 1e-9) {
    const sx = pts.reduce((s, p) => s + p.x, 0);
    const sy = pts.reduce((s, p) => s + p.y, 0);
    return { x: sx / pts.length, y: sy / pts.length };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const w = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * w;
    cy += (p.y + q.y) * w;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function bbox(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** Ray-cast point-in-polygon. */
export function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return Math.hypot(p.x - x, p.y - y);
}

/** Min distance from point to polygon boundary (0 when strictly inside is NOT special-cased). */
export function distToPolygonEdge(p, pts) {
  let d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    d = Math.min(d, distToSegment(p, pts[j], pts[i]));
  }
  return d;
}

/** Inside, or within eps of the boundary. */
export function insideWithEps(p, pts, eps) {
  if (pointInPolygon(p, pts)) return true;
  return distToPolygonEdge(p, pts) <= eps;
}

/**
 * Sutherland–Hodgman clip of polygon `pts` against half-plane A*x + B*y <= C.
 * Returns a new vertex array (possibly empty).
 */
export function clipHalfPlane(pts, A, B, C) {
  const out = [];
  const val = (p) => A * p.x + B * p.y - C;
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const prev = pts[(i + pts.length - 1) % pts.length];
    const vc = val(cur);
    const vp = val(prev);
    const curIn = vc <= 0;
    const prevIn = vp <= 0;
    if (curIn !== prevIn) {
      const t = vp / (vp - vc);
      out.push({ x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) });
    }
    if (curIn) out.push(cur);
  }
  return out;
}

export function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Interior point with the largest clearance from the polygon's own edges,
 * found by grid scan over the bbox. Guaranteed to be strictly inside for
 * any polygon with nonzero area (grid fine enough for our blob shapes).
 */
export function bestInteriorPoint(pts, gridN = 48) {
  const bb = bbox(pts);
  let best = null;
  let bestD = -1;
  for (let i = 0; i <= gridN; i++) {
    for (let j = 0; j <= gridN; j++) {
      const p = {
        x: bb.minX + (bb.w * i) / gridN,
        y: bb.minY + (bb.h * j) / gridN,
      };
      if (!pointInPolygon(p, pts)) continue;
      const d = distToPolygonEdge(p, pts);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best; // null if nothing found (degenerate)
}

/** Sample each segment of a polyline densely; every sample must satisfy `ok(p)`. */
export function polylineSamplesOk(line, ok, samplesPerSeg = 16) {
  for (let i = 0; i + 1 < line.length; i++) {
    for (let s = 0; s <= samplesPerSeg; s++) {
      const p = lerp(line[i], line[i + 1], s / samplesPerSeg);
      if (!ok(p)) return false;
    }
  }
  return true;
}
