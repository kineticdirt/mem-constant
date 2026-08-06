/**
 * Playwright smoke — tableslop radio player (/radio/).
 *
 * Serves scripts/linuxbox/tableslop-static/ itself? No — expects a static server
 * already running at PREVIEW_URL (default http://127.0.0.1:8899).
 * Screenshots land in .staging/tableslop-radio/.
 *
 *   cd .staging/portfolio-redesign/_screenshots
 *   node tableslop-radio-smoke.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = (process.env.PREVIEW_URL || 'http://127.0.0.1:8899').replace(/\/?$/, '/');
const outDir = process.env.RADIO_SHOT_DIR || path.resolve(__dirname, '../../tableslop-radio');
let failed = 0;
const consoleErrors = [];

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}
function pass(msg) {
  console.log(`OK: ${msg}`);
}

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

function watch(page, tag) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[${tag}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => consoleErrors.push(`[${tag}] pageerror: ${err.message}`));
}

// ---------- desktop ----------
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
watch(page, 'desktop');

const res = await page.goto(`${base}radio/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
if (!res?.ok()) fail(`HTTP ${res?.status() ?? 'none'} at ${base}radio/`);
else pass(`page loads (${res.status()})`);

await page.waitForSelector('.station', { timeout: 10000 });
const stationCount = await page.locator('.station').count();
if (stationCount !== 6) fail(`expected 6 stations, got ${stationCount}`);
else pass(`${stationCount} stations on the dial`);

await page.waitForSelector('#ticker .b-chip', { timeout: 10000 });
pass('bulletin ticker rendered with type chip');

const firstFreq = await page.locator('#freq').textContent();
if (firstFreq.trim() !== '93.5') fail(`first tuned freq expected 93.5, got ${firstFreq}`);
else pass('first station auto-tuned (93.5 The Dream)');

const sheetItems = await page.locator('.sheet-list li').count();
if (sheetItems < 2) fail(`expected >=2 sheet bulletins, got ${sheetItems}`);
else pass(`${sheetItems} sheet bulletins listed`);

// audio element present + bound per station
const stationsJson = await page.evaluate(async () => {
  const r = await fetch('./stations.json');
  return r.ok ? r.json() : null;
});
if (!stationsJson?.stations?.length) {
  fail('could not fetch stations.json from page context');
} else {
  for (const s of stationsJson.stations) {
    await page.locator(`.station[data-id="${s.id}"]`).click();
    await page.waitForTimeout(150);
    const src = await page.locator('#player').getAttribute('src');
    const active = await page.locator('.station.is-active').getAttribute('data-id');
    if (active !== s.id) fail(`station ${s.id} did not activate`);
    if (s.stream_url) {
      if (src !== s.stream_url) fail(`${s.id}: audio src ${src} != ${s.stream_url}`);
    } else if (src !== null) {
      fail(`${s.id}: stream-less station should leave audio src unset, got ${src}`);
    }
  }
  pass('audio element binds stream_url per station (null = static state)');
}

// ticker auto-advance
await page.locator('.station[data-id="khum"]').click();
const tick0 = await page.locator('#ticker .t-text').textContent();
await page.waitForTimeout(7000);
const tick1 = await page.locator('#ticker .t-text').textContent();
if (tick0 === tick1) fail('ticker did not auto-advance');
else pass('ticker auto-advances');

// PLAY on a static station (no network) -> static status, no errors
await page.locator('.station[data-id="kljr"]').click();
await page.locator('#playBtn').click();
await page.waitForTimeout(800);
const statusText = await page.locator('#status').textContent();
if (!/static/i.test(statusText)) fail(`expected static status for KLJR play, got "${statusText}"`);
else pass('static station PLAY shows static state');

// PLAY on a stream station -> either streaming or graceful static, never an error
await page.locator('.station[data-id="kprd"]').click();
await page.locator('#playBtn').click();
await page.waitForTimeout(2500);
const status2 = await page.locator('#status').textContent();
if (!/(signal acquired|signal lost|static)/i.test(status2)) fail(`unexpected stream status "${status2}"`);
else pass(`stream station PLAY handled gracefully ("${status2.trim()}")`);
await page.locator('#playBtn').click(); // pause

const shot1 = path.join(outDir, 'radio-desktop.png');
await page.screenshot({ path: shot1, fullPage: false });
pass(`screenshot -> ${shot1}`);
await page.close();

// ---------- mobile ----------
const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
watch(mob, 'mobile');
const res2 = await mob.goto(`${base}radio/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
if (!res2?.ok()) fail(`mobile HTTP ${res2?.status() ?? 'none'}`);
await mob.waitForSelector('.station', { timeout: 10000 });
await mob.locator('.station[data-id="kqay"]').click();
await mob.waitForTimeout(400);
const mobFreq = await mob.locator('#freq').textContent();
if (mobFreq.trim() !== '97.9') fail(`mobile tune to KQAY failed (freq=${mobFreq})`);
else pass('mobile station switching works');
const deckCols = await mob.evaluate(() => getComputedStyle(document.querySelector('.deck')).gridTemplateColumns);
if (deckCols.trim().split(' ').length !== 1) fail(`mobile deck not single-column (${deckCols})`);
else pass('mobile single-column layout');
const shot2 = path.join(outDir, 'radio-mobile.png');
await mob.screenshot({ path: shot2, fullPage: false });
pass(`screenshot -> ${shot2}`);
await mob.close();

await browser.close();

if (consoleErrors.length) {
  for (const e of consoleErrors) console.error(`CONSOLE ERROR: ${e}`);
  fail(`${consoleErrors.length} console error(s)`);
} else {
  pass('zero console errors');
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll radio smoke checks passed.');
