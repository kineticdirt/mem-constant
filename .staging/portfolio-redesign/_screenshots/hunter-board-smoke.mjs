/**
 * Playwright smoke — tableslop Hunter Board (Hunter: The Reckoning silo).
 *
 *   cd .staging/portfolio-redesign/_screenshots
 *   node hunter-board-smoke.mjs
 *
 * Serves scripts/linuxbox/tableslop-static/hunter/ over a zero-dep loopback server
 * (the page itself is client-side only). Screenshots -> .staging/tableslop-hunter/.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const hunterDir = path.join(repoRoot, 'scripts', 'linuxbox', 'tableslop-static', 'hunter');
const outDir = path.join(repoRoot, '.staging', 'tableslop-hunter');
let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}
function pass(msg) {
  console.log(`OK: ${msg}`);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = rel === '/' ? 'index.html' : rel.replace(/^\/+/, '');
  const abs = path.join(hunterDir, file);
  if (!abs.startsWith(hunterDir) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream' });
  fs.createReadStream(abs).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

const res = await page.goto(base, { waitUntil: 'load', timeout: 30000 });
if (!res?.ok()) fail(`HTTP ${res?.status() ?? 'none'} at ${base}`);
else pass(`board loads (${res.status()})`);

const brand = await page.locator('.hud-brand').textContent();
if (!brand?.includes('tableslop')) fail('missing HUD brand');
else pass('HUD present (tableslop / Isla Primavera / HUNTER BOARD)');

const caseCount = await page.locator('.case-card').count();
if (caseCount !== 15) fail(`expected 15 case cards, got ${caseCount}`);
else pass('15 case files listed');

// Shot 1 — the board (case list + empty corkboard)
let shot = path.join(outDir, 'hunter-board.png');
await page.screenshot({ path: shot, fullPage: false });
pass(`screenshot -> ${shot}`);

// Open the starter case
await page.locator('.case-card[data-case="thin-blood-plus-one"]').click();
await page.waitForTimeout(300);
const headName = await page.locator('#chName').textContent();
if (!headName?.includes('Plus-One')) fail(`case head wrong: ${headName}`);
else pass('case file opens (thin-blood-plus-one)');

const sealed = await page.locator('.tell-note.sealed').count();
if (sealed !== 5) fail(`expected 5 sealed tells on fresh case, got ${sealed}`);
else pass('5 sealed tell notes (veil holding)');

if ((await page.locator('#prepLock').count()) !== 1) fail('prep panel should be locked on fresh case');
else pass('prep locked before veil tier 3');

const redactedTruth = await page.locator('#truthBody .redact').count();
if (redactedTruth !== 1) fail('truth should be redacted on fresh case');
else pass('truth redacted (cover story holding)');

// Work the case: click enabled actions round-robin until veil tier 3
let tierText = '';
for (let i = 0; i < 12; i++) {
  const btn = page.locator('#actionBar .act-btn:not([disabled])').first();
  if ((await btn.count()) === 0) break;
  await btn.click();
  await page.waitForTimeout(120);
  tierText = (await page.locator('#veilLabel').textContent()) || '';
  if (tierText.includes('tier 3')) break;
}
if (!tierText.includes('tier 3')) fail(`veil never reached tier 3 (label: ${tierText})`);
else pass(`investigation reaches veil tier 3 (${tierText.trim()})`);

const revealed = await page.locator('.tell-note:not(.sealed)').count();
const strings = await page.locator('#stringLayer line').count();
if (revealed < 4) fail(`expected >=4 revealed tells, got ${revealed}`);
else pass(`${revealed} tells revealed with action tags`);
if (strings !== revealed) fail(`string layer: ${strings} lines for ${revealed} notes`);
else pass('corkboard strings drawn (one per revealed tell)');

if ((await page.locator('#truthBody .redact').count()) !== 0) fail('truth still redacted at tier 3');
else pass('entity profile unredacted at tier >= 2');
if ((await page.locator('#weakList .redact').count()) !== 0) fail('weaknesses still redacted at tier 3');
else pass('weaknesses unredacted at tier 3');

const kitRows = await page.locator('#kitList .kit-row').count();
if (kitRows !== 3) fail(`expected 3 kit rows for thin-blood case, got ${kitRows}`);
else pass('prep kit panel unlocked (UV / stakes / blessed kit)');

// Shot 2 — the worked case file
shot = path.join(outDir, 'hunter-case-file.png');
await page.screenshot({ path: shot, fullPage: true });
pass(`screenshot -> ${shot}`);

// Resolve prepared, then rushed
await page.locator('#resolvePrep').click();
await page.waitForTimeout(150);
let outcome = await page.locator('#resolveOut .ro-outcome').textContent();
if (!outcome || !/clean win|win with cost|disaster/.test(outcome)) fail(`bad prepared outcome: ${outcome}`);
else pass(`resolve prepared -> ${outcome.trim()}`);
const heatCount = await page.locator('#heatList li').count();
pass(`heat events emitted: ${heatCount}`);

// Shot 3 — the prep panel (post-resolve)
shot = path.join(outDir, 'hunter-prep-panel.png');
await page.locator('#prepPanel').screenshot({ path: shot });
pass(`screenshot -> ${shot}`);

await page.locator('#resolveRush').click();
await page.waitForTimeout(150);
outcome = await page.locator('#resolveOut .ro-outcome').textContent();
if (!outcome || !/clean win|win with cost|disaster/.test(outcome)) fail(`bad rushed outcome: ${outcome}`);
else pass(`resolve rushed -> ${outcome.trim()}`);

// Persistence: reload keeps the board; reset clears it
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(300);
const persisted = await page.locator('.tell-note:not(.sealed)').count();
if (persisted !== revealed) fail(`after reload expected ${revealed} revealed tells, got ${persisted}`);
else pass('board state persists across reload (localStorage)');
await page.locator('#resetBoard').click();
await page.waitForTimeout(200);
const afterReset = await page.locator('.tell-note:not(.sealed)').count();
if (afterReset !== 0) fail(`reset board left ${afterReset} revealed tells`);
else pass('reset board reseals the case');

// A second case opens independently (kit lengths differ by case)
await page.locator('.case-card[data-case="harvest-crown"]').click();
await page.waitForTimeout(200);
const crownSealed = await page.locator('.tell-note.sealed').count();
if (crownSealed !== 5) fail(`harvest-crown should open with 5 sealed tells, got ${crownSealed}`);
else pass('second case file opens fresh (harvest crown, 5 sealed)');

if (consoleErrors.length) {
  for (const e of consoleErrors) fail(`console error: ${e}`);
} else {
  pass('zero console errors');
}

await browser.close();
server.close();
if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll hunter board smoke checks passed.');
