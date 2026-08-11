/**
 * Isla Primavera terrain for /3d.
 * Default: painted 2.5D heightmesh (master-enhanced on heightmap).
 * Optional: ?voxels=1 Minecraft columns (debug).
 */
import * as THREE from 'three';

export const TERRAIN_CFG = {
  blockH: 0.06, // vu per height step (maxH 32 → ~1.9 vu board relief; was 0.14 cliffs)
  fetchMeta: '/map-heightmap-256.json',
  fetchHeight: '/map-heightmap-256.bin',
  fetchRoads: '/map-roadmask-256.bin',
  /** Prefer 2k for phone; falls back to full master via /map-image */
  mapTextureUrl: '/map-image?res=2k',
  mapTextureFallback: '/map-image',
  grass: '#5a9e4a',
  dirt: '#8b6914',
  stone: '#7a756c',
  peak: '#e8e4dc',
  road: '#4a4a4a',
};

/**
 * @returns {Promise<{meta: object, height: Uint8Array, roads: Uint8Array, sampleHeightVu: Function, w: number, h: number, blockH: number}|null>}
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
      // round to match painted mesh vertex indexing (floor left half-cell mismatch)
      const gx = Math.max(0, Math.min(w - 1, Math.round((x / 100) * (w - 1))));
      const gy = Math.max(0, Math.min(h - 1, Math.round((y / 100) * (h - 1))));
      return (height[gy * w + gx] || 0) * blockH;
    }
    return { meta, height, roads, sampleHeightVu, w, h, blockH };
  } catch {
    return null;
  }
}

async function loadMapTexture() {
  const loader = new THREE.TextureLoader();
  const tryUrl = (url) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`texture timeout ${url}`)), 12000);
      loader.load(
        url,
        (tex) => {
          clearTimeout(t);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          resolve(tex);
        },
        undefined,
        (err) => {
          clearTimeout(t);
          reject(err);
        },
      );
    });
  for (const url of [TERRAIN_CFG.mapTextureUrl, TERRAIN_CFG.mapTextureFallback]) {
    try {
      const tex = await tryUrl(url);
      return { tex, url };
    } catch {
      /* try next */
    }
  }
  return { tex: null, url: null };
}

/**
 * Displaced plane with painted map albedo — primary 2.5D board surface.
 * @returns {Promise<{drawCalls: number, landCells: number, roadCells: number, mode: string, textureUrl: string|null}>}
 */
export async function addPaintedHeightMesh(world, field) {
  const { height, roads, w, h, blockH } = field;
  let landCells = 0;
  let roadCells = 0;
  for (let i = 0; i < height.length; i++) {
    if (height[i]) landCells++;
    if (roads[i] && height[i]) roadCells++;
  }

  // segments = cells; vertices = w * h
  const geo = new THREE.PlaneGeometry(100, 100, w - 1, h - 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(50, 0, 50);

  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const gx = Math.max(0, Math.min(w - 1, Math.round((x / 100) * (w - 1))));
    const gy = Math.max(0, Math.min(h - 1, Math.round((z / 100) * (h - 1))));
    pos.setY(i, (height[gy * w + gx] || 0) * blockH);
    // PNG row0 = image top = viewBox y=0 (north); world z = viewBox y
    uv.setXY(i, x / 100, 1 - z / 100);
  }
  pos.needsUpdate = true;
  uv.needsUpdate = true;
  geo.computeVertexNormals();

  const { tex, url } = await loadMapTexture();
  // Unlit albedo so the painted map reads like a 2.5D board (Lambert washes greens flat)
  const mat = tex
    ? new THREE.MeshBasicMaterial({ map: tex })
    : new THREE.MeshLambertMaterial({ color: '#5a9e4a', flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.terrain = true;
  mesh.userData.mode = 'iso25d';
  // Slight polygon offset so region borders/buildings win depth fights on flats
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = 1;
  mat.polygonOffsetUnits = 1;
  world.add(mesh);

  return {
    drawCalls: 1,
    landCells,
    roadCells,
    mode: 'iso25d',
    textureUrl: url,
  };
}

function bandColor(hv) {
  if (hv >= 24) return TERRAIN_CFG.peak;
  if (hv >= 16) return TERRAIN_CFG.stone;
  if (hv >= 8) return TERRAIN_CFG.dirt;
  return TERRAIN_CFG.grass;
}

/**
 * Optional Minecraft columns (?voxels=1).
 * @returns {{drawCalls: number, landCells: number, roadCells: number, mode: string}}
 */
export function addVoxelTerrain(world, field) {
  const { height, roads, w, h, blockH } = field;
  const cell = 100 / w;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const lam = (hex) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });

  const buckets = { grass: [], dirt: [], stone: [], peak: [], road: [] };
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

  return { drawCalls, landCells, roadCells, mode: 'voxels' };
}
