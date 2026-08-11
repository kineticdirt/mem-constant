/**
 * Minecraft-like heightmap terrain + road tops for Isla Primavera /3d.
 * Data: /map-heightmap-256.json + .bin + /map-roadmask-256.bin (baked from map art).
 */
import * as THREE from 'three';

export const TERRAIN_CFG = {
  blockH: 0.14, // vu per height step (maxH 32 → ~4.5 vu mountains)
  fetchMeta: '/map-heightmap-256.json',
  fetchHeight: '/map-heightmap-256.bin',
  fetchRoads: '/map-roadmask-256.bin',
  // Minecraft-ish bands
  grass: '#5a9e4a',
  dirt: '#8b6914',
  stone: '#7a756c',
  peak: '#e8e4dc',
  road: '#4a4a4a',
  roadEdge: '#3a3a3a',
};

/**
 * @returns {Promise<{meta: object, height: Uint8Array, roads: Uint8Array, sampleHeightVu: Function}|null>}
 */
export async function loadHeightField() {
  try {
    const metaRes = await fetch(TERRAIN_CFG.fetchMeta);
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    const w = meta.w || 256;
    const h = meta.h || 256;
    const n = w * h;
    const [hb, rb] = await Promise.all([
      fetch(TERRAIN_CFG.fetchHeight).then((r) => (r.ok ? r.arrayBuffer() : null)),
      fetch(TERRAIN_CFG.fetchRoads).then((r) => (r.ok ? r.arrayBuffer() : null)),
    ]);
    if (!hb || hb.byteLength < n) return null;
    const height = new Uint8Array(hb.slice(0, n));
    const roads = rb && rb.byteLength >= n ? new Uint8Array(rb.slice(0, n)) : new Uint8Array(n);
    const blockH = TERRAIN_CFG.blockH;
    function sampleHeightVu(x, y) {
      const gx = Math.max(0, Math.min(w - 1, Math.floor((x / 100) * w)));
      const gy = Math.max(0, Math.min(h - 1, Math.floor((y / 100) * h)));
      return (height[gy * w + gx] || 0) * blockH;
    }
    return { meta, height, roads, sampleHeightVu, w, h, blockH };
  } catch {
    return null;
  }
}

function bandColor(hv) {
  if (hv >= 24) return TERRAIN_CFG.peak;
  if (hv >= 16) return TERRAIN_CFG.stone;
  if (hv >= 8) return TERRAIN_CFG.dirt;
  return TERRAIN_CFG.grass;
}

/**
 * Add chunked InstancedMesh columns + road tops into world (viewBox units).
 * @returns {{drawCalls: number, landCells: number, roadCells: number}}
 */
export function addVoxelTerrain(world, field) {
  const { height, roads, w, h, blockH } = field;
  const cell = 100 / w;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const lam = (hex) =>
    new THREE.MeshLambertMaterial({ color: hex, flatShading: true });

  // Bucket instances by material key to keep draw calls low
  const buckets = {
    grass: [],
    dirt: [],
    stone: [],
    peak: [],
    road: [],
  };

  let landCells = 0;
  let roadCells = 0;
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      const i = gy * w + gx;
      const hv = height[i];
      if (!hv) continue;
      landCells++;
      const x = (gx + 0.5) * cell;
      const z = (gy + 0.5) * cell;
      const colH = hv * blockH;
      // column from y=0 up — Minecraft block column feel
      const entry = {
        x,
        y: colH / 2,
        z,
        w: cell * 0.98,
        h: colH,
        d: cell * 0.98,
        rot: 0,
        color: bandColor(hv),
      };
      if (hv >= 24) buckets.peak.push(entry);
      else if (hv >= 16) buckets.stone.push(entry);
      else if (hv >= 8) buckets.dirt.push(entry);
      else buckets.grass.push(entry);

      if (roads[i]) {
        roadCells++;
        buckets.road.push({
          x,
          y: colH + blockH * 0.35,
          z,
          w: cell * 0.92,
          h: blockH * 0.55,
          d: cell * 0.92,
          rot: 0,
          color: TERRAIN_CFG.road,
        });
      }
    }
  }

  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const tmpC = new THREE.Color();

  let drawCalls = 0;
  function addBucket(key, colorHex) {
    const entries = buckets[key];
    if (!entries.length) return;
    const mat = lam(colorHex);
    const im = new THREE.InstancedMesh(boxGeo, mat, entries.length);
    entries.forEach((e, idx) => {
      tmpE.set(0, e.rot || 0, 0);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpV.set(e.x, e.y, e.z), tmpQ, tmpS.set(e.w, e.h, e.d));
      im.setMatrixAt(idx, tmpM);
      im.setColorAt(idx, tmpC.set(e.color));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.userData.terrain = true;
    world.add(im);
    drawCalls++;
  }

  addBucket('grass', TERRAIN_CFG.grass);
  addBucket('dirt', TERRAIN_CFG.dirt);
  addBucket('stone', TERRAIN_CFG.stone);
  addBucket('peak', TERRAIN_CFG.peak);
  addBucket('road', TERRAIN_CFG.road);

  return { drawCalls, landCells, roadCells };
}
