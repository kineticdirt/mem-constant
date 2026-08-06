/**
 * Playwright smoke for the Primavera Bell phone feature.
 * Serves the phone dir + engine over a throwaway local server, then walks:
 * contacts, mid-call (forced pickup), keypad not-in-service, flavor intercept,
 * voicemail, recents-with-spam — desktop and mobile. Fails on any console error.
 *
 * Run: node smoke.mjs   (playwright resolved from ../portfolio-redesign/_screenshots)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const PHONE_DIR = path.join(REPO, "scripts/linuxbox/tableslop-static/phone");
const ENGINE = path.join(REPO, "scripts/tableslop/phone-responder.js");
const SHOTS = __dirname;

const require = createRequire(pathToFileURL(path.join(REPO, ".staging/portfolio-redesign/_screenshots/package.json")));
const { chromium } = require("playwright");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://x");
      let file = null;
      if (url.pathname === "/tableslop/phone-responder.js") file = ENGINE;
      else if (url.pathname === "/phone/" || url.pathname === "/phone") file = path.join(PHONE_DIR, "index.html");
      else if (url.pathname.startsWith("/phone/")) file = path.join(PHONE_DIR, decodeURIComponent(url.pathname.slice(7)));
      if (!file || !file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end("nope");
        return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const failures = [];
function watch(page, label) {
  page.on("console", msg => {
    if (msg.type() === "error") {
      failures.push(`${label}: console.error — ${msg.text()}`);
      console.error(`FAIL ${label}: console.error — ${msg.text()}`);
    }
  });
  page.on("pageerror", err => {
    failures.push(`${label}: pageerror — ${err.message}`);
    console.error(`FAIL ${label}: pageerror — ${err.message}`);
  });
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name) });
  console.log("shot " + name);
}

async function statusIs(page, text) {
  await page.waitForFunction(
    t => (document.querySelector("#call-status") || {}).textContent?.includes(t),
    text,
    { timeout: 12000 }
  );
}

async function run() {
  const server = await serve();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/phone/`;
  // --disable-gpu: this PC's headless Chromium fails Page.captureScreenshot without it
  const browser = await chromium.launch({ args: ["--disable-gpu", "--disable-software-rasterizer"] });
  const fixed = "date=2026-08-05";

  // --- desktop: contacts → live call → recents (spam + log) → keypad unknown → intercept
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pA = await ctxA.newPage();
  watch(pA, "desktop-A");

  await pA.goto(`${base}?force=pickup&${fixed}&heat=0.9`, { waitUntil: "networkidle" });
  await pA.waitForSelector('[data-contact-id="r02-harbormaster"]');
  await shot(pA, "01-contacts-desktop.png");

  await pA.click('[data-contact-id="r02-harbormaster"]');
  await pA.click("#btn-call-from-thread");
  await statusIs(pA, "CONNECTED");
  await pA.fill("#call-input", "anything about the night boats?");
  await pA.click("#btn-send");
  await pA.waitForFunction(
    () => document.querySelectorAll("#call-log .msg.contact").length >= 2,
    { timeout: 8000 }
  );
  await shot(pA, "02-mid-call-desktop.png");

  await pA.click("#btn-end");
  await pA.click("#btn-end"); // CLOSES back to the thread
  await pA.click('[data-nav="recents"]');
  await pA.waitForTimeout(400);
  await shot(pA, "03-recents-spam-desktop.png");

  await pA.click('[data-nav="keypad"]');
  for (const d of "5550999") await pA.click(`[data-digit="${d}"]`);
  await pA.click("#kp-call");
  await statusIs(pA, "OPERATOR");
  await shot(pA, "04-not-in-service-desktop.png");
  await pA.waitForTimeout(4500); // operator auto-ends

  await pA.click('[data-nav="keypad"]');
  for (const d of "5550170") await pA.click(`[data-digit="${d}"]`);
  await pA.click("#kp-call");
  await statusIs(pA, "OPERATOR");
  await shot(pA, "05-intercept-desktop.png");
  await pA.waitForTimeout(4500);

  // --- desktop: voicemail flow (own context for a clean call view)
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pB = await ctxB.newPage();
  watch(pB, "desktop-B");
  await pB.goto(`${base}?dial=r02-harbormaster&force=voicemail&${fixed}`, { waitUntil: "networkidle" });
  await statusIs(pB, "VOICEMAIL");
  await pB.fill("#call-input", "Meng — the night boats. Call me back before the horn.");
  await pB.click("#btn-send");
  await statusIs(pB, "MESSAGE RECORDED");
  await shot(pB, "06-voicemail-desktop.png");

  // --- mobile
  const ctxC = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pC = await ctxC.newPage();
  watch(pC, "mobile-C");
  await pC.goto(`${base}?force=pickup&${fixed}&heat=0.5`, { waitUntil: "networkidle" });
  await pC.waitForSelector('[data-contact-id="r02-night-ledger"]');
  await shot(pC, "10-contacts-mobile.png");

  await pC.click('[data-contact-id="r02-night-ledger"]');
  await pC.click("#btn-call-from-thread");
  await statusIs(pC, "CONNECTED");
  await pC.fill("#call-input", "what does a raid forecast cost?");
  await pC.click("#btn-send");
  await pC.waitForFunction(
    () => document.querySelectorAll("#call-log .msg.contact").length >= 2,
    { timeout: 8000 }
  );
  await shot(pC, "11-mid-call-mobile.png");

  await pC.click("#btn-end");
  await pC.click("#btn-end");
  await pC.click('[data-nav="keypad"]');
  await shot(pC, "12-keypad-mobile.png");

  await browser.close();
  server.close();

  if (failures.length) {
    console.error(`\nSMOKE FAIL — ${failures.length} console/page error(s)`);
    process.exit(1);
  }
  console.log("\nSMOKE PASS — zero console errors, 9 screenshots in .staging/tableslop-phone/");
}

run().catch(err => {
  console.error("SMOKE ERROR:", err.message);
  process.exit(1);
});
