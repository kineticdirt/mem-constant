#!/usr/bin/env node
/**
 * Deterministic per-person sim — needs / wants / idiosyncrasies.
 * No LLM. Economy commodities are read for prices; agents write demand pressure.
 * Does not touch city pins or regions-ui.
 *
 *   node tableslop-agents-sim.js --seed-from-registry [--write]
 *   node tableslop-agents-sim.js --tick [--days N] [--write]
 *   node tableslop-agents-sim.js --self-check
 */
"use strict";

const fs = require("fs");
const path = require("path");
const {
  campaignDir,
  loadEconomy,
  saveEconomy,
  tickEconomy,
} = require("./tableslop-economy-sim.js");

const DEFAULT_CAMPAIGN = "tropic-gooner";

const NEED_KEYS = ["food", "shelter", "money", "safety", "belonging", "stimulation"];

function agentsPath(cdir) {
  return path.join(cdir, "worldbuilding", "agents-state.json");
}

function registryPath(cdir) {
  return path.join(cdir, "characters-registry.json");
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

function rngFrom(seedStr) {
  let t = hashSeed(seedStr) || 1;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function readJson(abs) {
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function writeJson(abs, data) {
  fs.writeFileSync(abs, JSON.stringify(data, null, 2) + "\n");
}

const HOME_BY_ROLE = {
  pc: ["r01-paradise", "r02-porto-lujuria", "r03-crimson-quay", "r01-paradise"],
  npc: ["r02-porto-lujuria", "r03-crimson-quay", "r04-villa-miel", "r08-sierra-dorado"],
};

const QUIRK_POOL = [
  "night_owl",
  "early_riser",
  "cheapskate",
  "status_seeker",
  "homebody",
  "wanderer",
  "risk_tolerant",
  "risk_averse",
  "foodie",
  "teetotal",
  "club_regular",
  "church_morning",
];

const WANT_POOL = [
  "nightlife",
  "quiet",
  "status",
  "romance",
  "work",
  "faith",
  "vice",
  "nature",
  "tech",
  "family",
];

function pickN(rnd, arr, n) {
  const copy = arr.slice();
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    const j = Math.floor(rnd() * copy.length);
    out.push(copy.splice(j, 1)[0]);
  }
  return out;
}

function seedAgentFromChar(ch, idx) {
  const rnd = rngFrom("agent|" + ch.id);
  const role = String(ch.role || "npc");
  const homes = HOME_BY_ROLE[role] || HOME_BY_ROLE.npc;
  const home = homes[idx % homes.length];
  const needs = {};
  for (const k of NEED_KEYS) {
    needs[k] = Math.round((0.35 + rnd() * 0.45) * 1000) / 1000;
  }
  // idiosyncrasy: amplify 1–2 needs
  const amp = NEED_KEYS[Math.floor(rnd() * NEED_KEYS.length)];
  needs[amp] = clamp(needs[amp] + 0.25, 0, 1);
  const funds = Math.round(40 + rnd() * 220);
  return {
    id: ch.id,
    name: ch.display_name || ch.id,
    role: role,
    status: ch.status || "active",
    home_region: home,
    region: home,
    funds,
    job: role === "pc" ? "player_orbit" : rnd() > 0.5 ? "service" : "informal",
    needs,
    wants: pickN(rnd, WANT_POOL, 2 + Math.floor(rnd() * 2)),
    quirks: pickN(rnd, QUIRK_POOL, 2),
    inventory: { ice: 0, seafood: 0, rum: 0 },
    last_action: null,
    satisfaction: 0.5,
    demand_pressure: {},
  };
}

function visibleChars(reg) {
  return (reg.characters || []).filter((c) => {
    if (!c || c.hidden) return false;
    if (c.status === "stub") return false;
    if (c.role === "ingest-noise" || c.role === "author-stub") return false;
    return true;
  });
}

function seedFromRegistry(cdir) {
  const reg = readJson(registryPath(cdir));
  const chars = visibleChars(reg);
  const agents = chars.map((c, i) => seedAgentFromChar(c, i));
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    present_lock: 2019,
    diegetic_date: "2019-06-15",
    tick: 0,
    seed: "isla-agents-v1",
    _doc: "Deterministic person sim (needs/wants/quirks). No LLM. Seeded from visible registry rows.",
    agents,
    last_summary: null,
  };
}

function loadAgents(cdir) {
  const abs = agentsPath(cdir);
  if (!fs.existsSync(abs)) return seedFromRegistry(cdir);
  return readJson(abs);
}

function saveAgents(cdir, state) {
  writeJson(agentsPath(cdir), state);
  return state;
}

function dominantNeed(needs) {
  let best = NEED_KEYS[0];
  let v = -1;
  for (const k of NEED_KEYS) {
    const n = Number(needs[k]) || 0;
    if (n > v) {
      v = n;
      best = k;
    }
  }
  return { key: best, value: v };
}

function priceOf(economy, commodity) {
  const c = (economy.commodities || {})[commodity];
  return c && c.price != null ? Number(c.price) : 20;
}

/**
 * One agent day — pure functions of needs, quirks, prices, seed.
 */
function tickOneAgent(agent, economy, seedKey) {
  const rnd = rngFrom(seedKey + "|" + agent.id);
  const a = JSON.parse(JSON.stringify(agent));
  const needs = a.needs || {};
  // decay / rise
  for (const k of NEED_KEYS) {
    let n = Number(needs[k]) || 0.5;
    n += 0.04 + rnd() * 0.03;
    if ((a.quirks || []).includes("homebody") && k === "belonging") n += 0.02;
    if ((a.quirks || []).includes("wanderer") && k === "stimulation") n += 0.03;
    if ((a.quirks || []).includes("night_owl") && k === "stimulation") n += 0.02;
    needs[k] = clamp(n, 0, 1);
  }
  const dom = dominantNeed(needs);
  let action = "idle";
  let spend = 0;
  const pressure = {};

  function buy(commodity, needKey, relief, qty) {
    const price = priceOf(economy, commodity) * (qty || 1);
    const cheap = (a.quirks || []).includes("cheapskate");
    const cost = cheap ? price * 0.85 : price;
    if (a.funds < cost * 0.5) {
      action = "broke_skip_" + commodity;
      pressure[commodity] = (pressure[commodity] || 0) + 0.3;
      return false;
    }
    a.funds = Math.round((a.funds - Math.min(a.funds, cost)) * 100) / 100;
    spend = cost;
    needs[needKey] = clamp(needs[needKey] - relief, 0, 1);
    pressure[commodity] = (pressure[commodity] || 0) + 1;
    action = "buy_" + commodity;
    return true;
  }

  if (dom.key === "food") {
    if ((a.quirks || []).includes("foodie") || (a.wants || []).includes("nightlife")) {
      buy("seafood", "food", 0.45, 1) || buy("honey", "food", 0.3, 1);
    } else {
      buy("sugar", "food", 0.35, 1) || buy("seafood", "food", 0.4, 1);
    }
  } else if (dom.key === "money") {
    const wage = a.job === "service" ? 18 + rnd() * 12 : a.job === "player_orbit" ? 10 + rnd() * 8 : 12 + rnd() * 10;
    a.funds = Math.round((a.funds + wage) * 100) / 100;
    needs.money = clamp(needs.money - 0.35, 0, 1);
    action = "work_" + a.job;
    pressure.labor = (pressure.labor || 0) + 1;
  } else if (dom.key === "shelter") {
    const rent = (a.quirks || []).includes("status_seeker") ? 25 : 14;
    if (a.funds >= rent) {
      a.funds -= rent;
      needs.shelter = clamp(needs.shelter - 0.5, 0, 1);
      action = "pay_rent";
      pressure.hospitality = (pressure.hospitality || 0) + 1;
    } else {
      action = "couchsurf";
      needs.safety = clamp(needs.safety + 0.1, 0, 1);
      a.region = a.home_region;
    }
  } else if (dom.key === "safety") {
    a.region = a.home_region;
    needs.safety = clamp(needs.safety - 0.4, 0, 1);
    action = "stay_home";
  } else if (dom.key === "belonging") {
    if ((a.wants || []).includes("faith") || (a.quirks || []).includes("church_morning")) {
      needs.belonging = clamp(needs.belonging - 0.4, 0, 1);
      action = "community_faith";
    } else if ((a.wants || []).includes("nightlife") || (a.quirks || []).includes("club_regular")) {
      buy("vice_cash", "belonging", 0.35, 0.5) || buy("rum", "belonging", 0.3, 1);
      if (action.startsWith("buy_")) action = "social_" + action;
      a.region = "r03-crimson-quay";
    } else {
      needs.belonging = clamp(needs.belonging - 0.3, 0, 1);
      action = "visit_friend";
    }
  } else if (dom.key === "stimulation") {
    if ((a.wants || []).includes("nature")) {
      a.region = "r11-black-sand-preserve";
      needs.stimulation = clamp(needs.stimulation - 0.35, 0, 1);
      action = "go_nature";
    } else if ((a.wants || []).includes("tech")) {
      buy("tech", "stimulation", 0.25, 0.2);
      a.region = "r01-paradise";
    } else {
      buy("tourism", "stimulation", 0.3, 0.3) || buy("rum", "stimulation", 0.25, 1);
      a.region = "r01-paradise";
    }
  }

  // baseline decay of money need if funds high
  if (a.funds > 150) needs.money = clamp(needs.money - 0.05, 0, 1);
  if (a.funds < 20) needs.money = clamp(needs.money + 0.15, 0, 1);

  a.needs = needs;
  a.last_action = action;
  a.last_spend = Math.round(spend * 100) / 100;
  a.demand_pressure = pressure;
  const avgNeed = NEED_KEYS.reduce((s, k) => s + (needs[k] || 0), 0) / NEED_KEYS.length;
  a.satisfaction = Math.round(clamp(1 - avgNeed, 0, 1) * 1000) / 1000;
  return a;
}

function aggregatePressure(agents) {
  const out = {};
  for (const a of agents) {
    for (const [k, v] of Object.entries(a.demand_pressure || {})) {
      out[k] = (out[k] || 0) + Number(v);
    }
  }
  return out;
}

function applyPressureToEconomy(economy, pressure) {
  const next = JSON.parse(JSON.stringify(economy));
  const commodities = next.commodities || {};
  for (const [id, c] of Object.entries(commodities)) {
    const p = pressure[id] || 0;
    if (!p) continue;
    const base = Number(c.base_demand) || Number(c.demand) || 10;
    c.base_demand = Math.round((base * 0.85 + (base + p * 2) * 0.15) * 100) / 100;
    commodities[id] = c;
  }
  next.commodities = commodities;
  return next;
}

function summarize(agents) {
  const byAction = {};
  let sat = 0;
  let funds = 0;
  for (const a of agents) {
    byAction[a.last_action || "idle"] = (byAction[a.last_action || "idle"] || 0) + 1;
    sat += a.satisfaction || 0;
    funds += a.funds || 0;
  }
  const n = agents.length || 1;
  return {
    count: agents.length,
    avg_satisfaction: Math.round((sat / n) * 1000) / 1000,
    avg_funds: Math.round((funds / n) * 100) / 100,
    actions: byAction,
    pressure: aggregatePressure(agents),
  };
}

function tickAgents(agentsState, economy, opts) {
  opts = opts || {};
  const days = Math.max(1, Number(opts.days) || 1);
  let nextA = JSON.parse(JSON.stringify(agentsState));
  let nextE = economy;
  for (let d = 0; d < days; d++) {
    const date = nextA.diegetic_date || nextE.diegetic_date || "2019-06-15";
    const seedKey = [nextA.seed || "isla-agents", date, String(nextA.tick || 0)].join("|");
    nextA.agents = (nextA.agents || []).map((a) => tickOneAgent(a, nextE, seedKey));
    const pressure = aggregatePressure(nextA.agents);
    nextE = applyPressureToEconomy(nextE, pressure);
    nextE = tickEconomy(nextE, { campaignDir: opts.campaignDir, days: 1 });
    nextA.tick = Number(nextA.tick || 0) + 1;
    nextA.diegetic_date = nextE.diegetic_date;
    nextA.last_summary = summarize(nextA.agents);
    nextA.version = Number(nextA.version || 0) + 1;
    nextA.updated_at = new Date().toISOString();
  }
  return { agents: nextA, economy: nextE };
}

function selfCheck() {
  const cdir = campaignDir(DEFAULT_CAMPAIGN);
  let agents = seedFromRegistry(cdir);
  if (agents.agents.length < 5) throw new Error("seed_too_few");
  const eco = loadEconomy(cdir);
  const t1 = tickAgents(agents, eco, { campaignDir: cdir, days: 1 });
  const t1b = tickAgents(agents, eco, { campaignDir: cdir, days: 1 });
  if (JSON.stringify(t1.agents.agents.map((a) => a.last_action)) !== JSON.stringify(t1b.agents.agents.map((a) => a.last_action))) {
    throw new Error("non_deterministic_actions");
  }
  if (!t1.agents.last_summary || t1.agents.last_summary.count < 5) throw new Error("summary_missing");
  console.log(
    "tableslop-agents-sim: SELF_CHECK_OK agents=%s tick=%s sat=%s actions=%s",
    t1.agents.last_summary.count,
    t1.agents.tick,
    t1.agents.last_summary.avg_satisfaction,
    JSON.stringify(t1.agents.last_summary.actions)
  );
  return true;
}

function main(argv) {
  const args = argv.slice(2);
  const cdir = campaignDir(DEFAULT_CAMPAIGN);
  const write = args.includes("--write");
  if (args.includes("--self-check")) {
    selfCheck();
    return;
  }
  if (args.includes("--seed-from-registry")) {
    const seeded = seedFromRegistry(cdir);
    if (write) {
      saveAgents(cdir, seeded);
      console.log("seeded agents", seeded.agents.length);
    } else {
      console.log(JSON.stringify({ count: seeded.agents.length, sample: seeded.agents[0] }, null, 2));
    }
    return;
  }
  if (!args.includes("--tick")) {
    console.error("usage: --self-check | --seed-from-registry [--write] | --tick [--days N] [--write]");
    process.exit(2);
  }
  let days = 1;
  const di = args.indexOf("--days");
  if (di >= 0) days = Number(args[di + 1]) || 1;
  const agents = loadAgents(cdir);
  const eco = loadEconomy(cdir);
  const out = tickAgents(agents, eco, { campaignDir: cdir, days });
  if (write) {
    saveAgents(cdir, out.agents);
    saveEconomy(cdir, out.economy);
    console.log("wrote agents+economy", out.agents.last_summary);
  } else {
    console.log(JSON.stringify(out.agents.last_summary, null, 2));
  }
}

module.exports = {
  seedFromRegistry,
  loadAgents,
  saveAgents,
  tickAgents,
  tickOneAgent,
  agentsPath,
  selfCheck,
  NEED_KEYS,
};

if (require.main === module) {
  try {
    main(process.argv);
  } catch (e) {
    console.error("tableslop-agents-sim:", e && e.message ? e.message : e);
    process.exit(1);
  }
}
