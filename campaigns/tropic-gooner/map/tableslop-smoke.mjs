/**
 * Playwright smoke — tableslop overworld map viewer.
 *
 *   cd .staging/portfolio-redesign/_screenshots
 *   PREVIEW_URL=https://map.tableslop.org/ node ../../../../campaigns/tropic-gooner/map/tableslop-smoke.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = (process.env.PREVIEW_URL || 'https://map.tableslop.org/').replace(/\/?$/, '/');
const outDir = process.env.TABLESLOP_SHOT_DIR || path.join(__dirname, '_screenshots');
let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}
function pass(msg) {
  console.log(`OK: ${msg}`);
}

function inside(outer, inner) {
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  return (
    cx >= outer.x &&
    cx <= outer.x + outer.width &&
    cy >= outer.y &&
    cy <= outer.y + outer.height
  );
}

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// Prefer domcontentloaded — CDNs (fonts/marked) can stall `load`/`networkidle` on potato.
const res = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
if (!res?.ok()) {
  fail(`HTTP ${res?.status() ?? 'none'} at ${base}`);
} else {
  pass(`loads (${res.status()})`);
}

// Regression: stale coord_overrides + Edit OFF used to throw on `const profile` reassign → black map.
await page.evaluate(() => {
  localStorage.setItem(
    'tableslop-primavera-profile-v1',
    JSON.stringify({
      v: 1,
      mapRes: '2k',
      editMode: false,
      visited: [],
      notes: {},
      coord_overrides: { 'r01-paradise': { x_pct: 10, y_pct: 10 } },
    })
  );
});
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#mapImg, #mapTileLayer img', { timeout: 30000 });
await page.waitForTimeout(800);
const afterOverride = await page.evaluate(() => ({
  legend: document.querySelectorAll('.legend-chip').length,
  pins: document.querySelectorAll('.pin').length,
  mapImg: !!document.getElementById('mapImg') || document.querySelectorAll('#mapTileLayer img').length > 0,
}));
if (afterOverride.legend < 14 || afterOverride.pins < 14 || !afterOverride.mapImg) {
  fail(
    `CODE:TS-MAP-OVERRIDE-BOOT black-map regression (legend=${afterOverride.legend} pins=${afterOverride.pins} mapImg=${afterOverride.mapImg})`
  );
} else {
  pass('stale coord_overrides boot still renders map');
}

await page.waitForSelector('#mapStage', { state: 'attached', timeout: 30000 });
const hasTiles = await page.locator('#mapTileLayer img').count();
const hasImg = await page.locator('#mapImg').count();
if (hasTiles > 0) pass(`tile pyramid (${hasTiles} visible tiles)`);
else if (hasImg > 0) pass('map image rendered');
else fail('no map tiles or image in #mapStage');

const legendCount = await page.locator('.legend-chip').count();
if (legendCount < 14) {
  fail(`expected 14 legend chips, got ${legendCount}`);
} else {
  pass(`${legendCount} legend chips`);
}

await page.locator('#zoomIn').click();
await page.waitForTimeout(200);
const zoomLabel = await page.locator('#zoomLabel').textContent();
if (!zoomLabel || zoomLabel === '—') fail('zoom label did not update');
else pass(`zoom controls work (${zoomLabel.trim()})`);

const pinCount = await page.locator('.pin').count();
if (pinCount < 14) {
  fail(`expected 14 pins, got ${pinCount}`);
} else {
  pass(`${pinCount} region pins`);
}

const mapJson = await page.evaluate(async () => {
  const r = await fetch('/api/map');
  return r.ok ? r.json() : null;
});
if (mapJson?.label_layer === 'ui') {
  const labelCount = await page.locator('.map-label').count();
  if (labelCount < 14) fail(`label_layer=ui but only ${labelCount} .map-label elements`);
  else pass(`${labelCount} UI map labels`);
}

const stageBox = await page.locator('#mapStage').boundingBox();
if (!stageBox) {
  fail('no #mapStage bounding box');
} else {
  const pins = await page.locator('.pin').all();
  let outside = 0;
  for (const pin of pins) {
    const box = await pin.boundingBox();
    if (!box || !inside(stageBox, box)) outside += 1;
  }
  if (outside > 0) {
    fail(`${outside} pin(s) outside map image bounds (container bug)`);
  } else {
    pass('all pin centers inside map stage');
  }
}

const hud = await page.locator('.hud-brand').textContent();
if (!hud?.includes('tableslop')) fail('missing game HUD brand');
else pass('game HUD present');

// Cast = red silo (not orange Radio/Phone/Sim dock)
const castClass = await page.locator('#castToggle').getAttribute('class');
if (!castClass || !/\bhud-cast\b/.test(castClass)) {
  fail('CODE:TS-HUD-CAST-CHROME #castToggle missing hud-cast class');
} else if (/\bhud-dock\b/.test(castClass)) {
  fail('CODE:TS-HUD-CAST-CHROME #castToggle still uses hud-dock (must be red silo)');
} else {
  const castBg = await page.locator('#castToggle').evaluate((el) => getComputedStyle(el).backgroundColor);
  const phoneBg = await page.locator('#dockPhone').evaluate((el) => getComputedStyle(el).backgroundColor);
  if (castBg === phoneBg) fail(`CODE:TS-HUD-CAST-CHROME Cast bg matches Phone dock (${castBg})`);
  else pass(`Cast red chrome (class hud-cast; bg≠Phone ${phoneBg})`);
}

await page.locator('.region-card').first().click();
await page.waitForTimeout(400);
await page.locator('.legend-chip').nth(7).click();
await page.waitForTimeout(400);
const activeLegend = await page.locator('.legend-chip.is-active').count();
if (activeLegend !== 1) fail('legend chip focus did not activate');
else pass('legend chip focuses region');

const activePins = await page.locator('.pin.is-active').count();
if (activePins !== 1) fail(`click region card → expected 1 active pin, got ${activePins}`);
else pass('sidebar selects region on map');

// vibes.png display-name gate (CODE:TS-MAP-LABEL-LORE / TS-MAP-SOFT-PIN)
const forbidden = [
  'Crimson Quay', 'Crimzon Quay', 'Porto Lujuria', 'CuloVera', 'Culo Vera',
  'Lagoona Seica', 'Lagoona Seika', 'Federal Shores', 'Orchid Falls', 'Nueva Vista',
];
const required = [
  'Paradise', 'Porto Lujara', 'Jackedsonville', 'Villa Miel', 'San Aurelio',
  'Seaside Springs', 'Sierra Dorado', 'Ruby Harbor', 'Lagooni Seika',
  'Black Sand Beach Preserve', 'Portview', 'InterFederal Shores',
];
if (mapJson?.markers?.length) {
  const labels = mapJson.markers.map((m) => m.label || m.name || '');
  const lower = new Set(labels.map((x) => String(x).toLowerCase()));
  for (const bad of forbidden) {
    if (lower.has(bad.toLowerCase())) {
      const soft = bad === 'Orchid Falls' || bad === 'Nueva Vista';
      fail(`CODE:${soft ? 'TS-MAP-SOFT-PIN' : 'TS-MAP-LABEL-LORE'} forbidden display ${JSON.stringify(bad)}`);
    }
  }
  for (const need of required) {
    if (!labels.includes(need)) fail(`CODE:TS-MAP-LABEL-LORE missing vibes label ${JSON.stringify(need)}`);
  }
  if (labels.includes('Jackedsonville') && labels.includes('Porto Lujara')) {
    pass(`vibes label gate (${labels.length} markers)`);
  }
} else {
  fail('CODE:TS-API-MAP-PARSE /api/map missing markers for label gate');
}

// Region area polygons (painted boundaries) — expect core coastal + Sierra digitized
const areas = mapJson?.regions_ui_data?.areas || [];
if (!areas.length) {
  fail('CODE:TS-MAP-AREAS missing regions_ui_data.areas');
} else {
  const polys = areas.filter((a) => a.shape === 'polygon' && a.points);
  const needPoly = ['r01-paradise', 'r02-porto-lujuria', 'r03-crimson-quay', 'r08-sierra-dorado'];
  const missing = needPoly.filter((id) => !polys.some((a) => a.id === id));
  if (missing.length) fail(`CODE:TS-MAP-BOUNDARY missing polygons: ${missing.join(',')}`);
  else pass(`boundary polygons ${polys.length} (core Paradise/Porto/Jacked/Sierra present)`);
}

const shot = path.join(outDir, 'tableslop-overworld.png');
await page.screenshot({ path: shot, fullPage: false });
pass(`screenshot → ${shot}`);

await browser.close();
if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll tableslop smoke checks passed.');
