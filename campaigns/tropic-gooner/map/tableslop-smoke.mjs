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

const res = await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
if (!res?.ok()) {
  fail(`HTTP ${res?.status() ?? 'none'} at ${base}`);
} else {
  pass(`loads (${res.status()})`);
}

await page.waitForSelector('#mapStage', { timeout: 30000 });
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

const shot = path.join(outDir, 'tableslop-overworld.png');
await page.screenshot({ path: shot, fullPage: false });
pass(`screenshot → ${shot}`);

await browser.close();
if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll tableslop smoke checks passed.');
