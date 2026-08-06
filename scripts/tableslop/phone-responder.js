/**
 * phone-responder.js — Isla Primavera diegetic phone engine (phase 1: scripted).
 *
 * ESM module, zero deps. Runs in Node (CLI, self-check) and in the browser as
 * a module script. Contact scripts live in
 * ../linuxbox/tableslop-static/phone/contacts.js and register themselves on
 * globalThis.PHONE_CONTACTS; the engine reads them lazily.
 *
 * Stable contract (the UI and any future LLM backend both sit behind it):
 *
 *   dial(contactId, opts) -> { status: "pickup" | "voicemail", text, dateStr }
 *   respond(contactId, history[], opts) -> { text, action, topic?, mood }
 *     history[] = [{ role: "caller" | "contact", text, topic? }] including the
 *     caller's current message as the last entry. action is one of
 *     "continue" | "goodbye" | "hangup" | "voicemail".
 *
 *   spamForDay(dateStr, { heat }) -> deterministic inbound spam events
 *   spamRespond(spam, history[]) -> { text, action: "continue" | "dead" }
 *   lookupNumber(numberString) -> { type: "contact" | "intercept" | "dead", ... }
 *
 * LLM slot-in: a future backend replaces respond() per contact with a model
 * call (message in -> reply out, contact sheet as context) behind this same
 * signature. See campaigns/tropic-gooner/worldbuilding/PHONE.md.
 */

const CONTACTS_URL = "../linuxbox/tableslop-static/phone/contacts.js";

let cachedContacts = null;

export async function loadContacts() {
  if (globalThis.PHONE_CONTACTS) {
    cachedContacts = globalThis.PHONE_CONTACTS;
    return cachedContacts;
  }
  if (typeof process !== "undefined" && process.versions && process.versions.node) {
    await import(new URL(CONTACTS_URL, import.meta.url).href);
    if (globalThis.PHONE_CONTACTS) {
      cachedContacts = globalThis.PHONE_CONTACTS;
      return cachedContacts;
    }
  }
  throw new Error("PHONE_CONTACTS not loaded — import contacts.js first");
}

export function getContacts() {
  if (cachedContacts) return cachedContacts;
  if (globalThis.PHONE_CONTACTS) return globalThis.PHONE_CONTACTS;
  throw new Error("PHONE_CONTACTS not loaded — import contacts.js first");
}

export function getContact(idOrContact) {
  if (idOrContact && typeof idOrContact === "object") return idOrContact;
  const list = getContacts();
  for (const c of list) if (c.id === idOrContact) return c;
  throw new Error("unknown contact: " + idOrContact);
}

// --- deterministic hashing / picking -----------------------------------------

function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashFloat(str) {
  return hash(str) / 4294967296;
}

function pickSeeded(arr, seedStr) {
  return arr[hash(seedStr) % arr.length];
}

function dateString(d) {
  const dt = d ? new Date(d) : new Date();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return dt.getFullYear() + "-" + m + "-" + day;
}

// --- availability --------------------------------------------------------------

// availability: { p: 0..1 } for all-day odds, or
// { day, night, nightStart, nightEnd } for night-modulated schedules.
// Seeded per (contact id, calendar day): the island gives the same answer all day.
export function checkAvailability(contact, opts = {}) {
  const dateStr = opts.date || dateString();
  const hour = opts.hour != null ? opts.hour : new Date().getHours();
  const a = contact.availability || { p: 0.75 };
  let p = a.p != null ? a.p : 0.75;
  if (a.day != null) {
    const night = a.nightStart <= a.nightEnd
      ? hour >= a.nightStart && hour < a.nightEnd
      : hour >= a.nightStart || hour < a.nightEnd;
    p = night ? a.night : a.day;
  }
  return { available: hashFloat(contact.id + "|" + dateStr) < p, p, dateStr };
}

export function dial(idOrContact, opts = {}) {
  const contact = getContact(idOrContact);
  const avail = checkAvailability(contact, opts);
  if (opts.force === "voicemail" || (!avail.available && opts.force !== "pickup")) {
    return { status: "voicemail", text: contact.voicemail, dateStr: avail.dateStr };
  }
  return {
    status: "pickup",
    text: pickSeeded(contact.greeting, contact.id + "|greet|" + avail.dateStr),
    dateStr: avail.dateStr
  };
}

// --- mood ---------------------------------------------------------------------

const RUDE = ["shut up", "idiot", "stupid", "dumbass", "screw you", "fuck you",
  "bitch", "asshole", "bastard", "piss off", "loser", "moron"];
const CREEPY = ["what are you wearing", "you sound hot", "you sound sexy", "sexy voice",
  "are you alone", "send a pic", "send pics", "send nudes", "come over", "come to my"];
const BYE = ["bye", "gotta go", "got to go", "talk later", "good night", "goodnight",
  "see you", "take care", "peace out", "that's all"];

function rudeness(text) {
  const t = " " + String(text).toLowerCase() + " ";
  let score = 0;
  for (const kw of CREEPY) if (t.indexOf(kw) >= 0) { score += 2; break; }
  for (const kw of RUDE) if (t.indexOf(kw) >= 0) { score += 1; break; }
  return score;
}

function isBye(text) {
  const t = String(text).toLowerCase();
  for (const kw of BYE) if (t.indexOf(kw) >= 0) return true;
  return false;
}

function moodAt(contact, history) {
  let mood = contact.patience != null ? contact.patience : 2;
  for (const m of history) if (m.role === "caller") mood -= rudeness(m.text);
  return mood;
}

// --- topic matching -------------------------------------------------------------

function matchTopic(contact, text) {
  const t = String(text).toLowerCase();
  const topics = contact.topics.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));
  for (const topic of topics) {
    for (const kw of topic.keywords) {
      if (t.indexOf(kw.toLowerCase()) >= 0) return topic;
    }
  }
  return null;
}

function topicUsage(history, topicId) {
  let n = 0;
  for (const m of history) if (m.role === "contact" && m.topic === topicId) n++;
  return n;
}

// --- respond ---------------------------------------------------------------------

export function respond(idOrContact, history, opts = {}) {
  const contact = getContact(idOrContact);
  history = history || [];
  const last = history[history.length - 1];
  if (!last || last.role !== "caller") {
    throw new Error("history must end with the caller's current message");
  }
  const dateStr = opts.date || dateString();
  let exchanges = 0;
  for (const m of history) if (m.role === "caller") exchanges++;
  const mood = moodAt(contact, history);
  const seed = contact.id + "|" + dateStr + "|" + exchanges;

  if (mood <= 0) {
    return { text: pickSeeded(contact.hangup, seed + "|hangup"), action: "hangup", mood };
  }
  if (isBye(last.text)) {
    return { text: pickSeeded(contact.goodbye, seed + "|bye"), action: "goodbye", mood };
  }
  if (exchanges >= (contact.maxExchanges || 6)) {
    return { text: pickSeeded(contact.winddown, seed + "|wind"), action: "goodbye", topic: "winddown", mood };
  }
  if (rudeness(last.text) > 0 && mood === 1) {
    return { text: pickSeeded(contact.warning, seed + "|warn"), action: "continue", topic: "warning", mood };
  }

  const topic = matchTopic(contact, last.text);
  if (topic) {
    const used = topicUsage(history, topic.id);
    if (used < topic.replies.length) {
      return { text: topic.replies[used], action: "continue", topic: topic.id, mood };
    }
    if (topic.exhaust) {
      return { text: pickSeeded([].concat(topic.exhaust), seed + "|ex"), action: "continue", topic: topic.id, mood };
    }
  }
  return { text: pickSeeded(contact.fallback, seed + "|fb"), action: "continue", topic: "fallback", mood };
}

// --- dial-by-number ----------------------------------------------------------------

// In-world numbers are [proposal]. Island telco: Primavera Bell [proposal].
// Flavor intercepts for numbers nobody gives out.
const INTERCEPTS = {
  "555-0170": "Stevens dispatch. If you are calling about an incident, a team is already en route. If you are calling about anything else, there has been no incident.",
  "555-0199": "The party you are trying to reach does not accept calls from this line. Floor fourteen handles its own arrangements.",
  "555-0110": "Paradisio CRT non-emergency line. All calls are logged. State your block and your business."
};
const NOT_IN_SERVICE = "The number you have dialed is not in service. Check the number and try again. This is a recording. Primavera Bell.";

function normalizeNumber(num) {
  const digits = String(num || "").replace(/\D/g, "");
  if (digits.length === 7) return digits.slice(0, 3) + "-" + digits.slice(3);
  return String(num || "").trim();
}

export function lookupNumber(num) {
  const n = normalizeNumber(num);
  for (const c of getContacts()) {
    if (c.number === n) return { type: "contact", contact: c };
  }
  if (INTERCEPTS[n]) return { type: "intercept", number: n, text: INTERCEPTS[n] };
  return { type: "dead", number: n, text: NOT_IN_SERVICE };
}

// --- spam (ambient inbound) -----------------------------------------------------------

// Scripted, seeded, deterministic. Frequency scales with sim heat when the host
// provides it (window.TABLESLOP_SIM_HEAT in the UI, --heat on the CLI); default 0.3.
const SPAM_POOL = [
  {
    id: "touro-warranty",
    kind: "robocall",
    from: "UNKNOWN",
    text: "ALERT: The warranty on your Touro-Card is about to expire. Reply YES to speak with a licensed renewal specialist.",
    replies: [
      "Thank you! Your renewal is being processed. A fee of $49.95 will be billed to your— hello? Hello?",
      "This number is no longer in service."
    ]
  },
  {
    id: "meridian-weekend",
    kind: "robocall",
    from: "PARADISE MERIDIAN",
    text: "Congratulations! You have been selected for a FREE weekend at the Paradise Meridian Resort & Spa. Reply YES to claim your stay.",
    replies: [
      "Wonderful! A hospitality specialist will call between 6:00 and 6:15 a.m. to confirm. Do not leave the island.",
      "Your FREE weekend is being held. Bring a credit card and a positive attitude. Attendance is mandatory."
    ]
  },
  {
    id: "gold-status",
    kind: "robocall",
    from: "RED FORTUNE",
    text: "Your loyalty status has been upgraded to GOLD. Reply COMP to activate 400 free slot pulls at the Red Fortune.",
    replies: [
      "Invalid response. Your GOLD status has been downgraded to BRONZE. Reply COMP to re-upgrade.",
      "Your BRONZE status entitles you to this message. Thank you for playing."
    ]
  },
  {
    id: "coral-trace",
    kind: "robocall",
    from: "BLOCKED",
    text: "Coral Trace LLP records management: our files indicate you may have witnessed an event. No action is required. Do not reply to this message.",
    replies: [
      "Your reply has been logged and appended to the file. Thank you."
    ]
  },
  {
    id: "county-survey",
    kind: "robocall",
    from: "PARADISIO COUNTY",
    text: "Paradisio County values your opinion! Rate your most recent sweep experience from 1 (seamless) to 5 (exemplary).",
    replies: [
      "Thank you. Your response has been forwarded to the Visibility Board and your precinct."
    ]
  },
  {
    id: "tita-mangoes",
    kind: "wrong-number",
    from: "555-0133",
    text: "tita did you get the mangoes. the good ones, not from dick's",
    replies: [
      "oh no. wrong tita. sorry. if you see her tell her the mangoes"
    ]
  },
  {
    id: "barn-shift",
    kind: "wrong-number",
    from: "555-0158",
    text: "you still owe me for the carnaval barn shift. i covered for you when the committee came by",
    replies: [
      "wait who is this. manny? if this isnt manny forget this text happened"
    ]
  },
  {
    id: "crates-short",
    kind: "wrong-number",
    from: "555-0171",
    text: "Meng, the crates are short again. Call me before the horn.",
    replies: [
      "wrong number? great. if you know a harbormaster named meng tell him rico says the count is off. again."
    ]
  },
  {
    id: "table-six",
    kind: "wrong-number",
    from: "555-0162",
    text: "nes?? table 6 tomorrow?? they put the buffet up to 12.50 i'm not paying that",
    replies: [
      "sorry. thought you were someone who eats lunch."
    ]
  }
];

export function spamForDay(dateStr, opts = {}) {
  const day = dateStr || dateString();
  const heat = opts.heat != null ? opts.heat : 0.3;
  const count = Math.min(SPAM_POOL.length, 2 + Math.round(heat * 3));
  const seedStr = "spam|" + day;
  const order = SPAM_POOL.map((s, i) => ({ s, k: hashFloat(seedStr + "|" + i) }))
    .sort((a, b) => a.k - b.k)
    .map(x => x.s);
  const picked = order.slice(0, count);
  const times = picked.map((s, i) => {
    // low bits vary better than the float head on tiny suffixes; spread 08:00-20:00
    const start = 8 * 60 + (hash(seedStr + "|t|" + s.id) % (12 * 60));
    return String(Math.floor(start / 60)).padStart(2, "0") + ":" + String(start % 60).padStart(2, "0");
  }).sort();
  return picked.map((s, i) => ({
    id: s.id + "@" + day,
    spamId: s.id,
    kind: s.kind,
    from: s.from,
    time: times[i],
    date: day,
    text: s.text,
    replies: s.replies
  }));
}

export function spamRespond(spam, history) {
  history = history || [];
  let playerMsgs = 0;
  for (const m of history) if (m.role === "caller") playerMsgs++;
  const idx = playerMsgs - 1; // history includes the current message
  if (idx < spam.replies.length) {
    const last = idx === spam.replies.length - 1;
    return { text: spam.replies[idx], action: last ? "dead" : "continue" };
  }
  return { text: null, action: "dead" };
}

// --- conversation state (local JSON, Node only) ---------------------------------------
// Product-side persistence in the UI is localStorage; this is the CLI/dev-side
// equivalent: a single JSON file of { [contactId]: { status, date, history } }.

export async function loadState(path) {
  const fs = await import("node:fs");
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

export async function saveState(path, state) {
  const fs = await import("node:fs");
  const pathMod = await import("node:path");
  fs.mkdirSync(pathMod.dirname(path), { recursive: true });
  fs.writeFileSync(path, JSON.stringify(state, null, 2) + "\n", "utf8");
}

// --- self-check -----------------------------------------------------------------------

function fail(errors, msg) { errors.push(msg); }

function checkContact(errors, report, contact) {
  const id = contact.id;
  if (!id) return fail(errors, "contact missing id");
  if (!contact.name || !contact.role || !contact.city) fail(errors, id + ": missing name/role/city");
  if (!contact.number) fail(errors, id + ": missing in-world number");
  if (!Array.isArray(contact.greeting) || !contact.greeting.length) fail(errors, id + ": greeting empty");
  if (!contact.voicemail) fail(errors, id + ": voicemail missing");
  if (!Array.isArray(contact.fallback) || !contact.fallback.length) fail(errors, id + ": fallback empty");
  if (!Array.isArray(contact.goodbye) || !contact.goodbye.length) fail(errors, id + ": goodbye empty");
  if (!Array.isArray(contact.hangup) || !contact.hangup.length) fail(errors, id + ": hangup empty");
  if (!Array.isArray(contact.warning) || !contact.warning.length) fail(errors, id + ": warning empty");
  if (!Array.isArray(contact.winddown) || !contact.winddown.length) fail(errors, id + ": winddown empty");
  if (!Array.isArray(contact.topics) || contact.topics.length < 6 || contact.topics.length > 10) {
    fail(errors, id + ": needs 6-10 topic nodes, has " + (contact.topics || []).length);
  }

  // keywords unique per node (within and across nodes of this contact)
  const seen = {};
  (contact.topics || []).forEach(topic => {
    if (!topic.id) fail(errors, id + ": topic missing id");
    if (!Array.isArray(topic.replies) || !topic.replies.length) fail(errors, id + "/" + topic.id + ": replies empty");
    const local = {};
    (topic.keywords || []).forEach(kw => {
      const k = kw.toLowerCase();
      if (local[k]) fail(errors, id + "/" + topic.id + ": duplicate keyword within node: " + kw);
      if (seen[k]) fail(errors, id + ": keyword shared by " + seen[k] + " and " + topic.id + ": " + kw);
      local[k] = true;
      seen[k] = topic.id;
    });
  });

  // reachable: dial resolves and picks up at least one day in a 30-day scan
  let picked = false;
  for (let d = 0; d < 30 && !picked; d++) {
    const day = new Date(Date.UTC(2026, 7, 5 + d));
    if (dial(contact, { date: dateString(day), hour: 21 }).status === "pickup") picked = true;
  }
  if (!picked) fail(errors, id + ": never picks up across a 30-day scan");

  // determinism: same dial twice -> same result
  const a = dial(contact, { date: "2026-08-05", hour: 21 });
  const b = dial(contact, { date: "2026-08-05", hour: 21 });
  if (a.status !== b.status || a.text !== b.text) fail(errors, id + ": dial not deterministic");

  // topics: each reachable by its first keyword from a fresh single-turn call
  (contact.topics || []).forEach(topic => {
    const r = respond(contact, [{ role: "caller", text: topic.keywords[0] }], { date: "2026-08-05" });
    if (r.topic !== topic.id) {
      fail(errors, id + "/" + topic.id + ": keyword '" + topic.keywords[0] + "' matched " + r.topic + " instead");
    }
    if (!r.text) fail(errors, id + "/" + topic.id + ": empty reply text");
  });

  // termination: gibberish spam ends in goodbye/hangup within 12 caller turns
  const hist = [];
  let terminal = null;
  for (let t = 0; t < 12 && !terminal; t++) {
    hist.push({ role: "caller", text: "zqx wvprn kjl fgh " + t });
    const r = respond(contact, hist, { date: "2026-08-05" });
    if (!r.text) fail(errors, id + ": empty reply text");
    hist.push({ role: "contact", text: r.text, topic: r.topic });
    if (r.action === "goodbye" || r.action === "hangup") terminal = r.action;
  }
  if (!terminal) fail(errors, id + ": gibberish call never terminates within 12 exchanges");
  report.push(id + ": gibberish run terminates via " + terminal);

  // termination after a mixed topic walk
  const hist2 = [];
  (contact.topics || []).forEach(topic => {
    hist2.push({ role: "caller", text: topic.keywords[0] });
    const r2 = respond(contact, hist2, { date: "2026-08-05" });
    hist2.push({ role: "contact", text: r2.text, topic: r2.topic });
  });
  let closed = false;
  for (let g = 0; g < 12 && !closed; g++) {
    hist2.push({ role: "caller", text: "zqx wvprn " + g });
    const r3 = respond(contact, hist2, { date: "2026-08-05" });
    hist2.push({ role: "contact", text: r3.text, topic: r3.topic });
    if (r3.action === "goodbye" || r3.action === "hangup") closed = r3.action;
  }
  if (!closed) fail(errors, id + ": topic-walk call never terminates");

  // mood: repeated rudeness ends in hangup within patience turns (+1 slack)
  const hist3 = [];
  let hungAt = -1;
  for (let u = 0; u < 8 && hungAt < 0; u++) {
    hist3.push({ role: "caller", text: "shut up, you stupid idiot" });
    const r4 = respond(contact, hist3, { date: "2026-08-05" });
    if (r4.action === "hangup") hungAt = u + 1;
    hist3.push({ role: "contact", text: r4.text, topic: r4.topic });
  }
  if (hungAt < 0) fail(errors, id + ": rude caller never gets hung up on");
  if (hungAt > contact.patience + 1) fail(errors, id + ": hangup at turn " + hungAt + " exceeds patience " + contact.patience);
}

export function selfCheck() {
  const list = getContacts();
  const errors = [];
  const report = [];
  if (!Array.isArray(list) || list.length < 4) fail(errors, "need 4+ contacts, have " + (list || []).length);
  const ids = {};
  const numbers = {};
  (list || []).forEach(c => {
    if (ids[c.id]) fail(errors, "duplicate contact id: " + c.id);
    ids[c.id] = true;
    if (c.number) {
      if (numbers[c.number]) fail(errors, "number " + c.number + " shared by " + numbers[c.number] + " and " + c.id);
      numbers[c.number] = c.id;
    }
  });
  (list || []).forEach(c => checkContact(errors, report, c));

  // voicemail contract: forced p=0 always goes to voicemail, p=1 always picks up
  const dead = { id: "test-dead", availability: { p: 0 }, greeting: ["x"], voicemail: "vm",
    fallback: ["f"], goodbye: ["g"], hangup: ["h"], warning: ["w"], winddown: ["wd"],
    patience: 1, maxExchanges: 3, topics: [] };
  if (dial(dead, { date: "2026-08-05" }).status !== "voicemail") fail(errors, "p=0 contact did not go to voicemail");
  const live = Object.assign({}, dead, { id: "test-live", availability: { p: 1 } });
  if (dial(live, { date: "2026-08-05" }).status !== "pickup") fail(errors, "p=1 contact did not pick up");

  // number lookup: contacts resolve, flavor intercepts intercept, unknowns go dead
  (list || []).forEach(c => {
    const r = lookupNumber(c.number);
    if (r.type !== "contact" || r.contact.id !== c.id) fail(errors, c.id + ": number " + c.number + " does not resolve");
  });
  if (lookupNumber("5550170").type !== "intercept") fail(errors, "555-0170 intercept missing");
  if (lookupNumber("555-0999").type !== "dead") fail(errors, "unknown number did not return not-in-service");

  // spam: deterministic per day, count scales with heat, replies terminate dead
  const s1 = spamForDay("2026-08-05", { heat: 0.3 }).map(x => x.id).join(",");
  const s2 = spamForDay("2026-08-05", { heat: 0.3 }).map(x => x.id).join(",");
  if (s1 !== s2) fail(errors, "spamForDay not deterministic");
  const cold = spamForDay("2026-08-05", { heat: 0 }).length;
  const hot = spamForDay("2026-08-05", { heat: 1 }).length;
  if (cold < 2 || hot > 5 || hot <= cold) fail(errors, "spam heat scaling wrong: cold=" + cold + " hot=" + hot);
  const spamTimes = new Set(spamForDay("2026-08-05", { heat: 1 }).map(x => x.time));
  if (spamTimes.size < 2) fail(errors, "spam times collapsed to a single minute (hash correlation)");
  const anySpam = spamForDay("2026-08-05", { heat: 0.3 })[0];
  let spamHist = [];
  let spamEnded = false;
  for (let i = 0; i < 5 && !spamEnded; i++) {
    spamHist.push({ role: "caller", text: "hello " + i });
    const sr = spamRespond(anySpam, spamHist);
    spamHist.push({ role: "contact", text: sr.text || "" });
    if (sr.action === "dead") spamEnded = true;
  }
  if (!spamEnded) fail(errors, "spam thread never goes dead");
  report.push("spam: " + s1.split(",").length + " events/day at heat 0.3, deterministic, terminates dead");

  return { ok: errors.length === 0, errors, report, contacts: list.length };
}

// --- CLI -------------------------------------------------------------------------------
// node phone-responder.js --self-check
// node phone-responder.js --list
// node phone-responder.js --contact r02-harbormaster [--say "..."] [--date D] [--hour H]
//   [--force pickup|voicemail] [--state path/to/phone-state.json]
// node phone-responder.js --spam [--date D] [--heat 0.0-1.0]
// node phone-responder.js --number 555-0104

async function main() {
  const args = process.argv.slice(2);
  const argVal = flag => {
    const i = args.indexOf(flag);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  };
  await loadContacts();

  if (args.indexOf("--self-check") >= 0) {
    const res = selfCheck();
    res.report.forEach(line => console.log("ok   " + line));
    res.errors.forEach(line => console.error("FAIL " + line));
    console.log(res.ok
      ? "SELF-CHECK PASS — " + res.contacts + " contacts, all checks green"
      : "SELF-CHECK FAIL — " + res.errors.length + " problem(s)");
    process.exit(res.ok ? 0 : 1);
  }

  if (args.indexOf("--list") >= 0) {
    getContacts().forEach(c => {
      console.log(c.id.padEnd(20) + " " + c.number + "  " + c.name + " — " + c.role + " (" + c.city + ")");
    });
    process.exit(0);
  }

  if (args.indexOf("--spam") >= 0) {
    const heat = argVal("--heat") != null ? Number(argVal("--heat")) : 0.3;
    const events = spamForDay(argVal("--date") || undefined, { heat });
    events.forEach(e => console.log(e.time + "  [" + e.kind + "] " + e.from + ": " + e.text));
    process.exit(0);
  }

  if (argVal("--number")) {
    const r = lookupNumber(argVal("--number"));
    if (r.type === "contact") console.log(r.number + " → " + r.contact.name + " (" + r.contact.role + ")");
    else console.log(r.number + " → [" + r.type + "] " + r.text);
    process.exit(0);
  }

  const contactId = argVal("--contact");
  if (contactId) {
    const contact = getContact(contactId);
    const opts = {};
    if (argVal("--date")) opts.date = argVal("--date");
    if (argVal("--hour")) opts.hour = Number(argVal("--hour"));
    if (argVal("--force")) opts.force = argVal("--force");
    const statePath = argVal("--state");
    const d = dial(contact, opts);
    const first = contact.name.split(" ")[0];
    console.log("[dialing " + contact.id + " " + contact.number + " … " + d.dateStr + " → " + d.status + "]");
    console.log(first + ": " + d.text);
    const say = argVal("--say");
    if (say && d.status === "pickup") {
      let hist = [{ role: "caller", text: say }];
      let state = null;
      if (statePath) {
        state = await loadState(statePath);
        const prior = state[contactId];
        if (prior && prior.status === "open" && Array.isArray(prior.history)) {
          hist = prior.history.concat(hist);
        }
      }
      const reply = respond(contact, hist, opts);
      console.log("You: " + say);
      console.log(first + ": " + reply.text + (reply.action !== "continue" ? "   [" + reply.action + "]" : ""));
      if (statePath) {
        hist.push({ role: "contact", text: reply.text, topic: reply.topic });
        state[contactId] = {
          status: reply.action === "continue" ? "open" : "ended",
          date: d.dateStr,
          history: hist
        };
        await saveState(statePath, state);
        console.log("[state saved → " + statePath + " (" + state[contactId].status + ")]");
      }
    } else if (say) {
      console.log("(voicemail — message recorded, no reply)");
    }
    process.exit(0);
  }

  console.log("usage: --self-check | --list | --spam [--date D] [--heat N] | --number 555-0104 | --contact <id> [--say \"...\"] [--date D] [--hour N] [--force pickup|voicemail] [--state file.json]");
  process.exit(2);
}

let isMain = false;
if (typeof process !== "undefined" && process.argv && process.argv[1]) {
  try {
    const { pathToFileURL } = await import("node:url");
    isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    isMain = false;
  }
}
if (isMain) {
  main().catch(err => {
    console.error("phone-responder: " + (err && err.message ? err.message : err));
    process.exit(1);
  });
}
