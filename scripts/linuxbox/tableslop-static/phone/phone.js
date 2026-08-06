/**
 * phone.js — Primavera Bell client. All logic client-side, no frameworks.
 * The scripted engine is imported as a module; contact data registers itself
 * on globalThis.PHONE_CONTACTS via contacts.js. Threads and call history
 * persist in localStorage. Test hooks (deterministic screenshots):
 * ?force=pickup|voicemail  ?date=YYYY-MM-DD  ?heat=0..1
 */
import "./contacts.js";
import * as Engine from "../../../tableslop/phone-responder.js";

const CONTACTS = globalThis.PHONE_CONTACTS;
const params = new URLSearchParams(location.search);
const FORCE = params.get("force");
const DATE = params.get("date");
const HEAT = params.has("heat")
  ? Number(params.get("heat"))
  : (typeof window.TABLESLOP_SIM_HEAT === "number" ? window.TABLESLOP_SIM_HEAT : 0.3);

const $ = sel => document.querySelector(sel);

// --- storage ------------------------------------------------------------------

function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let threads = load("ip-phone-threads", {});
let callLog = load("ip-phone-history", []);
let unread = load("ip-phone-unread", {});
let spamList = load("ip-phone-spam-list", []);
let spamDay = localStorage.getItem("ip-phone-spam-day") || "";
let soundOn = load("ip-phone-sound", false);

function todayStr() {
  if (DATE) return DATE;
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}
function nowTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function persistAll() {
  save("ip-phone-threads", threads);
  save("ip-phone-history", callLog);
  save("ip-phone-unread", unread);
}

// --- ambient inbound spam ------------------------------------------------------
// Generated once per calendar day, seeded/deterministic. Frequency follows
// sim heat when the host provides it (window.TABLESLOP_SIM_HEAT).

function ensureSpam() {
  const day = todayStr();
  if (spamDay === day) return;
  spamDay = day;
  localStorage.setItem("ip-phone-spam-day", day);
  spamList = Engine.spamForDay(day, { heat: HEAT });
  save("ip-phone-spam-list", spamList);
  for (const sp of spamList) {
    const key = "spam:" + sp.spamId;
    threads[key] = threads[key] || [];
    threads[key].push({ role: "contact", text: sp.text, ts: day + " " + sp.time });
    unread[key] = true;
  }
  persistAll();
}

function spamById(spamId) {
  return spamList.find(s => s.spamId === spamId) || null;
}

// --- sound (optional, off by default) -------------------------------------------

let audioCtx = null;
function beep(freq, dur, when) {
  if (!soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const t = audioCtx.currentTime + (when || 0);
    osc.start(t);
    osc.stop(t + dur);
  } catch {
    /* audio is a garnish, never a blocker */
  }
}
function ringback() {
  for (let ring = 0; ring < 3; ring++) {
    beep(440, 0.4, ring * 0.9);
    beep(480, 0.4, ring * 0.9 + 0.05);
  }
}

function renderSoundToggle() {
  const btn = $("#sb-sound");
  btn.textContent = soundOn ? "SND ON" : "SND OFF";
  btn.classList.toggle("on", soundOn);
}

// --- view switching ---------------------------------------------------------------

const VIEWS = ["contacts", "recents", "keypad", "thread", "call"];
function showView(name) {
  for (const v of VIEWS) {
    $("#view-" + v).classList.toggle("active", v === name);
  }
  for (const btn of document.querySelectorAll(".softkeys [data-nav]")) {
    btn.classList.toggle("active", btn.dataset.nav === name);
  }
  if (name === "contacts") renderContacts();
  if (name === "recents") renderRecents();
  if (name === "keypad") renderKeypad();
}

function updateBadge() {
  const n = Object.values(unread).filter(Boolean).length;
  const badge = $("#recents-badge");
  badge.hidden = n === 0;
  badge.textContent = String(n);
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function bubble(role, text, ts) {
  const m = el("div", "msg " + role);
  m.appendChild(el("span", "txt", text));
  if (ts) m.appendChild(el("span", "m-ts", ts));
  return m;
}

// --- contacts view --------------------------------------------------------------------

function renderContacts() {
  const view = $("#view-contacts");
  view.replaceChildren();
  view.appendChild(el("div", "view-head", "DIRECTORY — ISLA PRIMAVERA"));
  for (const c of CONTACTS) {
    const row = el("button", "row");
    row.type = "button";
    row.dataset.contactId = c.id;
    row.appendChild(el("span", "r-name", c.name));
    row.appendChild(el("span", "r-meta", c.role + " — " + c.city));
    row.appendChild(el("span", "r-hint", c.number + " · " + c.hint));
    row.addEventListener("click", () => openThread(c.id));
    view.appendChild(row);
  }
}

// --- recents view ------------------------------------------------------------------------

const OUTCOME_LABEL = {
  completed: "call ended",
  goodbye: "call ended",
  hangup: "they hung up",
  voicemail: "voicemail left",
  "no-service": "not in service",
  intercept: "intercept"
};

function renderRecents() {
  const view = $("#view-recents");
  view.replaceChildren();
  view.appendChild(el("div", "view-head", "RECENTS"));

  const spamKeys = spamList.map(s => "spam:" + s.spamId);
  let rows = 0;

  for (const key of spamKeys) {
    const msgs = threads[key];
    if (!msgs || !msgs.length) continue;
    const sp = spamById(key.slice(5));
    rows++;
    const row = el("button", "row");
    row.type = "button";
    row.dataset.thread = key;
    if (unread[key]) row.appendChild(el("span", "r-unread", "NEW"));
    row.appendChild(el("span", "r-name", sp ? sp.from : "UNKNOWN"));
    row.appendChild(el("span", "r-meta", (sp && sp.kind === "robocall" ? "robocall" : "wrong number") + " — " + (msgs[msgs.length - 1].text || "").slice(0, 42) + "…"));
    row.addEventListener("click", () => openThread(key));
    view.appendChild(row);
  }

  for (const entry of callLog.slice(0, 12)) {
    rows++;
    const row = el("button", "row");
    row.type = "button";
    row.dataset.thread = entry.contactId;
    row.appendChild(el("span", "r-name", entry.name));
    row.appendChild(el("span", "r-meta",
      (OUTCOME_LABEL[entry.outcome] || entry.outcome) + " · " + entry.when +
      (entry.durSec != null && entry.outcome !== "no-service" && entry.outcome !== "intercept"
        ? " · " + entry.durSec + "s" : "")));
    row.addEventListener("click", () => openThread(entry.contactId));
    view.appendChild(row);
  }

  if (!rows) {
    view.appendChild(el("div", "empty-note", "No calls yet. The island is quiet.\nIt won't last."));
  }
  updateBadge();
}

// --- keypad view -------------------------------------------------------------------------

let kpBuffer = "";

function formatKp(digits) {
  return digits.length > 3 ? digits.slice(0, 3) + "-" + digits.slice(3) : digits;
}

function renderKeypad() {
  const view = $("#view-keypad");
  view.replaceChildren();
  view.appendChild(el("div", "view-head", "DIAL"));
  const display = el("div", "kp-display", formatKp(kpBuffer) || " ");
  display.id = "kp-display";
  view.appendChild(display);
  const note = el("div", "kp-note", "");
  note.id = "kp-note";
  view.appendChild(note);

  const grid = el("div", "kp-grid");
  const keys = [
    ["1", ""], ["2", "ABC"], ["3", "DEF"],
    ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
    ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
    ["*", ""], ["0", "+"], ["#", ""]
  ];
  for (const [digit, sub] of keys) {
    const b = el("button");
    b.type = "button";
    b.dataset.digit = digit;
    b.textContent = digit;
    if (sub) b.appendChild(el("small", null, sub));
    b.addEventListener("click", () => {
      if (kpBuffer.length < 7 && /\d/.test(digit)) {
        kpBuffer += digit;
        display.textContent = formatKp(kpBuffer);
      }
    });
    grid.appendChild(b);
  }
  view.appendChild(grid);

  const actions = el("div", "kp-actions");
  const clear = el("button", "btn ghost", "CLEAR");
  clear.type = "button";
  clear.addEventListener("click", () => {
    kpBuffer = kpBuffer.slice(0, -1);
    display.textContent = formatKp(kpBuffer) || " ";
    note.textContent = "";
  });
  const dial = el("button", "btn", "CALL");
  dial.type = "button";
  dial.id = "kp-call";
  dial.addEventListener("click", () => {
    if (kpBuffer.length !== 7) {
      note.textContent = "island numbers are seven digits.";
      return;
    }
    dialNumber(formatKp(kpBuffer));
  });
  const wipe = el("button", "btn ghost", "RESET");
  wipe.type = "button";
  wipe.addEventListener("click", () => {
    kpBuffer = "";
    display.textContent = " ";
    note.textContent = "";
  });
  actions.append(clear, dial, wipe);
  view.appendChild(actions);
}

function dialNumber(number) {
  const res = Engine.lookupNumber(number);
  kpBuffer = "";
  if (res.type === "contact") {
    startCall(res.contact);
    return;
  }
  // flavor intercept or generic not-in-service: a one-way "operator" call
  startOperatorCall(number, res.text, res.type === "dead" ? "no-service" : res.type);
}

// --- thread view ----------------------------------------------------------------------------

let currentThread = null;

function openThread(key) {
  currentThread = key;
  unread[key] = false;
  persistAll();
  updateBadge();

  const view = $("#view-thread");
  view.replaceChildren();

  const isSpam = key.startsWith("spam:");
  const contact = isSpam ? null : CONTACTS.find(c => c.id === key);
  const sp = isSpam ? spamById(key.slice(5)) : null;

  const head = el("div", "thread-head");
  head.appendChild(el("div", "t-name", contact ? contact.name : (sp ? sp.from : "UNKNOWN")));
  head.appendChild(el("div", "t-meta", contact
    ? contact.role + " — " + contact.city + " · " + contact.number
    : (sp ? (sp.kind === "robocall" ? "robocall · " : "wrong number · ") + sp.date + " " + sp.time : "")));
  view.appendChild(head);

  const log = el("div", "log");
  log.id = "thread-log";
  const msgs = threads[key] || [];
  if (!msgs.length) {
    log.appendChild(el("div", "empty-note", contact
      ? "No calls yet. " + contact.hint + "."
      : "Nothing here."));
  }
  for (const m of msgs) log.appendChild(bubble(m.role === "caller" ? "caller" : "contact", m.text, m.ts || null));
  view.appendChild(log);

  if (contact) {
    const bar = el("div", "composer");
    const callBtn = el("button", "btn", "CALL " + contact.number);
    callBtn.type = "button";
    callBtn.id = "btn-call-from-thread";
    callBtn.addEventListener("click", () => startCall(contact));
    const back = el("button", "btn ghost", "BACK");
    back.type = "button";
    back.addEventListener("click", () => showView("contacts"));
    bar.append(callBtn, back);
    view.appendChild(bar);
  } else if (sp) {
    const lastReply = threads[key].filter(m => m.role === "caller").length;
    const dead = lastReply >= sp.replies.length;
    if (dead) {
      view.appendChild(el("div", "empty-note", sp.kind === "robocall"
        ? "the number has gone quiet. it always does."
        : "no answer. wrong numbers move on."));
    } else {
      const bar = el("div", "composer");
      const input = el("input");
      input.id = "spam-input";
      input.placeholder = sp.kind === "robocall" ? "reply YES, or anything…" : "reply…";
      input.maxLength = 240;
      const send = el("button", "btn", "SEND");
      send.type = "button";
      const doSend = () => {
        const text = input.value.trim();
        if (!text) return;
        const hist = threads[key].map(m => ({ role: m.role, text: m.text }));
        hist.push({ role: "caller", text });
        const reply = Engine.spamRespond(sp, hist);
        threads[key].push({ role: "caller", text, ts: todayStr() + " " + nowTime() });
        if (reply.text) {
          threads[key].push({ role: "contact", text: reply.text, ts: todayStr() + " " + nowTime() });
        }
        persistAll();
        openThread(key);
      };
      send.addEventListener("click", doSend);
      input.addEventListener("keydown", e => { if (e.key === "Enter") doSend(); });
      bar.append(input, send);
      view.appendChild(bar);
    }
  }

  showView("thread");
  log.scrollTop = log.scrollHeight;
}

// --- call view ---------------------------------------------------------------------------------

let call = null;

function setCallStatus(text, cls) {
  const s = $("#call-status");
  s.textContent = text;
  s.className = "call-status" + (cls ? " " + cls : "");
}

function callTimerTick() {
  if (!call || !call.t0) return;
  const sec = Math.floor((Date.now() - call.t0) / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  setCallStatus("CONNECTED " + mm + ":" + ss, "live");
}

function buildCallView(name, number) {
  const view = $("#view-call");
  view.replaceChildren();
  const id = el("div", "call-id ringing");
  id.id = "call-id";
  id.appendChild(el("div", "c-name", name));
  id.appendChild(el("div", "c-number", number || ""));
  id.appendChild(el("div", "call-status", "RINGING…"));
  id.querySelector(".call-status").id = "call-status";
  view.appendChild(id);
  const log = el("div", "log");
  log.id = "call-log";
  view.appendChild(log);
  const composer = el("div", "composer");
  const input = el("input");
  input.id = "call-input";
  input.maxLength = 240;
  input.disabled = true;
  const send = el("button", "btn", "SEND");
  send.type = "button";
  send.id = "btn-send";
  send.addEventListener("click", sendCallMessage);
  input.addEventListener("keydown", e => { if (e.key === "Enter") sendCallMessage(); });
  composer.append(input, send);
  view.appendChild(composer);
  const actions = el("div", "call-actions");
  const end = el("button", "btn danger", "END CALL");
  end.type = "button";
  end.id = "btn-end";
  end.addEventListener("click", () => endCall("completed"));
  actions.appendChild(end);
  view.appendChild(actions);
}

function addCallBubble(role, text) {
  const log = $("#call-log");
  log.appendChild(bubble(role, text, nowTime()));
  log.scrollTop = log.scrollHeight;
}

function startCall(contact) {
  call = { contact, hist: [], state: "ringing", t0: null, timer: null, outcome: null };
  buildCallView(contact.name, contact.number);
  showView("call");
  ringback();
  setTimeout(resolveDial, 2600);
}

function startOperatorCall(number, text, kind) {
  call = { contact: null, number, hist: [], state: "operator", t0: null, timer: null, outcome: kind };
  buildCallView(number, "");
  showView("call");
  ringback();
  setTimeout(() => {
    if (!call || call.state !== "operator") return;
    $("#call-id").classList.remove("ringing");
    setCallStatus(kind === "intercept" ? "CONNECTED — OPERATOR" : "OPERATOR", "live");
    addCallBubble("contact", text);
    setTimeout(() => {
      if (!call || call.state !== "operator") return;
      setCallStatus("CALL ENDED", "ended");
      logCall(number, number, kind, null);
      setTimeout(() => { if (!call) showView("keypad"); }, 1800);
    }, 2200);
  }, 2000);
}

function resolveDial() {
  if (!call || !call.contact || call.state !== "ringing") return;
  const opts = {};
  if (DATE) opts.date = DATE;
  if (FORCE) opts.force = FORCE;
  const d = Engine.dial(call.contact, opts);
  $("#call-id").classList.remove("ringing");
  addCallBubble("contact", d.text);
  if (d.status === "voicemail") {
    call.state = "voicemail";
    setCallStatus("VOICEMAIL — leave a message after the beep");
    const input = $("#call-input");
    input.disabled = false;
    input.placeholder = "Leave a message…";
    input.focus();
  } else {
    call.state = "live";
    call.t0 = Date.now();
    call.timer = setInterval(callTimerTick, 1000);
    callTimerTick();
    const input = $("#call-input");
    input.disabled = false;
    input.placeholder = "Say something…";
    input.focus();
  }
}

function sendCallMessage() {
  if (!call) return;
  const input = $("#call-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  call.hist.push({ role: "caller", text });
  addCallBubble("caller", text);

  if (call.state === "voicemail") {
    input.disabled = true;
    setCallStatus("MESSAGE RECORDED — ending call");
    setTimeout(() => endCall("voicemail"), 1400);
    return;
  }
  if (call.state !== "live") return;

  const reply = Engine.respond(call.contact, call.hist, { date: DATE || undefined });
  call.hist.push({ role: "contact", text: reply.text, topic: reply.topic });
  addCallBubble("contact", reply.text);
  if (reply.action === "goodbye" || reply.action === "hangup") {
    input.disabled = true;
    setCallStatus(reply.action === "hangup" ? "THEY HUNG UP" : "CALL ENDED", "ended");
    setTimeout(() => endCall(reply.action), 1600);
  }
}

function endCall(outcome) {
  if (!call || call.state === "ended") return;
  if (call.timer) clearInterval(call.timer);
  const durSec = call.t0 ? Math.floor((Date.now() - call.t0) / 1000) : null;
  if (call.contact) {
    const key = call.contact.id;
    threads[key] = threads[key] || [];
    for (const m of call.hist) {
      threads[key].push({ role: m.role, text: m.text, topic: m.topic, ts: todayStr() + " " + nowTime() });
    }
    logCall(call.contact.id, call.contact.name, outcome, durSec);
    persistAll();
  }
  call.outcome = outcome;
  call.state = "ended";
  const input = $("#call-input");
  if (input) input.disabled = true;
  setCallStatus(outcome === "hangup" ? "THEY HUNG UP" : "CALL ENDED", "ended");
  const endBtn = $("#btn-end");
  endBtn.textContent = "CLOSE";
  endBtn.onclick = () => {
    const contactId = call && call.contact ? call.contact.id : null;
    call = null;
    if (contactId) openThread(contactId);
    else showView("contacts");
  };
}

function logCall(contactId, name, outcome, durSec) {
  callLog.unshift({
    contactId,
    name,
    outcome,
    durSec,
    when: todayStr() + " " + nowTime()
  });
  if (callLog.length > 60) callLog.length = 60;
  persistAll();
}

// --- boot ----------------------------------------------------------------------------------------

function startClock() {
  const tick = () => { $("#sb-clock").textContent = nowTime(); };
  tick();
  setInterval(tick, 20000);
}

function boot() {
  ensureSpam();
  startClock();
  renderSoundToggle();
  $("#sb-sound").addEventListener("click", () => {
    soundOn = !soundOn;
    save("ip-phone-sound", soundOn);
    renderSoundToggle();
  });
  for (const btn of document.querySelectorAll(".softkeys [data-nav]")) {
    btn.addEventListener("click", () => showView(btn.dataset.nav));
  }
  updateBadge();
  showView("contacts");

  // test hook: jump straight into a deterministic call for smokes
  const dialId = params.get("dial");
  if (dialId) {
    const contact = CONTACTS.find(c => c.id === dialId);
    if (contact) startCall(contact);
  }
}

boot();
