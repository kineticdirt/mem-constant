/**
 * phone.js — Primavera Bell client. All logic client-side, no frameworks.
 * The scripted engine is imported as a module; contact data registers itself
 * on globalThis.PHONE_CONTACTS via contacts.js. Threads and call history
 * persist in localStorage. Test hooks (deterministic screenshots):
 * ?force=pickup|voicemail  ?date=YYYY-MM-DD  ?heat=0..1
 */
import "./contacts.js";
import "./apps-data.js";
import * as Engine from "../../../tableslop/phone-responder.js";
import { TableslopSfx } from "../sfx/sfx-bank.js";

const CONTACTS = globalThis.PHONE_CONTACTS;
const APPS = globalThis.PHONE_APPS || [];
const MAP_FALLBACK = globalThis.PHONE_MAP_DESTINATIONS || [];
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
let carts = load("ip-phone-carts", {});
let activeTrip = load("ip-phone-trip", null);
let activeAppId = null;
let mapMode = load("ip-phone-map-mode", "walk");
let mapDestCache = null;

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
  save("ip-phone-carts", carts);
  save("ip-phone-trip", activeTrip);
  save("ip-phone-map-mode", mapMode);
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

// --- sound (SFX bank — files optional; procedural until assets drop) ----------

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
function sfx(id, opts) {
  const o = opts || {};
  if (!soundOn && !o.force) return;
  try {
    TableslopSfx.play(id, o);
  } catch {
    /* garnish */
  }
}
function ringback() {
  sfx("line.ringback");
}

function renderSoundToggle() {
  const btn = $("#sb-sound");
  btn.textContent = soundOn ? "SND ON" : "SND OFF";
  btn.classList.toggle("on", soundOn);
  try { TableslopSfx.setEnabled(soundOn); } catch { /* ignore */ }
}

// --- view switching ---------------------------------------------------------------

/** Built-in apps on the home launcher (Texts/Contacts/… are separate apps). */
const HOME_SYSTEM = [
  { id: "contacts", name: "Contacts", icon: "@", view: "contacts", tone: "sys" },
  { id: "messages", name: "Texts", icon: "✉", view: "messages", tone: "sys", badge: true },
  { id: "keypad", name: "Phone", icon: "☎", view: "keypad", tone: "sys" },
  { id: "recents", name: "Recents", icon: "◷", view: "recents", tone: "sys" },
  { id: "settings", name: "Settings", icon: "⚙", view: "settings", tone: "sys" },
];

const VIEWS = [
  "home", "contacts", "messages", "actions", "app", "settings",
  "recents", "keypad", "thread", "call",
];
let currentView = "home";
let viewStack = [];

function showView(name, opts) {
  const skipStack = opts && opts.skipStack;
  const changed = currentView !== name;
  if (!skipStack && currentView && currentView !== name && name !== "home") {
    if (viewStack[viewStack.length - 1] !== currentView) viewStack.push(currentView);
    if (viewStack.length > 12) viewStack.shift();
  }
  if (name === "home") viewStack = [];
  currentView = name;

  for (const v of VIEWS) {
    const node = $("#view-" + v);
    if (node) node.classList.toggle("active", v === name);
  }
  for (const btn of document.querySelectorAll(".softkeys [data-nav]")) {
    const nav = btn.dataset.nav;
    if (nav === "back") {
      btn.classList.toggle("active", false);
      continue;
    }
    const on =
      nav === name ||
      (name === "thread" && nav === "messages") ||
      (name === "call" && nav === "keypad") ||
      (name === "app" && nav === "home") ||
      (name === "actions" && nav === "home");
    btn.classList.toggle("active", on);
  }
  if (name === "home") renderHome();
  if (name === "contacts") renderContacts();
  if (name === "messages") renderMessages();
  if (name === "actions") renderActions();
  if (name === "settings") renderSettings();
  if (name === "recents") renderRecents();
  if (name === "keypad") renderKeypad();
  if (changed && !(opts && opts.sfx === false)) sfx("ui.click", { target: $("#phone") });
}

function goBack() {
  if (currentView === "thread") {
    showView("messages", { skipStack: true });
    return;
  }
  if (currentView === "call") {
    showView(viewStack.pop() || "home", { skipStack: true });
    return;
  }
  if (currentView === "app") {
    showView("home", { skipStack: true });
    return;
  }
  const prev = viewStack.pop();
  showView(prev || "home", { skipStack: true });
}

function updateBadge() {
  const n = Object.values(unread).filter(Boolean).length;
  const badge = $("#recents-badge");
  if (badge) {
    badge.hidden = n === 0;
    badge.textContent = String(n);
  }
  const tb = $("#texts-badge");
  if (tb) {
    tb.hidden = n === 0;
    tb.textContent = String(n);
  }
  const homeBadge = $("#home-texts-badge");
  if (homeBadge) {
    homeBadge.hidden = n === 0;
    homeBadge.textContent = String(n);
  }
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
  view.appendChild(el("div", "view-head", "DIRECTORY — call or text"));
  for (const c of CONTACTS) {
    const row = el("div", "row row-split");
    const info = el("button", "row-main");
    info.type = "button";
    info.appendChild(el("span", "r-name", c.name));
    info.appendChild(el("span", "r-meta", c.role + " — " + c.city));
    info.appendChild(el("span", "r-hint", c.number + " · " + c.hint));
    info.addEventListener("click", () => openThread(c.id));
    const actions = el("div", "row-actions");
    const textBtn = el("button", "mini", "TEXT");
    textBtn.type = "button";
    textBtn.addEventListener("click", (e) => { e.stopPropagation(); openThread(c.id); });
    const callBtn = el("button", "mini mini-call", "CALL");
    callBtn.type = "button";
    callBtn.addEventListener("click", (e) => { e.stopPropagation(); startCall(c); });
    actions.appendChild(textBtn);
    actions.appendChild(callBtn);
    row.appendChild(info);
    row.appendChild(actions);
    view.appendChild(row);
  }
}

function renderMessages() {
  const view = $("#view-messages");
  view.replaceChildren();
  view.appendChild(el("div", "view-head", "TEXTS — threads"));
  const keys = Object.keys(threads).sort((a, b) => {
    const ta = (threads[a] || []).slice(-1)[0];
    const tb = (threads[b] || []).slice(-1)[0];
    return String((tb && tb.ts) || "").localeCompare(String((ta && ta.ts) || ""));
  });
  if (!keys.length) {
    view.appendChild(el("div", "empty-note", "No texts yet. Open a contact and send one."));
    return;
  }
  for (const key of keys) {
    const msgs = threads[key] || [];
    const last = msgs[msgs.length - 1];
    const isSpam = key.startsWith("spam:");
    const contact = isSpam ? null : CONTACTS.find(c => c.id === key);
    const sp = isSpam ? spamById(key.slice(5)) : null;
    const row = el("button", "row" + (unread[key] ? " unread" : ""));
    row.type = "button";
    row.appendChild(el("span", "r-name",
      (unread[key] ? "● " : "") + (contact ? contact.name : (sp ? sp.from : key))));
    row.appendChild(el("span", "r-meta", last
      ? ((last.role === "you" ? "you: " : "") + String(last.text || "").slice(0, 48))
      : "empty thread"));
    row.appendChild(el("span", "r-hint", last && last.ts ? last.ts : "tap to open"));
    row.addEventListener("click", () => openThread(key));
    view.appendChild(row);
  }
}

// --- HOME launcher + commerce apps ------------------------------------------------

function cartFor(appId) {
  if (!carts[appId]) carts[appId] = [];
  return carts[appId];
}

function cartTotal(appId) {
  const app = APPS.find(a => a.id === appId);
  if (!app || !app.items) return 0;
  let sum = 0;
  for (const line of cartFor(appId)) {
    const item = app.items.find(i => i.id === line.id);
    if (item) sum += item.price * (line.qty || 1);
  }
  return Math.round(sum * 100) / 100;
}

function makeIconTile(opts) {
  const tile = el("button", "icon-tile" + (opts.tone === "arms" ? " is-arms" : ""));
  tile.type = "button";
  tile.title = opts.name;
  const face = el("span", "icon-face");
  face.setAttribute("aria-hidden", "true");
  face.textContent = opts.icon || "?";
  tile.appendChild(face);
  tile.appendChild(el("span", "icon-name", opts.name));
  if (opts.badge) {
    const b = el("span", "icon-badge", "");
    b.id = opts.badgeId || "home-texts-badge";
    b.hidden = true;
    tile.appendChild(b);
  }
  tile.addEventListener("click", opts.onClick);
  return tile;
}

function renderHome() {
  const view = $("#view-home");
  view.replaceChildren();
  view.appendChild(el("div", "view-head", "HOME — apps"));
  if (activeTrip && activeTrip.status === "enroute") {
    const trip = el("div", "trip-card");
    trip.appendChild(el("strong", null, "ACTIVE TRIP"));
    trip.appendChild(el("div", null,
      `${activeTrip.mode.toUpperCase()} → ${activeTrip.destName} (${activeTrip.region || "?"})`));
    trip.appendChild(el("div", null, activeTrip.eta || "in progress…"));
    const stop = el("button", "btn ghost", "CANCEL TRIP");
    stop.type = "button";
    stop.style.marginTop = "8px";
    stop.addEventListener("click", () => {
      activeTrip = null;
      persistAll();
      renderHome();
    });
    trip.appendChild(stop);
    view.appendChild(trip);
  }

  view.appendChild(el("div", "home-section", "PHONE"));
  const sys = el("div", "icon-grid");
  for (const app of HOME_SYSTEM) {
    sys.appendChild(makeIconTile({
      name: app.name,
      icon: app.icon,
      tone: "sys",
      badge: !!app.badge,
      badgeId: app.badge ? "home-texts-badge" : undefined,
      onClick: () => showView(app.view),
    }));
  }
  view.appendChild(sys);

  view.appendChild(el("div", "home-section", "ISLAND"));
  const island = el("div", "icon-grid");
  for (const app of APPS) {
    island.appendChild(makeIconTile({
      name: app.name,
      icon: app.icon || app.name.charAt(0),
      tone: app.kind === "arms" ? "arms" : "app",
      onClick: () => openApp(app.id),
    }));
  }
  view.appendChild(island);
  updateBadge();
}

/** Legacy ACTIONS deep-link → home launcher. */
function renderActions() {
  showView("home", { skipStack: true });
}

function renderSettings() {
  const view = $("#view-settings");
  view.replaceChildren();
  view.appendChild(el("div", "view-head", "SETTINGS"));
  const sound = el("button", "row");
  sound.type = "button";
  sound.appendChild(el("span", "r-name", soundOn ? "Sound ON" : "Sound OFF"));
  sound.appendChild(el("span", "r-meta", "tap to toggle beeps"));
  sound.addEventListener("click", () => {
    soundOn = !soundOn;
    save("ip-phone-sound", soundOn);
    renderSoundToggle();
    sfx("ui.toggle", { force: true });
    renderSettings();
  });
  view.appendChild(sound);
  const keypad = el("button", "row");
  keypad.type = "button";
  keypad.appendChild(el("span", "r-name", "Keypad"));
  keypad.appendChild(el("span", "r-meta", "dial a number"));
  keypad.addEventListener("click", () => showView("keypad"));
  view.appendChild(keypad);
  const recents = el("button", "row");
  recents.type = "button";
  recents.appendChild(el("span", "r-name", "Call recents"));
  recents.appendChild(el("span", "r-meta", `${callLog.length} entries`));
  recents.addEventListener("click", () => showView("recents"));
  view.appendChild(recents);
  view.appendChild(el("div", "empty-note",
    "Food/mart/Amazon deliver. Firearms require a physical storefront visit — use Maps."));
}

function openApp(appId) {
  activeAppId = appId;
  const app = APPS.find(a => a.id === appId);
  if (!app) return;
  sfx(app.kind === "maps" ? "ui.click" : "door.open");
  if (app.kind === "maps") renderMapsApp();
  else renderCommerceApp(app);
  showView("app", { sfx: false });
}

function renderCommerceApp(app) {
  const view = $("#view-app");
  view.replaceChildren();
  const bar = el("div", "app-bar");
  const back = el("button", "btn ghost", "BACK");
  back.type = "button";
  back.addEventListener("click", () => showView("home"));
  bar.appendChild(back);
  bar.appendChild(el("span", "app-title", app.name.toUpperCase()));
  view.appendChild(bar);
  view.appendChild(el("div", "view-head", app.blurb));

  if (app.inPersonOnly) {
    const warn = el("div", "shop-warn");
    warn.textContent =
      "No remote purchase. Browse the catalog, then go to the storefront in person " +
      `(${app.storefront.place}). Delivery / phone checkout blocked.`;
    view.appendChild(warn);
    const go = el("button", "btn");
    go.type = "button";
    go.textContent = "MAPS → GO TO STOREFRONT";
    go.style.margin = "0 10px 10px";
    go.addEventListener("click", () => {
      startTrip({
        id: "sf-" + app.id,
        name: app.storefront.place,
        region: app.storefront.region,
      }, app.storefront.modeHint || "walk");
    });
    view.appendChild(go);
  }

  for (const item of app.items || []) {
    const row = el("div", "shop-item");
    row.appendChild(el("div", "si-name", item.name));
    row.appendChild(el("div", "si-price", "$" + item.price.toFixed(2)));
    row.appendChild(el("div", "si-note", item.note || ""));
    const add = el("button", "si-add", app.inPersonOnly ? "IN STORE" : "ADD");
    add.type = "button";
    add.disabled = !!app.inPersonOnly;
    if (!app.inPersonOnly) {
      add.addEventListener("click", () => {
        const cart = cartFor(app.id);
        const line = cart.find(l => l.id === item.id);
        if (line) line.qty += 1;
        else cart.push({ id: item.id, qty: 1 });
        persistAll();
        renderCommerceApp(app);
        showView("app");
      });
    }
    row.appendChild(add);
    view.appendChild(row);
  }

  if (!app.inPersonOnly) {
    const cart = cartFor(app.id);
    const foot = el("div", "shop-cart");
    const n = cart.reduce((a, l) => a + (l.qty || 0), 0);
    foot.textContent = n
      ? `Cart ${n} · $${cartTotal(app.id).toFixed(2)} · ${app.delivery ? "delivery" : ""}${app.pickup ? (app.delivery ? " / pickup" : "pickup") : ""}`
      : "Cart empty";
    view.appendChild(foot);
    if (n) {
      const order = el("button", "btn");
      order.type = "button";
      order.textContent = app.delivery ? "PLACE ORDER (DELIVER)" : "PLACE ORDER";
      order.style.margin = "8px 10px";
      order.addEventListener("click", () => {
        const conf = {
          app: app.id,
          total: cartTotal(app.id),
          items: cart.slice(),
          when: todayStr() + " " + nowTime(),
          via: app.delivery ? "delivery van" : "pickup",
        };
        const hist = load("ip-phone-orders", []);
        hist.unshift(conf);
        save("ip-phone-orders", hist.slice(0, 40));
        carts[app.id] = [];
        persistAll();
        view.appendChild(el("div", "trip-card",
          `Order placed · $${conf.total.toFixed(2)} · ${conf.via}. ETA island-time fuzzy.`));
      });
      view.appendChild(order);
      if (app.pickup && app.storefront) {
        const pickup = el("button", "btn ghost");
        pickup.type = "button";
        pickup.textContent = "PICKUP — NAVIGATE TO STORE";
        pickup.style.margin = "0 10px 10px";
        pickup.addEventListener("click", () => {
          startTrip({
            id: "sf-" + app.id,
            name: app.storefront.place,
            region: app.storefront.region,
          }, app.storefront.modeHint || "drive");
        });
        view.appendChild(pickup);
      }
    }
  }
}

function etaFor(mode) {
  if (mode === "walk") return "~25–40 min on foot";
  if (mode === "bus") return "~15–30 min · island bus";
  return "~8–18 min driving";
}

function startTrip(dest, mode) {
  mapMode = mode || mapMode || "walk";
  activeTrip = {
    status: "enroute",
    destId: dest.id,
    destName: dest.name,
    region: dest.region,
    mode: mapMode,
    eta: etaFor(mapMode),
    started: todayStr() + " " + nowTime(),
  };
  persistAll();
  renderMapsApp();
  showView("app");
}

async function loadMapDestinations() {
  if (mapDestCache) return mapDestCache;
  const dests = MAP_FALLBACK.slice();
  try {
    for (const rid of ["r01-paradise", "r02-porto-lujuria", "r03-crimson-quay"]) {
      const res = await fetch("/api/cities/" + rid, { cache: "no-store" });
      if (!res.ok) continue;
      const city = await res.json();
      for (const p of (city.places || []).slice(0, 12)) {
        dests.push({
          id: p.id,
          name: p.name,
          region: rid,
          kind: p.kind || "place",
        });
      }
    }
  } catch {
    /* offline / no API — fallback list is enough */
  }
  mapDestCache = dests;
  return dests;
}

function renderMapsApp() {
  activeAppId = "maps";
  const view = $("#view-app");
  view.replaceChildren();
  const bar = el("div", "app-bar");
  const back = el("button", "btn ghost", "BACK");
  back.type = "button";
  back.addEventListener("click", () => showView("home"));
  bar.appendChild(back);
  bar.appendChild(el("span", "app-title", "ISLAND MAPS"));
  view.appendChild(bar);
  view.appendChild(el("div", "view-head", "Walk · drive · bus to districts & storefronts"));

  const modes = el("div", "mode-row");
  for (const m of ["walk", "drive", "bus"]) {
    const b = el("button", mapMode === m ? "active" : "", m.toUpperCase());
    b.type = "button";
    b.addEventListener("click", () => {
      mapMode = m;
      persistAll();
      renderMapsApp();
      showView("app");
    });
    modes.appendChild(b);
  }
  view.appendChild(modes);

  if (activeTrip && activeTrip.status === "enroute") {
    const trip = el("div", "trip-card");
    trip.appendChild(el("strong", null, "EN ROUTE"));
    trip.appendChild(el("div", null, ` ${activeTrip.mode} → ${activeTrip.destName}`));
    trip.appendChild(el("div", null, activeTrip.eta));
    trip.appendChild(el("div", null, "Characters complete this on the 2D/3D map (routines)."));
    const done = el("button", "btn");
    done.type = "button";
    done.textContent = "ARRIVED";
    done.style.marginTop = "8px";
    done.addEventListener("click", () => {
      activeTrip = Object.assign({}, activeTrip, {
        status: "arrived",
        ended: todayStr() + " " + nowTime(),
      });
      persistAll();
      renderMapsApp();
      showView("app");
    });
    trip.appendChild(done);
    view.appendChild(trip);
  }

  const listHost = el("div");
  listHost.appendChild(el("div", "empty-note", "Loading places…"));
  view.appendChild(listHost);
  loadMapDestinations().then((dests) => {
    listHost.replaceChildren();
    listHost.appendChild(el("div", "view-head", `${dests.length} destinations · mode ${mapMode}`));
    for (const d of dests) {
      const row = el("button", "row");
      row.type = "button";
      row.appendChild(el("span", "r-name", d.name));
      row.appendChild(el("span", "r-meta", `${d.region || "?"} · ${d.kind || "place"}`));
      row.appendChild(el("span", "r-hint", `Go ${mapMode} · ${etaFor(mapMode)}`));
      row.addEventListener("click", () => startTrip(d, mapMode));
      listHost.appendChild(row);
    }
  });
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
      sfx("ui.key", { target: $("#phone") });
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
      sfx("line.deny");
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
      ? "No texts yet. Type below — or CALL from the header."
      : "Nothing here."));
  }
  for (const m of msgs) log.appendChild(bubble(m.role === "caller" ? "caller" : "contact", m.text, m.ts || null));
  view.appendChild(log);

  if (contact) {
    const bar = el("div", "composer");
    const input = el("input");
    input.id = "sms-input";
    input.placeholder = "text message…";
    input.maxLength = 280;
    const send = el("button", "btn", "SEND");
    send.type = "button";
    const doSend = () => {
      const text = input.value.trim();
      if (!text) return;
      threads[key] = threads[key] || [];
      threads[key].push({ role: "caller", text, ts: todayStr() + " " + nowTime() });
      const hist = threads[key].map(m => ({ role: m.role === "you" ? "caller" : m.role, text: m.text }));
      try {
        const reply = Engine.respond(contact, hist, { date: DATE || undefined });
        if (reply && reply.text) {
          threads[key].push({
            role: "contact",
            text: reply.text,
            ts: todayStr() + " " + nowTime(),
          });
        }
      } catch {
        threads[key].push({
          role: "contact",
          text: "…",
          ts: todayStr() + " " + nowTime(),
        });
      }
      persistAll();
      openThread(key);
    };
    send.addEventListener("click", doSend);
    input.addEventListener("keydown", e => { if (e.key === "Enter") doSend(); });
    const callBtn = el("button", "btn", "CALL");
    callBtn.type = "button";
    callBtn.id = "btn-call-from-thread";
    callBtn.addEventListener("click", () => startCall(contact));
    const back = el("button", "btn ghost", "BACK");
    back.type = "button";
    back.addEventListener("click", () => showView("messages"));
    bar.append(input, send, callBtn, back);
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
  showView("call", { sfx: false });
  ringback();
  setTimeout(resolveDial, 2600);
}

function startOperatorCall(number, text, kind) {
  call = { contact: null, number, hist: [], state: "operator", t0: null, timer: null, outcome: kind };
  buildCallView(number, "");
  showView("call", { sfx: false });
  if (kind === "no-service") sfx("line.deny");
  else sfx("line.static");
  ringback();
  setTimeout(() => {
    if (!call || call.state !== "operator") return;
    $("#call-id").classList.remove("ringing");
    setCallStatus(kind === "intercept" ? "CONNECTED — OPERATOR" : "OPERATOR", "live");
    addCallBubble("contact", text);
    if (kind === "no-service") sfx("line.buzz");
    setTimeout(() => {
      if (!call || call.state !== "operator") return;
      setCallStatus("CALL ENDED", "ended");
      sfx("line.hangup");
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
  sfx("line.hangup");
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
  if (params.get("embed") === "1") document.documentElement.classList.add("embed");
  ensureSpam();
  startClock();
  TableslopSfx.load().then(() => {
    TableslopSfx.setEnabled(soundOn);
  }).catch(() => {});
  renderSoundToggle();
  $("#sb-sound").addEventListener("click", () => {
    soundOn = !soundOn;
    save("ip-phone-sound", soundOn);
    renderSoundToggle();
    sfx("ui.toggle", { force: true });
  });
  for (const btn of document.querySelectorAll(".softkeys [data-nav]")) {
    btn.addEventListener("click", () => {
      const nav = btn.dataset.nav;
      if (nav === "back") goBack();
      else showView(nav);
    });
  }
  updateBadge();
  const start = params.get("view");
  showView(
    start === "messages" || start === "contacts" || start === "keypad" ? start : "home",
    { skipStack: true, sfx: false }
  );

  // test hook: jump straight into a deterministic call for smokes
  const dialId = params.get("dial");
  if (dialId) {
    const contact = CONTACTS.find(c => c.id === dialId);
    if (contact) startCall(contact);
  }
}

boot();
