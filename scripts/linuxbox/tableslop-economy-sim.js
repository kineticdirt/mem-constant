#!/usr/bin/env node
/**
 * Isla Primavera economy sim — deterministic tick over water / minerals / other.
 * Does NOT touch map.json city pins or regions-ui.json.
 *
 * CLI:
 *   node tableslop-economy-sim.js --self-check
 *   node tableslop-economy-sim.js --tick [--write] [--days N]
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "../..");
const DEFAULT_CAMPAIGN = "tropic-gooner";

function campaignDir(name) {
  return path.join(REPO, "campaigns", name || DEFAULT_CAMPAIGN);
}

function economyPath(cdir) {
  return path.join(cdir, "worldbuilding", "economy-state.json");
}

function weatherPath(cdir) {
  return path.join(cdir, "worldbuilding", "weather-state.json");
}

function overlayPath(cdir) {
  return path.join(cdir, "map", "economy-overlay.json");
}

function readJson(abs) {
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function writeJson(abs, data) {
  fs.writeFileSync(abs, JSON.stringify(data, null, 2) + "\n");
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 — same seed → same stream */
function rngFrom(seedStr) {
  let t = hashSeed(seedStr) || 1;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function parseDateParts(iso) {
  const m = String(iso || "2019-06-15").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { y: 2019, mo: 6, d: 15 };
  return { y: +m[1], mo: +m[2], d: +m[3] };
}

function addDays(iso, days) {
  const { y, mo, d } = parseDateParts(iso);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function seasonFactor(diegeticDate) {
  const mo = parseDateParts(diegeticDate).mo;
  // Wet May–Oct: water regen up, tourism mid; Dry Nov–Apr: tourism high, water regen down
  const wet = mo >= 5 && mo <= 10;
  return {
    wet,
    water_regen: wet ? 1.15 : 0.85,
    tourism_demand: wet ? 0.95 : 1.2,
    ag_extract: wet ? 1.05 : 0.9,
    mineral_extract: 1.0,
  };
}

function weatherMod(cdir, diegeticDate) {
  const base = seasonFactor(diegeticDate);
  try {
    if (!fs.existsSync(weatherPath(cdir))) return base;
    const w = readJson(weatherPath(cdir));
    const cities = w.cities || w.by_city || {};
    let storm = 0;
    let n = 0;
    for (const row of Object.values(cities)) {
      if (!row || typeof row !== "object") continue;
      n++;
      const cond = String(row.condition || row.summary || "").toLowerCase();
      if (cond.includes("storm") || cond.includes("hurricane")) storm += 1;
      if (cond.includes("rain") || cond.includes("shower")) storm += 0.35;
    }
    if (n > 0 && storm / n > 0.4) {
      base.water_regen *= 1.1;
      base.tourism_demand *= 0.85;
      base.shipping = 0.8;
    } else {
      base.shipping = 1.0;
    }
  } catch {
    base.shipping = 1.0;
  }
  if (base.shipping == null) base.shipping = 1.0;
  return base;
}

function commodityIds(state) {
  return Object.keys(state.commodities || {});
}

function resourceLists(state) {
  return [
    ...(state.water_bodies || []).map((r) => Object.assign({ _list: "water_bodies" }, r)),
    ...(state.minerals || []).map((r) => Object.assign({ _list: "minerals" }, r)),
    ...(state.other_resources || []).map((r) => Object.assign({ _list: "other_resources" }, r)),
  ];
}

function applyResourceTick(row, mod, rnd) {
  const capacity = Number(row.capacity) || 0;
  let stock = Number(row.stock);
  if (!Number.isFinite(stock)) stock = capacity;
  const quality = clamp(Number(row.quality) || 0.8, 0.1, 1.2);
  let regen = Number(row.regen_per_tick) || 0;
  let extract = Number(row.extract_per_tick) || 0;
  const kind = row.kind || "other";
  if (kind === "water") regen *= mod.water_regen;
  if (kind === "mineral") extract *= mod.mineral_extract * (0.97 + rnd() * 0.06);
  if (kind === "ag" || kind === "fishery") extract *= mod.ag_extract;
  if (kind === "tourism" || (row.roles || []).includes("tourism")) {
    extract *= mod.tourism_demand;
  }
  if ((row.roles || []).includes("shipping")) extract *= mod.shipping || 1;

  const produced = regen * quality;
  const taken = Math.min(stock + produced, extract);
  stock = clamp(stock + produced - taken, 0, capacity || stock + produced);
  const stress = capacity > 0 ? 1 - stock / capacity : 0;
  return {
    row: Object.assign({}, row, {
      stock: Math.round(stock * 100) / 100,
      last_extract: Math.round(taken * 100) / 100,
      last_regen: Math.round(produced * 100) / 100,
      stress: Math.round(stress * 1000) / 1000,
    }),
    taken,
    produced,
    stress,
  };
}

function recomputeCommodities(state, extractsByCommodity, mod) {
  const commodities = Object.assign({}, state.commodities || {});
  const flows = [];
  for (const id of Object.keys(commodities)) {
    const c = Object.assign({}, commodities[id]);
    const supplyIn = extractsByCommodity[id] || 0;
    const baseDemand = Number(c.base_demand) || 10;
    let demand = baseDemand;
    if (id === "tourism" || id === "hospitality") demand *= mod.tourism_demand;
    if (id === "seafood" || id === "ice") demand *= 0.9 + 0.2 * mod.tourism_demand;
    if (id === "shipping" || id === "freight") demand *= mod.shipping || 1;

    const prevSupply = Number(c.supply) || supplyIn;
    const supply = Math.round((0.35 * prevSupply + 0.65 * supplyIn) * 100) / 100;
    const imbalance = (demand - supply) / Math.max(supply, 1);
    const price0 = Number(c.price) || 1;
    const price = Math.round(clamp(price0 * (1 + clamp(imbalance, -0.35, 0.35) * 0.12), 0.05, 1e6) * 100) / 100;
    c.supply = supply;
    c.demand = Math.round(demand * 100) / 100;
    c.price = price;
    c.imbalance = Math.round(imbalance * 1000) / 1000;
    commodities[id] = c;
    flows.push({
      commodity: id,
      supply,
      demand: c.demand,
      price,
      delta_price: Math.round((price - price0) * 1000) / 1000,
    });
  }
  return { commodities, flows };
}

/**
 * Advance economy one world-day (soft clock: 1 tick ≈ 1 diegetic day).
 */
function tickEconomy(state, opts) {
  opts = opts || {};
  const cdir = opts.campaignDir || campaignDir(opts.campaign);
  const days = Math.max(1, Number(opts.days) || 1);
  let next = JSON.parse(JSON.stringify(state));
  delete next.error;
  delete next.module;

  for (let i = 0; i < days; i++) {
    const date = next.diegetic_date || "2019-06-15";
    const seedKey = [next.seed || "isla-economy", date, String(next.tick || 0)].join("|");
    const rnd = rngFrom(seedKey);
    const mod = weatherMod(cdir, date);

    const extractsByCommodity = {};
    const lists = {
      water_bodies: [],
      minerals: [],
      other_resources: [],
    };
    for (const raw of resourceLists(next)) {
      const list = raw._list;
      const clean = Object.assign({}, raw);
      delete clean._list;
      const out = applyResourceTick(clean, mod, rnd);
      lists[list].push(out.row);
      for (const cid of out.row.feeds || []) {
        extractsByCommodity[cid] = (extractsByCommodity[cid] || 0) + out.taken;
      }
    }
    next.water_bodies = lists.water_bodies;
    next.minerals = lists.minerals;
    next.other_resources = lists.other_resources;

    const recomputed = recomputeCommodities(next, extractsByCommodity, mod);
    next.commodities = recomputed.commodities;
    next.last_flows = recomputed.flows;
    next.markets = next.markets || { island: {} };
    next.markets.island = Object.assign({}, next.markets.island, {
      last_tick_at: new Date().toISOString(),
      diegetic_date: date,
      shock: Math.round(rnd() * 1000) / 1000 < 0.04 ? Math.round((rnd() - 0.5) * 0.2 * 1000) / 1000 : 0,
    });
    if (next.markets.island.shock) {
      for (const id of Object.keys(next.commodities)) {
        const c = next.commodities[id];
        c.price = Math.round(c.price * (1 + next.markets.island.shock) * 100) / 100;
      }
    }

    next.tick = Number(next.tick || 0) + 1;
    next.diegetic_date = addDays(date, 1);
    next.season = seasonFactor(next.diegetic_date).wet ? "wet" : "dry";
  }

  next.version = Number(state.version || 0) + 1;
  next.updated_at = new Date().toISOString();
  return next;
}

function syncOverlayFromState(state) {
  const sites = [];
  for (const row of resourceLists(state)) {
    if (row.x_pct == null || row.y_pct == null) continue;
    sites.push({
      id: row.id,
      name: row.name,
      kind: row.kind,
      canon: row.canon || "proposal",
      regions: row.regions || [],
      x_pct: row.x_pct,
      y_pct: row.y_pct,
      stock: row.stock,
      capacity: row.capacity,
      stress: row.stress,
      roles: row.roles || [],
      note: row.note || "",
    });
  }
  return {
    version: state.version || 1,
    updated_at: state.updated_at || new Date().toISOString(),
    diegetic_date: state.diegetic_date,
    tick: state.tick,
    _doc: "Economy map overlay sites — NOT city pins. Guard: tableslop-pin-coords-guard.sh ignores these.",
    sites,
  };
}

function loadEconomy(cdir) {
  const abs = economyPath(cdir);
  if (!fs.existsSync(abs)) throw new Error("economy_missing:" + abs);
  return readJson(abs);
}

function saveEconomy(cdir, state) {
  const abs = economyPath(cdir);
  writeJson(abs, state);
  writeJson(overlayPath(cdir), syncOverlayFromState(state));
  return state;
}

function selfCheck() {
  const cdir = campaignDir(DEFAULT_CAMPAIGN);
  const a = loadEconomy(cdir);
  const t1 = tickEconomy(a, { campaignDir: cdir, days: 1 });
  const t1b = tickEconomy(a, { campaignDir: cdir, days: 1 });
  if (JSON.stringify(t1.commodities) !== JSON.stringify(t1b.commodities)) {
    throw new Error("non_deterministic_commodities");
  }
  if (t1.tick !== Number(a.tick || 0) + 1) throw new Error("tick_not_advanced");
  const t3 = tickEconomy(a, { campaignDir: cdir, days: 3 });
  if (t3.tick !== Number(a.tick || 0) + 3) throw new Error("multi_day_tick");
  const water = (t1.water_bodies || []).length;
  const minerals = (t1.minerals || []).length;
  const other = (t1.other_resources || []).length;
  if (water < 3 || minerals < 2 || other < 3) throw new Error("seed_too_thin");
  console.log(
    "tableslop-economy-sim: SELF_CHECK_OK water=%s minerals=%s other=%s tick=%s→%s date=%s prices.tourism=%s",
    water,
    minerals,
    other,
    a.tick,
    t1.tick,
    t1.diegetic_date,
    (t1.commodities.tourism && t1.commodities.tourism.price) || "?"
  );
  return true;
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes("--self-check")) {
    selfCheck();
    return;
  }
  const write = args.includes("--write");
  const tickIdx = args.indexOf("--tick");
  if (tickIdx < 0) {
    console.error("usage: --self-check | --tick [--days N] [--write]");
    process.exit(2);
  }
  let days = 1;
  const di = args.indexOf("--days");
  if (di >= 0) days = Number(args[di + 1]) || 1;
  const cdir = campaignDir(DEFAULT_CAMPAIGN);
  const cur = loadEconomy(cdir);
  const next = tickEconomy(cur, { campaignDir: cdir, days });
  if (write) {
    saveEconomy(cdir, next);
    console.log("wrote economy-state + overlay tick=%s date=%s", next.tick, next.diegetic_date);
  } else {
    console.log(JSON.stringify({ tick: next.tick, diegetic_date: next.diegetic_date, commodities: next.commodities, last_flows: next.last_flows }, null, 2));
  }
}

module.exports = {
  tickEconomy,
  loadEconomy,
  saveEconomy,
  syncOverlayFromState,
  selfCheck,
  economyPath,
  overlayPath,
  campaignDir,
};

if (require.main === module) {
  try {
    main(process.argv);
  } catch (e) {
    console.error("tableslop-economy-sim:", e && e.message ? e.message : e);
    process.exit(1);
  }
}
