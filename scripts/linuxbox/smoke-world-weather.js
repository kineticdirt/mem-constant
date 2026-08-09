#!/usr/bin/env node
/** Loopback smoke: signed owner cookie → /world + weather/summary/cast. */
"use strict";

const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const path = require("path");
const { execSync } = require("child_process");

const ENV_PATH = process.env.TABLESLOP_ENV || path.join(process.env.HOME || "", ".linuxbox-tableslop", ".env");
const AUTH_DB =
  process.env.TABLESLOP_AUTH_DB ||
  path.join(process.env.HOME || "", "agent-dump", "agents", "state", "tableslop-auth.db");

function loadEnv(p) {
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

function signSession(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return body + "." + sig;
}

function request(cookie, pathname, method, bodyObj) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "127.0.0.1",
      port: 8765,
      path: pathname,
      method: method || "GET",
      headers: { Cookie: cookie, Accept: "application/json" },
    };
    let data = null;
    if (bodyObj) {
      data = Buffer.from(JSON.stringify(bodyObj));
      opts.headers["Content-Type"] = "application/json";
      opts.headers["Content-Length"] = data.length;
    }
    const req = http.request(opts, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => resolve({ status: res.statusCode, body: b }));
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const env = loadEnv(ENV_PATH);
  const secret = env.TABLESLOP_SESSION_SECRET;
  if (!secret) throw new Error("TABLESLOP_SESSION_SECRET missing");
  const sid = execSync("python3 -", {
    input:
      "import sqlite3,os\n" +
      "c=sqlite3.connect(" +
      JSON.stringify(AUTH_DB) +
      ")\n" +
      "print(c.execute('select id from sessions order by expires_at desc limit 1').fetchone()[0])\n",
    encoding: "utf8",
  }).trim();
  const token = signSession(secret, { sid, exp: Date.now() + 86400000 });
  const cookie = "tableslop_session=" + encodeURIComponent(token);

  const me = await request(cookie, "/api/me");
  const mej = JSON.parse(me.body);
  if (!mej.logged_in || mej.can_edit !== true) {
    throw new Error("auth failed: " + me.body.slice(0, 200));
  }

  const world = await request(cookie, "/world");
  if (world.status !== 200) throw new Error("world status " + world.status);
  for (const needle of ["weatherGenBtn", "sotDash", "weatherPlus1Btn", "sotDetail", "castBulkBar", "entBulkBar", "/api/world/weather"]) {
    if (!world.body.includes(needle)) throw new Error("world html missing " + needle);
  }

  const w = await request(cookie, "/api/world/weather");
  const wj = JSON.parse(w.body);
  if (w.status !== 200 || !wj.cities || !wj.cities.paradise) throw new Error("weather bad: " + w.body.slice(0, 200));

  const t0 = Date.now();
  const gen = await request(cookie, "/api/world/weather", "POST", {
    action: "regenerate",
    generate: true,
    forecast_days: 7,
    base_version: wj.version,
  });
  const genMs = Date.now() - t0;
  const gj = JSON.parse(gen.body);
  if (gen.status !== 200 || !gj.cities || !gj.cities["porto-lujara"]) {
    throw new Error("generate bad: " + gen.body.slice(0, 240));
  }
  if (genMs > 1000) throw new Error("regen too slow: " + genMs + "ms");

  const adv = await request(cookie, "/api/world/weather", "POST", {
    action: "advance",
    days: 1,
    base_version: gj.version,
  });
  const aj = JSON.parse(adv.body);
  if (adv.status !== 200 || !aj.diegetic_date) throw new Error("advance bad: " + adv.body.slice(0, 200));

  const regions = await request(cookie, "/api/world/summary?module=regions");
  const rj = JSON.parse(regions.body);
  if (regions.status !== 200 || !(rj.focus || []).length) throw new Error("regions summary bad");

  const transport = await request(cookie, "/api/world/summary?module=transport");
  const tj = JSON.parse(transport.body);
  if (transport.status !== 200 || !tj.highways_layer || !tj.highways_layer.status) {
    throw new Error("transport highways_layer bad: " + transport.body.slice(0, 240));
  }

  const cast = await request(cookie, "/api/characters?include_hidden=1");
  const cj = JSON.parse(cast.body);
  if (cast.status !== 200 || !cj.count) throw new Error("cast bad");

  console.log(
    "OK",
    "@" + (mej.username || "?") + " · " + mej.role,
    "weather",
    wj.diegetic_date,
    "→",
    aj.diegetic_date,
    wj.season,
    "regen_ms",
    genMs,
    "cities",
    Object.keys(wj.cities).join(","),
    "gen_v" + gj.version,
    "hw",
    tj.highways_layer.status,
    "cast v" + cj.version + " · " + cj.count + " rows"
  );
}

main().catch((e) => {
  console.error("FAIL", e.message || e);
  process.exit(1);
});
