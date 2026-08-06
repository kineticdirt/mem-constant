#!/usr/bin/env node
/**
 * radio-bulletins.js — deterministic daily news bulletins for Isla Primavera radio.
 *
 * No LLM, no deps. Same world-day in -> same bulletins out.
 *
 *   node scripts/tableslop/radio-bulletins.js [--date YYYY-MM-DD] [--out PATH] [--sim PATH]
 *   node scripts/tableslop/radio-bulletins.js --self-check
 *
 * Inputs:  scripts/linuxbox/tableslop-static/radio/stations.json
 *          campaigns/tropic-gooner/worldbuilding/STORIES.md  (seed titles, parsed)
 *          campaigns/tropic-gooner/worldbuilding/GROUPS.md   (faction names, parsed)
 *          OPTIONAL sim-broadcast.json (isla-sim.js --export radio bridge, design
 *          docs/plans/isla-primavera-sim-design-2026-08-06.md §7): typed news items
 *          merged verbatim ahead of template bulletins. Default lookup beside the
 *          output file; --sim overrides. Engine works unchanged when it is absent.
 * Output:  scripts/linuxbox/tableslop-static/radio/bulletins.json
 *
 * Seed scheme: xmur3("<date>|<station.id>") -> mulberry32.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const RADIO_DIR = path.join(REPO, 'scripts', 'linuxbox', 'tableslop-static', 'radio');
const STATIONS_PATH = path.join(RADIO_DIR, 'stations.json');
const STORIES_PATH = path.join(REPO, 'campaigns', 'tropic-gooner', 'worldbuilding', 'STORIES.md');
const GROUPS_PATH = path.join(REPO, 'campaigns', 'tropic-gooner', 'worldbuilding', 'GROUPS.md');
const DEFAULT_OUT = path.join(RADIO_DIR, 'bulletins.json');
const SIM_DEFAULT = path.join(RADIO_DIR, 'sim-broadcast.json');

const KNOWN_TYPES = ['news', 'weather', 'blotter', 'talk', 'port'];

// ---------- PRNG ----------

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function seed() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFor(date, stationId) {
  return mulberry32(xmur3(`${date}|${stationId}`)());
}

// ---------- lore parsing ----------

function parseGroups(md) {
  const byCity = { paradise: [], porto: [], jacksonville: [], county: [] };
  let city = null;
  for (const line of md.split(/\r?\n/)) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      const t = h2[1].toLowerCase();
      if (t.startsWith('paradise')) city = 'paradise';
      else if (t.startsWith('porto lujara')) city = 'porto';
      else if (t.startsWith('jackedsonville')) city = 'jacksonville';
      else if (t.includes('hunter-adjacent')) city = 'county';
      else city = null;
      continue;
    }
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3 && city) {
      const name = h3[1].split(/\s+—\s+PRI-/)[0].split(/\s+\[/)[0].trim();
      if (name) byCity[city].push(name);
    }
  }
  return byCity;
}

function parseStories(md) {
  const byCity = { paradise: [], porto: [], jacksonville: [] };
  let city = null;
  for (const line of md.split(/\r?\n/)) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      const t = h2[1].toLowerCase();
      if (t.startsWith('paradise')) city = 'paradise';
      else if (t.startsWith('porto lujara')) city = 'porto';
      else if (t.startsWith('jackedsonville')) city = 'jacksonville';
      else city = null;
      continue;
    }
    const h3 = line.match(/^###\s+\d+\.\s+(.+?)\s*$/);
    if (h3 && city) byCity[city].push(h3[1].trim());
  }
  return byCity;
}

// ---------- static pools (proposal texture, not canon) ----------

const SHIPS = [
  'MV Coral Standard', 'MV Agua Clara', 'MV Bermeja', 'MV Salt Chaplain',
  'MV Ninth Honeymoon', 'MV Dona Pilar', 'MV Practical Magic', 'MV Low Curtain',
];
const TENDERS = ['Tender Aurelia', 'Tender Sol y Sombra', 'Tender Biscayne Lady', 'Tender Paloma'];
const GOATS = ['a goat', 'one outboard engine', 'a wedding ring', "a ladder, used once", 'a parrot with opinions'];
const TALK_TOPICS = [
  'the humidity on the east side, and whether it is weather at all',
  'what the gray vans carry, and why they carry it before anyone calls',
  'Object 14: hoax, hobby, or the one true thing',
  'why the cruise ships changed their horn pattern the year the CRT was founded',
  'the yacht-club guest list, and the name that should not still be on it',
  'why the riot trucks changed color, and what the gray ones polled as',
  'the stretch of FM below 89, and what the static does at three in the morning',
  'the condo soil studies that never publish, and the word "leak"',
];
const CORRECTIONS = [
  'an item the show has no record of airing',
  "last Tuesday's caller list, which the show does not keep",
  'a weather report from a date that has not happened yet',
  'the number of berths at Lujara Docks, down by one, retroactively',
];

// ---------- bulletin templates (voice: dry; blotter: funny-dry, sanitized) ----------

function newsTemplates(c) {
  const f = c.pick(c.factions);
  const s = c.seeds.length ? c.pick(c.seeds) : null;
  const out = [
    `County commission posted its summary overnight. Public comment closed before the doors opened, per custom. ${f} sent no representative, or sent one.`,
    `A ${f} spokesperson described the week as "quiet and productive." No agenda was published. No questions were taken. The coffee was reportedly fine.`,
    `Sierra Dorado reminds permit holders that renewal season ends Friday. The reminder was read twice: once for the record, once for the people who heard it the first time.`,
    `The Visibility Board's filming schedule moves to the east side this week. Residents are advised which evenings to be photogenic.`,
  ];
  if (s) out.push(`Listeners asking about the matter known locally as "${s}" are reminded there is no timeline. There is never a timeline.`);
  if (c.city === 'harbor') {
    return [
      `The church-hall calendar: Thursday is the bake table, Saturday is the rummage room, and Father Ipo has borrowed back his ladder. Bring exact change.`,
      `Lost and found at the harbor office: ${c.pick(GOATS)}, claimed twice, returned once. The office would like this to be the last time.`,
      `The ferry to the tri-city ran on time today. This is noted because it is notable.`,
    ];
  }
  return out;
}

function weatherTemplates(c) {
  const t = 84 + Math.floor(c.rng() * 5);
  switch (c.city) {
    case 'paradise':
      return [
        `Beach report: ${t} by noon, flags yellow, water flat enough for the paddleboard packages. The marina gala tents went up anyway, as forecast.`,
        `Afternoon showers possible after three. The hotel strip has already moved the pool furniture twice and will deny both times.`,
        `Humidity holding at eighty-something percent, same as yesterday, same as the brochure doesn't say. Surf flags green until the east side decides otherwise.`,
      ];
    case 'porto':
      return [
        `Harbor weather: ${t} degrees, swell two feet and lazy, cruise horns on schedule at six. Dock coffee at four, as is right and proper.`,
        `Wet-season cell moving over the hills tonight. The float barns are tarped, the condos are not. Draw your own conclusions; the rain will.`,
      ];
    case 'harbor':
      return [
        `Sea conditions: swell ${2 + Math.floor(c.rng() * 3)} feet from the southeast, tide going out at ${6 + Math.floor(c.rng() * 3)}:${c.rng() < 0.5 ? '20' : '50'} this evening. Small craft are advised to stay friends with the harbor.`,
        `Water's warm, wind's honest, and the rain will come when it comes. Small-craft advisory for the east passage after dark, same as every night this month.`,
      ];
    default:
      return [
        `Official weather from the mountain: ${t} degrees on the coasts, cooler in the passes, fog above the second switchback until nine. This was measured, not heard about.`,
        `The federal station reports ${t} degrees and holding. East-side listeners are reminded that official instruments read what they read.`,
      ];
  }
}

function blotterTemplates(c) {
  const times = ['00:40', '01:15', '02:05', '02:50', '03:30', '04:10'];
  const bt = c.pick(times);
  const f = c.pick(c.factions);
  return [
    `${bt}, the Row: officers assisted a gentleman in a rented tuxedo in locating his own hotel. He was three hotels early.`,
    `${bt}, the Quay: a disagreement over a bar tab was settled by arithmetic. One party was transported for a second opinion.`,
    `${bt}, the alleys: a noise complaint was resolved when the noise agreed to become a private event. No permit was produced. None was requested.`,
    `${bt}, Main Street market: a grill stall reported a theft of mangoes. The suspect was described as "everybody, over a period of years."`,
    `${bt}, stadium edge: a sports-club fundraiser and a sports-club rivalry were found sharing the same parking lot. Officers separated the accounting.`,
    `${bt}, the Book Nook block: a customer was escorted out for annotating the merchandise. The notes were legible. This was the upsetting part.`,
    `${bt}, marina parking: a vehicle was cited for impersonating a vehicle that had already left. The original vehicle did not return for comment.`,
    `${bt}, Ledger Row: a man was detained matching the description of someone ${f} had already described as "handled." He was released into the ambiguity.`,
  ];
}

function talkTemplates(c) {
  const s = c.seeds.length ? c.pick(c.seeds) : 'the early van';
  return [
    `Topic of the night, announced at ten: ${c.pick(TALK_TOPICS)}. Calls open now. Marlow will say "could be" approximately forty times. Count along.`,
    `Still on the line tonight: ${c.pick(TALK_TOPICS)}. A caller with a professional voice has read a correction to ${c.pick(CORRECTIONS)}. The delay was seven seconds.`,
    `Hour three of the overnight: the phones want to talk about "${s}" again. The host reminds you the show has no opinions, only callers, and the callers have opinions.`,
    `Sign-off note for the tape: tonight's callers established nothing, twice, conclusively. Tomorrow's topic is the same topic. It is always the same topic. Good night from the Hum.`,
  ];
}

function portTemplates(c) {
  const berth = 2 + Math.floor(c.rng() * 14);
  const hour = String(3 + Math.floor(c.rng() * 18)).padStart(2, '0');
  const minute = c.pick(['05', '20', '35', '50']);
  return [
    `Arrivals: ${c.pick(SHIPS)} to berth ${berth} at ${hour}:${minute}, cargo listed as "miscellaneous dry goods" for the third consecutive visit. Longshoremen are asked to report unusual dampness.`,
    `${c.pick(TENDERS)} holds at anchorage until the pilot boat resets the sweep buoy. Outbound passengers are advised the delay is weather, in the broad sense of weather.`,
    `Berth ${berth} remains closed for cleaning. The last three closures at that berth were also for cleaning. The cleaning contract is not public.`,
    `Manifest reconciliation at Lujara Docks came up one pallet short of the invoice and one explanation long. The union hall has posted the overtime sheet anyway.`,
    `The Carnaval committee's storage ledger lists one more float than the parade route held. The committee has been notified. The committee was already counting.`,
  ];
}

const TEMPLATES = { news: newsTemplates, weather: weatherTemplates, blotter: blotterTemplates, talk: talkTemplates, port: portTemplates };

// ---------- generation ----------

const CITY_BY_REGION = { r01: 'paradise', r02: 'porto', r03: 'jacksonville', r08: 'county', r09: 'harbor' };

const TIME_SLOTS = {
  news: ['06:05', '08:30', '12:00', '17:15', '21:05'],
  weather: ['05:50', '06:40', '07:20', '12:10', '16:45'],
  port: ['04:50', '06:20', '11:40', '18:05'],
  blotter: ['00:35', '01:20', '02:45', '03:10', '04:05'],
  talk: ['22:00', '23:05', '01:10', '02:30', '03:45'],
};

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffled(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cityKeyFor(station) {
  return CITY_BY_REGION[station.region_ref] || 'county';
}

// ---------- isla-sim radio bridge (optional; design doc §7) ----------

const SIM_KIND_TYPE = { incident: ['blotter', 'news'], market: ['port', 'news'], heat: ['news'], quiet: ['news'] };

function simMatchesStation(item, station) {
  if (station.region_ref === null || station.region_ref === 'r08') return true; // island-wide / federal wire
  return station.city === item.city;
}

function simTypeFor(item, station) {
  const prefs = SIM_KIND_TYPE[item.kind] || ['news'];
  return prefs.find((t) => station.bulletins.includes(t)) || null;
}

function simBulletinsFor(station, simItems) {
  return simItems
    .filter((it) => it && it.id && it.headline && it.body && simMatchesStation(it, station))
    .map((it) => ({ item: it, type: simTypeFor(it, station) }))
    .filter((x) => x.type)
    .sort((a, b) => (a.item.priority || 9) - (b.item.priority || 9));
}

function generateForStation(station, date, lore, simItems = []) {
  const rng = rngFor(date, station.id);
  const city = cityKeyFor(station);
  const factions = [...(lore.factions[city] || []), ...lore.factions.county];
  const seeds = lore.seeds[city] || [];
  const count = 2 + Math.floor(rng() * 3); // 2-4 per world-day
  const simPicks = simBulletinsFor(station, simItems).slice(0, count);
  const types = simPicks.map((x) => x.type);
  const cycle = shuffled(rng, station.bulletins);
  while (types.length < count) types.push(...cycle);
  types.length = count;

  const slotsByType = {};
  for (const t of new Set(types)) slotsByType[t] = shuffled(rng, TIME_SLOTS[t]);
  const slotCursor = {};
  const nextSlot = (t) => {
    const slots = slotsByType[t];
    const idx = slotCursor[t] || 0;
    slotCursor[t] = idx + 1;
    return slots[idx % slots.length];
  };

  const ctx = { rng, pick: (a) => pick(rng, a), factions, seeds, city };
  const out = types.map((type, i) => {
    const time = nextSlot(type);
    if (i < simPicks.length) {
      const it = simPicks[i].item;
      return { id: it.id, type, time, text: `${it.headline} — ${it.body}`, source: 'isla-sim' };
    }
    const templates = TEMPLATES[type](ctx);
    return { id: `${station.id}-${date}-${i + 1}`, type, time, text: pick(rng, templates) };
  });
  out.sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  return out;
}

function generateAll(stations, date, lore, simItems = []) {
  const result = {};
  for (const s of stations) result[s.id] = generateForStation(s, date, lore, simItems);
  return result;
}

// ---------- validation ----------

function loadInputs() {
  const stationsDoc = JSON.parse(fs.readFileSync(STATIONS_PATH, 'utf8'));
  const storiesMd = fs.readFileSync(STORIES_PATH, 'utf8');
  const groupsMd = fs.readFileSync(GROUPS_PATH, 'utf8');
  return {
    stations: stationsDoc.stations,
    lore: { factions: parseGroups(groupsMd), seeds: parseStories(storiesMd) },
  };
}

function validateStations(stations, errs) {
  if (!Array.isArray(stations) || stations.length < 5 || stations.length > 7) {
    errs.push(`expected 5-7 stations, got ${stations?.length}`);
    return;
  }
  const ids = new Set();
  for (const s of stations) {
    for (const k of ['id', 'callsign', 'frequency', 'name', 'city', 'theme', 'host', 'stream_status']) {
      if (!s[k]) errs.push(`station missing field ${k}: ${JSON.stringify(s.id)}`);
    }
    if (ids.has(s.id)) errs.push(`duplicate station id ${s.id}`);
    ids.add(s.id);
    if (!['verified', 'unverified', 'none'].includes(s.stream_status)) {
      errs.push(`${s.id}: bad stream_status ${s.stream_status}`);
    }
    if (s.stream_status === 'verified' && !/^https?:\/\//.test(s.stream_url || '')) {
      errs.push(`${s.id}: verified but stream_url missing/invalid`);
    }
    if (s.stream_status === 'none' && s.stream_url !== null) {
      errs.push(`${s.id}: stream_status none must have null stream_url`);
    }
    if (!Array.isArray(s.bulletins) || !s.bulletins.length) {
      errs.push(`${s.id}: bulletins[] must be a non-empty array of types`);
    } else {
      for (const t of s.bulletins) {
        if (!KNOWN_TYPES.includes(t)) errs.push(`${s.id}: unknown bulletin type ${t}`);
      }
    }
  }
}

function validateBulletins(stations, byStation, errs) {
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const s of stations) {
    const list = byStation[s.id];
    if (!Array.isArray(list)) {
      errs.push(`${s.id}: no bulletin list generated`);
      continue;
    }
    if (list.length < 2 || list.length > 4) errs.push(`${s.id}: ${list.length} bulletins, expected 2-4`);
    const ids = new Set();
    for (const b of list) {
      if (!s.bulletins.includes(b.type)) errs.push(`${s.id}: bulletin type ${b.type} not in station flavor`);
      if (!TIME_RE.test(b.time)) errs.push(`${s.id}: bad time ${b.time}`);
      if (typeof b.text !== 'string' || b.text.length < 40 || b.text.length > 400) {
        errs.push(`${s.id}: bulletin text length out of bounds (${b.text?.length})`);
      }
      if (ids.has(b.id)) errs.push(`${s.id}: duplicate bulletin id ${b.id}`);
      ids.add(b.id);
    }
  }
}

// ---------- CLI ----------

function parseArgs(argv) {
  const args = { date: null, out: DEFAULT_OUT, sim: null, selfCheck: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--self-check') args.selfCheck = true;
    else if (argv[i] === '--date') args.date = argv[++i];
    else if (argv[i] === '--out') args.out = path.resolve(argv[++i]);
    else if (argv[i] === '--sim') args.sim = path.resolve(argv[++i]);
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('usage: radio-bulletins.js [--date YYYY-MM-DD] [--out PATH] [--sim PATH] | --self-check');
      process.exit(0);
    } else {
      console.error(`unknown arg: ${argv[i]}`);
      process.exit(2);
    }
  }
  if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    console.error(`--date must be YYYY-MM-DD, got ${args.date}`);
    process.exit(2);
  }
  if (!args.date) {
    const now = new Date();
    args.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  return args;
}

function selfCheck() {
  const errs = [];
  const { stations, lore } = loadInputs();
  validateStations(stations, errs);

  const factionCount = Object.values(lore.factions).flat().length;
  const seedCount = Object.values(lore.seeds).flat().length;
  if (factionCount < 10) errs.push(`GROUPS.md parse too thin: ${factionCount} factions`);
  if (seedCount < 9) errs.push(`STORIES.md parse too thin: ${seedCount} seeds`);

  const fixed = '2026-01-15';
  const runA = generateAll(stations, fixed, lore);
  const runB = generateAll(stations, fixed, lore);
  if (JSON.stringify(runA) !== JSON.stringify(runB)) errs.push('determinism: same date produced different bulletins');
  validateBulletins(stations, runA, errs);

  const dayA = generateAll(stations, '2026-01-15', lore);
  const dayB = generateAll(stations, '2026-01-16', lore);
  if (JSON.stringify(dayA) === JSON.stringify(dayB)) errs.push('different dates produced identical bulletins (seed not mixing)');

  // sim-bridge: synthetic items, no disk touched
  const sampleSim = [
    { id: 'sim-d14-i41', kind: 'incident', priority: 1, city: 'Jackedsonville', headline: 'Second shooting this week on the Row', body: 'County CRT confirms a drive-by in the Row early today. One casualty reported. Investigation active.' },
    { id: 'sim-d14-m1', kind: 'market', priority: 2, city: 'Porto Lujara', headline: 'Rum up 18% on the week', body: 'Dockside suppliers blame manifest delays. Night Ledger forecasts higher bar tabs through the weekend.' },
  ];
  const simA = generateAll(stations, fixed, lore, sampleSim);
  const simB = generateAll(stations, fixed, lore, sampleSim);
  if (JSON.stringify(simA) !== JSON.stringify(simB)) errs.push('sim-bridge determinism failed');
  validateBulletins(stations, simA, errs);
  const kqaySim = simA.kqay.find((b) => b.id === 'sim-d14-i41');
  if (!kqaySim || kqaySim.type !== 'blotter' || kqaySim.source !== 'isla-sim') {
    errs.push('sim incident did not land on kqay as an isla-sim blotter item');
  }
  if (!simA.kljr.some((b) => b.id === 'sim-d14-m1')) errs.push('sim market item did not land on kljr');
  if (simA.kprd.some((b) => b.id === 'sim-d14-i41')) errs.push('sim Jackedsonville item leaked onto Paradise station');
  if (simA.khum.some((b) => b.source === 'isla-sim')) errs.push('sim item landed on talk-only station');
  if (!simA.ksda.some((b) => b.source === 'isla-sim')) errs.push('sim wire items missing from federal news station');

  if (errs.length) {
    for (const e of errs) console.error(`FAIL: ${e}`);
    console.error(`\nself-check: ${errs.length} failure(s)`);
    process.exit(1);
  }
  console.log(`OK: stations schema (${stations.length} stations, ${stations.filter((s) => s.stream_status === 'verified').length} verified streams)`);
  console.log(`OK: lore parse (${factionCount} factions, ${seedCount} seed titles)`);
  console.log(`OK: determinism (fixed date ${fixed} stable across runs, varies by date)`);
  const counts = Object.fromEntries(Object.entries(runA).map(([k, v]) => [k, v.length]));
  console.log(`OK: bulletin counts 2-4 per station ${JSON.stringify(counts)}`);
  console.log('OK: sim-bridge (synthetic incident/market items routed, deterministic, counts hold)');
  console.log('self-check passed.');
}

const args = parseArgs(process.argv.slice(2));
if (args.selfCheck) {
  selfCheck();
} else {
  const { stations, lore } = loadInputs();
  const errs = [];
  validateStations(stations, errs);
  if (errs.length) {
    for (const e of errs) console.error(`FAIL: ${e}`);
    process.exit(1);
  }
  const simPath = args.sim ?? (fs.existsSync(SIM_DEFAULT) ? SIM_DEFAULT : null);
  let simItems = [];
  let simWorldDay = null;
  if (simPath) {
    const simDoc = JSON.parse(fs.readFileSync(simPath, 'utf8'));
    simItems = (Array.isArray(simDoc.items) ? simDoc.items : []).filter((it) => it && it.id && it.headline && it.body);
    simWorldDay = simDoc.world_day ?? null;
  }
  const byStation = generateAll(stations, args.date, lore, simItems);
  const doc = {
    date: args.date,
    seed_scheme: 'xmur3(date|station.id) -> mulberry32',
    station_count: stations.length,
    ...(simWorldDay !== null ? { sim_world_day: simWorldDay } : {}),
    stations: byStation,
  };
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  const total = Object.values(byStation).reduce((n, l) => n + l.length, 0);
  const simNote = simPath ? `, sim items from ${simPath}` : ' (no sim-broadcast.json found — template-only)';
  console.log(`wrote ${args.out}: ${stations.length} stations, ${total} bulletins for ${args.date}${simNote}`);
}
