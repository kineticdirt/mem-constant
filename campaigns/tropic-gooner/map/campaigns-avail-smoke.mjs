/**
 * Playwright smoke — campaigns.tableslop.org (Theme A / :8768).
 * Fails loudly if campaigns home is down.
 *
 *   cd .staging/portfolio-redesign/_screenshots
 *   PREVIEW_URL=https://campaigns.tableslop.org/ node ../../../../campaigns/tropic-gooner/map/campaigns-avail-smoke.mjs
 *
 * Loopback (on potato):
 *   PREVIEW_URL=http://127.0.0.1:8768/ node campaigns/tropic-gooner/map/campaigns-avail-smoke.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = (process.env.PREVIEW_URL || 'https://campaigns.tableslop.org/').replace(/\/?$/, '/');
const outDir = process.env.CAMPAIGNS_SHOT_DIR || path.join(__dirname, '_screenshots');
let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}
function pass(msg) {
  console.log(`OK: ${msg}`);
}

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

let res;
try {
  res = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45000 });
} catch (err) {
  fail(`navigation failed at ${base}: ${err.message}`);
  await browser.close();
  process.exit(1);
}

if (!res?.ok()) {
  fail(`HTTP ${res?.status() ?? 'none'} at ${base} — campaigns home down`);
} else {
  pass(`loads (${res.status()})`);
}

const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
if (!bodyText.trim()) {
  fail('empty body — campaigns home unusable');
} else {
  pass(`body has content (${bodyText.trim().length} chars)`);
}

const healthUrl = new URL('health', base).href;
const health = await page.evaluate(async (url) => {
  try {
    const r = await fetch(url);
    return { ok: r.ok, status: r.status, text: await r.text() };
  } catch (e) {
    return { ok: false, status: 0, text: String(e) };
  }
}, healthUrl);

if (!health.ok) {
  fail(`/health HTTP ${health.status} — ${health.text.slice(0, 120)}`);
} else {
  pass(`/health OK (${health.status})`);
}

const title = await page.title();
if (!title || title.toLowerCase().includes('error')) {
  fail(`suspicious title: ${JSON.stringify(title)}`);
} else {
  pass(`title: ${title}`);
}

const shot = path.join(outDir, 'campaigns-avail-home.png');
await page.screenshot({ path: shot, fullPage: false });
pass(`screenshot → ${shot}`);

await browser.close();
if (failed) {
  console.error(`\n${failed} check(s) failed — campaigns availability surface unhealthy`);
  process.exit(1);
}
console.log('\nAll campaigns-avail smoke checks passed.');
