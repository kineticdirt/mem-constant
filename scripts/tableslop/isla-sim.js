#!/usr/bin/env node
/**
 * isla-sim.js — Isla Primavera market + gunplay background sim (deterministic, zero deps).
 *
 * Design: docs/plans/isla-primavera-sim-design-2026-08-06.md (read first).
 * Lore SoT: campaigns/tropic-gooner/worldbuilding/{LORE-BIBLE,GROUPS,STORIES}.md.
 *
 * Usage:
 *   node isla-sim.js --init [--force] [--seed N]   seed initial state
 *   node isla-sim.js --tick [N]                    advance N world-days (default 1)
 *   node isla-sim.js --status                      compact human summary
 *   node isla-sim.js --export                      write sim-static.json + sim-broadcast.json
 *   node isla-sim.js --self-check                  temp-dir invariant run, exit nonzero on failure
 *   node isla-sim.js --state PATH                  state file override (env ISLA_SIM_STATE also works)
 *
 * Flags compose in order: --init --tick 14 --export --status is one valid invocation.
 * State path default: ../linuxbox/tableslop-static/sim/sim-state.json (relative to this file).
 * GM overrides: sim-gm-overrides.json next to the state file — applied before every tick run.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_VERSION = 1;
const INCIDENT_CAP = 200;
const HISTORY_CAP = 90;

/* ============================== CONFIG (lore-cited) ============================== */

const DEFAULT_SEED = 20190812; // Stevens' first non-mortal cleanup, yacht club, 2019-08-12 (LORE-BIBLE timeline)

const COMMODITIES = {
  rum:          { label: "Rum",            vol: 0.015 },
  sugar:        { label: "Sugar",          vol: 0.015 },
  vice:         { label: "Vice (lic.)",    vol: 0.03  },
  guns:         { label: "Guns (illicit)", vol: 0.05  },
  touro_dollar: { label: "Touro $",        vol: 0.02  },
};

const CITIES = {
  // LORE-BIBLE r01: resort markup; guns thin behind the CRT showcase; vice demand heavy.
  r01: {
    name: "Paradise", heat_base: 12, incident_rate: 0.08,
    base:        { rum: 15,  sugar: 10,  vice: 60, guns: 145, touro_dollar: 100 },
    supply_base: { rum: 0.55, sugar: 0.50, vice: 0.60, guns: 0.30, touro_dollar: 0.50 },
    demand_base: { rum: 0.55, sugar: 0.45, vice: 0.72, guns: 0.35, touro_dollar: 0.68 },
    districts: ["the marina", "the boardwalk strip", "the CRT substation block", "PIU South edge", "the CiDance tower district"],
    kinds: { "robbery gone loud": 0.35, "standoff": 0.30, "drive-by": 0.20, "dockside ambush": 0.15 },
  },
  // LORE-BIBLE r02: working port — rum/sugar production + docks; contraband inflow keeps guns moving.
  r02: {
    name: "Porto Lujara", heat_base: 18, incident_rate: 0.11,
    base:        { rum: 12,  sugar: 8,  vice: 45, guns: 115, touro_dollar: 100 },
    supply_base: { rum: 0.75, sugar: 0.70, vice: 0.50, guns: 0.45, touro_dollar: 0.50 },
    demand_base: { rum: 0.50, sugar: 0.45, vice: 0.50, guns: 0.40, touro_dollar: 0.45 },
    districts: ["the Carnaval Route", "Lujara Docks", "Ledger Row", "the Annex hill", "the Porto hills"],
    kinds: { "dockside ambush": 0.40, "robbery gone loud": 0.30, "standoff": 0.20, "drive-by": 0.10 },
  },
  // LORE-BIBLE r03: "the least filtered of the three" — casinos, night economy, most guns, most heat.
  r03: {
    name: "Jackedsonville", heat_base: 25, incident_rate: 0.16,
    base:        { rum: 14,  sugar: 9,  vice: 62, guns: 120, touro_dollar: 100 },
    supply_base: { rum: 0.55, sugar: 0.50, vice: 0.65, guns: 0.60, touro_dollar: 0.50 },
    demand_base: { rum: 0.55, sugar: 0.45, vice: 0.70, guns: 0.55, touro_dollar: 0.55 },
    districts: ["the Row", "the Quay", "the alleys", "Main Street market", "the Book Nook block", "stadium edge"],
    kinds: { "drive-by": 0.40, "standoff": 0.25, "robbery gone loud": 0.25, "dockside ambush": 0.10 },
  },
};

// Faction tension pairs. Each comment quotes the GROUPS.md line it is built from (canon).
const TENSIONS = [
  {
    id: "quay-rojo_vs_crimson-tithe",
    factions: ["Quay Rojo", "Crimson Tithe"],
    cities: ["r03"],
    // GROUPS.md — Quay Rojo (PRI-0201): "the Crimson Tithe — tribute went up after the
    // marina wrist incident, and Rudy's ledger and the Tithe's ledger disagree about
    // what 'the night owes.'"
  },
  {
    id: "crimson-tithe_vs_gilded-anchor",
    factions: ["Crimson Tithe", "Gilded Anchor"],
    cities: ["r03", "r01"],
    // GROUPS.md — The Crimson Tithe (PRI-0602): "the Gilded Anchor — shared blood
    // sources, no shared trust; the border is a marina parking lot and everyone knows
    // the space number." (Anchor side, PRI-0601: the wrist incident; "It was not nothing.")
  },
  {
    id: "rough-ride_vs_quay-rojo",
    factions: ["Rough Ride", "Quay Rojo"],
    cities: ["r03"],
    // GROUPS.md — Rough Ride: "Quay Rojo — Rough Ride sells licensed protection on the
    // same blocks where Rojo sells the other kind, and both claim they don't poach."
  },
];
// Blotter realism: most shootings are not faction war. Fallback actor pool per city.
const UNAFFILIATED = {
  r01: ["hotel security", "a marina crew", "unknown parties"],
  r02: ["a dockside crew", "manifest fixers", "unknown parties"],
  r03: ["local crews", "an alley outfit", "unknown parties"],
};

const KIND_TEMPLATES = {
  "drive-by": (s) => `Shots fired from a moving vehicle, ${s.district}. ${s.actors}. ${s.casualties} Investigation active.`,
  "dockside ambush": (s) => `Ambush on the waterfront, ${s.district}. ${s.actors}. ${s.casualties} Harbor patrol notified.`,
  "robbery gone loud": (s) => `Armed robbery escalated to gunfire, ${s.district}. ${s.actors}. ${s.casualties} Investigation active.`,
  "standoff": (s) => `Armed standoff, ${s.district}. ${s.actors}. ${s.casualties} CRT units stood down by morning.`,
};

/* ============================== PRNG (mulberry32, state carried) ============================== */

// ponytail: one PRNG stream threaded through state.rng so save/load resumes mid-sequence.
function nextRandom(state) {
  let a = state.rng | 0;
  a = (a + 0x6d2b79f5) | 0;
  state.rng = a;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* ============================== small helpers ============================== */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = (v) => Math.round(v * 100) / 100;
const round1 = (v) => Math.round(v * 10) / 10;
const num = (v, dflt) => (Number.isFinite(Number(v)) ? Number(v) : dflt);

function pickWeighted(state, entries) {
  // entries: [[key, weight], ...] — weights need not sum to 1
  const total = entries.reduce((s, e) => s + Math.max(0, e[1]), 0);
  if (total <= 0) return entries[0][0];
  let roll = nextRandom(state) * total;
  for (const [key, w] of entries) {
    roll -= Math.max(0, w);
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

function casualtyPhrase(c) {
  if (c <= 0) return "No injuries reported.";
  if (c === 1) return "One casualty reported.";
  if (c === 2) return "Two casualties reported.";
  return "Three confirmed dead.";
}

function knownFactions() {
  const set = new Set();
  for (const t of TENSIONS) for (const f of t.factions) set.add(f);
  for (const list of Object.values(UNAFFILIATED)) for (const f of list) set.add(f);
  return set;
}

/* ============================== state load/save/init ============================== */

function defaultStatePath() {
  return path.resolve(__dirname, "../linuxbox/tableslop-static/sim/sim-state.json");
}
function statePath(opts) {
  return path.resolve(opts.state || process.env.ISLA_SIM_STATE || defaultStatePath());
}
function overridesPathFor(stateFile) {
  return path.join(path.dirname(stateFile), "sim-gm-overrides.json");
}

function loadState(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file); // atomic-ish: cron tick never leaves a half-written state
}

function initState(seed) {
  const cities = {};
  for (const cid of Object.keys(CITIES).sort()) {
    const cfg = CITIES[cid];
    const markets = {};
    for (const k of Object.keys(COMMODITIES).sort()) {
      markets[k] = { price: cfg.base[k], supply: cfg.supply_base[k], demand: cfg.demand_base[k] };
    }
    cities[cid] = { name: cfg.name, heat: cfg.heat_base, markets };
  }
  const tensions = {};
  for (const t of TENSIONS) tensions[t.id] = 0.7;
  return {
    version: STATE_VERSION,
    world_day: 0,
    seed,
    rng: seed | 0,
    cities,
    tensions,
    incidents: [],
    history: [],
    next_incident: 1,
    gm_notes: [],
  };
}

/* ============================== GM overrides (GM always wins) ============================== */

function applyOverrides(state, ovFile) {
  const result = { applied: [], disableRandom: false };
  if (!fs.existsSync(ovFile)) return result;
  let ov;
  try {
    ov = JSON.parse(fs.readFileSync(ovFile, "utf8"));
  } catch (e) {
    throw new Error(`sim-gm-overrides.json is not valid JSON: ${e.message}`);
  }
  const note = (s) => result.applied.push(s);
  if (ov.heat && typeof ov.heat === "object") {
    for (const [cid, v] of Object.entries(ov.heat)) {
      if (!state.cities[cid]) continue;
      state.cities[cid].heat = clamp(num(v, state.cities[cid].heat), 0, 100);
      note(`heat ${cid}=${v}`);
    }
  }
  for (const field of ["price", "supply", "demand"]) {
    if (!ov[field] || typeof ov[field] !== "object") continue;
    for (const [key, v] of Object.entries(ov[field])) {
      const [cid, k] = key.split(".");
      const m = state.cities[cid] && state.cities[cid].markets[k];
      if (!m) continue;
      m[field] = field === "price" ? Math.max(0.01, num(v, m.price)) : clamp(num(v, m[field]), 0.05, 1.5);
      note(`${field} ${key}=${v}`);
    }
  }
  if (ov.tension && typeof ov.tension === "object") {
    for (const [id, v] of Object.entries(ov.tension)) {
      if (!(id in state.tensions)) continue;
      state.tensions[id] = clamp(num(v, state.tensions[id]), 0, 1.5);
      note(`tension ${id}=${v}`);
    }
  }
  if (ov.disable_random_incidents === true) {
    result.disableRandom = true;
    note("random incidents disabled");
  }
  if (Array.isArray(ov.inject_incidents)) {
    for (const raw of ov.inject_incidents) {
      const cid = raw && state.cities[raw.city] ? raw.city : null;
      if (!cid) { note(`inject skipped (bad city): ${JSON.stringify(raw && raw.city)}`); continue; }
      const cfg = CITIES[cid];
      const kind = KIND_TEMPLATES[raw.kind] ? raw.kind : "standoff";
      const casualties = clamp(Math.round(num(raw.casualties, 1)), 0, 3);
      const district = typeof raw.district === "string" && raw.district ? raw.district : cfg.districts[0];
      const factions = Array.isArray(raw.factions) ? raw.factions.map(String) : [];
      const heatDelta = clamp(Math.round(num(raw.heat_delta, 4 + casualties * 4)), 0, 40);
      const inc = {
        id: `d${state.world_day}-i${state.next_incident++}`,
        world_day: state.world_day,
        city: cid,
        district,
        factions,
        kind,
        casualties,
        heat_delta: heatDelta,
        blurb: typeof raw.blurb === "string" && raw.blurb
          ? raw.blurb
          : KIND_TEMPLATES[kind]({ district, actors: "No faction affiliation confirmed", casualties: casualtyPhrase(casualties) }),
        gm: true,
      };
      pushIncident(state, inc);
      note(`inject ${inc.id} (${cid} ${kind})`);
    }
  }
  return result;
}

/* ============================== tick ============================== */

function pushIncident(state, inc) {
  state.incidents.push(inc);
  state.cities[inc.city].heat = clamp(state.cities[inc.city].heat + inc.heat_delta, 0, 100);
  if (state.incidents.length > INCIDENT_CAP) {
    state.incidents.splice(0, state.incidents.length - INCIDENT_CAP);
  }
}

function tickMarkets(state, cid) {
  const city = state.cities[cid];
  const cfg = CITIES[cid];
  city.heat += (cfg.heat_base - city.heat) * 0.06; // decay toward city baseline
  const pressure = Math.max(0, (city.heat - 50) / 100); // raids/checkpoints above heat 50
  for (const k of Object.keys(COMMODITIES).sort()) {
    const m = city.markets[k];
    let supAdj = 0, demAdj = 0;
    if (k === "guns") supAdj = -pressure * 0.06;          // supply dries up under attention
    if (k === "vice") demAdj = -pressure * 0.04;         // margins squeezed
    if (k === "touro_dollar") demAdj = -pressure * 0.05; // scared tourists
    m.supply = clamp(m.supply + (cfg.supply_base[k] - m.supply) * 0.08 + (nextRandom(state) * 2 - 1) * 0.02 + supAdj, 0.05, 1.5);
    m.demand = clamp(m.demand + (cfg.demand_base[k] - m.demand) * 0.08 + (nextRandom(state) * 2 - 1) * 0.02 + demAdj, 0.05, 1.5);
    const base = cfg.base[k];
    const noise = (nextRandom(state) * 2 - 1) * COMMODITIES[k].vol;
    const price = m.price * (1 + 0.10 * (m.demand - m.supply) + 0.04 * (base / m.price - 1) + noise);
    m.price = Math.max(base * 0.05, round2(price));
  }
  city.heat = clamp(city.heat, 0, 100);
}

function rollIncident(state, cid) {
  const city = state.cities[cid];
  const cfg = CITIES[cid];
  const lambda = cfg.incident_rate * (0.5 + city.heat / 60) * (0.4 + city.markets.guns.supply);
  if (nextRandom(state) >= lambda) return null;

  // actor: tension pairs active in this city, weighted by tension, vs unaffiliated pool
  const pairs = TENSIONS.filter((t) => t.cities.includes(cid));
  const entries = pairs.map((t) => [t.id, state.tensions[t.id] ?? 0.5]);
  entries.push(["__unaffiliated", 0.6]);
  const pick = pickWeighted(state, entries);
  let factions, actors;
  if (pick === "__unaffiliated") {
    const pool = UNAFFILIATED[cid];
    factions = [pool[Math.floor(nextRandom(state) * pool.length)]];
    actors = "No faction affiliation confirmed";
  } else {
    const pair = pairs.find((t) => t.id === pick);
    factions = pair.factions.slice();
    actors = `Witness statements name ${factions[0]} and ${factions[1]} figures`;
    state.tensions[pick] = clamp((state.tensions[pick] ?? 0.5) + 0.15, 0.2, 1.0); // violence feeds the feud
  }

  const district = cfg.districts[Math.floor(nextRandom(state) * cfg.districts.length)];
  const kind = pickWeighted(state, Object.entries(cfg.kinds));
  const weights = city.heat > 60 ? [0.25, 0.32, 0.26, 0.17] : [0.40, 0.30, 0.20, 0.10];
  const casualties = Number(pickWeighted(state, weights.map((w, i) => [String(i), w])));
  const heatDelta = Math.round(4 + casualties * 4 + nextRandom(state) * 3);

  const inc = {
    id: `d${state.world_day}-i${state.next_incident++}`,
    world_day: state.world_day,
    city: cid,
    district,
    factions,
    kind,
    casualties,
    heat_delta: heatDelta,
    blurb: KIND_TEMPLATES[kind]({ district, actors, casualties: casualtyPhrase(casualties) }),
  };
  pushIncident(state, inc);
  return inc;
}

function snapshotDay(state) {
  const snap = { world_day: state.world_day, cities: {} };
  for (const cid of Object.keys(state.cities).sort()) {
    const city = state.cities[cid];
    snap.cities[cid] = { heat: round1(city.heat), prices: {} };
    for (const k of Object.keys(city.markets).sort()) {
      snap.cities[cid].prices[k] = city.markets[k].price;
    }
  }
  state.history.push(snap);
  if (state.history.length > HISTORY_CAP) state.history.splice(0, state.history.length - HISTORY_CAP);
}

function tickDays(state, nDays, ovFile, log) {
  const ov = applyOverrides(state, ovFile);
  if (ov.applied.length && log) log(`GM overrides applied: ${ov.applied.join("; ")}`);
  for (let d = 0; d < nDays; d++) {
    state.world_day += 1;
    for (const tid of Object.keys(state.tensions)) {
      state.tensions[tid] = clamp(state.tensions[tid] + (nextRandom(state) * 2 - 1) * 0.05, 0.2, 1.0);
    }
    for (const cid of Object.keys(state.cities).sort()) {
      tickMarkets(state, cid);
      if (!ov.disableRandom) rollIncident(state, cid);
    }
    snapshotDay(state);
  }
}

/* ============================== exports ============================== */

function buildStatic(state) {
  const cities = {};
  for (const cid of Object.keys(state.cities).sort()) {
    const city = state.cities[cid];
    cities[cid] = { name: city.name, heat: round1(city.heat), markets: {} };
    for (const k of Object.keys(city.markets).sort()) {
      const m = city.markets[k];
      cities[cid].markets[k] = { price: m.price, supply: round2(m.supply), demand: round2(m.demand) };
    }
  }
  return {
    source: "isla-sim",
    version: state.version,
    generated_at: new Date().toISOString(),
    world_day: state.world_day,
    seed: state.seed,
    commodities: Object.fromEntries(Object.entries(COMMODITIES).map(([k, v]) => [k, v.label])),
    cities,
    tensions: state.tensions,
    incidents: state.incidents.slice(-50).reverse(), // newest first for the feed
    history: state.history,
  };
}

function biggestMover(state, days) {
  const hist = state.history;
  if (hist.length < 2) return null;
  const back = Math.max(0, hist.length - 1 - days);
  const then = hist[back], now = hist[hist.length - 1];
  let best = null;
  for (const cid of Object.keys(now.cities)) {
    for (const k of Object.keys(now.cities[cid].prices)) {
      const p0 = then.cities[cid] && then.cities[cid].prices[k];
      const p1 = now.cities[cid].prices[k];
      if (!p0 || !p1) continue;
      const pct = ((p1 - p0) / p0) * 100;
      if (!best || Math.abs(pct) > Math.abs(best.pct)) {
        best = { city: cid, commodity: k, pct: round1(pct), price: p1 };
      }
    }
  }
  return best;
}

function buildBroadcast(state) {
  const items = [];
  const window = state.incidents.filter((i) => i.world_day >= state.world_day - 1);
  window.sort((a, b) => b.casualties - a.casualties || b.heat_delta - a.heat_delta);
  for (const inc of window.slice(0, 2)) {
    items.push({
      id: `sim-${inc.id}`,
      kind: "incident",
      city: CITIES[inc.city].name,
      headline: `${inc.kind[0].toUpperCase()}${inc.kind.slice(1)} in ${inc.district}, ${CITIES[inc.city].name}`,
      body: `${CITIES[inc.city].name} — ${inc.blurb}`,
    });
  }
  const mover = biggestMover(state, 7);
  if (mover) {
    const dir = mover.pct >= 0 ? "up" : "down";
    items.push({
      id: `sim-d${state.world_day}-m1`,
      kind: "market",
      city: CITIES[mover.city].name,
      headline: `${COMMODITIES[mover.commodity].label} ${dir} ${Math.abs(mover.pct)}% on the week in ${CITIES[mover.city].name}`,
      body: `${COMMODITIES[mover.commodity].label} moving at ${mover.price} in ${CITIES[mover.city].name}, ${dir} ${Math.abs(mover.pct)}% over seven days. Night Ledger reads the tape so you don't have to.`,
    });
  }
  for (const cid of Object.keys(state.cities).sort()) {
    if (state.cities[cid].heat > 60) {
      items.push({
        id: `sim-d${state.world_day}-h-${cid}`,
        kind: "heat",
        city: CITIES[cid].name,
        headline: `CRT surge holds in ${CITIES[cid].name}`,
        body: `County CRT presence remains elevated in ${CITIES[cid].name} (heat ${round1(state.cities[cid].heat)}/100). Expect checkpoints, manifest inspections, and canceled evenings.`,
      });
      break;
    }
  }
  if (items.length === 0) {
    items.push({
      id: `sim-d${state.world_day}-quiet`,
      kind: "quiet",
      city: null,
      headline: "Quiet night on the blotter",
      body: "No firearm incidents reported to county CRT in the last cycle. The island thanks you for your continued discretion.",
    });
  }
  items.slice(0, 3).forEach((it, i) => { it.priority = i + 1; });
  return {
    source: "isla-sim",
    generated_at: new Date().toISOString(),
    world_day: state.world_day,
    items: items.slice(0, 3),
  };
}

function writeExports(state, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const staticFile = path.join(dir, "sim-static.json");
  const broadcastFile = path.join(dir, "sim-broadcast.json");
  fs.writeFileSync(staticFile, JSON.stringify(buildStatic(state), null, 2) + "\n", "utf8");
  fs.writeFileSync(broadcastFile, JSON.stringify(buildBroadcast(state), null, 2) + "\n", "utf8");
  return [staticFile, broadcastFile];
}

/* ============================== status ============================== */

function weekDelta(state, cid, k) {
  const hist = state.history;
  if (hist.length < 2) return null;
  const back = Math.max(0, hist.length - 1 - 7);
  const p0 = hist[back].cities[cid] && hist[back].cities[cid].prices[k];
  const p1 = hist[hist.length - 1].cities[cid].prices[k];
  if (!p0 || !p1) return null;
  return round1(((p1 - p0) / p0) * 100);
}

function heatBar(heat) {
  const filled = Math.round(clamp(heat, 0, 100) / 10);
  return "#".repeat(filled) + "-".repeat(10 - filled);
}

function printStatus(state) {
  const recent7 = state.incidents.filter((i) => i.world_day > state.world_day - 7).length;
  console.log(`ISLA PRIMAVERA SIM — world day ${state.world_day} | seed ${state.seed} | incidents ${state.incidents.length} (last 7d: ${recent7})`);
  for (const cid of Object.keys(state.cities).sort()) {
    const city = state.cities[cid];
    console.log(`\n${city.name} (${cid}) — heat ${round1(city.heat)} [${heatBar(city.heat)}]${city.heat > 60 ? "  CRT SURGE" : city.heat > 50 ? "  elevated" : ""}`);
    for (const k of Object.keys(city.markets).sort()) {
      const m = city.markets[k];
      const wd = weekDelta(state, cid, k);
      const wdTxt = wd === null ? "   n/a " : `${wd >= 0 ? "+" : ""}${wd}%`.padStart(7);
      console.log(`  ${COMMODITIES[k].label.padEnd(15)} ${String(m.price).padStart(8)}  ${wdTxt}/7d  s:${m.supply.toFixed(2)} d:${m.demand.toFixed(2)}`);
    }
  }
  const last = state.incidents.slice(-6).reverse();
  if (last.length) {
    console.log("\nRecent blotter:");
    for (const i of last) {
      console.log(`  d${i.world_day} ${i.kind} — ${i.district}, ${CITIES[i.city].name} — ${i.factions.join(" x ")} — ${casualtyPhrase(i.casualties)}${i.gm ? " [GM]" : ""}`);
    }
  }
}

/* ============================== self-check ============================== */

function assert(cond, msg, failures) {
  if (cond) console.log(`OK: ${msg}`);
  else { console.error(`FAIL: ${msg}`); failures.push(msg); }
}

function selfCheck() {
  const failures = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "isla-sim-check-"));
  const fileA = path.join(root, "a", "sim-state.json");
  const fileB = path.join(root, "b", "sim-state.json");
  const KNOWN = knownFactions();
  const KINDS = new Set(Object.keys(KIND_TEMPLATES));

  // run A: init + 30 ticks with an overrides file exercising the GM channel
  const stA = initState(424242);
  saveState(fileA, stA);
  const ovFile = overridesPathFor(fileA);
  fs.writeFileSync(ovFile, JSON.stringify({
    heat: { r01: 88 },
    price: { "r03.guns": 250 },
    inject_incidents: [{ city: "r02", kind: "dockside ambush", casualties: 2, factions: ["Test Crew"], blurb: "GM scripted beat." }],
  }) + "\n", "utf8");
  const runA = loadState(fileA);
  tickDays(runA, 30, ovFile, null);
  saveState(fileA, runA);
  const loadedA = loadState(fileA);

  assert(JSON.stringify(loadedA) === JSON.stringify(runA), "state round-trips through save/load", failures);
  assert(loadedA.world_day === 30, `world_day advanced to 30 (got ${loadedA.world_day})`, failures);
  assert(loadedA.history.length === 30, `history holds 30 daily snapshots (got ${loadedA.history.length})`, failures);
  assert(loadedA.incidents.length <= INCIDENT_CAP, `incidents within cap ${INCIDENT_CAP}`, failures);

  let pricesOk = true, heatOk = true;
  for (const [cid, city] of Object.entries(loadedA.cities)) {
    if (!(city.heat >= 0 && city.heat <= 100)) heatOk = false;
    for (const m of Object.values(city.markets)) {
      if (!(Number.isFinite(m.price) && m.price > 0)) pricesOk = false;
    }
  }
  for (const snap of loadedA.history) {
    for (const [cid, c] of Object.entries(snap.cities)) {
      if (!(c.heat >= 0 && c.heat <= 100)) heatOk = false;
      for (const p of Object.values(c.prices)) if (!(p > 0)) pricesOk = false;
    }
  }
  assert(pricesOk, "all prices > 0 (state + 30 days of history)", failures);
  assert(heatOk, "all heat in [0,100] (state + history)", failures);

  let refsOk = true, gmSeen = false, overrideHeld = false;
  for (const inc of loadedA.incidents) {
    if (!CITIES[inc.city] || !KINDS.has(inc.kind) || !(inc.casualties >= 0 && inc.casualties <= 3) || typeof inc.blurb !== "string" || !inc.blurb) refsOk = false;
    if (!inc.gm) for (const f of inc.factions) if (!KNOWN.has(f)) refsOk = false;
    if (inc.gm) {
      gmSeen = true;
      if (inc.city === "r02" && inc.blurb === "GM scripted beat." && inc.casualties === 2) overrideHeld = true;
    }
  }
  assert(refsOk, "incidents reference valid cities/kinds/factions with blurbs", failures);
  assert(loadedA.incidents.length > 0, `incidents generated over 30 days (got ${loadedA.incidents.length})`, failures);
  assert(gmSeen && overrideHeld, "GM-injected incident landed intact (gm channel)", failures);

  // GM pins: 1-tick run — pins land, then exactly one day of drift applies
  const pinRun = initState(424243);
  tickDays(pinRun, 1, ovFile, null);
  assert(pinRun.cities.r01.heat > 75 && pinRun.cities.r01.heat <= 88, `GM heat pin landed (r01=${round1(pinRun.cities.r01.heat)} after 1 decay)`, failures);
  assert(pinRun.cities.r03.markets.guns.price > 200 && pinRun.cities.r03.markets.guns.price <= 250, `GM price pin landed (r03 guns=${pinRun.cities.r03.markets.guns.price} after 1 move)`, failures);

  // run B: determinism — two fresh same-seed states, 10 ticks, byte-identical
  const b1 = initState(777);
  tickDays(b1, 10, overridesPathFor(fileB), null);
  saveState(fileB, b1);
  const b2 = initState(777);
  tickDays(b2, 10, overridesPathFor(fileB), null);
  assert(JSON.stringify(b1) === JSON.stringify(b2), "determinism: same seed + 10 ticks = identical state", failures);

  // exports build clean
  const [sf, bf] = writeExports(runA, root);
  const stat = JSON.parse(fs.readFileSync(sf, "utf8"));
  const bcast = JSON.parse(fs.readFileSync(bf, "utf8"));
  assert(stat.world_day === 30 && stat.history.length === 30, "sim-static.json export shape", failures);
  assert(Array.isArray(bcast.items) && bcast.items.length >= 1 && bcast.items.length <= 3, "sim-broadcast.json has 1-3 items", failures);

  fs.rmSync(root, { recursive: true, force: true });
  if (failures.length) {
    console.error(`\n${failures.length} self-check failure(s)`);
    return 1;
  }
  console.log("\nSelf-check passed.");
  return 0;
}

/* ============================== CLI ============================== */

function usage() {
  console.log(`Usage: node isla-sim.js [--init [--force] [--seed N]] [--tick [N]] [--status] [--export] [--self-check] [--state PATH]
  State: --state PATH, else $ISLA_SIM_STATE, else ../linuxbox/tableslop-static/sim/sim-state.json
  GM overrides: sim-gm-overrides.json next to the state file (see design doc §5).`);
}

function main(argv) {
  const opts = { init: false, force: false, seed: DEFAULT_SEED, tick: null, status: false, export: false, selfCheck: false, state: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--init") opts.init = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--seed") opts.seed = Number(argv[++i]);
    else if (a === "--tick") {
      const n = argv[i + 1];
      if (n && !n.startsWith("--")) { opts.tick = Math.max(0, Math.floor(Number(n) || 1)); i++; }
      else opts.tick = 1;
    }
    else if (a === "--status") opts.status = true;
    else if (a === "--export") opts.export = true;
    else if (a === "--self-check") opts.selfCheck = true;
    else if (a === "--state") opts.state = argv[++i];
    else if (a === "--help" || a === "-h") { usage(); return 0; }
    else { console.error(`Unknown flag: ${a}`); usage(); return 2; }
  }

  if (opts.selfCheck) return selfCheck();
  if (!opts.init && opts.tick === null && !opts.status && !opts.export) { usage(); return 2; }

  const file = statePath(opts);

  if (opts.init) {
    if (fs.existsSync(file) && !opts.force) {
      console.error(`State already exists: ${file} (use --force to reseed)`);
      return 1;
    }
    saveState(file, initState(opts.seed));
    console.log(`Initialized sim state (seed ${opts.seed}) -> ${file}`);
  }

  if (opts.tick !== null) {
    if (!fs.existsSync(file)) { console.error(`No state file: ${file} (run --init first)`); return 1; }
    const state = loadState(file);
    tickDays(state, opts.tick, overridesPathFor(file), (s) => console.log(s));
    saveState(file, state);
    console.log(`Ticked ${opts.tick} world-day(s); now world day ${state.world_day}.`);
  }

  if (opts.export) {
    if (!fs.existsSync(file)) { console.error(`No state file: ${file} (run --init first)`); return 1; }
    const [sf, bf] = writeExports(loadState(file), path.dirname(file));
    console.log(`Exported -> ${sf}`);
    console.log(`Exported -> ${bf}`);
  }

  if (opts.status) {
    if (!fs.existsSync(file)) { console.error(`No state file: ${file} (run --init first)`); return 1; }
    printStatus(loadState(file));
  }
  return 0;
}

process.exit(main(process.argv.slice(2)));
