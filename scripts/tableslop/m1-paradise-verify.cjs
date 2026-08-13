#!/usr/bin/env node
/**
 * M1 Paradise slice gates (G0–G7-ish) — no regions-ui writes.
 * Run: node scripts/tableslop/m1-paradise-verify.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..", "..");
const CAMPAIGN = path.join(ROOT, "campaigns", "tropic-gooner");

function fail(errors, msg) {
  errors.push(msg);
}

async function main() {
  const errors = [];
  const report = [];

  // G0 / V6 — regions-ui untouched (vert floor)
  const regionsAbs = path.join(CAMPAIGN, "map", "regions-ui.json");
  const ui = JSON.parse(fs.readFileSync(regionsAbs, "utf8"));
  let verts = 0;
  for (const a of ui.areas || []) {
    if (!a || a.shape === "ellipse") continue;
    const pts = String(a.points || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    verts += pts.length;
  }
  report.push(`regions-ui verts≈${verts} areas=${(ui.areas || []).length}`);
  if (verts < 200) fail(errors, "regions-ui looks wiped/stub (verts < 200)");

  // D-ROADS
  const {
    readRoadsIndex,
    readRoadsRegion,
    readLogisticsRoutes,
    readBoardIndex,
    writeBoardResolve,
    readBoardThreads,
  } = require("../linuxbox/tableslop-world-roads.js");
  const {
    generateWeatherState,
    loadActivePhenomena,
  } = require("../linuxbox/tableslop-world-weather.js");

  const idx = readRoadsIndex(CAMPAIGN);
  if (!idx || idx.error) fail(errors, "roads index missing");
  else report.push(`roads index v${idx.version} shards=${(idx.shards || []).length}`);

  const shard = readRoadsRegion(CAMPAIGN, "r01-paradise");
  const feats = shard.features || [];
  const kinds = new Set(feats.map((f) => f.kind));
  report.push(`r01 features=${feats.length} kinds=${[...kinds].join(",")}`);
  if (feats.length < 2) fail(errors, "r01 roads shard too thin");
  if (!kinds.has("hwy") && !kinds.has("arterial")) fail(errors, "need hwy or arterial class");
  if (!kinds.has("local") && !kinds.has("arterial")) fail(errors, "need local/arterial class");

  const ref = path.join(CAMPAIGN, "roads", "meta", "highway-overlay-ref.json");
  if (!fs.existsSync(ref)) fail(errors, "highway-overlay-ref missing");

  // logistics stub
  const routes = readLogisticsRoutes(CAMPAIGN);
  if (!routes.length) fail(errors, "logistics routes empty");
  else report.push(`logistics routes=${routes.length}`);

  // D-WX phenomenon bias
  const phen = loadActivePhenomena(CAMPAIGN);
  if (!phen.length) fail(errors, "no active phenomena");
  const withPhen = generateWeatherState(CAMPAIGN, {
    seed: "isla-primavera-weather",
    diegetic_date: "2019-05-14",
  });
  const paradise = withPhen.cities && withPhen.cities.paradise && withPhen.cities.paradise.current;
  if (!paradise) fail(errors, "paradise weather missing");
  else {
    const mods = paradise.phenomenon_mods || {};
    report.push(
      `wx paradise wind=${paradise.wind_mph} rain%=${paradise.rain_chance_pct} mods=${JSON.stringify(mods)}`
    );
    if (!(mods.wind_mph_delta > 0 || mods.rain_chance_delta > 0)) {
      fail(errors, "phenomenon mods did not bias paradise tick");
    }
  }

  // V4 board resolve → delta (in-process; restores thread for repeatability)
  const boardIdx = readBoardIndex(CAMPAIGN);
  const threadsPath = path.join(CAMPAIGN, "board", "threads.ndjson");
  const threadsBak = fs.readFileSync(threadsPath, "utf8");
  const indexBak = fs.readFileSync(path.join(CAMPAIGN, "board", "index.json"), "utf8");
  try {
    // ensure unresolved demo thread
    const threads = JSON.parse("[" + threadsBak.trim().split(/\n/).filter(Boolean).join(",") + "]");
    const demo = threads.find((t) => t.id === "thr-m1-road-closure-demo");
    if (!demo) fail(errors, "demo board thread missing");
    else {
      // reset resolved flag for test
      const reset = threads.map((t) =>
        t.id === "thr-m1-road-closure-demo"
          ? Object.assign({}, t, { resolved: false, world_delta_id: null })
          : t
      );
      fs.writeFileSync(threadsPath, reset.map((t) => JSON.stringify(t)).join("\n") + "\n");
      const idxReset = Object.assign({}, boardIdx, {
        version: Number(boardIdx.version) || 1,
        open_thread_ids: ["thr-m1-road-closure-demo"],
      });
      fs.writeFileSync(
        path.join(CAMPAIGN, "board", "index.json"),
        JSON.stringify(idxReset, null, 2) + "\n"
      );
      const out = writeBoardResolve(CAMPAIGN, {
        base_version: idxReset.version,
        thread_id: "thr-m1-road-closure-demo",
        action: "resolve",
        resolution: "accepted",
        delta: {
          id: "wd-m1-verify-001",
          ops: [{ op: "note", text: "M1 verify road closure demo" }],
        },
      });
      const deltaFile = path.join(CAMPAIGN, "board", "deltas", "thr-m1-road-closure-demo.ndjson");
      if (!fs.existsSync(deltaFile)) fail(errors, "board delta file not written");
      else report.push(`board resolve ok delta=${out.delta && out.delta.id}`);
    }
  } finally {
    fs.writeFileSync(threadsPath, threadsBak);
    fs.writeFileSync(path.join(CAMPAIGN, "board", "index.json"), indexBak);
  }

  // V5 dial matrix via phone-responder (911 xfail until feat)
  const phoneUrl = pathToFileURL(path.join(ROOT, "scripts", "tableslop", "phone-responder.js")).href;
  const phone = await import(phoneUrl);
  await phone.loadContacts();
  const contact = phone.lookupNumber("555-0110");
  if (contact.type !== "intercept") fail(errors, "non-emergency CRT line should intercept");
  const dead = phone.lookupNumber("555-0999");
  if (dead.type !== "dead") fail(errors, "unknown should be dead");
  const nine = phone.lookupNumber("911");
  if (nine.type === "emergency") {
    report.push("911=emergency (feat live)");
  } else {
    report.push(`911 xfail type=${nine.type} (expected until D-911)`);
  }
  const self = phone.selfCheck ? phone.selfCheck() : null;
  if (self && !self.ok) fail(errors, "phone selfCheck: " + (self.errors || []).join("; "));
  else if (self) report.push("phone selfCheck ok contacts=" + self.contacts);

  // layers manifest entries
  const layers = JSON.parse(fs.readFileSync(path.join(CAMPAIGN, "map", "layers.json"), "utf8"));
  const ids = new Set((layers.layers || []).map((l) => l.id));
  for (const need of ["roads-local", "wind", "water", "logistics", "highways", "poi-pins"]) {
    if (!ids.has(need)) fail(errors, "layers.json missing " + need);
  }
  report.push("layers manifest ok");

  const ok = errors.length === 0;
  console.log(ok ? "M1_VERIFY_OK" : "M1_VERIFY_FAIL");
  for (const line of report) console.log(" -", line);
  for (const e of errors) console.log(" !", e);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
