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
  for (const needle of ["weatherGenBtn", "sotDash", "Generate / refresh forecast", "/api/world/weather"]) {
    if (!world.body.includes(needle)) throw new Error("world html missing " + needle);
  }

  const w = await request(cookie, "/api/world/weather");
  const wj = JSON.parse(w.body);
  if (w.status !== 200 || !wj.cities || !wj.cities.paradise) throw new Error("weather bad: " + w.body.slice(0, 200));

  const gen = await request(cookie, "/api/world/weather", "POST", {
    generate: true,
    forecast_days: 7,
    base_version: wj.version,
  });
  const gj = JSON.parse(gen.body);
  if (gen.status !== 200 || !gj.cities || !gj.cities["porto-lujara"]) {
    throw new Error("generate bad: " + gen.body.slice(0, 240));
  }

  const regions = await request(cookie, "/api/world/summary?module=regions");
  const rj = JSON.parse(regions.body);
  if (regions.status !== 200 || !(rj.focus || []).length) throw new Error("regions summary bad");

  const cast = await request(cookie, "/api/characters?include_hidden=1");
  const cj = JSON.parse(cast.body);
  if (cast.status !== 200 || !cj.count) throw new Error("cast bad");

  console.log(
    "OK",
    "@" + (mej.username || "?") + " · " + mej.role,
    "weather",
    wj.diegetic_date,
    wj.season,
    "cities",
    Object.keys(wj.cities).join(","),
    "gen_v" + gj.version,
    "cast v" + cj.version + " · " + cj.count + " rows"
  );
}

main().catch((e) => {
  console.error("FAIL", e.message || e);
  process.exit(1);
});
