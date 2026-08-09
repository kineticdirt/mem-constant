/**
 * Deterministic Isla Primavera weather for World editor dashboard.
 * No LLM — PRNG from seed + diegetic date + city id.
 * Climate band (LORE-BIBLE): 75–88°F, 70–90% humidity, wet May–Oct / dry Nov–Apr, year lock 2019.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CITIES = [
  {
    id: "paradise",
    label: "Paradise",
    region_id: "r01-paradise",
    bias: { temp: 1, rain: -8, humidity: -2 },
    vibe: "boardwalk brochure sun",
  },
  {
    id: "porto-lujara",
    label: "Porto Lujara",
    region_id: "r02-porto-lujuria",
    bias: { temp: 0, rain: 10, humidity: 4 },
    vibe: "dock steam + neon wet asphalt",
  },
  {
    id: "jackedsonville",
    label: "Jackedsonville",
    region_id: "r03-crimson-quay",
    bias: { temp: 2, rain: 4, humidity: 2 },
    vibe: "casino heat island + fog-machine haze",
  },
];

const CONDITIONS = [
  "clear",
  "partly cloudy",
  "humid haze",
  "scattered showers",
  "afternoon storm cells",
  "steady rain",
  "trade-wind breeze",
  "overcast muggy",
];

function hash32(str) {
  const h = crypto.createHash("sha256").update(String(str), "utf8").digest();
  return h.readUInt32BE(0);
}

function mulberry32(a) {
  return function rand() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseYmd(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d };
}

function addDays(ymd, days) {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  const dt = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function isWetSeason(month) {
  return month >= 5 && month <= 10;
}

function windDir(rand) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "ENE", "ESE", "trade E"];
  return dirs[Math.floor(rand() * dirs.length)];
}

function festivalRisk(cityId, month, rainChance, rand) {
  // Carnaval spillover weeks lean Lujuria; tourist peak dry months lean Paradise.
  let score = rainChance * 0.25 + rand() * 30;
  if (cityId === "porto-lujara" && (month === 2 || month === 3 || month === 7)) score += 25;
  if (cityId === "paradise" && (month === 12 || month === 1 || month === 2)) score += 18;
  if (cityId === "jackedsonville") score += 12;
  if (score >= 70) return "high";
  if (score >= 40) return "moderate";
  return "low";
}

function crtOptics(cityId, conditions, humidity, rand) {
  if (cityId === "jackedsonville") {
    return humidity > 82 || /storm|rain/.test(conditions)
      ? "neon bloom + wet glass CRT smear"
      : "casino LED wash, mild CRT fringe";
  }
  if (cityId === "porto-lujara") {
    return /rain|storm/.test(conditions)
      ? "dock flood sheen; streetlights streak"
      : "port sodium glow, soft CRT edge";
  }
  // paradise
  return humidity > 85
    ? "brochure haze; hunter optics muddy at dusk"
    : rand() > 0.7
      ? "postcard clear; CRT quiet"
      : "bay glare + light CRT edge at marina";
}

function dayRoll(seed, cityId, ymd) {
  const p = parseYmd(ymd) || { y: 2019, mo: 5, d: 14 };
  const wet = isWetSeason(p.mo);
  const city = CITIES.find((c) => c.id === cityId) || CITIES[0];
  const rand = mulberry32(hash32(`${seed}|${cityId}|${ymd}`));

  const baseTemp = wet ? 82 : 80;
  const temp = Math.round(
    clamp(baseTemp + city.bias.temp + (rand() * 10 - 4), 75, 88)
  );
  const humidity = Math.round(
    clamp((wet ? 82 : 74) + city.bias.humidity + (rand() * 14 - 4), 70, 90)
  );
  let rain = Math.round(
    clamp((wet ? 55 : 18) + city.bias.rain + (rand() * 40 - 12), 5, 95)
  );
  const condIdx = Math.min(
    CONDITIONS.length - 1,
    Math.floor(rain / 14) + (rand() > 0.65 ? 1 : 0)
  );
  const conditions = CONDITIONS[clamp(condIdx, 0, CONDITIONS.length - 1)];
  const wind_mph = Math.round(clamp(6 + rand() * 18 + (wet ? 2 : 0), 4, 28));
  const wind_dir = windDir(rand);
  const festival_risk = festivalRisk(cityId, p.mo, rain, rand);
  const crt_optics = crtOptics(cityId, conditions, humidity, rand);
  const flood_watch =
    cityId === "porto-lujara" && rain >= 60
      ? "low docks / Quay alleys first"
      : cityId === "jackedsonville" && rain >= 70
        ? "casino service alleys slick"
        : "none";

  return {
    date: ymd,
    temp_f: temp,
    humidity_pct: humidity,
    conditions,
    wind_mph,
    wind_dir,
    rain_chance_pct: rain,
    festival_risk,
    crt_optics,
    flood_watch,
    season: wet ? "wet" : "dry",
  };
}

function readDiegeticDate(campaignDir) {
  const clockPath = path.join(campaignDir, "map", "diegetic-clock.json");
  let year = 2019;
  let month = 5;
  let day = 14;
  try {
    const clock = JSON.parse(fs.readFileSync(clockPath, "utf8"));
    if (Number(clock.diegetic_year)) year = Number(clock.diegetic_year);
    if (clock.diegetic_date) {
      const p = parseYmd(clock.diegetic_date);
      if (p) return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}`;
    }
    if (Number(clock.diegetic_month)) month = clamp(Number(clock.diegetic_month), 1, 12);
    if (Number(clock.diegetic_day)) day = clamp(Number(clock.diegetic_day), 1, 28);
  } catch {
    /* defaults */
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function generateWeatherState(campaignDir, opts) {
  const o = opts || {};
  const seed = String(o.seed || "isla-primavera-weather");
  const days = clamp(Number(o.forecast_days) || 7, 3, 7);
  const baseDate = String(o.diegetic_date || readDiegeticDate(campaignDir));
  const cities = {};
  for (const c of CITIES) {
    const current = dayRoll(seed, c.id, baseDate);
    const forecast = [];
    for (let i = 0; i < days; i++) {
      forecast.push(dayRoll(seed, c.id, addDays(baseDate, i)));
    }
    cities[c.id] = {
      id: c.id,
      label: c.label,
      region_id: c.region_id,
      vibe: c.vibe,
      current,
      forecast,
    };
  }
  const p = parseYmd(baseDate) || { mo: 5 };
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    seed,
    diegetic_date: baseDate,
    diegetic_year: (parseYmd(baseDate) || { y: 2019 }).y,
    season: isWetSeason(p.mo) ? "wet" : "dry",
    climate_band: {
      temp_f: [75, 88],
      humidity_pct: [70, 90],
      wet_months: "May–Oct",
      dry_months: "Nov–Apr",
      present_lock: 2019,
    },
    cities,
    notes_path: "worldbuilding/CLIMATE.md",
  };
}

function weatherStatePath(campaignDir) {
  return path.join(campaignDir, "worldbuilding", "weather-state.json");
}

function readWeatherState(campaignDir) {
  const abs = weatherStatePath(campaignDir);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    return { error: "weather_read_failed", detail: String(e.message || e) };
  }
}

function writeWeatherState(campaignDir, state, lockFns) {
  const abs = weatherStatePath(campaignDir);
  const dir = path.dirname(abs);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const next = Object.assign({}, state, {
    updated_at: new Date().toISOString(),
    version: Number(state.version) > 0 ? Number(state.version) : 1,
  });
  const body = JSON.stringify(next, null, 2) + "\n";
  const resource = "world-weather:tropic-gooner";
  const holder = `tableslop-weather:${process.pid}`;
  const acquire = lockFns && lockFns.acquire;
  const release = lockFns && lockFns.release;
  const repoRoot = lockFns && lockFns.repoRoot;
  if (acquire && repoRoot) {
    acquire({ repoRoot, resource, holder, note: "write weather-state.json", wait: true });
  }
  try {
    if (fs.existsSync(abs)) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      try {
        fs.copyFileSync(abs, `${abs}.bak-${ts}`);
      } catch {
        /* bak best-effort */
      }
    }
    fs.writeFileSync(abs, body);
    return next;
  } finally {
    if (release && repoRoot) {
      try {
        release({ repoRoot, resource, holder });
      } catch {
        /* ignore */
      }
    }
  }
}

function ensureWeatherState(campaignDir, lockFns) {
  const cur = readWeatherState(campaignDir);
  if (cur && !cur.error && cur.cities) return cur;
  const gen = generateWeatherState(campaignDir, {});
  return writeWeatherState(campaignDir, gen, lockFns);
}

module.exports = {
  CITIES,
  generateWeatherState,
  readWeatherState,
  writeWeatherState,
  ensureWeatherState,
  weatherStatePath,
  readDiegeticDate,
};
