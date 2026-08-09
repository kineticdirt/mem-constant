/**
 * Playwright UI smoke for /world Weather dashboard + Cast still loads.
 * Run on potato: node smoke-world-weather-ui.mjs
 */
import fs from "fs";
import crypto from "crypto";
const { execSync } = await import("child_process");
const { chromium } = await import(
  process.env.HOME + "/agent-dump/node_modules/playwright/index.mjs"
);

const ENV_PATH = process.env.HOME + "/.linuxbox-tableslop/.env";
const AUTH_DB = process.env.HOME + "/agent-dump/agents/state/tableslop-auth.db";

function loadEnv(p) {
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function signSession(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return body + "." + sig;
}

const env = loadEnv(ENV_PATH);
const sid = execSync("python3 -", {
  input:
    "import sqlite3\nc=sqlite3.connect(" +
    JSON.stringify(AUTH_DB) +
    ")\nprint(c.execute('select id from sessions order by expires_at desc limit 1').fetchone()[0])\n",
  encoding: "utf8",
}).trim();
const token = signSession(env.TABLESLOP_SESSION_SECRET, { sid, exp: Date.now() + 86400000 });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies([
  {
    name: "tableslop_session",
    value: token,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
  },
]);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://127.0.0.1:8765/world", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForSelector("#who", { timeout: 15000 });
const who = await page.locator("#who").innerText();
if (!/owner|admin/i.test(who)) throw new Error("who chip bad: " + who);

await page.click('button[data-mod="climate"]');
await page.waitForSelector("#sotDash .dash-card", { timeout: 15000 });
const cities = await page.locator("#sotDash .dash-card .city").allInnerTexts();
if (cities.length < 3) throw new Error("expected 3 city cards, got " + cities.join("|"));
await page.click("#weatherGenBtn");
await page.waitForFunction(() => {
  const s = document.getElementById("sotStatus");
  return s && /refreshed|forecast/i.test(s.textContent || "");
}, null, { timeout: 15000 });

await page.click('button[data-mod="cast"]');
await page.waitForSelector("#roster .rost", { timeout: 15000 });
const rosterN = await page.locator("#roster .rost").count();
if (rosterN < 1) throw new Error("cast roster empty");

await browser.close();
if (errors.length) throw new Error("pageerrors: " + errors.join(" | "));
console.log("OK UI who=", who.trim(), "cities=", cities.join(", "), "roster=", rosterN, "pageerrors=0");
