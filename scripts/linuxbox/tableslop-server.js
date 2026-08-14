#!/usr/bin/env node
/**
 * tableslop.org map endpoint — lightweight campaign map viewer for linuxbox.
 * Optional Discord OAuth (TABLESLOP_REQUIRE_DISCORD_AUTH=1) — see docs/tableslop-discord-auth.md
 *
 * Env: TABLESLOP_PORT (8765), TABLESLOP_HOST (127.0.0.1), TABLESLOP_CAMPAIGN (tropic-gooner)
 */
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { TableslopAuth, EDIT_ROLES } = require("./tableslop-auth.js");
const { writeRegistryFile, VersionConflictError } = require("./chars-registry-persist.js");
const { acquire: acquireStateLock, release: releaseStateLock } = require("./multitask-lock");
const {
  readWeatherState,
  writeWeatherState,
  ensureWeatherState,
  applyWeatherAction,
} = require("./tableslop-world-weather.js");
const {
  readRoadsIndex,
  readRoadsRegion,
  readRoadsAll,
  readLogisticsIndex,
  readLogisticsRoutes,
  readBoardIndex,
  readBoardThreads,
  writeBoardResolve,
  readWeatherPhenomenaIndex,
} = require("./tableslop-world-roads.js");
const {
  readModuleState,
  writeModuleState,
  applyModulePatch,
  readHighwaysLayerStatus,
} = require("./tableslop-world-sot.js");
const {
  tickEconomy,
  loadEconomy,
  saveEconomy,
  syncOverlayFromState,
  economyPath,
  overlayPath,
} = require("./tableslop-economy-sim.js");
const {
  loadAgents,
  saveAgents,
  tickAgents,
  seedFromRegistry,
} = require("./tableslop-agents-sim.js");

const REPO = path.resolve(__dirname, "../..");
const HOST = process.env.TABLESLOP_HOST || "127.0.0.1";
const PORT = parseInt(process.env.TABLESLOP_PORT || "8765", 10);
const CAMPAIGN = process.env.TABLESLOP_CAMPAIGN || "tropic-gooner";
const REQUIRE_AUTH = process.env.TABLESLOP_REQUIRE_DISCORD_AUTH === "1";
const DEV_AUTH = process.env.TABLESLOP_DEV_AUTH === "1";
// Dev stub needs a stable secret so sessions survive a restart; never used in prod
// (gating requires the real TABLESLOP_SESSION_SECRET — see OAUTH_CONFIGURED).
const SESSION_SECRET =
  process.env.TABLESLOP_SESSION_SECRET || (DEV_AUTH ? "tableslop-dev-only-insecure-secret" : "");
const OAUTH_CLIENT_ID = process.env.DISCORD_OAUTH_CLIENT_ID || "";
const OAUTH_CLIENT_SECRET = process.env.DISCORD_OAUTH_CLIENT_SECRET || "";
const OAUTH_REDIRECT = process.env.DISCORD_OAUTH_REDIRECT_URI || "";
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || "";
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const OWNER_DISCORD_ID = process.env.TABLESLOP_OWNER_DISCORD_ID || "";
const SESSION_COOKIE = "tableslop_session";
const SESSION_DAYS = 7;
/** Complete config = gating may engage. Half-configured deploys run open so the GM can never be locked out. */
const OAUTH_CONFIGURED = Boolean(
  OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET && OAUTH_REDIRECT && process.env.TABLESLOP_SESSION_SECRET
);
/** View is always public; gating only locks mutating endpoints behind login+role. */
const AUTH_GATING = REQUIRE_AUTH && (OAUTH_CONFIGURED || DEV_AUTH);
const AUTH_DB_PATH =
  process.env.TABLESLOP_AUTH_DB || path.join(REPO, "agents", "state", "tableslop-auth.db");
let authStore = null;

const CAMPAIGN_DIR = path.join(REPO, "campaigns", CAMPAIGN);
const MAP_JSON = path.join(CAMPAIGN_DIR, "map", "map.json");
const REGIONS_UI_JSON = path.join(CAMPAIGN_DIR, "map", "regions-ui.json");
const COORDS_JSON = path.join(CAMPAIGN_DIR, "map", "coords.json");
const LAYERS_JSON = path.join(CAMPAIGN_DIR, "map", "layers.json");
const REGIONS_BOARD = path.join(REPO, "projects", "tableslop", "regions.json");
/** Product roadmap (features/bugs/timeline) — not diegetic lore. */
const DEV_CALENDAR_JSON = path.join(REPO, "projects", "tableslop", "dev-calendar.json");
/** Same SoT as dashboard Chars — read-through only (writes stay on :8790). */
const REGISTRY_JSON = path.join(CAMPAIGN_DIR, "characters-registry.json");
const ENTITIES_JSON = path.join(CAMPAIGN_DIR, "wiki", "entities.json");
const WORLD_PAGE_ROOTS = ["story", "worldbuilding", "reports", "places", "characters", "Things and Places of Note", "Plot Lines"];
const WEATHER_LOCK = {
  repoRoot: REPO,
  acquire: acquireStateLock,
  release: releaseStateLock,
};
const SOT_LOCK = WEATHER_LOCK;
const FEEDBACK_DIR = path.join(REPO, "reports", "tableslop-feedback");
const USER_TASKS_JSON = path.join(REPO, "agents", "user-tasks.json");
const FEEDBACK_MAX_BYTES = 2.5 * 1024 * 1024;
/** Proxy player campaign trackers (:8768) under /camp on map.tableslop.org (optional interim; canonical = campaigns.tableslop.org). */
const CAMPAIGNS_ORIGIN =
  process.env.TABLESLOP_CAMPAIGNS_ORIGIN || "http://127.0.0.1:8768";
const CHAR_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const WORLD_PORTRAIT_MAX = 4 * 1024 * 1024;
/**
 * Unique region shade palette (R1–R17) — map fills/strokes only.
 * Neon/vaporwave stays on HUD chrome only. Opacity owned by CSS fill-opacity (~0.28).
 * Pin accents: CITY_PIN_PALETTE / markers[].pin_color (also unique per city).
 */
const REGION_SHADE_PALETTE = {
  1: { fill: "#c4a035", stroke: "#8a7020" },
  2: { fill: "#3d7a9e", stroke: "#2a5570" },
  3: { fill: "#2a8f7a", stroke: "#1d6556" },
  4: { fill: "#c17a28", stroke: "#8a561c" },
  5: { fill: "#5a9a45", stroke: "#3f6e30" },
  6: { fill: "#b85a6a", stroke: "#82404c" },
  7: { fill: "#6a7088", stroke: "#4a5060" },
  8: { fill: "#d4a820", stroke: "#957518" },
  9: { fill: "#2d7a4e", stroke: "#1f5536" },
  10: { fill: "#b8734a", stroke: "#825234" },
  11: { fill: "#3a8a85", stroke: "#28615e" },
  12: { fill: "#7a6e5a", stroke: "#554c3e" },
  13: { fill: "#a06a2e", stroke: "#704a20" },
  14: { fill: "#4a7a9e", stroke: "#345670" },
  15: { fill: "#8a5a9e", stroke: "#5f3e6e" },
  16: { fill: "#5a6e9e", stroke: "#3e4c6e" },
  17: { fill: "#2e8a6a", stroke: "#20604a" },
};
/** Unique pin ring/fill per city (map data — not HUD neon). */
const CITY_PIN_PALETTE = {
  1: "#e8c547",
  2: "#5eb0d9",
  3: "#3ec9ad",
  4: "#e89a3c",
  5: "#7bc45e",
  6: "#e07a8c",
  7: "#9aa3b8",
  8: "#f0c530",
  9: "#45b06e",
  10: "#e09262",
  11: "#52c4bd",
  12: "#c4b08a",
  13: "#d49248",
  14: "#6aabd4",
  15: "#b47acc",
  16: "#7a94d4",
  17: "#48c498",
};
function regionShadePaint(regionNum) {
  const n = Math.max(1, Number(regionNum) || 1);
  return REGION_SHADE_PALETTE[n] || REGION_SHADE_PALETTE[((n - 1) % 17) + 1] || REGION_SHADE_PALETTE[1];
}
function cityPinColor(markerOrRegion) {
  if (markerOrRegion && typeof markerOrRegion === "object") {
    if (markerOrRegion.pin_color) return String(markerOrRegion.pin_color);
    const n = Number(markerOrRegion.region) || 0;
    if (n && CITY_PIN_PALETTE[n]) return CITY_PIN_PALETTE[n];
  }
  const n = Math.max(1, Number(markerOrRegion) || 1);
  return CITY_PIN_PALETTE[n] || CITY_PIN_PALETTE[((n - 1) % 17) + 1] || "#c4a035";
}
/** Canonical id → Character Images/<Folder>/ — same map as dashboard (no inventing faces). */
const CHAR_IMAGE_FOLDER_BY_ID = {
  "ellaine-mishpit": "Ellaine",
  "harper-maupin": "Harper",
  "sister-minerva": "Minerva",
  "nelly-stein": "Nelly",
  "redmond-red-gallagher": "Redmond",
  toga: "Toga",
};

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifySession(token) {
  if (!token || !SESSION_SECRET) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expect = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

/** Secure only when the public origin is https (prod via cloudflared); plain http on LAN/dev. */
function cookieSecureFlag() {
  return OAUTH_REDIRECT.startsWith("https://") ? "; Secure" : "";
}

/** Cookie holds an opaque signed session id; user data/tokens live server-side in the DB. */
function sessionCookieValue(sid, expMs) {
  const token = signSession({ sid, exp: expMs });
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${cookieSecureFlag()}`;
}

function clearSessionCookieValue() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`;
}

function sessionFromReq(req) {
  if (!authStore) return { id: "public", username: "guest" };
  const cookies = parseCookies(req.headers.cookie);
  const data = verifySession(cookies[SESSION_COOKIE]);
  if (!data || !data.sid) return null;
  return authStore.getSessionUser(data.sid);
}

/** null = allowed; otherwise { code, error } to send. Edit = owner/admin only when gating is on. */
function editGate(session) {
  if (!AUTH_GATING) return null;
  if (!session) return { code: 401, error: "login required to edit" };
  if (!EDIT_ROLES.has(session.role)) {
    return { code: 403, error: `role '${session.role}' cannot edit — ask the GM for admin` };
  }
  return null;
}

async function isGuildMember(userId) {
  if (!DISCORD_GUILD_ID || !DISCORD_BOT_TOKEN) return false;
  const r = await fetch(`https://discord.com/api/guilds/${DISCORD_GUILD_ID}/members/${userId}`, {
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
  });
  return r.status === 200;
}

/** Dedicated Discord login page — public; OAuth button only when env is complete. */
function loginPageHtml() {
  const configured = OAUTH_CONFIGURED;
  const gating = AUTH_GATING;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Login · tableslop</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=VT323&display=swap" rel="stylesheet"/>
<style>
  :root {
    --void:#0d0221; --panel:#16082a; --text:#f8f0ff; --muted:#9a8ab8;
    --pink:#ff71ce; --cyan:#01cdfe; --purple:#b967ff; --sun:#fffb96;
    --glow-pink:rgba(255,113,206,.35); --glow-cyan:rgba(1,205,254,.3);
  }
  * { box-sizing:border-box; }
  body {
    margin:0; min-height:100vh; font-family:VT323,monospace; color:var(--text);
    background:
      radial-gradient(ellipse at 20% 0%, rgba(185,103,255,.25), transparent 50%),
      radial-gradient(ellipse at 80% 100%, rgba(1,205,254,.18), transparent 45%),
      linear-gradient(180deg, #12061f, var(--void));
    display:flex; align-items:center; justify-content:center; padding:24px;
  }
  .card {
    width:min(420px, 100%);
    padding:28px 26px 24px;
    background:linear-gradient(180deg, rgba(22,8,42,.98), rgba(13,2,33,.98));
    border:2px solid transparent;
    border-image:linear-gradient(90deg, var(--pink), var(--cyan), var(--purple)) 1;
    box-shadow:0 0 40px rgba(255,113,206,.12);
  }
  .brand {
    font:700 .95rem Orbitron,sans-serif; letter-spacing:.2em; text-transform:uppercase;
    background:linear-gradient(90deg, var(--pink), var(--cyan));
    -webkit-background-clip:text; background-clip:text; color:transparent;
  }
  h1 {
    margin:10px 0 6px; font:700 1.35rem Orbitron,sans-serif; letter-spacing:.06em;
    color:var(--sun); text-shadow:0 0 16px rgba(255,251,150,.35);
  }
  p { margin:0 0 12px; color:var(--muted); font-size:1.15rem; line-height:1.35; }
  .roles { margin:14px 0 18px; padding:10px 12px; border:1px solid rgba(185,103,255,.35); font-size:1.05rem; color:var(--muted); }
  .roles strong { color:var(--cyan); font-weight:400; }
  .cta {
    display:block; text-align:center; text-decoration:none;
    font:700 .8rem Orbitron,sans-serif; letter-spacing:.1em; text-transform:uppercase;
    padding:14px 16px; border:1px solid var(--cyan); color:var(--cyan);
    background:rgba(1,205,254,.1); box-shadow:0 0 16px var(--glow-cyan);
  }
  .cta:hover { border-color:var(--pink); color:var(--pink); box-shadow:0 0 18px var(--glow-pink); }
  .cta[aria-disabled="true"] { opacity:.45; pointer-events:none; }
  .status { margin-top:14px; font-size:1.05rem; color:var(--muted); min-height:1.2em; }
  .status.ok { color:var(--cyan); }
  .status.warn { color:var(--sun); }
  .back { display:inline-block; margin-top:18px; color:var(--purple); text-decoration:none; font-size:1.1rem; }
  .back:hover { color:var(--pink); }
</style>
</head>
<body>
  <main class="card">
    <div class="brand">tableslop</div>
    <h1>Map login</h1>
    <p>View the island map without signing in. Login with Discord to edit borders, pins, and (for the GM) manage who can edit.</p>
    <div class="roles">
      <div><strong>owner</strong> — edit + grant/revoke roles</div>
      <div><strong>admin</strong> — edit map</div>
      <div><strong>user</strong> — view + play features</div>
    </div>
    <a class="cta" id="discordBtn" href="/auth/discord" ${configured ? "" : 'aria-disabled="true"'}>Login with Discord</a>
    <div class="status" id="status">${configured ? (gating ? "Auth ready — edits require login." : "Discord connected — gating off until TABLESLOP_REQUIRE_DISCORD_AUTH=1.") : "Discord OAuth env not on this server yet — GM must finish portal secrets."}</div>
    <a class="back" href="/">← Back to map</a>
  </main>
<script>
(async function () {
  const status = document.getElementById('status');
  const btn = document.getElementById('discordBtn');
  try {
    const me = await fetch('/api/me').then(function (r) { return r.json(); });
    if (me.logged_in) {
      status.className = 'status ok';
      status.textContent = 'Signed in as @' + (me.username || me.id) + (me.role ? ' · ' + me.role : '') + '.';
      btn.textContent = 'Open map';
      btn.href = '/';
      btn.removeAttribute('aria-disabled');
      return;
    }
    if (me.discord_configured) {
      status.className = 'status ok';
      status.textContent = me.auth_gating
        ? 'Ready — login required to edit. Owner manages roles after login.'
        : 'Discord ready (edit gate off).';
      btn.removeAttribute('aria-disabled');
    } else {
      status.className = 'status warn';
      status.textContent = 'Waiting on Discord OAuth client secret + owner id on potato (~/.linuxbox-tableslop/.env).';
      btn.setAttribute('aria-disabled', 'true');
    }
  } catch (e) {
    status.className = 'status warn';
    status.textContent = 'Could not read /api/me — try the map anyway.';
  }
})();
</script>
</body>
</html>`;
}

function worldPageHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>World editor — Isla Primavera</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=VT323&family=Share+Tech+Mono&display=swap" rel="stylesheet"/>
<script defer src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script defer src="/wiki-entity-links.js?v=20260808-world"></script>
<style>
  :root { --void:#050208; --panel:#0d0616; --text:#f7ecff; --muted:#a98fc4; --pink:#ff71ce; --cyan:#01cdfe; --sun:#fffb96; --purple:#b967ff; --lime:#c8ff4d; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; background:radial-gradient(circle at 20% 0%, rgba(185,103,255,.22), transparent 34%), radial-gradient(circle at 90% 10%, rgba(1,205,254,.16), transparent 30%), var(--void); color:var(--text); font-family:"Share Tech Mono", ui-monospace, monospace; }
  a { color:var(--cyan); }
  header { display:flex; align-items:center; flex-wrap:wrap; gap:12px; padding:12px 16px; border-bottom:1px solid rgba(185,103,255,.35); background:rgba(5,2,8,.88); position:sticky; top:0; z-index:5; }
  .brand { font:700 .95rem Orbitron,sans-serif; letter-spacing:.14em; text-transform:uppercase; color:var(--pink); text-shadow:0 0 14px rgba(255,113,206,.45); }
  .title { font:700 .78rem Orbitron,sans-serif; letter-spacing:.12em; text-transform:uppercase; color:var(--sun); }
  .spacer { flex:1; }
  .chip { border:1px solid var(--purple); border-radius:999px; padding:4px 10px; color:var(--muted); font-size:.72rem; }
  .btn { font:inherit; font-size:.74rem; letter-spacing:.08em; text-transform:uppercase; color:var(--cyan); background:rgba(1,205,254,.08); border:1px solid var(--cyan); border-radius:4px; padding:7px 10px; cursor:pointer; text-decoration:none; display:inline-block; }
  .btn:hover { box-shadow:0 0 12px rgba(1,205,254,.35); }
  .mods { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
  .modbtn { font:inherit; font-size:.7rem; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); background:transparent; border:1px solid rgba(169,143,196,.4); border-radius:999px; padding:6px 10px; cursor:pointer; }
  .modbtn.is-active { color:var(--sun); border-color:var(--sun); background:rgba(255,251,150,.08); }
  .places-grid, .docs-grid { display:grid; grid-template-columns:minmax(240px,320px) minmax(0,1fr); gap:14px; align-items:start; }
  .btn.warn { color:var(--sun); border-color:var(--sun); background:rgba(255,251,150,.08); }
  .btn.danger { color:var(--pink); border-color:var(--pink); background:rgba(255,113,206,.08); }
  main { padding:16px; }
  #gate { max-width:680px; margin:12vh auto; padding:22px; border:1px solid var(--purple); border-radius:10px; background:rgba(13,6,22,.92); }
  [hidden] { display: none !important; }
  #app { display:grid; grid-template-columns:minmax(220px,260px) minmax(0,1fr) minmax(300px,360px); gap:14px; align-items:start; }
  .col { border:1px solid rgba(185,103,255,.32); border-radius:10px; background:rgba(13,6,22,.86); min-height:calc(100vh - 92px); }
  .col h2 { margin:0; padding:12px 14px; border-bottom:1px solid rgba(185,103,255,.25); font:700 .72rem Orbitron,sans-serif; letter-spacing:.12em; text-transform:uppercase; color:var(--purple); }
  .pad { padding:12px 14px; }
  .roster-tools { display:grid; gap:8px; }
  input, select, textarea { width:100%; font:inherit; color:var(--text); background:rgba(5,2,8,.9); border:1px solid rgba(169,143,196,.55); border-radius:5px; padding:8px 9px; }
  textarea { min-height:150px; resize:vertical; line-height:1.4; }
  label { display:block; margin:10px 0 4px; color:var(--muted); font-size:.68rem; letter-spacing:.08em; text-transform:uppercase; }
  .row { display:flex; gap:8px; align-items:center; }
  .row > * { flex:1; }
  .roster { list-style:none; margin:12px 0 0; padding:0; display:grid; gap:8px; max-height:calc(100vh - 250px); overflow:auto; }
  .rost { width:100%; text-align:left; display:grid; grid-template-columns:44px 1fr; gap:10px; align-items:center; padding:8px; border:1px solid rgba(1,205,254,.25); border-radius:8px; background:rgba(1,205,254,.05); color:var(--text); cursor:pointer; }
  .rost:hover, .rost.is-active { border-color:var(--pink); background:rgba(255,113,206,.1); }
  .rost img { width:44px; height:44px; object-fit:cover; border-radius:6px; border:1px solid rgba(185,103,255,.5); }
  .rost .face { width:44px; height:44px; border-radius:6px; display:grid; place-items:center; border:1px solid rgba(185,103,255,.5); color:var(--sun); font:700 1rem Orbitron,sans-serif; }
  .rost strong { display:block; font-size:.92rem; }
  .rost span { display:block; color:var(--muted); font-size:.68rem; margin-top:2px; }
  .sheet-wrap { padding:0; }
  .sheet-head { display:flex; gap:12px; align-items:center; padding:14px 16px; border-bottom:1px solid rgba(185,103,255,.25); }
  .sheet-head img { width:92px; height:92px; object-fit:cover; border-radius:10px; border:1px solid var(--cyan); box-shadow:0 0 18px rgba(1,205,254,.28); }
  .sheet-head .face { width:92px; height:92px; border-radius:10px; display:grid; place-items:center; border:1px solid var(--cyan); color:var(--sun); font:700 2rem Orbitron,sans-serif; }
  .sheet-head h1 { margin:0; font:700 clamp(1.5rem, 3vw, 2.6rem) Orbitron,sans-serif; letter-spacing:.04em; color:var(--text); }
  .sheet-head p { margin:4px 0 0; color:var(--muted); }
  .sheet { padding:18px clamp(16px, 3vw, 34px) 30px; font-size:1.02rem; line-height:1.62; }
  .sheet h1, .sheet h2, .sheet h3 { font-family:Orbitron,sans-serif; letter-spacing:.05em; }
  .sheet h2 { margin-top:1.4em; padding-top:.7em; border-top:1px solid rgba(1,205,254,.25); color:var(--cyan); }
  .sheet img { max-width:100%; }
  .checks { display:grid; gap:7px; margin-top:10px; }
  .check { display:flex; gap:8px; align-items:flex-start; padding:7px 8px; border:1px solid rgba(169,143,196,.25); border-radius:6px; color:var(--muted); font-size:.74rem; }
  .check.ok { border-color:rgba(200,255,77,.45); color:var(--lime); }
  .check.miss { border-color:rgba(255,113,206,.45); color:var(--pink); }
  .status { min-height:1.2em; margin-top:10px; color:var(--sun); font-size:.78rem; }
  .rel { display:flex; gap:6px; align-items:center; margin:6px 0; color:var(--muted); font-size:.74rem; }
  .rel button { flex:0 0 auto; }
  .dash-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }
  .dash-card { border:1px solid rgba(1,205,254,.35); border-radius:10px; background:linear-gradient(160deg,rgba(1,205,254,.08),rgba(185,103,255,.08)); padding:14px; cursor:pointer; }
  .dash-card.is-active { border-color:var(--sun); box-shadow:0 0 14px rgba(255,251,150,.25); }
  .dash-card h3 { margin:0 0 6px; font:700 .78rem Orbitron,sans-serif; letter-spacing:.1em; text-transform:uppercase; color:var(--cyan); }
  .dash-card .city { font:700 1.15rem Orbitron,sans-serif; color:var(--sun); margin:0 0 4px; }
  .dash-card .metric { display:flex; justify-content:space-between; gap:8px; margin:4px 0; font-size:.8rem; color:var(--muted); }
  .dash-card .metric b { color:var(--text); font-weight:700; }
  .dash-card .big { font:700 2rem Orbitron,sans-serif; color:var(--pink); line-height:1; }
  .forecast { display:flex; gap:6px; overflow:auto; margin-top:10px; padding-bottom:4px; }
  .fday { flex:0 0 72px; border:1px solid rgba(169,143,196,.35); border-radius:6px; padding:6px; text-align:center; font-size:.68rem; color:var(--muted); background:rgba(5,2,8,.55); }
  .fday strong { display:block; color:var(--text); font-size:.85rem; margin:4px 0; }
  .risk-high { color:var(--pink); }
  .risk-moderate { color:var(--sun); }
  .risk-low { color:var(--lime); }
  .dash-meta { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 14px; align-items:center; }
  .bulk-bar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:0 0 12px; padding:10px; border:1px solid rgba(185,103,255,.28); border-radius:8px; background:rgba(5,2,8,.45); }
  .bulk-bar .chip { margin:0; }
  .detail-panel { margin-top:14px; border:1px solid rgba(255,251,150,.35); border-radius:10px; background:rgba(13,6,22,.92); padding:14px; }
  .detail-panel h3 { margin:0 0 10px; font:700 .72rem Orbitron,sans-serif; letter-spacing:.1em; text-transform:uppercase; color:var(--sun); }
  .rost-row { display:grid; grid-template-columns:22px 1fr; gap:8px; align-items:center; }
  .rost-row input[type=checkbox] { width:auto; margin:0; }
  .dash-table { width:100%; border-collapse:collapse; font-size:.78rem; margin-top:8px; }
  .dash-table th, .dash-table td { border-bottom:1px solid rgba(185,103,255,.2); padding:7px 6px; text-align:left; vertical-align:top; }
  .dash-table th { color:var(--purple); font:700 .68rem Orbitron,sans-serif; letter-spacing:.08em; text-transform:uppercase; }
  details.source { margin-top:16px; border:1px solid rgba(169,143,196,.35); border-radius:8px; background:rgba(5,2,8,.55); }
  details.source summary { cursor:pointer; padding:10px 12px; color:var(--muted); font-size:.74rem; letter-spacing:.08em; text-transform:uppercase; }
  details.source .src-body { padding:0 12px 12px; }
  .doc-title { font-size:.92rem; }
  .doc-sub { color:var(--muted); font-size:.68rem; }
  .node-row { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; align-items:stretch; }
  .node-box { border:1px solid rgba(1,205,254,.4); border-radius:10px; background:rgba(13,6,22,.9); min-height:320px; display:flex; flex-direction:column; }
  .node-box h2 { margin:0; padding:12px 14px; border-bottom:1px solid rgba(1,205,254,.25); font:700 .72rem Orbitron,sans-serif; letter-spacing:.12em; text-transform:uppercase; color:var(--cyan); }
  .node-box .pad { flex:1; }
  .node-drop { border:1px dashed rgba(185,103,255,.55); border-radius:8px; min-height:180px; display:grid; place-items:center; text-align:center; color:var(--muted); font-size:.78rem; padding:12px; cursor:pointer; background:rgba(5,2,8,.55); }
  .node-drop.is-hot { border-color:var(--sun); color:var(--sun); }
  .node-drop img { max-width:100%; max-height:200px; border-radius:6px; border:1px solid rgba(1,205,254,.45); }
  .node-plumb { margin-top:14px; display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
  .node-hint { color:var(--muted); font-size:.74rem; line-height:1.4; margin:0 0 10px; }
  @media (max-width: 900px) { #app { grid-template-columns:1fr; } .col { min-height:auto; } .roster { max-height:40vh; } .sheet-wrap { order:-2; } .edit-wrap { order:-1; } .places-grid, .docs-grid { grid-template-columns:1fr; } .node-row { grid-template-columns:1fr; } }
</style>
</head>
<body>
<header>
  <span class="brand">tableslop</span>
  <span class="title">World editor</span>
  <span class="chip" id="who">checking…</span>
  <span class="chip" id="worldErr" hidden style="border-color:var(--pink);color:var(--pink)"></span>
  <span class="spacer"></span>
  <nav class="mods" id="mods" aria-label="World modules">
    <button class="modbtn is-active" type="button" data-mod="cast">Cast</button>
    <button class="modbtn" type="button" data-mod="ingest">Quick create</button>
    <button class="modbtn" type="button" data-mod="places">Places</button>
    <button class="modbtn" type="button" data-mod="docs">Stories &amp; notes</button>
    <button class="modbtn" type="button" data-mod="regions">Regions</button>
    <button class="modbtn" type="button" data-mod="climate">Weather</button>
    <button class="modbtn" type="button" data-mod="agriculture">Agriculture</button>
    <button class="modbtn" type="button" data-mod="economy">Economy</button>
    <button class="modbtn" type="button" data-mod="sim">People sim</button>
    <button class="modbtn" type="button" data-mod="transport">Transport</button>
  </nav>
  <span class="spacer"></span>
  <a class="btn" href="/">← Map</a>
  <a class="btn danger" href="/auth/logout">Logout</a>
</header>
<main>
  <section id="gate" hidden>
    <h1 style="font:700 1.2rem Orbitron,sans-serif">World editor locked</h1>
    <p id="gateMsg" style="color:var(--muted)">Checking access…</p>
    <p><a class="btn" id="gateLink" href="/login?next=/world">Continue</a></p>
  </section>
  <section id="app" class="mod" hidden>
    <aside class="col">
      <h2>Cast</h2>
      <div class="pad roster-tools">
        <input id="q" placeholder="Search name / alias / notes" autocomplete="off"/>
        <div class="row">
          <input id="newName" placeholder="New character name"/>
          <button class="btn" id="addBtn" type="button" style="flex:0 0 auto">Add</button>
        </div>
        <div class="bulk-bar" id="castBulkBar">
          <span class="chip" id="castBulkCount">0 selected</span>
          <select id="bulkRole" style="flex:0 0 90px"><option value="">role…</option><option value="pc">pc</option><option value="npc">npc</option><option value="side">side</option><option value="gm">gm</option></select>
          <input id="bulkStatus" placeholder="status" style="flex:1 1 90px"/>
          <button class="btn" id="bulkHideBtn" type="button">Hide</button>
          <button class="btn" id="bulkUnhideBtn" type="button">Unhide</button>
          <button class="btn warn" id="bulkApplyBtn" type="button">Apply</button>
        </div>
        <div class="chip" id="regMeta">registry …</div>
      </div>
      <ul class="roster pad" id="roster"></ul>
    </aside>
    <section class="col sheet-wrap">
      <div class="sheet-head" id="sheetHead"></div>
      <article class="sheet" id="sheet"></article>
    </section>
    <aside class="col edit-wrap">
      <h2>Edit</h2>
      <div class="pad">
        <label for="f_name">Display name</label><input id="f_name"/>
        <div class="row">
          <div><label for="f_role">Role</label><select id="f_role"><option value="pc">pc</option><option value="npc">npc</option><option value="side">side</option><option value="gm">gm</option></select></div>
          <div><label for="f_status">Status</label><input id="f_status" placeholder="active / hiatus / dead"/></div>
        </div>
        <label for="f_player">Player</label><input id="f_player"/>
        <label for="f_aliases">Aliases (comma)</label><input id="f_aliases"/>
        <label for="f_story">Sheet path (.md)</label><input id="f_story" placeholder="characters/name.md"/>
        <label for="f_image">Primary portrait path</label><select id="f_image"></select>
        <label style="display:flex;align-items:center;gap:8px"><input id="f_hidden" type="checkbox" style="width:auto"/> Hidden / stub</label>
        <label for="f_notes">Notes</label><textarea id="f_notes" placeholder="GM notes, additions, WoD fit notes"></textarea>
        <h3 style="margin:16px 0 6px;color:var(--cyan);font:700 .68rem Orbitron,sans-serif;letter-spacing:.1em;text-transform:uppercase">WoD fit check</h3>
        <div class="checks" id="checks"></div>
        <h3 style="margin:16px 0 6px;color:var(--cyan);font:700 .68rem Orbitron,sans-serif;letter-spacing:.1em;text-transform:uppercase">Relations</h3>
        <div id="rels"></div>
        <div class="row">
          <select id="relTo"></select>
          <input id="relType" placeholder="type" value="related"/>
          <button class="btn" id="relAdd" type="button" style="flex:0 0 auto">Add</button>
        </div>
        <div class="row" style="margin-top:14px">
          <button class="btn warn" id="saveBtn" type="button">Save character</button>
          <button class="btn" id="reloadBtn" type="button">Reload</button>
        </div>
        <div class="status" id="status"></div>
      </div>
    </aside>
  </section>
  <section id="mod-ingest" class="mod" hidden>
    <div class="col" style="min-height:calc(100vh - 92px)">
      <h2>Quick create · boxes</h2>
      <div class="pad">
        <p class="node-hint">Fill any box alone, or plumb them together. Store-only — no LLM expand. Portrait accepts drop, paste, file, or image URL. Info dump becomes notes; optional sheet write.</p>
        <div class="node-row">
          <article class="node-box" id="boxPortrait">
            <h2>1 · Portrait</h2>
            <div class="pad">
              <div class="node-drop" id="ingestDrop" tabindex="0">Drop / paste image<br/><span style="opacity:.7">or click to choose file</span></div>
              <input id="ingestFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden/>
              <label for="ingestUrl" style="margin-top:10px">Image URL</label>
              <div class="row">
                <input id="ingestUrl" placeholder="https://…"/>
                <button class="btn" id="ingestUrlBtn" type="button" style="flex:0 0 auto">Load</button>
              </div>
              <button class="btn danger" id="ingestClearImg" type="button" style="margin-top:8px">Clear portrait</button>
            </div>
          </article>
          <article class="node-box" id="boxIdentity">
            <h2>2 · Identity</h2>
            <div class="pad">
              <label for="ingestName">Display name</label><input id="ingestName" placeholder="Required to create"/>
              <div class="row">
                <div><label for="ingestRole">Role</label><select id="ingestRole"><option value="npc">npc</option><option value="pc">pc</option><option value="side">side</option><option value="gm">gm</option></select></div>
                <div><label for="ingestCharStatus">Status</label><input id="ingestCharStatus" value="draft"/></div>
              </div>
              <label for="ingestAliases">Aliases (comma)</label><input id="ingestAliases"/>
              <label for="ingestPlayer">Player</label><input id="ingestPlayer"/>
              <label style="display:flex;align-items:center;gap:8px;margin-top:10px"><input id="ingestHidden" type="checkbox" style="width:auto"/> Hidden / stub</label>
            </div>
          </article>
          <article class="node-box" id="boxInfo">
            <h2>3 · Info dump</h2>
            <div class="pad">
              <label for="ingestNotes">Paste bio / Discord / notes</label>
              <textarea id="ingestNotes" style="min-height:160px" placeholder="Anything useful — creed, look, age, clothing…"></textarea>
              <label style="display:flex;align-items:center;gap:8px;margin-top:10px"><input id="ingestAsSheet" type="checkbox" style="width:auto" checked/> Also write characters/&lt;id&gt;.md sheet from dump</label>
              <label for="ingestSheet" style="margin-top:8px">Or paste full sheet markdown</label>
              <textarea id="ingestSheet" style="min-height:100px" placeholder="Optional ## Look / ## Speech / …"></textarea>
            </div>
          </article>
        </div>
        <div class="node-plumb">
          <button class="btn warn" id="ingestCreateBtn" type="button">Create character (plumb boxes)</button>
          <button class="btn" id="ingestApplyPortraitBtn" type="button">Apply portrait → selected Cast</button>
          <button class="btn" id="ingestClearBtn" type="button">Clear boxes</button>
          <span class="chip" id="ingestMeta">boxes idle</span>
        </div>
        <div class="status" id="ingestMsg"></div>
      </div>
    </div>
  </section>
  <section id="mod-places" class="mod" hidden>
    <div class="places-grid">
      <aside class="col">
        <h2>Places &amp; orgs</h2>
        <div class="pad roster-tools">
          <input id="eq" placeholder="Search name / alias / fact" autocomplete="off"/>
          <div class="row">
            <input id="eNewName" placeholder="New place/org name"/>
            <select id="eNewKind" style="flex:0 0 104px"><option value="place">place</option><option value="org">org</option><option value="school">school</option><option value="faction">faction</option><option value="year">year</option></select>
            <button class="btn" id="eAddBtn" type="button" style="flex:0 0 auto">Add</button>
          </div>
          <div class="bulk-bar" id="entBulkBar">
            <span class="chip" id="entBulkCount">0 selected</span>
            <select id="eBulkKind" style="flex:0 0 100px"><option value="">kind…</option><option value="place">place</option><option value="org">org</option><option value="school">school</option><option value="faction">faction</option><option value="year">year</option></select>
            <input id="eBulkRegion" placeholder="region_id" list="regionList" style="flex:1 1 100px"/>
            <button class="btn warn" id="eBulkApplyBtn" type="button">Apply</button>
          </div>
          <div class="chip" id="entMeta">entities …</div>
        </div>
        <ul class="roster pad" id="entList"></ul>
      </aside>
      <section class="col">
        <h2>Place editor</h2>
        <div class="pad">
          <label for="e_id">Id</label><input id="e_id" readonly/>
          <div class="row">
            <div><label for="e_kind">Kind</label><input id="e_kind" list="kindList"/><datalist id="kindList"><option value="place"></option><option value="org"></option><option value="school"></option><option value="faction"></option><option value="year"></option></datalist></div>
            <div><label for="e_region">Region</label><input id="e_region" list="regionList"/><datalist id="regionList"></datalist></div>
          </div>
          <label for="e_name">Name</label><input id="e_name"/>
          <label for="e_aliases">Aliases (comma)</label><input id="e_aliases"/>
          <label for="e_location">Location</label><input id="e_location"/>
          <label for="e_facts">Facts (one per line)</label><textarea id="e_facts"></textarea>
          <label for="e_related">Related entity ids (comma)</label><input id="e_related"/>
          <div class="row" style="margin-top:14px">
            <button class="btn warn" id="eSaveBtn" type="button">Save place</button>
            <button class="btn" id="eReloadBtn" type="button">Reload</button>
          </div>
          <div class="status" id="estatus"></div>
        </div>
      </section>
    </div>
  </section>
  <section id="mod-docs" class="mod" hidden>
    <div class="docs-grid">
      <aside class="col">
        <h2>Stories &amp; notes</h2>
        <div class="pad roster-tools">
          <input id="dq" placeholder="Search title / folder" autocomplete="off"/>
          <div class="chip" id="docMeta">pages …</div>
        </div>
        <ul class="roster pad" id="docList"></ul>
      </aside>
      <section class="col">
        <h2 id="docTitle">Page</h2>
        <div class="pad">
          <div class="chip" id="docPath">pick a page</div>
          <div id="docPreview" class="sheet" style="min-height:120px;margin:10px 0;padding:12px;border:1px solid rgba(185,103,255,.25);border-radius:8px;background:rgba(5,2,8,.4)"></div>
          <details class="source" id="docSource">
            <summary>Advanced · edit markdown source</summary>
            <div class="src-body">
              <label for="docText">Markdown</label>
              <textarea id="docText" style="min-height:calc(100vh - 420px)"></textarea>
              <div class="row" style="margin-top:14px">
                <button class="btn warn" id="docSaveBtn" type="button">Save page</button>
                <button class="btn" id="docReloadBtn" type="button">Reload</button>
              </div>
            </div>
          </details>
          <div class="status" id="dstatus"></div>
        </div>
      </section>
    </div>
  </section>
  <section id="mod-sot" class="mod" hidden>
    <div class="col" style="min-height:calc(100vh - 92px)">
      <h2 id="sotTitle">World dashboard</h2>
      <div class="pad">
        <p id="sotBlurb" style="color:var(--muted);font-size:.82rem;line-height:1.45;margin:0 0 12px"></p>
        <div class="dash-meta">
          <span class="chip" id="sotMetaChip">…</span>
          <button class="btn" id="sotReloadBtn" type="button">Reload</button>
          <a class="btn" href="/" id="sotMapLink">← Map</a>
        </div>
        <div class="bulk-bar" id="sotBulkBar" hidden>
          <span class="chip">Bulk</span>
          <button class="btn warn" id="weatherGenBtn" type="button" hidden>Regenerate</button>
          <button class="btn" id="weatherPlus1Btn" type="button" hidden>+1 day</button>
          <button class="btn" id="weatherPlus7Btn" type="button" hidden>+7 days</button>
          <input id="weatherDateInput" type="date" hidden style="flex:0 0 auto;width:auto"/>
          <button class="btn" id="weatherSetDateBtn" type="button" hidden>Set date</button>
          <button class="btn warn" id="economyTickBtn" type="button" hidden>Tick +1 day</button>
          <button class="btn" id="economyTick7Btn" type="button" hidden>Tick +7</button>
          <button class="btn warn" id="simTickBtn" type="button" hidden>Sim day +1</button>
          <button class="btn" id="simTick7Btn" type="button" hidden>Sim +7</button>
          <button class="btn warn" id="sotDetailSaveBtn" type="button" hidden>Save detail</button>
        </div>
        <div id="sotDash" class="dash-grid"></div>
        <div id="sotDetail" class="detail-panel" hidden>
          <h3 id="sotDetailTitle">Detail</h3>
          <div id="sotDetailBody"></div>
        </div>
        <div class="status" id="sotStatus"></div>
        <details class="source" id="sotSource">
          <summary>Advanced · view source notes</summary>
          <div class="src-body">
            <p id="sotPathHint" style="color:var(--muted);font-size:.72rem;margin:0 0 8px"></p>
            <label for="sotText">Notes (markdown export / lore)</label>
            <textarea id="sotText" style="min-height:240px"></textarea>
            <div class="row" style="margin-top:10px">
              <button class="btn warn" id="sotSaveBtn" type="button">Save notes</button>
            </div>
          </div>
        </details>
      </div>
    </div>
  </section>
</main>
<script>
(function () {
  let me = null;
  let reg = null;
  let active = null;
  let sheetMd = '';
  let rels = [];
  let castBound = false;
  let modsBound = false;
  const SOT_MODS = {
    regions: {
      path: 'worldbuilding/REGIONS.md',
      title: 'Regions',
      kind: 'regions',
      blurb: 'Focus-city cards for play. Borders stay on the map (GM draw) — this is not the polygon editor.'
    },
    climate: {
      path: 'worldbuilding/CLIMATE.md',
      title: 'Weather',
      kind: 'weather',
      blurb: 'Generated conditions by city (deterministic from diegetic date + seed). Lore band: 75–88°F, 70–90% humidity, wet May–Oct / dry Nov–Apr · present lock 2019.'
    },
    agriculture: {
      path: 'worldbuilding/AGRICULTURE.md',
      title: 'Agriculture',
      kind: 'agriculture',
      blurb: 'Crops, fleets, and cold-chain logistics as structured cards. Source notes stay collapsed.'
    },
    economy: {
      path: 'worldbuilding/ECONOMY.md',
      title: 'Economy',
      kind: 'economy',
      blurb: 'Full sim: water · minerals · other stocks → commodity prices. Tick = one diegetic day. Does not move city pins.'
    },
    sim: {
      path: 'docs/plans/tableslop-deterministic-sim-2026-08-10.md',
      title: 'People sim',
      kind: 'sim',
      blurb: 'Deterministic needs/wants/quirks per visible cast — no LLM. Coupled to commodity prices. Use Tick for a full island day.'
    },
    transport: {
      path: 'worldbuilding/TRANSPORT.md',
      title: 'Transport',
      kind: 'transport',
      blurb: 'Modes and play notes. Green map lines = highways/freeways. Roads overlay labels SwitchBack / Bay Ring. Do not wipe region borders.'
    }
  };
  let activeSot = null;
  let sotSha = '';
  let weatherState = null;
  let sotDash = null;
  let sotSelectedId = null;
  let sotSelectedList = null;
  let castSelected = new Set();
  let entSelected = new Set();
  const $ = (id) => document.getElementById(id);
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function status(msg) { if ($('status')) $('status').textContent = msg || ''; }
  function worldErr(msg) {
    const el = $('worldErr');
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = msg;
  }
  function gate(msg, href) {
    $('gate').hidden = false;
    $('app').hidden = true;
    document.querySelectorAll('main .mod').forEach((s) => { if (s.id !== 'gate') s.hidden = true; });
    $('gateMsg').textContent = msg;
    $('gateLink').href = href;
    $('who').textContent = 'locked';
  }
  function parseAliases(v) {
    return String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
  }
  function charById(id) {
    return (reg && reg.characters || []).find((c) => String(c.id) === String(id)) || null;
  }
  function fetchJson(url, opts, ms) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), ms || 12000) : null;
    const o = Object.assign({ cache: 'no-store' }, opts || {});
    if (ctrl) o.signal = ctrl.signal;
    return fetch(url, o).then((r) => {
      if (timer) clearTimeout(timer);
      return r.json().then((j) => ({ r: r, j: j })).catch(() => ({ r: r, j: {} }));
    }).catch((e) => {
      if (timer) clearTimeout(timer);
      throw e;
    });
  }
  async function init() {
    bindMods();
    try {
      const out = await fetchJson('/api/me', null, 10000);
      me = out.j || {};
      if (!out.r.ok) {
        worldErr('/api/me failed · HTTP ' + out.r.status);
        $('who').textContent = 'api error';
        return;
      }
      if (!me.logged_in) return gate('Login required. Owner/admin only.', '/login?next=/world');
      if (me.can_edit !== true) return gate('World editor is owner/admin only. The map stays view-only for this role.', '/');
      $('who').textContent = '@' + (me.username || me.id) + ' · ' + (me.role || 'user');
      worldErr('');
      $('app').hidden = false;
      bindCast();
      try {
        await loadRegistry(null);
      } catch (e) {
        worldErr('Cast load failed: ' + (e.message || e));
        status('Cast load failed: ' + (e.message || e));
        $('regMeta').textContent = 'registry load failed';
        $('roster').innerHTML = '<li class="chip">Registry unavailable — Places / Stories / SoT modules still work.</li>';
      }
    } catch (e) {
      worldErr('Auth check failed: ' + (e.name === 'AbortError' ? 'timeout' : (e.message || e)));
      $('who').textContent = 'auth timeout';
    }
  }
  function bindCast() {
    if (castBound) return;
    castBound = true;
    $('q').addEventListener('input', renderRoster);
    $('addBtn').onclick = addCharacter;
    $('saveBtn').onclick = save;
    $('reloadBtn').onclick = () => loadRegistry(active && active.id).catch((e) => status(String(e.message || e)));
    $('relAdd').onclick = addRel;
    $('bulkHideBtn').onclick = () => applyCastBulk({ hidden: true });
    $('bulkUnhideBtn').onclick = () => applyCastBulk({ hidden: false });
    $('bulkApplyBtn').onclick = () => {
      const patch = {};
      if ($('bulkRole').value) patch.role = $('bulkRole').value;
      if ($('bulkStatus').value.trim()) patch.status = $('bulkStatus').value.trim();
      if (!Object.keys(patch).length) return status('pick role and/or status for bulk apply');
      applyCastBulk(patch);
    };
    for (const id of ['f_name','f_role','f_status','f_player','f_aliases','f_story','f_image','f_hidden','f_notes']) {
      $(id).addEventListener('input', () => status('unsaved changes'));
    }
  }
  function updateCastBulkCount() {
    $('castBulkCount').textContent = castSelected.size + ' selected';
  }
  async function applyCastBulk(patch) {
    const ids = Array.from(castSelected);
    if (!ids.length) return status('select cast rows first');
    if (!reg) return status('registry not loaded');
    status('bulk saving…');
    const out = await fetchJson('/api/world/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bulk: true, ids: ids, patch: patch, base_version: reg.version }),
    }, 20000);
    if (out.r.status === 409) {
      status('version conflict — reload Cast, then retry');
      return;
    }
    if (!out.r.ok) {
      status('bulk failed: ' + (out.j.error || out.r.status));
      return;
    }
    castSelected.clear();
    status('bulk updated ' + (out.j.updated || ids.length) + ' · v' + out.j.version);
    await loadRegistry(active && active.id);
  }
  async function loadRegistry(selectId) {
    const out = await fetchJson('/api/characters?include_hidden=1', null, 15000);
    if (!out.r.ok) throw new Error('characters ' + out.r.status);
    reg = out.j;
    $('regMeta').textContent = 'registry v' + (reg.version || '?') + ' · ' + ((reg.characters && reg.characters.length) || reg.count || 0) + ' rows';
    renderRoster();
    const wanted = selectId || (active && active.id) || (reg.characters[0] && reg.characters[0].id);
    // Do not block roster paint on sheet fetch (slow/failed sheet left middle panel blank).
    if (wanted) select(wanted).catch(function(e) { status('sheet: ' + (e.message || e)); });
  }
  function renderRoster() {
    const q = String($('q').value || '').toLowerCase();
    const list = (reg.characters || []).filter((c) => {
      const hay = [c.display_name, c.id, c.role, c.status, c.player_name, (c.aliases || []).join(' '), c.notes].join(' ').toLowerCase();
      return !q || hay.includes(q);
    });
    $('roster').innerHTML = list.map((c) => {
      const face = c.image_url ? '<img src="' + esc(c.image_url) + '" alt="" loading="lazy"/>' : '<span class="face">' + esc(String(c.display_name || c.id).slice(0, 1).toUpperCase()) + '</span>';
      const checked = castSelected.has(c.id) ? ' checked' : '';
      return '<li class="rost-row"><input type="checkbox" data-bulk="' + esc(c.id) + '"' + checked + '/><button type="button" class="rost' + (active && active.id === c.id ? ' is-active' : '') + '" data-id="' + esc(c.id) + '">' + face + '<span><strong>' + esc(c.display_name || c.id) + '</strong><span>' + esc([c.role, c.status, c.hidden ? 'hidden' : ''].filter(Boolean).join(' · ')) + '</span></span></button></li>';
    }).join('') || '<li class="chip">No matches.</li>';
    $('roster').querySelectorAll('button[data-id]').forEach((b) => { b.onclick = () => select(b.getAttribute('data-id')); });
    $('roster').querySelectorAll('input[data-bulk]').forEach((cb) => {
      cb.onchange = () => {
        const id = cb.getAttribute('data-bulk');
        if (cb.checked) castSelected.add(id); else castSelected.delete(id);
        updateCastBulkCount();
      };
    });
    updateCastBulkCount();
    const relTo = $('relTo');
    relTo.innerHTML = '<option value="">relation target…</option>' + (reg.characters || []).map((c) => '<option value="' + esc(c.id) + '">' + esc(c.display_name || c.id) + '</option>').join('');
  }
  async function select(id) {
    active = charById(id);
    if (!active) return;
    renderRoster();
    populate();
    $('sheet').innerHTML = '<p style="color:var(--muted)">Loading sheet…</p>';
    const r = await fetch('/api/characters/sheet?id=' + encodeURIComponent(id), { cache: 'no-store' });
    const j = r.ok ? await r.json() : { markdown: '', error: 'sheet_' + r.status };
    sheetMd = j.markdown || '';
    renderSheet(j);
    renderChecks();
  }
  function populate() {
    $('f_name').value = active.display_name || '';
    $('f_role').value = active.role || 'npc';
    $('f_status').value = active.status || '';
    $('f_player').value = active.player_name || '';
    $('f_aliases').value = (active.aliases || []).join(', ');
    $('f_story').value = active.story_path || '';
    $('f_hidden').checked = Boolean(active.hidden);
    $('f_notes').value = active.notes || '';
    const imgs = (active.images || []).slice();
    if (active.image_path && !imgs.includes(active.image_path)) imgs.unshift(active.image_path);
    $('f_image').innerHTML = '<option value="">(no primary portrait)</option>' + imgs.map((p) => '<option value="' + esc(p) + '"' + (p === active.image_path ? ' selected' : '') + '>' + esc(p) + '</option>').join('');
    rels = (active.relations || []).map((r) => ({ to_id: r.to_id, type: r.type || 'related', label: r.label || r.type || 'related' }));
    renderRels();
    const hero = active.image_url ? '<img src="' + esc(active.image_url) + '" alt=""/>' : '<span class="face">' + esc(String(active.display_name || active.id).slice(0, 1).toUpperCase()) + '</span>';
    $('sheetHead').innerHTML = hero + '<div><h1>' + esc(active.display_name || active.id) + '</h1><p>' + esc([active.role, active.status, active.player_name, active.id].filter(Boolean).join(' · ')) + '</p></div>';
    status('');
  }
  function renderSheet(j) {
    if (!sheetMd) {
      $('sheet').innerHTML = '<p style="color:var(--pink)">No sheet markdown' + (j && j.story_path ? ' at ' + esc(j.story_path) : '') + '.</p>';
      return;
    }
    if (window.marked && marked.parse) {
      if (marked.setOptions) marked.setOptions({ breaks: true, gfm: true });
      $('sheet').innerHTML = marked.parse(sheetMd);
    } else {
      $('sheet').innerHTML = '<pre>' + esc(sheetMd) + '</pre>';
    }
  }
  function hasPillar(re) { return re.test(sheetMd); }
  function renderChecks() {
    const checks = [
      { label: 'Portrait present', ok: Boolean(active.has_image || active.image_path), hint: 'pick a primary portrait path' },
      { label: 'Sheet linked', ok: Boolean(active.story_path && sheetMd), hint: 'set a campaign .md sheet path' },
      { label: 'Look pillar', ok: hasPillar(/^##\s+Look\b/im), hint: 'add ## Look' },
      { label: 'Speech pillar', ok: hasPillar(/^##\s+Speech\b/im), hint: 'add ## Speech' },
      { label: 'Act pillar', ok: hasPillar(/^##\s+Act\b/im), hint: 'add ## Act' },
      { label: 'Think pillar', ok: hasPillar(/^##\s+Think\b/im), hint: 'add ## Think' },
      { label: 'Skills / sexuality / else pillar', ok: hasPillar(/^##\s+.*(Skills|sexuality|else)/im), hint: 'add the fifth pillar' },
      { label: 'Backstory pillar', ok: hasPillar(/^##\s+Backstory\b/im), hint: 'add ## Backstory' },
      { label: 'GM notes present', ok: Boolean(String(active.notes || '').trim()), hint: 'notes carry additions / WoD fit intent' },
    ];
    $('checks').innerHTML = checks.map((c) => '<div class="check ' + (c.ok ? 'ok' : 'miss') + '"><span>' + (c.ok ? '✓' : '×') + '</span><span><strong>' + esc(c.label) + '</strong><br/>' + esc(c.hint) + '</span></div>').join('');
  }
  function renderRels() {
    $('rels').innerHTML = rels.map((r, i) => {
      const target = charById(r.to_id);
      return '<div class="rel"><span>' + esc(r.type) + ' → ' + esc(target ? (target.display_name || target.id) : r.to_id) + (r.label ? ' · ' + esc(r.label) : '') + '</span><button class="btn danger" type="button" data-i="' + i + '">Remove</button></div>';
    }).join('') || '<div class="chip">No relations yet.</div>';
    $('rels').querySelectorAll('button[data-i]').forEach((b) => { b.onclick = () => { rels.splice(Number(b.getAttribute('data-i')), 1); renderRels(); status('unsaved changes'); }; });
  }
  function addRel() {
    const to = $('relTo').value;
    if (!to) return status('pick a relation target');
    rels.push({ to_id: to, type: $('relType').value.trim() || 'related', label: $('relType').value.trim() || 'related' });
    renderRels();
    status('unsaved changes');
  }
  async function save() {
    if (!active) return;
    status('saving…');
    const body = {
      base_version: reg.version,
      id: active.id,
      display_name: $('f_name').value.trim(),
      role: $('f_role').value,
      status: $('f_status').value.trim(),
      player_name: $('f_player').value.trim(),
      aliases: parseAliases($('f_aliases').value),
      story_path: $('f_story').value.trim(),
      image_path: $('f_image').value,
      hidden: $('f_hidden').checked,
      notes: $('f_notes').value,
      relations: rels,
    };
    const r = await fetch('/api/world/characters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409) {
      status('version conflict — registry changed elsewhere. Reload, then re-apply.');
      return;
    }
    if (!r.ok) {
      status('save failed: ' + (j.error || r.status));
      return;
    }
    status('saved · registry v' + j.version);
    await loadRegistry(j.id || active.id);
  }
  async function addCharacter() {
    const name = $('newName').value.trim();
    if (!name) return status('name required for new character');
    status('creating…');
    const r = await fetch('/api/world/characters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ create: true, base_version: reg.version, display_name: name }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      status('create failed: ' + (j.error || r.status));
      return;
    }
    $('newName').value = '';
    await loadRegistry(j.id);
  }
  let ingestImageData = '';
  let ingestImageName = '';
  function istatus(msg) { $('ingestMsg').textContent = msg || ''; }
  function setIngestPreview(dataUrl, name) {
    ingestImageData = dataUrl || '';
    ingestImageName = name || 'ingest.jpg';
    const drop = $('ingestDrop');
    if (!ingestImageData) {
      drop.innerHTML = 'Drop / paste image<br/><span style="opacity:.7">or click to choose file</span>';
      $('ingestMeta').textContent = 'boxes idle';
      return;
    }
    drop.textContent = '';
    const img = document.createElement('img');
    img.alt = 'preview';
    img.src = ingestImageData;
    drop.appendChild(img);
    $('ingestMeta').textContent = 'portrait ready · ' + ingestImageName;
  }
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file || !String(file.type || '').startsWith('image/')) return reject(new Error('not an image file'));
      if (file.size > 4 * 1024 * 1024) return reject(new Error('image over 4MB'));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(file);
    });
  }
  function bindIngest() {
    const drop = $('ingestDrop');
    const file = $('ingestFile');
    drop.onclick = () => file.click();
    file.onchange = async () => {
      try {
        if (!file.files || !file.files[0]) return;
        const data = await fileToDataUrl(file.files[0]);
        setIngestPreview(data, file.files[0].name);
        istatus('portrait loaded from file');
      } catch (e) { istatus(String(e.message || e)); }
    };
    drop.addEventListener('dragover', (ev) => { ev.preventDefault(); drop.classList.add('is-hot'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-hot'));
    drop.addEventListener('drop', async (ev) => {
      ev.preventDefault();
      drop.classList.remove('is-hot');
      try {
        const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
        const data = await fileToDataUrl(f);
        setIngestPreview(data, f.name);
        istatus('portrait dropped');
      } catch (e) { istatus(String(e.message || e)); }
    });
    document.addEventListener('paste', async (ev) => {
      if ($('mod-ingest').hidden) return;
      const items = ev.clipboardData && ev.clipboardData.items;
      if (!items) return;
      for (const it of items) {
        if (it.type && it.type.startsWith('image/')) {
          ev.preventDefault();
          try {
            const f = it.getAsFile();
            const data = await fileToDataUrl(f);
            setIngestPreview(data, f && f.name || 'paste.png');
            istatus('portrait pasted');
          } catch (e) { istatus(String(e.message || e)); }
          return;
        }
      }
    });
    $('ingestUrlBtn').onclick = async () => {
      const url = $('ingestUrl').value.trim();
      if (!url) return istatus('image URL required');
      istatus('fetching image…');
      try {
        const r = await fetch(url, { mode: 'cors' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const blob = await r.blob();
        if (!String(blob.type || '').startsWith('image/')) throw new Error('URL is not an image');
        if (blob.size > 4 * 1024 * 1024) throw new Error('image over 4MB');
        const data = await fileToDataUrl(new File([blob], 'url-image.jpg', { type: blob.type || 'image/jpeg' }));
        setIngestPreview(data, 'url-image.jpg');
        istatus('portrait loaded from URL');
      } catch (e) {
        istatus('URL load failed (CORS or bad URL): ' + (e.message || e) + ' — drop/paste instead');
      }
    };
    $('ingestClearImg').onclick = () => { setIngestPreview('', ''); istatus('portrait cleared'); };
    $('ingestClearBtn').onclick = () => {
      setIngestPreview('', '');
      $('ingestName').value = '';
      $('ingestRole').value = 'npc';
      $('ingestCharStatus').value = 'draft';
      $('ingestAliases').value = '';
      $('ingestPlayer').value = '';
      $('ingestHidden').checked = false;
      $('ingestNotes').value = '';
      $('ingestSheet').value = '';
      $('ingestAsSheet').checked = true;
      $('ingestUrl').value = '';
      istatus('boxes cleared');
    };
    $('ingestCreateBtn').onclick = createFromIngest;
    $('ingestApplyPortraitBtn').onclick = applyIngestPortraitToSelected;
  }
  async function createFromIngest() {
    const name = $('ingestName').value.trim();
    if (!name) return istatus('Identity box: display name required');
    if (!reg) {
      try { await loadRegistry(null); } catch (e) { return istatus('registry unavailable: ' + (e.message || e)); }
    }
    istatus('creating…');
    const sheetPaste = $('ingestSheet').value.trim();
    const notes = $('ingestNotes').value;
    const body = {
      base_version: reg.version,
      display_name: name,
      role: $('ingestRole').value,
      status: $('ingestCharStatus').value.trim() || 'draft',
      aliases: parseAliases($('ingestAliases').value),
      player_name: $('ingestPlayer').value.trim(),
      hidden: $('ingestHidden').checked,
      notes: notes,
      write_sheet: Boolean($('ingestAsSheet').checked || sheetPaste),
      sheet_markdown: sheetPaste || notes,
      image_data_url: ingestImageData || '',
      image_filename: ingestImageName || 'ingest.jpg',
    };
    const out = await fetchJson('/api/world/characters/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 60000);
    if (out.r.status === 409) return istatus('version conflict — reload Cast, then retry');
    if (!out.r.ok) return istatus('ingest failed: ' + (out.j.error || out.r.status));
    istatus('created · ' + (out.j.id || '?') + ' · registry v' + out.j.version + (out.j.image_path ? ' · portrait ok' : '') + (out.j.story_path ? ' · sheet ok' : ''));
    $('ingestMeta').textContent = 'created ' + (out.j.id || '');
    await loadRegistry(out.j.id);
    showMod('cast');
  }
  async function applyIngestPortraitToSelected() {
    if (!ingestImageData) return istatus('Portrait box empty');
    if (!active || !active.id) return istatus('Select a Cast row first (Cast module)');
    if (!reg) return istatus('registry not loaded');
    istatus('applying portrait…');
    const out = await fetchJson('/api/world/characters/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_version: reg.version,
        id: active.id,
        attach_only: true,
        image_data_url: ingestImageData,
        image_filename: ingestImageName || 'ingest.jpg',
      }),
    }, 60000);
    if (out.r.status === 409) return istatus('version conflict — reload Cast, then retry');
    if (!out.r.ok) return istatus('portrait apply failed: ' + (out.j.error || out.r.status));
    istatus('portrait applied → ' + active.id);
    await loadRegistry(active.id);
  }
  let entities = null;
  let activeEnt = null;
  let pages = [];
  let activePage = null;
  let pageSha = '';
  function estatus(msg) { $('estatus').textContent = msg || ''; }
  function dstatus(msg) { $('dstatus').textContent = msg || ''; }
  function bindMods() {
    if (modsBound) return;
    modsBound = true;
    $('mods').querySelectorAll('button[data-mod]').forEach((b) => {
      b.onclick = () => showMod(b.getAttribute('data-mod'));
    });
    $('eq').addEventListener('input', renderEntities);
    $('eAddBtn').onclick = addEntity;
    $('eSaveBtn').onclick = saveEntity;
    $('eReloadBtn').onclick = () => loadEntities(activeEnt && activeEnt.id);
    for (const id of ['e_kind','e_region','e_name','e_aliases','e_location','e_facts','e_related']) {
      $(id).addEventListener('input', () => estatus('unsaved changes'));
    }
    $('dq').addEventListener('input', renderDocs);
    $('docSaveBtn').onclick = saveDoc;
    $('docReloadBtn').onclick = () => { if (activePage) loadDoc(activePage); };
    $('docText').addEventListener('input', () => dstatus('unsaved changes'));
    $('sotSaveBtn').onclick = saveSot;
    $('sotReloadBtn').onclick = () => { if (activeSot) loadSot(activeSot); };
    $('weatherGenBtn').onclick = () => weatherAction('regenerate');
    $('weatherPlus1Btn').onclick = () => weatherAction('advance', 1);
    $('weatherPlus7Btn').onclick = () => weatherAction('advance', 7);
    $('weatherSetDateBtn').onclick = () => weatherAction('set_date');
    $('economyTickBtn').onclick = () => economyAction(1);
    $('economyTick7Btn').onclick = () => economyAction(7);
    $('simTickBtn').onclick = () => simAction(1);
    $('simTick7Btn').onclick = () => simAction(7);
    $('sotDetailSaveBtn').onclick = saveSotDetail;
    $('sotText').addEventListener('input', () => sotStatus('unsaved note changes'));
    $('eBulkApplyBtn').onclick = applyEntBulk;
    bindIngest();
  }
  function showMod(name) {
    $('mods').querySelectorAll('button[data-mod]').forEach((b) => {
      b.classList.toggle('is-active', b.getAttribute('data-mod') === name);
    });
    document.querySelectorAll('main .mod').forEach((s) => { s.hidden = true; });
    if (SOT_MODS[name]) {
      $('mod-sot').hidden = false;
      loadSot(name).catch((e) => sotStatus('load failed: ' + (e.message || e)));
      return;
    }
    const el = name === 'cast' ? $('app') : $('mod-' + name);
    if (el) el.hidden = false;
    if (name === 'places' && !entities) loadEntities(null).catch((e) => estatus('load failed: ' + (e.message || e)));
    if (name === 'docs' && !pages.length) loadDocs().catch((e) => dstatus('load failed: ' + (e.message || e)));
  }
  function sotStatus(msg) { $('sotStatus').textContent = msg || ''; }
  function riskClass(r) {
    const s = String(r || '').toLowerCase();
    if (s === 'high') return 'risk-high';
    if (s === 'moderate') return 'risk-moderate';
    return 'risk-low';
  }
  function setWeatherBulkVisible(on) {
    $('sotBulkBar').hidden = !on;
    $('weatherGenBtn').hidden = !on;
    $('weatherPlus1Btn').hidden = !on;
    $('weatherPlus7Btn').hidden = !on;
    $('weatherDateInput').hidden = !on;
    $('weatherSetDateBtn').hidden = !on;
    $('sotDetailSaveBtn').hidden = !on;
    if (!on && typeof setEconomyBulkVisible === 'function') setEconomyBulkVisible(false);
  }
  function renderWeatherDash(w) {
    weatherState = w;
    const cities = w && w.cities ? Object.values(w.cities) : [];
    $('sotMetaChip').textContent = (w.diegetic_date || '?') + ' · ' + (w.season || '?') + ' season · v' + (w.version || '?');
    if ($('weatherDateInput') && w.diegetic_date) $('weatherDateInput').value = w.diegetic_date;
    setWeatherBulkVisible(true);
    $('sotDash').innerHTML = cities.map((c) => {
      const cur = c.current || {};
      const forecast = (c.forecast || []).map((d) => {
        const label = String(d.date || '').slice(5);
        return '<div class="fday"><span>' + esc(label) + '</span><strong>' + esc(d.temp_f) + '°F</strong><span>' + esc(d.rain_chance_pct) + '% rain</span></div>';
      }).join('');
      const activeCls = sotSelectedId === c.id ? ' is-active' : '';
      return '<article class="dash-card' + activeCls + '" data-city="' + esc(c.id) + '">' +
        '<p class="city">' + esc(c.label) + '</p>' +
        '<div class="big">' + esc(cur.temp_f) + '°F</div>' +
        '<p style="margin:4px 0 10px;color:var(--muted)">' + esc(cur.conditions) + ' · ' + esc(c.vibe || '') + '</p>' +
        '<div class="metric"><span>Humidity</span><b>' + esc(cur.humidity_pct) + '%</b></div>' +
        '<div class="metric"><span>Wind</span><b>' + esc(cur.wind_mph) + ' mph ' + esc(cur.wind_dir) + '</b></div>' +
        '<div class="metric"><span>Rain chance</span><b>' + esc(cur.rain_chance_pct) + '%</b></div>' +
        '<div class="metric"><span>Festival risk</span><b class="' + riskClass(cur.festival_risk) + '">' + esc(cur.festival_risk) + '</b></div>' +
        '<div class="metric"><span>CRT optics</span><b style="text-align:right;max-width:58%">' + esc(cur.crt_optics) + '</b></div>' +
        (cur.flood_watch && cur.flood_watch !== 'none' ? '<div class="metric"><span>Flood watch</span><b class="risk-high">' + esc(cur.flood_watch) + '</b></div>' : '') +
        '<div class="forecast">' + forecast + '</div></article>';
    }).join('') || '<p class="chip">No weather cities.</p>';
    $('sotDash').querySelectorAll('[data-city]').forEach((card) => {
      card.onclick = () => selectWeatherCity(card.getAttribute('data-city'));
    });
    if (sotSelectedId && w.cities && w.cities[sotSelectedId]) selectWeatherCity(sotSelectedId);
    else {
      $('sotDetail').hidden = true;
      sotSelectedId = null;
    }
  }
  function selectWeatherCity(id) {
    sotSelectedId = id;
    sotSelectedList = 'weather';
    const c = weatherState && weatherState.cities && weatherState.cities[id];
    if (!c) return;
    $('sotDash').querySelectorAll('[data-city]').forEach((el) => {
      el.classList.toggle('is-active', el.getAttribute('data-city') === id);
    });
    const cur = c.current || {};
    $('sotDetail').hidden = false;
    $('sotDetailTitle').textContent = 'Detail · ' + (c.label || id);
    $('sotDetailBody').innerHTML =
      '<div class="row"><div><label>Temp °F</label><input id="wd_temp" value="' + esc(cur.temp_f) + '"/></div>' +
      '<div><label>Humidity %</label><input id="wd_hum" value="' + esc(cur.humidity_pct) + '"/></div></div>' +
      '<label>Conditions</label><input id="wd_cond" value="' + esc(cur.conditions) + '"/>' +
      '<div class="row"><div><label>Wind mph</label><input id="wd_wind" value="' + esc(cur.wind_mph) + '"/></div>' +
      '<div><label>Wind dir</label><input id="wd_wdir" value="' + esc(cur.wind_dir) + '"/></div></div>' +
      '<div class="row"><div><label>Rain %</label><input id="wd_rain" value="' + esc(cur.rain_chance_pct) + '"/></div>' +
      '<div><label>Festival risk</label><input id="wd_fest" value="' + esc(cur.festival_risk) + '"/></div></div>' +
      '<label>CRT optics</label><input id="wd_crt" value="' + esc(cur.crt_optics) + '"/>' +
      '<label>Vibe</label><input id="wd_vibe" value="' + esc(c.vibe || '') + '"/>' +
      '<label>Flood watch</label><input id="wd_flood" value="' + esc(cur.flood_watch || 'none') + '"/>';
  }
  function renderRegionsDash(d) {
    sotDash = d;
    const focus = (d && d.focus) || [];
    const watch = (d && d.watch) || [];
    $('sotMetaChip').textContent = focus.length + ' focus · ' + watch.length + ' watch · v' + (d.version || '?');
    setWeatherBulkVisible(false);
    $('sotBulkBar').hidden = false;
    $('sotDetailSaveBtn').hidden = false;
    let html = focus.map((r) => {
      const activeCls = sotSelectedId === r.id && sotSelectedList === 'focus' ? ' is-active' : '';
      return '<article class="dash-card' + activeCls + '" data-list="focus" data-id="' + esc(r.id) + '"><h3>' + esc(r.name) + (r.region_name ? ' · ' + esc(r.region_name) : '') + '</h3>' +
        '<div class="metric"><span>Border</span><b>' + esc(r.bordered) + '</b></div>' +
        '<p style="margin:8px 0;color:var(--text)">' + esc(r.identity) + '</p>' +
        '<p style="margin:0;color:var(--muted);font-size:.78rem">Hook: ' + esc(r.hook) + '</p></article>';
    }).join('');
    if (watch.length) {
      html += watch.map((w) => {
        const activeCls = sotSelectedId === w.id && sotSelectedList === 'watch' ? ' is-active' : '';
        return '<article class="dash-card' + activeCls + '" data-list="watch" data-id="' + esc(w.id) + '"><h3>Watch · ' + esc(w.name) + '</h3><p style="margin:0;color:var(--muted)">' + esc(w.note) + '</p></article>';
      }).join('');
    }
    $('sotDash').innerHTML = html || '<p class="chip">No region summary.</p>';
    $('sotDash').querySelectorAll('[data-id]').forEach((card) => {
      card.onclick = () => selectSotItem(card.getAttribute('data-list'), card.getAttribute('data-id'));
    });
  }
  function renderAgDash(d) {
    sotDash = d;
    $('sotMetaChip').textContent = ((d.crops || []).length) + ' crops · ' + ((d.fishing || []).length) + ' fleets · v' + (d.version || '?');
    setWeatherBulkVisible(false);
    setEconomyBulkVisible(false);
    $('sotBulkBar').hidden = false;
    $('sotDetailSaveBtn').hidden = false;
    let html = (d.crops || []).map((c) => {
      const activeCls = sotSelectedId === c.id && sotSelectedList === 'crops' ? ' is-active' : '';
      return '<article class="dash-card' + activeCls + '" data-list="crops" data-id="' + esc(c.id) + '"><h3>' + esc(c.product) + '</h3>' +
        '<div class="metric"><span>Where</span><b>' + esc(c.where) + '</b></div>' +
        '<p style="margin:8px 0 0;color:var(--muted);font-size:.78rem">' + esc(c.note) + '</p></article>';
    }).join('');
    html += (d.fishing || []).map((c) => {
      const activeCls = sotSelectedId === c.id && sotSelectedList === 'fishing' ? ' is-active' : '';
      return '<article class="dash-card' + activeCls + '" data-list="fishing" data-id="' + esc(c.id) + '"><h3>' + esc(c.catch) + '</h3>' +
        '<div class="metric"><span>Where</span><b>' + esc(c.where) + '</b></div>' +
        '<p style="margin:8px 0 0;color:var(--muted);font-size:.78rem">' + esc(c.note) + '</p></article>';
    }).join('');
    html += '<article class="dash-card" style="grid-column:1/-1;cursor:default"><h3>Logistics</h3><ul style="margin:0;padding-left:18px;color:var(--muted)">' +
      (d.logistics || []).map((x) => '<li style="margin:4px 0">' + esc(x) + '</li>').join('') + '</ul></article>';
    $('sotDash').innerHTML = html;
    $('sotDash').querySelectorAll('[data-id]').forEach((card) => {
      card.onclick = () => selectSotItem(card.getAttribute('data-list'), card.getAttribute('data-id'));
    });
  }
  function renderTransportDash(d) {
    sotDash = d;
    const hw = d.highways_layer || {};
    $('sotMetaChip').textContent = ((d.modes || []).length) + ' modes · highways ' + (hw.status || '?') + ' · v' + (d.version || '?');
    setWeatherBulkVisible(false);
    $('sotBulkBar').hidden = false;
    $('sotDetailSaveBtn').hidden = false;
    setEconomyBulkVisible(false);
    let html = '<article class="dash-card" style="grid-column:1/-1;cursor:default"><h3>Highways layer (map track)</h3>' +
      '<div class="metric"><span>Status</span><b>' + esc(hw.status || 'unknown') + '</b></div>' +
      '<div class="metric"><span>Source</span><b>' + esc(hw.source == null ? '(null placeholder)' : hw.source) + '</b></div>' +
      '<p style="margin:8px 0;color:var(--muted);font-size:.78rem;line-height:1.45">' + esc(hw.note || d.highway_note || '') + '</p>' +
      '<a class="btn" href="' + esc(hw.map_url || 'https://map.tableslop.org/') + '">Open map · geometry track</a></article>';
    html += (d.modes || []).map((m) => {
      const activeCls = sotSelectedId === m.id && sotSelectedList === 'modes' ? ' is-active' : '';
      return '<article class="dash-card' + activeCls + '" data-list="modes" data-id="' + esc(m.id) + '"><h3>' + esc(m.mode) + '</h3>' +
        '<div class="metric"><span>Role</span><b>' + esc(m.role) + '</b></div>' +
        '<p style="margin:8px 0 0;color:var(--muted);font-size:.78rem">' + esc(m.map) + '</p></article>';
    }).join('');
    html += '<article class="dash-card" style="cursor:default"><h3>Play notes</h3><ul style="margin:0;padding-left:18px;color:var(--muted)">' +
      (d.play_notes || []).map((x) => '<li style="margin:4px 0">' + esc(x) + '</li>').join('') + '</ul></article>';
    $('sotDash').innerHTML = html;
    $('sotDash').querySelectorAll('[data-id]').forEach((card) => {
      card.onclick = () => selectSotItem(card.getAttribute('data-list'), card.getAttribute('data-id'));
    });
  }
  function setEconomyBulkVisible(on) {
    if ($('economyTickBtn')) $('economyTickBtn').hidden = !on;
    if ($('economyTick7Btn')) $('economyTick7Btn').hidden = !on;
    if (!on) setSimBulkVisible(false);
  }
  function setSimBulkVisible(on) {
    if ($('simTickBtn')) $('simTickBtn').hidden = !on;
    if ($('simTick7Btn')) $('simTick7Btn').hidden = !on;
  }
  function renderEconomyDash(d) {
    sotDash = d;
    const nW = (d.water_bodies || []).length;
    const nM = (d.minerals || []).length;
    const nO = (d.other_resources || []).length;
    $('sotMetaChip').textContent = 'tick ' + (d.tick || 0) + ' · ' + (d.diegetic_date || '?') + ' · ' + nW + ' water · ' + nM + ' minerals · ' + nO + ' other · v' + (d.version || '?');
    setWeatherBulkVisible(false);
    setEconomyBulkVisible(true);
    $('sotBulkBar').hidden = false;
    $('sotDetailSaveBtn').hidden = false;
    const commodities = d.commodities || {};
    let html = '<article class="dash-card" style="grid-column:1/-1;cursor:default"><h3>Commodity prices (IP$)</h3><div class="dash-grid" style="margin-top:8px">';
    html += Object.keys(commodities).map((id) => {
      const c = commodities[id] || {};
      return '<div class="metric"><span>' + esc(c.label || id) + '</span><b>' + esc(c.price) + '</b></div>';
    }).join('');
    html += '</div></article>';
    function resCards(listKey, rows, titleKey) {
      return (rows || []).map((r) => {
        const activeCls = sotSelectedId === r.id && sotSelectedList === listKey ? ' is-active' : '';
        const stock = r.stock != null ? r.stock + '/' + (r.capacity != null ? r.capacity : '?') : '—';
        return '<article class="dash-card' + activeCls + '" data-list="' + listKey + '" data-id="' + esc(r.id) + '"><h3>' + esc(r[titleKey] || r.name) + '</h3>' +
          '<div class="metric"><span>Kind</span><b>' + esc(r.kind) + '</b></div>' +
          '<div class="metric"><span>Stock</span><b>' + esc(stock) + '</b></div>' +
          '<div class="metric"><span>Canon</span><b>' + esc(r.canon || '?') + '</b></div>' +
          '<p style="margin:8px 0 0;color:var(--muted);font-size:.78rem">' + esc(r.note || '') + '</p></article>';
      }).join('');
    }
    html += resCards('water_bodies', d.water_bodies, 'name');
    html += resCards('minerals', d.minerals, 'name');
    html += resCards('other_resources', d.other_resources, 'name');
    if ((d.last_flows || []).length) {
      html += '<article class="dash-card" style="grid-column:1/-1;cursor:default"><h3>Last tick flows</h3><ul style="margin:0;padding-left:18px;color:var(--muted);font-size:.78rem">' +
        d.last_flows.map((f) => '<li>' + esc(f.commodity) + ' · supply ' + esc(f.supply) + ' · demand ' + esc(f.demand) + ' · price ' + esc(f.price) + ' (Δ ' + esc(f.delta_price) + ')</li>').join('') +
        '</ul></article>';
    }
    $('sotDash').innerHTML = html;
    $('sotDash').querySelectorAll('[data-id]').forEach((card) => {
      card.onclick = () => selectSotItem(card.getAttribute('data-list'), card.getAttribute('data-id'));
    });
  }
  async function economyAction(days) {
    sotStatus('ticking economy…');
    const out = await fetchJson('/api/world/economy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'tick', days: days || 1, base_version: sotDash && sotDash.version })
    }, 30000);
    if (!out.r.ok) {
      sotStatus('economy tick failed: ' + (out.j.error || out.r.status));
      return;
    }
    renderEconomyDash(out.j);
    sotStatus('tick ok · day ' + (out.j.diegetic_date || '') + ' · v' + out.j.version);
  }
  function renderSimDash(payload) {
    const agents = payload.agents || {};
    const eco = payload.economy || {};
    sotDash = payload;
    const sum = agents.last_summary || {};
    $('sotMetaChip').textContent = 'people ' + (sum.count || (agents.agents || []).length) +
      ' · sat ' + (sum.avg_satisfaction != null ? sum.avg_satisfaction : '—') +
      ' · funds≈' + (sum.avg_funds != null ? sum.avg_funds : '—') +
      ' · day ' + (agents.diegetic_date || eco.diegetic_date || '?') +
      ' · tick ' + (agents.tick || 0);
    setWeatherBulkVisible(false);
    setEconomyBulkVisible(false);
    setSimBulkVisible(true);
    $('sotBulkBar').hidden = false;
    $('sotDetailSaveBtn').hidden = true;
    const commodities = eco.commodities || {};
    let html = '<article class="dash-card" style="grid-column:1/-1;cursor:default"><h3>Live prices (driven by people demand + resources)</h3><div class="dash-grid" style="margin-top:8px">';
    html += Object.keys(commodities).slice(0, 12).map((id) => {
      const c = commodities[id] || {};
      return '<div class="metric"><span>' + esc(c.label || id) + '</span><b>' + esc(c.price) + '</b></div>';
    }).join('');
    html += '</div></article>';
    html += '<article class="dash-card" style="grid-column:1/-1;cursor:default"><h3>Last day actions</h3><ul style="margin:0;padding-left:18px;color:var(--muted);font-size:.8rem">';
    const actions = sum.actions || {};
    html += Object.keys(actions).length
      ? Object.keys(actions).map((k) => '<li>' + esc(k) + ': <b>' + esc(actions[k]) + '</b></li>').join('')
      : '<li>No tick yet — press Sim day +1</li>';
    html += '</ul></article>';
    html += (agents.agents || []).map((a) => {
      const activeCls = sotSelectedId === a.id && sotSelectedList === 'agents' ? ' is-active' : '';
      const domNeed = Object.keys(a.needs || {}).sort((x, y) => (a.needs[y] || 0) - (a.needs[x] || 0))[0] || '—';
      return '<article class="dash-card' + activeCls + '" data-list="agents" data-id="' + esc(a.id) + '">' +
        '<h3>' + esc(a.name) + '</h3>' +
        '<div class="metric"><span>Sat</span><b>' + esc(a.satisfaction) + '</b></div>' +
        '<div class="metric"><span>Funds</span><b>' + esc(a.funds) + '</b></div>' +
        '<div class="metric"><span>Need</span><b>' + esc(domNeed) + '</b></div>' +
        '<div class="metric"><span>Last</span><b>' + esc(a.last_action || '—') + '</b></div>' +
        '<p style="margin:8px 0 0;color:var(--muted);font-size:.72rem">wants: ' + esc((a.wants || []).join(', ')) +
        ' · quirks: ' + esc((a.quirks || []).join(', ')) +
        ' · @' + esc(a.region) + '</p></article>';
    }).join('');
    $('sotDash').innerHTML = html;
    $('sotDash').querySelectorAll('[data-id]').forEach((card) => {
      card.onclick = () => {
        sotSelectedList = 'agents';
        sotSelectedId = card.getAttribute('data-id');
        const row = (agents.agents || []).find((r) => String(r.id) === String(sotSelectedId));
        if (!row) return;
        $('sotDetail').hidden = false;
        $('sotDetailTitle').textContent = 'Agent · ' + (row.name || row.id);
        $('sotDetailBody').innerHTML = Object.keys(row).map((k) => {
          const v = row[k];
          const shown = typeof v === 'object' ? JSON.stringify(v) : v;
          return '<label>' + esc(k) + '</label><input readonly value="' + esc(shown == null ? '' : shown) + '"/>';
        }).join('');
      };
    });
  }
  async function simAction(days) {
    sotStatus('simulating people + economy…');
    const out = await fetchJson('/api/world/sim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'tick', days: days || 1 })
    }, 60000);
    if (!out.r.ok) {
      sotStatus('sim tick failed: ' + (out.j.error || out.r.status));
      return;
    }
    renderSimDash(out.j);
    sotStatus('sim ok · ' + (out.j.agents && out.j.agents.diegetic_date) + ' · sat ' + ((out.j.agents && out.j.agents.last_summary && out.j.agents.last_summary.avg_satisfaction) || '—'));
  }
  function selectSotItem(listKey, id) {
    sotSelectedList = listKey;
    sotSelectedId = id;
    const rows = (sotDash && sotDash[listKey]) || [];
    const row = rows.find((r) => r && String(r.id) === String(id));
    if (!row) return;
    $('sotDash').querySelectorAll('[data-id]').forEach((el) => {
      el.classList.toggle('is-active', el.getAttribute('data-id') === id && el.getAttribute('data-list') === listKey);
    });
    $('sotDetail').hidden = false;
    $('sotDetailTitle').textContent = 'Detail · ' + (row.name || row.product || row.catch || row.mode || row.label || id);
    const fields = Object.keys(row).filter((k) => k !== 'id');
    $('sotDetailBody').innerHTML = fields.map((k) => {
      return '<label>' + esc(k) + '</label><input data-sot-field="' + esc(k) + '" value="' + esc(row[k] == null ? '' : row[k]) + '"/>';
    }).join('');
  }
  async function loadSot(name) {
    const meta = SOT_MODS[name];
    if (!meta) return;
    activeSot = name;
    sotSelectedId = null;
    sotSelectedList = null;
    $('sotTitle').textContent = meta.title;
    $('sotBlurb').textContent = meta.blurb;
    $('sotPathHint').textContent = 'Source path: ' + meta.path;
    $('sotDetail').hidden = true;
    $('sotDash').innerHTML = '<p class="chip">Loading dashboard…</p>';
    sotStatus('loading…');
    try {
      if (meta.kind === 'weather') {
        const out = await fetchJson('/api/world/weather', null, 15000);
        if (!out.r.ok) throw new Error(out.j.error || ('weather ' + out.r.status));
        renderWeatherDash(out.j);
      } else if (meta.kind === 'sim') {
        const out = await fetchJson('/api/world/sim', null, 20000);
        if (!out.r.ok) throw new Error(out.j.error || ('sim ' + out.r.status));
        renderSimDash(out.j);
      } else {
        const out = await fetchJson('/api/world/summary?module=' + encodeURIComponent(meta.kind), null, 15000);
        if (!out.r.ok) throw new Error(out.j.error || ('summary ' + out.r.status));
        sotDash = out.j;
        if (meta.kind === 'regions') renderRegionsDash(out.j);
        else if (meta.kind === 'agriculture') renderAgDash(out.j);
        else if (meta.kind === 'economy') renderEconomyDash(out.j);
        else if (meta.kind === 'transport') renderTransportDash(out.j);
        else $('sotDash').innerHTML = '<p class="chip">No dashboard for this module.</p>';
      }
    } catch (e) {
      $('sotDash').innerHTML = '<p class="chip" style="border-color:var(--pink);color:var(--pink)">Dashboard load failed: ' + esc(e.message || e) + '</p>';
    }
    const pageOut = await fetchJson('/api/world/page?path=' + encodeURIComponent(meta.path), null, 15000);
    if (!pageOut.r.ok) {
      $('sotText').value = '';
      sotSha = '';
      sotStatus('dashboard ok · notes missing on disk');
      return;
    }
    sotSha = pageOut.j.sha256 || '';
    $('sotText').value = pageOut.j.content || '';
    sotStatus(pageOut.j.truncated ? 'truncated notes view' : '');
  }
  async function weatherAction(action, days) {
    sotStatus(action + '…');
    const body = {
      action: action,
      base_version: weatherState && weatherState.version,
      seed: (weatherState && weatherState.seed) || 'isla-primavera-weather',
      forecast_days: 7
    };
    if (action === 'advance') body.days = days || 1;
    if (action === 'set_date') {
      body.diegetic_date = $('weatherDateInput').value;
      if (!body.diegetic_date) return sotStatus('pick a date');
    }
    if (action === 'regenerate') {
      body.diegetic_date = (weatherState && weatherState.diegetic_date) || undefined;
      body.generate = true;
    }
    const out = await fetchJson('/api/world/weather', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, 20000);
    if (out.r.status === 409) return sotStatus('version conflict — reload Weather');
    if (!out.r.ok) return sotStatus(action + ' failed: ' + (out.j.error || out.r.status));
    renderWeatherDash(out.j);
    sotStatus(action + ' ok · ' + (out.j.diegetic_date || '') + ' · v' + out.j.version);
  }
  async function saveSotDetail() {
    const meta = activeSot && SOT_MODS[activeSot];
    if (!meta) return;
    if (meta.kind === 'weather') {
      if (!sotSelectedId) return sotStatus('select a city card first');
      const patch = {
        temp_f: Number($('wd_temp').value),
        humidity_pct: Number($('wd_hum').value),
        conditions: $('wd_cond').value.trim(),
        wind_mph: Number($('wd_wind').value),
        wind_dir: $('wd_wdir').value.trim(),
        rain_chance_pct: Number($('wd_rain').value),
        festival_risk: $('wd_fest').value.trim(),
        crt_optics: $('wd_crt').value.trim(),
        flood_watch: $('wd_flood').value.trim(),
        vibe: $('wd_vibe').value.trim()
      };
      sotStatus('saving city…');
      const out = await fetchJson('/api/world/weather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'patch_city',
          city_id: sotSelectedId,
          patch: patch,
          base_version: weatherState && weatherState.version
        })
      }, 20000);
      if (out.r.status === 409) return sotStatus('version conflict — reload');
      if (!out.r.ok) return sotStatus('save failed: ' + (out.j.error || out.r.status));
      renderWeatherDash(out.j);
      selectWeatherCity(sotSelectedId);
      return sotStatus('city saved · v' + out.j.version);
    }
    if (!sotSelectedId || !sotSelectedList) return sotStatus('select a card first');
    const patch = {};
    $('sotDetailBody').querySelectorAll('[data-sot-field]').forEach((inp) => {
      patch[inp.getAttribute('data-sot-field')] = inp.value;
    });
    sotStatus('saving…');
    const out = await fetchJson('/api/world/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        module: meta.kind,
        base_version: sotDash && sotDash.version,
        list_key: sotSelectedList,
        patch_item: { id: sotSelectedId, patch: patch }
      })
    }, 20000);
    if (out.r.status === 409) return sotStatus('version conflict — reload');
    if (!out.r.ok) return sotStatus('save failed: ' + (out.j.error || out.r.status));
    sotDash = out.j;
    if (meta.kind === 'regions') renderRegionsDash(out.j);
    else if (meta.kind === 'agriculture') renderAgDash(out.j);
    else if (meta.kind === 'transport') renderTransportDash(out.j);
    selectSotItem(sotSelectedList, sotSelectedId);
    sotStatus('detail saved · v' + out.j.version);
  }
  async function saveSot() {
    const meta = activeSot && SOT_MODS[activeSot];
    if (!meta) return;
    sotStatus('saving notes…');
    const out = await fetchJson('/api/world/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: meta.path, content: $('sotText').value, base_sha256: sotSha })
    }, 20000);
    if (out.r.status === 409) {
      sotStatus('notes changed on disk — reload before saving.');
      return;
    }
    if (!out.r.ok) {
      sotStatus('save failed: ' + (out.j.error || out.r.status));
      return;
    }
    sotSha = out.j.sha256 || sotSha;
    sotStatus('notes saved · ' + (out.j.bytes || 0) + ' bytes');
  }
  function updateEntBulkCount() {
    $('entBulkCount').textContent = entSelected.size + ' selected';
  }
  async function applyEntBulk() {
    const ids = Array.from(entSelected);
    if (!ids.length) return estatus('select places first');
    const patch = {};
    if ($('eBulkKind').value) patch.kind = $('eBulkKind').value;
    if ($('eBulkRegion').value.trim()) patch.region_id = $('eBulkRegion').value.trim();
    if (!Object.keys(patch).length) return estatus('pick kind and/or region_id');
    estatus('bulk saving…');
    const out = await fetchJson('/api/world/entities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bulk: true, ids: ids, patch: patch, base_version: entities && entities.version })
    }, 20000);
    if (out.r.status === 409) return estatus('version conflict — reload places');
    if (!out.r.ok) return estatus('bulk failed: ' + (out.j.error || out.r.status));
    entSelected.clear();
    estatus('bulk updated ' + (out.j.updated || ids.length) + ' · v' + out.j.version);
    await loadEntities(activeEnt && activeEnt.id);
  }
  function entById(id) {
    return (entities && entities.entities || []).find((e) => String(e.id) === String(id)) || null;
  }
  async function renderRegionsDatalist() {
    try {
      const r = await fetch('/api/regions', { cache: 'no-store' });
      const j = await r.json();
      const regs = Array.isArray(j.regions) ? j.regions : [];
      $('regionList').innerHTML = regs.map((x) => '<option value="' + esc(x.id) + '">' + esc(x.name || x.id) + '</option>').join('');
    } catch (e) { /* datalist stays empty */ }
  }
  async function loadEntities(selectId) {
    estatus('loading…');
    const r = await fetch('/api/world/entities', { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('entities ' + r.status));
    entities = j;
    $('entMeta').textContent = 'entities v' + (j.version || '?') + ' · ' + (j.entities || []).length + ' rows';
    renderRegionsDatalist();
    renderEntities();
    const wanted = selectId || (activeEnt && activeEnt.id) || (j.entities[0] && j.entities[0].id);
    if (wanted) selectEntity(wanted);
    estatus('');
  }
  function renderEntities() {
    if (!entities) return;
    const q = String($('eq').value || '').toLowerCase();
    const list = (entities.entities || []).filter((e) => {
      const hay = [e.id, e.kind, e.name, (e.aliases || []).join(' '), e.location, e.region_id, (e.facts || []).join(' ')].join(' ').toLowerCase();
      return !q || hay.includes(q);
    });
    $('entList').innerHTML = list.map((e) => {
      const checked = entSelected.has(e.id) ? ' checked' : '';
      return '<li class="rost-row"><input type="checkbox" data-bulk="' + esc(e.id) + '"' + checked + '/><button type="button" class="rost' + (activeEnt && activeEnt.id === e.id ? ' is-active' : '') + '" data-id="' + esc(e.id) + '"><span class="face">' + esc(String(e.kind || '?').slice(0, 1).toUpperCase()) + '</span><span><strong>' + esc(e.name || e.id) + '</strong><span>' + esc([e.kind, e.region_id].filter(Boolean).join(' · ')) + '</span></span></button></li>';
    }).join('') || '<li class="chip">No matches.</li>';
    $('entList').querySelectorAll('button[data-id]').forEach((b) => { b.onclick = () => selectEntity(b.getAttribute('data-id')); });
    $('entList').querySelectorAll('input[data-bulk]').forEach((cb) => {
      cb.onchange = () => {
        const id = cb.getAttribute('data-bulk');
        if (cb.checked) entSelected.add(id); else entSelected.delete(id);
        updateEntBulkCount();
      };
    });
    updateEntBulkCount();
  }
  function selectEntity(id) {
    activeEnt = entById(id);
    if (!activeEnt) return;
    renderEntities();
    $('e_id').value = activeEnt.id || '';
    $('e_kind').value = activeEnt.kind || 'place';
    $('e_region').value = activeEnt.region_id || '';
    $('e_name').value = activeEnt.name || '';
    $('e_aliases').value = (activeEnt.aliases || []).join(', ');
    $('e_location').value = activeEnt.location || '';
    $('e_facts').value = (activeEnt.facts || []).join('\\n');
    $('e_related').value = (activeEnt.related_ids || []).join(', ');
    estatus('');
  }
  function parseLines(v) {
    return String(v || '').split('\\n').map((s) => s.trim()).filter(Boolean);
  }
  async function saveEntity() {
    if (!activeEnt || !entities) return;
    estatus('saving…');
    const body = {
      base_version: entities.version,
      id: activeEnt.id,
      kind: $('e_kind').value.trim(),
      region_id: $('e_region').value.trim(),
      name: $('e_name').value.trim(),
      aliases: parseAliases($('e_aliases').value),
      location: $('e_location').value.trim(),
      facts: parseLines($('e_facts').value),
      related_ids: parseAliases($('e_related').value),
    };
    const r = await fetch('/api/world/entities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409) {
      estatus('version conflict — reload places, then re-apply.');
      return;
    }
    if (!r.ok) {
      estatus('save failed: ' + (j.error || r.status));
      return;
    }
    estatus('saved · entities v' + j.version);
    await loadEntities(j.id || activeEnt.id);
  }
  async function addEntity() {
    const name = $('eNewName').value.trim();
    if (!name) return estatus('name required for new entity');
    estatus('creating…');
    const r = await fetch('/api/world/entities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ create: true, base_version: entities && entities.version, name: name, kind: $('eNewKind').value }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      estatus('create failed: ' + (j.error || r.status));
      return;
    }
    $('eNewName').value = '';
    await loadEntities(j.id);
  }
  async function loadDocs() {
    dstatus('loading…');
    const r = await fetch('/api/world/pages', { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('pages ' + r.status));
    pages = Array.isArray(j.files) ? j.files : [];
    $('docMeta').textContent = pages.length + ' pages';
    renderDocs();
    dstatus('');
  }
  function docDisplayName(rel) {
    const base = String(rel || '').split('/').pop() || 'page';
    return base.replace(/\\.md$/i, '').replace(/[-_]+/g, ' ');
  }
  function docFolderLabel(rel) {
    const parts = String(rel || '').split('/');
    if (parts.length < 2) return 'notes';
    return parts.slice(0, -1).join(' / ');
  }
  function renderDocs() {
    const q = String($('dq').value || '').toLowerCase();
    const list = pages.filter((p) => {
      const hay = [docDisplayName(p.path), docFolderLabel(p.path), p.path].join(' ').toLowerCase();
      return !q || hay.includes(q);
    });
    $('docList').innerHTML = list.map((p) => {
      return '<li><button type="button" class="rost' + (activePage === p.path ? ' is-active' : '') + '" data-path="' + esc(p.path) + '"><span class="face">¶</span><span><strong class="doc-title">' + esc(docDisplayName(p.path)) + '</strong><span class="doc-sub">' + esc(docFolderLabel(p.path)) + '</span></span></button></li>';
    }).join('') || '<li class="chip">No pages.</li>';
    $('docList').querySelectorAll('button[data-path]').forEach((b) => { b.onclick = () => loadDoc(b.getAttribute('data-path')); });
  }
  async function loadDoc(rel) {
    dstatus('loading…');
    const r = await fetch('/api/world/page?path=' + encodeURIComponent(rel), { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      dstatus('load failed: ' + (j.error || r.status));
      return;
    }
    activePage = j.path;
    pageSha = j.sha256 || '';
    $('docPath').textContent = docFolderLabel(j.path) + ' · ' + (j.bytes || 0) + ' bytes';
    $('docTitle').textContent = docDisplayName(j.path);
    $('docText').value = j.content || '';
    if (window.marked && marked.parse) {
      if (marked.setOptions) marked.setOptions({ breaks: true, gfm: true });
      $('docPreview').innerHTML = marked.parse(j.content || '');
    } else {
      $('docPreview').innerHTML = '<pre>' + esc(j.content || '') + '</pre>';
    }
    renderDocs();
    dstatus(j.truncated ? 'truncated view — file too large to edit safely' : '');
  }
  async function saveDoc() {
    if (!activePage) return;
    dstatus('saving…');
    const r = await fetch('/api/world/page', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: activePage, content: $('docText').value, base_sha256: pageSha }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409) {
      dstatus('page changed on disk — reload before saving.');
      return;
    }
    if (!r.ok) {
      dstatus('save failed: ' + (j.error || r.status));
      return;
    }
    pageSha = j.sha256 || pageSha;
    dstatus('saved · ' + (j.bytes || 0) + ' bytes');
  }
  init().catch((e) => {
    worldErr('World editor failed: ' + (e.message || e));
    $('who').textContent = 'error';
    bindMods();
  });
})();
</script>
</body>
</html>`;
}

/** Dedicated Dev calendar page (not a map overlay). HUD chip navigates here like WORLD → /world. */
function devlogPageHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Dev calendar — tableslop</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=VT323&family=Share+Tech+Mono&display=swap" rel="stylesheet"/>
<style>
  :root {
    --void:#0d0221; --panel:#16082a; --text:#e8f4ff; --muted:#9d8fc9;
    --pink:#ff71ce; --cyan:#01cdfe; --purple:#b967ff; --sun:#fffb96;
    --glow-pink:rgba(255,113,206,.55); --glow-cyan:rgba(1,205,254,.45);
  }
  * { box-sizing:border-box; }
  html, body { margin:0; min-height:100%; }
  body {
    font:15px/1.45 "Share Tech Mono",monospace; color:var(--text);
    background:radial-gradient(1200px 600px at 20% -10%, rgba(255,113,206,.12), transparent),
      radial-gradient(900px 500px at 90% 0%, rgba(1,205,254,.1), transparent), #0a0a0e;
  }
  .hud {
    display:flex; align-items:center; gap:14px; flex-wrap:wrap;
    padding:10px 16px; border-bottom:2px solid transparent;
    border-image:linear-gradient(90deg, var(--pink), var(--cyan), var(--purple)) 1;
    background:linear-gradient(180deg, rgba(22,8,42,.98), rgba(13,2,33,.98));
  }
  .hud-brand {
    font:700 1rem Orbitron,sans-serif; letter-spacing:.18em; text-transform:uppercase;
    background:linear-gradient(90deg, var(--pink), var(--cyan));
    -webkit-background-clip:text; background-clip:text; color:transparent;
    text-decoration:none;
  }
  .hud a.back {
    font:700 .7rem Orbitron,sans-serif; letter-spacing:.08em; text-transform:uppercase;
    color:var(--cyan); border:1px solid var(--cyan); padding:6px 10px; text-decoration:none;
  }
  .hud a.back:hover { color:var(--pink); border-color:var(--pink); }
  .wrap { max-width:920px; margin:0 auto; padding:20px 16px 48px; }
  h1 {
    margin:0 0 6px; font:700 1.2rem Orbitron,sans-serif; letter-spacing:.1em;
    color:var(--sun); text-transform:uppercase;
  }
  .sub { color:var(--muted); margin:0 0 18px; font-size:.9rem; }
  .dc-sec { margin:0 0 22px; padding:14px 16px; background:rgba(22,8,42,.85);
    border:1px solid rgba(185,103,255,.35); }
  .dc-sec h4 {
    margin:0 0 10px; font:700 .75rem Orbitron,sans-serif; letter-spacing:.12em;
    color:var(--pink); text-transform:uppercase;
  }
  .dc-list { list-style:none; margin:0; padding:0; }
  .dc-item { padding:10px 0; border-top:1px solid rgba(1,205,254,.15); }
  .dc-item:first-child { border-top:0; }
  .dc-item-top { display:flex; flex-wrap:wrap; gap:8px; align-items:baseline; }
  .dc-item-title { font-weight:700; color:var(--text); }
  .dc-when { color:var(--cyan); font-size:.8rem; }
  .dc-notes { margin:6px 0 0; color:var(--muted); font-size:.85rem; }
  .dc-badge {
    font:700 .62rem Orbitron,sans-serif; letter-spacing:.06em; text-transform:uppercase;
    padding:2px 6px; border:1px solid var(--purple); color:var(--purple);
  }
  .dc-badge--done, .dc-badge--fixed { border-color:var(--cyan); color:var(--cyan); }
  .dc-badge--doing { border-color:var(--sun); color:var(--sun); }
  .dc-badge--blocked, .dc-badge--high { border-color:var(--pink); color:var(--pink); }
  .dc-admin { margin-top:24px; padding:14px 16px; border:1px solid var(--cyan);
    background:rgba(1,205,254,.06); }
  .dc-admin[hidden] { display:none !important; }
  .dc-admin h4 { margin:0 0 10px; color:var(--cyan); font:700 .75rem Orbitron,sans-serif;
    letter-spacing:.1em; text-transform:uppercase; }
  .dc-admin-form {
    display:grid; grid-template-columns:1fr 1fr; gap:8px;
  }
  .dc-admin-form .dc-span2 { grid-column:1 / -1; }
  .dc-admin-form input, .dc-admin-form select, .dc-admin-form textarea, .dc-admin-form button {
    font:inherit; color:var(--text); background:rgba(0,0,0,.35);
    border:1px solid rgba(1,205,254,.35); padding:8px;
  }
  .dc-admin-form button {
    cursor:pointer; font:700 .7rem Orbitron,sans-serif; letter-spacing:.08em;
    text-transform:uppercase; border-color:var(--sun); color:var(--sun);
    background:rgba(255,251,150,.1);
  }
  .dc-status { margin-top:8px; color:var(--pink); min-height:1.2em; font-size:.8rem; }
</style>
</head>
<body>
<header class="hud">
  <a class="hud-brand" href="/">TABLESLOP</a>
  <span style="color:var(--sun);font:1.1rem VT323,monospace">Dev calendar</span>
  <a class="back" href="/">← Map</a>
</header>
<main class="wrap">
  <h1>Dev calendar</h1>
  <p class="sub">Product roadmap for map.tableslop.org — timeline, features, known bugs. Estimates are GM-editable. Not diegetic lore.</p>
  <div id="dcBody">Loading…</div>
  <div class="dc-admin" id="dcAdmin" hidden>
    <h4>Add (admin)</h4>
    <form class="dc-admin-form" id="dcAddForm">
      <select name="section" aria-label="Section" required>
        <option value="bugs">Bug</option>
        <option value="features">Feature</option>
        <option value="timeline">Timeline</option>
      </select>
      <select name="status" aria-label="Status">
        <option value="open">open / planned</option>
        <option value="doing">doing</option>
        <option value="done">done / fixed</option>
        <option value="blocked">blocked</option>
      </select>
      <input class="dc-span2" name="title" placeholder="Title" required maxlength="160" />
      <input name="when" placeholder="When / target (estimate OK)" maxlength="80" />
      <select name="severity" aria-label="Severity (bugs)">
        <option value="">severity (bugs)</option>
        <option value="low">low</option>
        <option value="med">med</option>
        <option value="high">high</option>
      </select>
      <textarea class="dc-span2" name="notes" placeholder="Notes (optional)" maxlength="800"></textarea>
      <button type="submit" class="dc-span2">Add item</button>
    </form>
    <div class="dc-status" id="dcStatus"></div>
  </div>
</main>
<script>
(function () {
  const bodyEl = document.getElementById('dcBody');
  const adminEl = document.getElementById('dcAdmin');
  const statusEl = document.getElementById('dcStatus');
  const form = document.getElementById('dcAddForm');
  let cache = null;
  let meCache = null;
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function badge(cls, text) {
    return '<span class="dc-badge dc-badge--' + cls + '">' + escapeHtml(text) + '</span>';
  }
  function itemHtml(it, kind) {
    const st = String(it.status || '').toLowerCase();
    const sev = String(it.severity || '').toLowerCase();
    let badges = badge(st || 'planned', st || '—');
    if (kind === 'bugs' && sev) badges += ' ' + badge(sev, sev);
    const when = it.when || it.target || '';
    return '<li class="dc-item"><div class="dc-item-top">' +
      '<span class="dc-item-title">' + escapeHtml(it.title || it.id || '') + '</span>' +
      badges +
      (when ? '<span class="dc-when">' + escapeHtml(when) + '</span>' : '') +
      '</div>' +
      (it.notes ? '<p class="dc-notes">' + escapeHtml(it.notes) + '</p>' : '') +
      '</li>';
  }
  function section(title, rows, kind) {
    if (!rows || !rows.length) {
      return '<section class="dc-sec"><h4>' + title + '</h4><p class="dc-notes">None yet.</p></section>';
    }
    return '<section class="dc-sec"><h4>' + title + '</h4><ul class="dc-list">' +
      rows.map(function (it) { return itemHtml(it, kind); }).join('') +
      '</ul></section>';
  }
  function render(data) {
    cache = data;
    const tl = (data.timeline || []).slice().sort(function (a, b) {
      return String(a.when || '').localeCompare(String(b.when || ''));
    });
    bodyEl.innerHTML =
      section('Timeline', tl, 'timeline') +
      section('Features', data.features || [], 'features') +
      section('Bugs / issues', data.bugs || [], 'bugs') +
      '<p class="dc-notes" style="margin-top:12px">v' + escapeHtml(String(data.version || 1)) +
      (data.updated_at ? ' · updated ' + escapeHtml(data.updated_at) : '') + '</p>';
    const canEdit = meCache && (meCache.can_edit === true ||
      (meCache.logged_in && (meCache.role === 'owner' || meCache.role === 'admin')));
    if (adminEl) adminEl.hidden = !canEdit;
  }
  async function loadCal() {
    bodyEl.textContent = 'Loading…';
    try {
      const r = await fetch('/api/dev-calendar', { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
      render(data);
    } catch (err) {
      bodyEl.textContent = 'Failed: ' + err.message;
    }
  }
  if (form) {
    form.onsubmit = async function (ev) {
      ev.preventDefault();
      if (!cache) return;
      const fd = new FormData(form);
      const sectionName = String(fd.get('section') || 'bugs');
      let status = String(fd.get('status') || 'open');
      if (sectionName === 'features' || sectionName === 'timeline') {
        if (status === 'open') status = 'planned';
        if (status === 'fixed') status = 'done';
      } else if (status === 'planned') status = 'open';
      if (status === 'done' && sectionName === 'bugs') status = 'fixed';
      const item = {
        title: String(fd.get('title') || '').trim(),
        notes: String(fd.get('notes') || '').trim(),
        status: status,
      };
      const when = String(fd.get('when') || '').trim();
      if (sectionName === 'timeline') item.when = when || 'TBD';
      else if (sectionName === 'features') item.target = when || 'TBD';
      else if (when) item.when = when;
      const sev = String(fd.get('severity') || '').trim();
      if (sectionName === 'bugs' && sev) item.severity = sev;
      if (statusEl) statusEl.textContent = 'Saving…';
      try {
        const r = await fetch('/api/dev-calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base_version: cache.version,
            action: 'add',
            section: sectionName,
            item: item,
          }),
        });
        const out = await r.json();
        if (!r.ok) throw new Error(out.error || ('HTTP ' + r.status));
        if (statusEl) statusEl.textContent = 'Added ' + (out.item && out.item.id ? out.item.id : 'ok');
        form.reset();
        render(out.calendar || out);
      } catch (err) {
        if (statusEl) statusEl.textContent = 'Failed: ' + err.message;
      }
    };
  }
  (async function boot() {
    try {
      const meR = await fetch('/api/me', { cache: 'no-store' });
      if (meR.ok) meCache = await meR.json();
    } catch (_) { /* public read still works */ }
    await loadCal();
  })();
})();
</script>
</body>
</html>`;
}

function viewerHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>tableslop — ${CAMPAIGN}</title>
<!-- Eager underlay: pyramid-matched master (not mislabeled 1024 "2k") so Roads lock to green art. -->
<meta name="tableslop-build" content="2026-08-10-hwy-wireframe-plane"/>
<link rel="preload" as="image" href="/map-image?v=20260810roads"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=VT323&family=Share+Tech+Mono&display=swap" rel="stylesheet"/>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="/wiki-entity-links.js?v=20260807e"></script>
<style>
  :root {
    --void:#0d0221; --panel:#16082a; --line:#ff71ce; --text:#e8f4ff; --muted:#9d8fc9;
    --pink:#ff71ce; --cyan:#01cdfe; --purple:#b967ff; --sun:#fffb96; --magenta:#ff006e;
    --glow-pink:rgba(255,113,206,.55); --glow-cyan:rgba(1,205,254,.45);
  }
  * { box-sizing:border-box; }
  html, body { height:100%; margin:0; overflow:hidden; }
  body {
    display:flex; flex-direction:column;
    height:100vh; height:100dvh;
    font:15px/1.4 "Share Tech Mono",monospace;
    background:#0a0a0e; color:var(--text);
  }
  .hud {
    flex:0 0 auto;
    display:flex; align-items:center; gap:14px; flex-wrap:wrap;
    padding:10px 16px;
    border-bottom:2px solid transparent;
    border-image:linear-gradient(90deg, var(--pink), var(--cyan), var(--purple)) 1;
    background:linear-gradient(180deg, rgba(22,8,42,.98), rgba(13,2,33,.98));
    box-shadow:0 0 24px rgba(255,113,206,.15);
    /* Wrapped chips (dev log) must stay above the map for hit-testing. */
    position:relative; z-index:20;
  }
  .hud-brand {
    font:700 1rem Orbitron,sans-serif; letter-spacing:.18em; text-transform:uppercase;
    background:linear-gradient(90deg, var(--pink), var(--cyan));
    -webkit-background-clip:text; background-clip:text; color:transparent;
    text-shadow:0 0 20px var(--glow-pink);
  }
  .hud-setting {
    font:1.1rem VT323,monospace; color:var(--sun);
    text-shadow:0 0 12px rgba(255,251,150,.5); letter-spacing:.06em;
  }
  .hud-user { color:var(--muted); font-size:.85rem; margin-left:auto; }
  .hud-logout { color:var(--cyan); font-size:.8rem; margin-left:8px; text-decoration:none; }
  .hud-logout:hover { text-shadow:0 0 8px var(--glow-cyan); }
  .hud-res {
    font:inherit; font-size:.7rem; letter-spacing:.08em; text-transform:uppercase;
    color:var(--cyan); background:rgba(1,205,254,.08); border:1px solid var(--cyan);
    padding:4px 12px; cursor:pointer;
    box-shadow:0 0 8px var(--glow-cyan);
  }
  a.hud-res { text-decoration:none; display:inline-flex; align-items:center; }
  .hud-res:hover { background:rgba(255,113,206,.12); border-color:var(--pink); color:var(--pink); }
  /* WORLD — neon pink; sits after orange docks, before REPORT */
  .hud-world {
    color:#ff2bd6; background:rgba(255,43,214,.14); border-color:#ff2bd6;
    box-shadow:0 0 14px rgba(255,43,214,.65), 0 0 4px rgba(255,120,255,.9);
    text-shadow:0 0 8px rgba(255,43,214,.55);
  }
  a.hud-world:hover, .hud-world:hover {
    color:#fff0fb; background:rgba(255,43,214,.28); border-color:#ff7ae8;
    box-shadow:0 0 18px rgba(255,43,214,.85);
  }
  /* DEV LOG — green box after REPORT */
  .hud-devlog {
    color:#04140a; background:rgba(57,255,136,.92); border-color:#1dff7a;
    box-shadow:0 0 12px rgba(57,255,136,.55);
    font-weight:700;
  }
  .hud-devlog:hover {
    filter:brightness(1.08); color:#021008; border-color:#7dffb0;
  }
  .hud-devlog.is-on {
    background:rgba(30,220,110,.98); box-shadow:0 0 16px rgba(57,255,136,.75);
  }
  .hud-edit.is-on { border-color:var(--sun); color:var(--sun); box-shadow:0 0 12px rgba(255,251,150,.45); }
  .hud-save { border-color:var(--cyan); color:var(--cyan); }
  .hud-save.is-dirty { border-color:var(--sun); color:var(--sun); animation:lane-breathe 1.2s ease-in-out infinite; }
  .hud-auth { margin-left:auto; display:flex; align-items:center; gap:10px; font-size:.85rem; }
  .hud-auth a { color:var(--cyan); text-decoration:none; }
  .hud-auth a:hover { text-shadow:0 0 8px var(--glow-cyan); }
  .hud-avatar { width:22px; height:22px; border-radius:50%; border:1px solid var(--purple); vertical-align:middle; }
  .hud-role { font-size:.62rem; letter-spacing:.1em; text-transform:uppercase; padding:1px 7px; border-radius:8px; border:1px solid var(--muted); color:var(--muted); }
  .hud-role--owner { border-color:var(--sun); color:var(--sun); }
  .hud-role--admin { border-color:var(--cyan); color:var(--cyan); }
  .hud-login { font-size:.7rem; letter-spacing:.08em; text-transform:uppercase; padding:5px 10px; border:1px solid var(--cyan); border-radius:4px; background:rgba(1,205,254,.08); }
  .hud-login-hint { color:var(--muted); font-size:.68rem; letter-spacing:.04em; }
  .hud-users-btn { font:inherit; font-size:.62rem; letter-spacing:.1em; text-transform:uppercase; color:var(--sun); background:none; border:1px solid var(--sun); border-radius:4px; padding:3px 8px; cursor:pointer; }
  .hud-mychar { font-size:.68rem; letter-spacing:.06em; color:var(--pink); text-decoration:none; border-bottom:1px dotted rgba(255,113,206,.5); }
  .hud-mychar:hover { text-shadow:0 0 8px var(--glow-pink); }
  .auth-users { position:fixed; top:52px; right:12px; z-index:60; width:320px; max-height:70vh; overflow:auto; background:var(--panel); border:1px solid var(--purple); border-radius:8px; padding:12px; box-shadow:0 8px 32px rgba(0,0,0,.6); }
  .auth-users h3 { margin:0 0 8px; font-size:.75rem; letter-spacing:.12em; text-transform:uppercase; color:var(--purple); }
  .auth-users .au-row { display:flex; align-items:center; gap:8px; padding:6px 0; border-top:1px solid rgba(185,103,255,.18); font-size:.78rem; }
  .auth-users .au-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .auth-users .au-role-badge { font-size:.6rem; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
  .auth-users select { font:inherit; font-size:.72rem; background:var(--void); color:var(--text); border:1px solid var(--muted); border-radius:4px; padding:2px 4px; }
  .auth-users button { font:inherit; font-size:.68rem; color:var(--cyan); background:none; border:1px solid var(--cyan); border-radius:4px; padding:2px 8px; cursor:pointer; }
  .auth-users .au-status { font-size:.68rem; color:var(--muted); min-height:1em; margin-top:6px; }
  .auth-users .au-add { display:grid; gap:6px; margin-top:10px; padding-top:8px; border-top:1px solid rgba(185,103,255,.18); }
  .auth-users .au-add input, .auth-users .au-add select {
    font:inherit; font-size:.72rem; background:var(--void); color:var(--text);
    border:1px solid var(--muted); border-radius:4px; padding:4px 6px; width:100%; box-sizing:border-box;
  }
  body.day .auth-users { background:rgba(253,243,250,.97); }
  .pilot-panel {
    padding:12px 14px 10px; border-bottom:1px solid rgba(255,113,206,.25);
    position:relative; z-index:1;
  }
  .pilot-name { font:1.05rem VT323,monospace; color:var(--sun); text-shadow:0 0 10px rgba(255,251,150,.4); }
  .pilot-meta { color:var(--muted); font-size:.72rem; margin-top:4px; }
  .pilot-stats { margin-top:8px; font-size:.75rem; color:var(--cyan); }
  .pilot-note {
    width:100%; margin-top:10px; min-height:56px; resize:vertical;
    font:inherit; font-size:.85rem; color:var(--text);
    background:rgba(13,2,33,.8); border:1px solid rgba(1,205,254,.35);
    padding:8px; color-scheme:dark;
  }
  .pilot-note:focus { outline:none; border-color:var(--pink); box-shadow:0 0 12px var(--glow-pink); }
  .pilot-note-label { display:block; margin-top:10px; font-size:.65rem; text-transform:uppercase; letter-spacing:.12em; color:var(--muted); }
  .city-map-link {
    display:block; margin-top:10px; padding:7px 10px; text-align:center;
    font:700 .7rem Orbitron,sans-serif; letter-spacing:.1em; text-transform:uppercase;
    color:var(--cyan); text-decoration:none; border:1px solid var(--cyan);
    box-shadow:0 0 8px var(--glow-cyan);
  }
  .city-map-link:hover { color:var(--pink); border-color:var(--pink); box-shadow:0 0 12px var(--glow-pink); }
  .city-map-link[hidden] { display:none; }
  /* isla-lived-in: compact demographics + rentals in journal (not fullscreen) */
  .lived-in-box {
    margin-top:10px; padding:8px 9px; border:1px solid rgba(1,205,254,.28);
    background:rgba(13,2,33,.72); border-radius:4px; font-size:.72rem; color:var(--text);
  }
  .lived-in-box[hidden] { display:none; }
  .lived-in-box h3 {
    margin:0 0 6px; font:700 .65rem Orbitron,sans-serif; letter-spacing:.1em;
    text-transform:uppercase; color:var(--cyan);
  }
  .lived-in-box .li-stats { color:var(--sun); margin-bottom:6px; line-height:1.35; }
  .lived-in-box .li-dist { color:var(--muted); font-size:.68rem; margin-bottom:6px; max-height:3.2em; overflow:hidden; }
  .lived-in-box .li-list { display:grid; gap:5px; margin:0; padding:0; list-style:none; }
  .lived-in-box .li-list li {
    border-top:1px dashed rgba(185,103,255,.22); padding-top:4px; color:var(--text);
  }
  .lived-in-box .li-price { color:var(--green, #05ffa1); float:right; font-weight:700; }
  .lived-in-box .li-more {
    display:inline-block; margin-top:7px; color:var(--pink); text-decoration:none;
    font:700 .62rem Orbitron,sans-serif; letter-spacing:.08em; text-transform:uppercase;
  }
  .lived-in-box .li-more:hover { text-decoration:underline; }
  .game-shell {
    flex:1; min-height:0; overflow:hidden;
    display:grid; grid-template-columns:1fr var(--journal-w, min(300px, 32vw));
  }
  .mobile-map-stub { display:none; }
  @media (max-width:800px) {
    .game-shell {
      grid-template-columns:1fr;
      grid-template-rows:auto minmax(0, 1fr);
    }
    .journal-resize { display:none !important; }
    /* Map paused on phone — journal / docks are the product surface for now. */
    .map-viewport { display:none !important; }
    .mobile-map-stub {
      display:block;
      margin:0;
      padding:14px 16px 12px;
      border-bottom:1px solid rgba(185,103,255,.35);
      background:linear-gradient(135deg, rgba(22,8,42,.98), rgba(8,24,40,.95));
    }
    .mobile-map-stub-title {
      margin:0 0 6px;
      font:700 .72rem Orbitron,sans-serif;
      letter-spacing:.14em;
      text-transform:uppercase;
      color:var(--sun);
    }
    .mobile-map-stub-body {
      margin:0;
      font-size:.82rem;
      line-height:1.4;
      color:var(--muted);
      max-width:36rem;
    }
    .region-journal {
      min-height:0;
      height:100%;
      max-height:none;
      overflow:auto;
      -webkit-overflow-scrolling:touch;
      box-shadow:none;
    }
    .hud {
      gap:8px;
      padding:8px 10px;
      padding-top:max(8px, env(safe-area-inset-top));
    }
    .hud-brand { font-size:.85rem; letter-spacing:.12em; }
    .hud-setting { font-size:1rem; }
    .hud-res, .hud-dock, .hud-cast, .hud-login, .hud-users-btn {
      font-size:.62rem;
      padding:5px 8px;
    }
    /* Map-only chrome — hidden while map is blocked on mobile */
    #resToggle, #areasToggle, #labelToggle, #citiesToggle,
    #editToggle, #drawToggle, #saveCoordsBtn, #map3dToggle,
    #drawBar { display:none !important; }
    .auth-users {
      left:8px; right:8px; width:auto; top:auto;
      max-height:min(70vh, 520px);
    }
  }
  .map-viewport {
    position:relative; min-height:0; overflow:hidden;
    overscroll-behavior:none;
    touch-action:none; user-select:none;
    background:#0a0a0e;
    cursor:grab;
  }
  .map-viewport.is-dragging { cursor:grabbing; }
  .map-viewport .fx-sunset { pointer-events:none; }
  .map-camera {
    position:absolute; inset:0; transform-origin:0 0;
    will-change:transform; overflow:visible;
  }
  .map-stage { position:relative; display:inline-block; line-height:0; z-index:1; }
  .map-stack { position:relative; width:100%; height:100%; }
  .map-layer {
    position:absolute; inset:0; pointer-events:none; overflow:visible;
  }
  .map-layer.is-hidden { display:none; }
  .map-tile-layer { position:absolute; inset:0; pointer-events:none; overflow:visible; }
  .map-tile-layer img {
    position:absolute; display:block; image-rendering:auto;
    transition:opacity .12s ease;
  }
  /* Glow on the layer, not the img — a 2px border on #mapImg inset the underlay
     vs full-bleed Roads/regions and grew in screen-px as you zoomed (roads looked like they drifted). */
  .map-layer--terrain-base {
    box-shadow:0 0 40px var(--glow-pink), 0 0 80px rgba(1,205,254,.15);
  }
  .map-layer--terrain-base img#mapImg {
    display:block; width:100%; height:100%;
    opacity:1; /* hard visible — do not rely on animation fill */
    border:0;
    box-shadow:none;
  }
  .map-load-chip {
    position:absolute; top:42px; left:50%; transform:translateX(-50%); z-index:8;
    max-width:min(520px, 92%); padding:8px 12px; text-align:center;
    font:700 .68rem Orbitron,sans-serif; letter-spacing:.08em; text-transform:uppercase;
    color:var(--sun); border:1px solid rgba(255,251,150,.45);
    background:rgba(13,2,33,.88); box-shadow:0 0 16px rgba(255,251,150,.25);
  }
  .map-load-chip.is-err {
    color:var(--pink); border-color:var(--pink);
    box-shadow:0 0 16px var(--glow-pink);
  }
  .map-load-chip[hidden] { display:none !important; }
  .map-area-svg {
    width:100%; height:100%; display:block; overflow:visible;
  }
  /* Region fills: natural washes (opaque hex + fill-opacity). Neon/vaporwave = HUD chrome only. */
  .map-area-zone {
    fill:#6b8f71; fill-opacity:0.18; stroke:#4a6b52; stroke-width:.5;
    vector-effect:non-scaling-stroke; pointer-events:all; cursor:pointer;
    transition:fill .15s, fill-opacity .15s, stroke .15s, stroke-width .15s, filter .15s, opacity .15s;
  }
  /* Hover/selected: slight bump — large mustard polys looked solid at ≥0.34 */
  .map-area-zone:hover {
    fill-opacity:0.24 !important; stroke:#7ef6ff !important; stroke-width:1.05 !important;
    filter:drop-shadow(0 0 3px rgba(1,205,254,.55));
  }
  .map-area-zone.is-active {
    fill-opacity:0.26 !important; stroke:#fff59a !important; stroke-width:1.25 !important;
    filter:drop-shadow(0 0 4px rgba(255,251,150,.55));
  }
  .map-area-zone.is-dim { opacity:.28; }
  .map-layer--poi-pins .pin { pointer-events:auto; }
  .fb-modal {
    position:fixed; inset:0; z-index:40; display:flex; align-items:center; justify-content:center;
    background:rgba(5,0,16,.72); padding:16px;
  }
  .fb-modal[hidden] { display:none !important; }
  .fb-card {
    width:min(440px,100%); max-height:90vh; overflow:auto;
    background:rgba(13,2,33,.96); border:1px solid var(--cyan);
    box-shadow:0 0 28px var(--glow-cyan); padding:16px 18px;
  }
  .fb-card h3 {
    margin:0 0 8px; font:700 .85rem Orbitron,sans-serif; letter-spacing:.1em;
    color:var(--sun); text-transform:uppercase;
  }
  .fb-card p { margin:0 0 10px; color:var(--muted); font-size:.78rem; line-height:1.35; }
  .fb-card textarea, .fb-card input[type=text] {
    width:100%; box-sizing:border-box; margin:0 0 10px;
    background:rgba(0,0,0,.35); border:1px solid rgba(1,205,254,.35);
    color:var(--text); font:inherit; padding:8px;
  }
  .fb-card textarea { min-height:72px; resize:vertical; }
  .fb-preview {
    width:100%; max-height:180px; object-fit:contain; display:block;
    margin:0 0 10px; background:#000; border:1px solid rgba(255,251,150,.3);
  }
  .fb-preview[hidden] { display:none; }
  .fb-actions { display:flex; flex-wrap:wrap; gap:8px; }
  .fb-actions button {
    font:700 .7rem Orbitron,sans-serif; letter-spacing:.08em; text-transform:uppercase;
    padding:8px 12px; cursor:pointer; border:1px solid var(--cyan);
    background:rgba(1,205,254,.12); color:var(--cyan);
  }
  .fb-actions button.primary { border-color:var(--sun); color:var(--sun); background:rgba(255,251,150,.12); }
  .fb-actions button:disabled { opacity:.4; cursor:not-allowed; }
  .fb-status { margin-top:8px; font-size:.75rem; color:var(--pink); min-height:1.2em; }
  .fb-draw-hint { font-size:.7rem; color:var(--cyan); margin:0 0 8px; }
  .dc-modal {
    position:fixed; inset:0; z-index:42; display:flex; align-items:flex-start; justify-content:center;
    background:rgba(5,0,16,.78); padding:52px 16px 16px; overflow:auto;
  }
  .dc-modal[hidden] { display:none !important; }
  .dc-card {
    width:min(720px,100%); max-height:min(88vh, 920px); overflow:auto;
    background:rgba(10,18,14,.97); border:1px solid #1dff7a;
    box-shadow:0 0 28px rgba(57,255,136,.25); padding:16px 18px 18px;
  }
  .dc-card h3 {
    margin:0 0 4px; font:700 .85rem Orbitron,sans-serif; letter-spacing:.1em;
    color:#1dff7a; text-transform:uppercase;
  }
  .dc-sub { margin:0 0 12px; color:var(--muted); font-size:.75rem; line-height:1.35; }
  .dc-head { display:flex; align-items:flex-start; gap:10px; }
  .dc-head .dc-titles { flex:1; min-width:0; }
  .dc-close {
    font:700 .65rem Orbitron,sans-serif; letter-spacing:.08em; text-transform:uppercase;
    padding:6px 10px; cursor:pointer; border:1px solid rgba(157,143,201,.5);
    background:transparent; color:var(--muted);
  }
  .dc-close:hover { color:var(--pink); border-color:var(--pink); }
  .dc-sec { margin:14px 0 0; }
  .dc-sec h4 {
    margin:0 0 8px; font:700 .68rem Orbitron,sans-serif; letter-spacing:.12em;
    text-transform:uppercase; color:var(--cyan);
  }
  .dc-list { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
  .dc-item {
    border:1px solid rgba(57,255,136,.22); background:rgba(0,0,0,.28);
    padding:8px 10px;
  }
  .dc-item-top { display:flex; flex-wrap:wrap; gap:6px 10px; align-items:baseline; }
  .dc-item-title { font-size:.9rem; color:var(--text); flex:1; min-width:10rem; }
  .dc-when, .dc-target { font-size:.72rem; color:var(--muted); }
  .dc-badge {
    font-size:.58rem; letter-spacing:.1em; text-transform:uppercase;
    padding:1px 7px; border:1px solid var(--muted); color:var(--muted); border-radius:8px;
  }
  .dc-badge--done, .dc-badge--fixed { border-color:#1dff7a; color:#1dff7a; }
  .dc-badge--doing { border-color:var(--sun); color:var(--sun); }
  .dc-badge--planned { border-color:var(--cyan); color:var(--cyan); }
  .dc-badge--blocked, .dc-badge--open { border-color:var(--pink); color:var(--pink); }
  .dc-badge--high { border-color:#ff5a5a; color:#ff5a5a; }
  .dc-badge--med { border-color:var(--sun); color:var(--sun); }
  .dc-badge--low { border-color:var(--muted); color:var(--muted); }
  .dc-notes { margin:6px 0 0; font-size:.75rem; color:var(--muted); line-height:1.35; }
  .dc-admin {
    margin-top:16px; padding-top:12px; border-top:1px solid rgba(57,255,136,.25);
  }
  .dc-admin[hidden] { display:none !important; }
  .dc-admin h4 { margin:0 0 8px; color:var(--sun); }
  .dc-admin-form { display:grid; gap:6px; grid-template-columns:1fr 1fr; }
  .dc-admin-form .dc-span2 { grid-column:1 / -1; }
  .dc-admin-form input, .dc-admin-form select, .dc-admin-form textarea {
    font:inherit; font-size:.78rem; background:rgba(0,0,0,.35);
    border:1px solid rgba(57,255,136,.35); color:var(--text); padding:6px 8px; width:100%;
    box-sizing:border-box;
  }
  .dc-admin-form textarea { min-height:52px; resize:vertical; }
  .dc-admin-form button {
    font:700 .68rem Orbitron,sans-serif; letter-spacing:.08em; text-transform:uppercase;
    padding:8px 12px; cursor:pointer; border:1px solid #1dff7a;
    background:rgba(57,255,136,.15); color:#1dff7a;
  }
  .dc-status { margin-top:8px; font-size:.72rem; color:var(--pink); min-height:1.1em; }
  body.day .dc-card { background:rgba(248,255,250,.98); }
  #fbDrawLayer {
    position:absolute; inset:0; z-index:7; cursor:crosshair;
    background:rgba(255,251,150,.04);
  }
  #fbDrawLayer[hidden] { display:none !important; }
  .map-controls {
    position:absolute; bottom:14px; right:14px; z-index:6;
    display:flex; flex-direction:column; gap:6px;
  }
  .map-controls button {
    width:36px; height:36px; padding:0; font:1.4rem VT323,monospace; line-height:1;
    color:var(--cyan); background:rgba(13,2,33,.88); border:1px solid var(--cyan);
    cursor:pointer; box-shadow:0 0 10px var(--glow-cyan);
  }
  .map-controls button:hover {
    color:var(--pink); border-color:var(--pink); box-shadow:0 0 14px var(--glow-pink);
  }
  .map-zoom-label {
    position:absolute; bottom:14px; left:14px; z-index:6;
    font:700 .65rem Orbitron,sans-serif; letter-spacing:.12em;
    color:var(--sun); padding:6px 10px;
    background:rgba(13,2,33,.85); border:1px solid rgba(255,251,150,.35);
    text-shadow:0 0 8px rgba(255,251,150,.4);
  }
  .map-hint {
    position:absolute; top:10px; left:50%; transform:translateX(-50%); z-index:6;
    font-size:.65rem; color:var(--muted); letter-spacing:.08em;
    padding:4px 12px; background:rgba(13,2,33,.7); border:1px solid rgba(157,143,201,.25);
    pointer-events:none;
  }
  .pin {
    position:absolute; transform:translate(-50%,-50%);
    width:28px; height:28px; padding:0; border:none; border-radius:50%;
    /* Default replaced per-city via pin_color / CITY_PIN_PALETTE (map data, not HUD neon) */
    background:#c4a035;
    border:2px solid #1a1208;
    box-shadow:0 0 10px rgba(0,0,0,.55), 0 0 4px rgba(255,255,255,.25);
    cursor:pointer;
    font:1rem VT323,monospace; color:#fff;
    text-shadow:0 1px 2px #000;
    transition:transform .15s, box-shadow .15s;
  }
  .pin:hover, .pin.is-active {
    transform:translate(-50%,-50%) scale(1.2);
    box-shadow:0 0 16px rgba(0,0,0,.65), 0 0 10px rgba(255,255,255,.35); z-index:2;
  }
  /* Type classes no longer force neon — unique pin_color wins via inline style */
  .pin--capital { color:#1a1208; font-weight:700; }
  .pin--town { }
  .pin--preserve { }
  .pin--region { }
  .econ-site {
    position:absolute; transform:translate(-50%,-50%) rotate(45deg);
    width:14px; height:14px; padding:0; border:2px solid #0d0221;
    box-shadow:0 0 8px rgba(0,0,0,.5); cursor:help; pointer-events:auto;
  }
  .econ-site--water { background:#2a9fd8; }
  .econ-site--mineral { background:#c4a035; }
  .econ-site--ag, .econ-site--fishery { background:#3dba6f; }
  .econ-site--tourism, .econ-site--vice { background:#e85d9c; }
  .econ-site--industry, .econ-site--logistics, .econ-site--tech, .econ-site--energy { background:#9d8fc9; }
  .map-layer--economy-resources.is-hidden { display:none; }
  .map-layer--highways.is-hidden { display:none; }
  .map-layer--roads-local.is-hidden { display:none; }
  .map-layer--wind.is-hidden { display:none; }
  .map-layer--water.is-hidden { display:none; }
  .map-layer--logistics.is-hidden { display:none; }
  .layers-panel {
    position:absolute; top:52px; right:12px; z-index:40;
    min-width:180px; padding:10px 12px; border:1px solid var(--line,#334);
    background:rgba(8,10,14,.92); color:var(--ink,#eee); font-size:12px;
  }
  .layers-panel[hidden] { display:none !important; }
  .layers-panel h3 { margin:0 0 8px; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted,#889); }
  .layers-panel label { display:flex; align-items:center; gap:8px; margin:6px 0; cursor:pointer; }
  .layers-panel .swatch { width:12px; height:12px; border:1px solid #666; flex:0 0 auto; }

  .hwy-svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
  /* Stroke in viewBox units so roads scale with the stage (same transform as green art). */
  .hwy-road-casing { fill:none; stroke:#b0a070; stroke-width:1.1; stroke-linecap:round; stroke-linejoin:round; opacity:.95; }
  .hwy-road { fill:none; stroke:#f6e27a; stroke-width:0.65; stroke-linecap:round; stroke-linejoin:round; }
  .hwy-road--freeway { stroke:#f7d44a; stroke-width:0.85; }
  .hwy-label {
    font: 700 2.1px "Segoe UI", system-ui, sans-serif;
    fill:#f4f0e0;
    stroke:#0d0221;
    stroke-width:0.45px;
    paint-order:stroke fill;
    text-anchor:middle;
    pointer-events:none;
  }
  .hwy-shield {
    font: 700 1.8px "Segoe UI", system-ui, sans-serif;
    fill:#fffb96;
    stroke:#0d0221;
    stroke-width:0.4px;
    paint-order:stroke fill;
    text-anchor:middle;
  }
  .map-label-layer {
    position:absolute; inset:0; pointer-events:none;
  }
  .map-label {
    position:absolute; transform:translate(-50%,-100%);
    font: clamp(11px, 1.35vw, 18px) VT323,monospace;
    color:#e8dcc0; letter-spacing:.04em;
    text-shadow:0 1px 0 #000, 0 0 4px #0d0221, 0 1px 3px #000;
    white-space:nowrap; opacity:.95;
    -webkit-font-smoothing:antialiased;
    transition:opacity .15s, transform .15s;
  }
  .map-label--city { }
  .map-label--town { }
  .map-label--capital { font-size:clamp(12px, 1.5vw, 20px); }
  .map-label--preserve { }
  .map-label--region { font-size:clamp(10px, 1.2vw, 16px); }
  .map-label.is-dim { opacity:.38; }
  .map-label.is-active {
    opacity:1; transform:translate(-50%,-100%) scale(1.08);
    text-shadow:0 0 6px #0d0221, 0 0 16px var(--glow-cyan), 0 0 24px var(--glow-pink);
  }
  .map-label-layer.is-hidden { display:none; }
  .region-journal {
    position:relative; min-height:0; overflow:hidden;
    border-left:2px solid transparent;
    border-image:linear-gradient(180deg, var(--pink), var(--cyan), var(--purple)) 1;
    background:
      linear-gradient(180deg, rgba(22,8,42,.97) 0%, rgba(13,2,33,.99) 100%),
      repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(1,205,254,.04) 3px, rgba(1,205,254,.04) 4px);
    display:flex; flex-direction:column; min-height:0;
    box-shadow:-8px 0 32px rgba(255,113,206,.12);
  }
  .journal-resize {
    position:absolute; left:0; top:0; bottom:0; width:10px; z-index:20;
    cursor:col-resize; touch-action:none;
    background:transparent;
  }
  /* Resize handle must not sit above the dock iframe (phone/radio softkeys). */
  .region-journal:has(#dockSide:not([hidden])) .journal-resize { z-index:1; }
  .journal-resize::after {
    content:""; position:absolute; left:2px; top:50%; transform:translateY(-50%);
    width:4px; height:48px; border-radius:2px;
    background:linear-gradient(180deg, var(--pink), var(--cyan));
    box-shadow:0 0 10px var(--glow-cyan); opacity:.85;
  }
  .journal-resize:hover::after, .game-shell.is-resizing-journal .journal-resize::after {
    opacity:1; width:5px; box-shadow:0 0 14px var(--glow-pink);
  }
  .game-shell.is-resizing-journal { cursor:col-resize; user-select:none; }
  .game-shell.is-resizing-journal .map-viewport { pointer-events:none; }
  .region-journal::before {
    content:""; position:absolute; inset:0; pointer-events:none;
    background:linear-gradient(180deg, rgba(255,113,206,.06), transparent 30%, rgba(1,205,254,.04));
  }
  .region-journal h2 {
    margin:0; padding:14px 14px 10px; font:700 .75rem Orbitron,sans-serif;
    text-transform:uppercase; letter-spacing:.2em;
    color:var(--pink);
    text-shadow:0 0 16px var(--glow-pink);
    border-bottom:1px solid rgba(255,113,206,.25);
  }
  .legend-grid {
    display:grid; grid-template-columns:repeat(7, 1fr); gap:5px;
    padding:8px 14px 10px; position:relative; z-index:1;
    border-bottom:1px solid rgba(255,113,206,.2);
  }
  .legend-chip {
    aspect-ratio:1; padding:0; font:1.1rem VT323,monospace; color:#fff;
    background:rgba(26,5,51,.85); border:1px solid rgba(1,205,254,.45);
    cursor:pointer; transition:border-color .12s, box-shadow .12s, transform .1s;
  }
  .legend-chip:hover {
    border-color:var(--pink); box-shadow:0 0 10px var(--glow-pink); transform:scale(1.06);
  }
  .legend-chip.is-active {
    border-color:var(--sun); box-shadow:0 0 14px rgba(255,251,150,.5);
    background:rgba(255,113,206,.15);
  }
  .legend-chip--capital { border-color:var(--sun); color:var(--sun); }
  .legend-chip--town { border-color:var(--purple); }
  .legend-chip--preserve { border-color:var(--cyan); }
  .legend-chip--region { border-color:#888; color:#ccc; }
  .legend-chip--city { border-color:var(--pink); }
  .legend-chip--stub { opacity:.72; border-style:dashed; }
  .region-list { overflow:auto; flex:1; padding:10px 10px 14px; position:relative; z-index:1; }
  .region-card {
    display:block; width:100%; text-align:left; margin:0 0 8px; padding:11px 12px;
    background:rgba(26,5,51,.75);
    border:1px solid rgba(1,205,254,.35);
    color:var(--text); cursor:pointer; font:inherit;
    transition:border-color .15s, box-shadow .15s, transform .1s;
    clip-path:polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
  }
  .region-card:hover {
    border-color:var(--pink);
    box-shadow:0 0 16px var(--glow-pink);
    transform:translateX(-2px);
  }
  .region-card.is-active {
    border-color:var(--pink);
    background:rgba(255,113,206,.1);
    box-shadow:0 0 20px var(--glow-pink), inset 0 0 24px rgba(1,205,254,.08);
  }
  .region-card strong { display:block; color:var(--cyan); font-weight:400; font-size:1.05rem; text-shadow:0 0 8px var(--glow-cyan); }
  .region-card .meta { color:var(--muted); font-size:.78rem; margin-top:4px; }
  .region-card .pip-warn {
    display:block; margin-top:4px; font-size:.72rem; color:var(--sun);
    letter-spacing:.04em;
  }
  .legend-chip--mismatch { outline:1px dashed var(--sun); outline-offset:2px; }
  .lane {
    display:inline-block; margin-top:6px; padding:2px 8px;
    font-size:.62rem; text-transform:uppercase; letter-spacing:.1em;
    font-family:Orbitron,sans-serif; border:1px solid;
  }
  .lane--planning { color:var(--purple); border-color:var(--purple); box-shadow:0 0 6px rgba(185,103,255,.3); }
  .lane--writing { color:var(--cyan); border-color:var(--cyan); box-shadow:0 0 6px var(--glow-cyan); }
  .lane--testing { color:var(--sun); border-color:var(--sun); }
  .lane--blocked { color:var(--pink); border-color:var(--pink); }
  .lane--done { color:#7fffd4; border-color:#7fffd4; }
  .lane--deferred { color:var(--muted); border-color:rgba(157,143,201,.4); }
  .region-num { color:var(--sun); font:1.1rem VT323,monospace; margin-right:6px; text-shadow:0 0 8px rgba(255,251,150,.4); }
  .map-tooltip {
    position:fixed; z-index:10; pointer-events:none; opacity:0;
    padding:8px 14px; background:rgba(13,2,33,.94);
    border:1px solid var(--cyan); font-family:VT323,monospace; font-size:1.1rem;
    color:var(--pink); text-shadow:0 0 8px var(--glow-pink);
    box-shadow:0 0 16px var(--glow-cyan); transition:opacity .12s;
  }
  .map-tooltip.visible { opacity:1; }
  .err { padding:24px; color:var(--pink); }
  .muted { color:var(--muted); padding:24px; }

  @keyframes grid-drift {
    0% { background-position: 0 0, 0 0, 0 0, 0 0; }
    100% { background-position: 0 0, 0 0, 48px 0, 0 48px; }
  }
  @keyframes shimmer-text {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.35); }
  }
  @keyframes pin-glow {
    0%, 100% { box-shadow: 0 0 12px var(--glow-pink), 0 0 4px var(--sun); }
    50% { box-shadow: 0 0 20px var(--glow-cyan), 0 0 10px var(--glow-pink); }
  }
  @keyframes pin-glow-active {
    0%, 100% { box-shadow: 0 0 22px var(--glow-pink), 0 0 16px var(--glow-cyan); }
    50% { box-shadow: 0 0 32px var(--glow-cyan), 0 0 24px var(--glow-pink); }
  }
  @keyframes map-frame-glow {
    0%, 100% { box-shadow: 0 0 40px var(--glow-pink), 0 0 80px rgba(1,205,254,.15); }
    50% { box-shadow: 0 0 55px var(--glow-cyan), 0 0 100px rgba(255,113,206,.2); }
  }
  /* Transform-only — NEVER animate opacity. Reduced-motion sets duration to 0.01ms and
     can freeze map-reveal on the from{opacity:0} keyframe → permanent black void. */
  @keyframes map-reveal {
    from { transform: scale(0.985); }
    to { transform: scale(1); }
  }
  @keyframes card-in {
    from { opacity: 0; transform: translateX(12px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes scanlines {
    0% { transform: translateY(0); }
    100% { transform: translateY(4px); }
  }
  @keyframes sunset-drift {
    0%, 100% { opacity: .35; transform: translate(-50%, 0) scale(1); }
    50% { opacity: .55; transform: translate(-48%, -2%) scale(1.03); }
  }
  @keyframes lane-breathe {
    0%, 100% { opacity: .85; }
    50% { opacity: 1; }
  }

  .hud-brand { animation: shimmer-text 4s ease-in-out infinite; }
  .hud-setting { animation: shimmer-text 5s ease-in-out infinite .5s; }

  .map-stage img#mapImg {
    opacity: 1;
    animation: map-reveal .5s ease;
    box-shadow: 0 4px 32px rgba(0,0,0,.55);
  }
  .map-tile-layer img {
    animation: none;
    image-rendering: auto;
  }
  .pin.is-editable { cursor:grab; outline:2px dashed var(--sun); outline-offset:3px; }
  .pin.is-dragging { cursor:grabbing; z-index:30; transform:translate(-50%,-50%) scale(1.15); }
  .map-viewport.is-edit-mode { cursor:default; }
  .map-viewport.is-edit-mode .map-hint { color:var(--sun); border-color:rgba(255,251,150,.45); }
  .map-viewport.is-draw-mode { cursor:crosshair; }
  .map-viewport.is-draw-mode.is-snap-hot { cursor:cell; }
  .map-viewport.is-draw-mode .map-hint { color:var(--cyan); border-color:rgba(1,205,254,.45); }
  .draw-bar {
    display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px;
    padding:4px 10px 6px; background:rgba(13,2,33,.92);
    border-bottom:1px solid rgba(1,205,254,.35); font-size:.72rem;
  }
  .draw-bar[hidden] { display:none !important; }
  .draw-bar label { color:var(--muted); letter-spacing:.04em; }
  .draw-bar select {
    background:var(--panel); color:var(--text); border:1px solid var(--line);
    font:inherit; padding:3px 6px; max-width:14rem;
  }
  .draw-bar .hud-res { padding:3px 8px; font-size:.7rem; }
  .draw-bar .hud-res:disabled { opacity:.4; cursor:not-allowed; }
  .draw-bar .hud-save.is-ready { border-color:var(--sun); color:var(--sun); }
  .draw-bar .draw-snap-hint { color:var(--muted); font-size:.68rem; letter-spacing:.02em; max-width:28rem; }
  .draw-bar #drawStatus.is-err { color:#ff8a9a; }
  .draw-bar #drawStatus.is-ok { color:var(--sun); }
  .map-draw-svg {
    position:absolute; inset:0; width:100%; height:100%;
    pointer-events:none; z-index:35; overflow:visible;
  }
  /* Draw preview: teal wash (readable); cyan stroke stays HUD chrome */
  .map-draw-poly { fill:#46827d; fill-opacity:0.22; stroke:var(--cyan); stroke-width:0.45; }
  .map-draw-line { fill:none; stroke:rgba(1,205,254,.75); stroke-width:0.4; stroke-dasharray:0.9 0.55; }
  /* viewBox 0–100: r≈0.12 ≈ ~1–2px on typical viewport; soft HUD cyan, not opaque black squares */
  .map-draw-vert {
    fill:rgba(1,205,254,.4); stroke:rgba(255,113,206,.35); stroke-width:0.04;
    opacity:.55; vector-effect:non-scaling-stroke;
  }
  .map-draw-vert.is-snapped {
    fill:rgba(255,251,150,.85); stroke:rgba(255,113,206,.9); stroke-width:0.08;
    opacity:1;
  }
  /* Editable handles on a loaded/closed border — larger than draw verts */
  .map-draw-vert.is-edit {
    fill:rgba(1,205,254,.75); stroke:rgba(255,251,150,.85); stroke-width:0.1;
    opacity:.95;
  }
  .map-draw-vert.is-edit-sel {
    fill:rgba(255,251,150,.95); stroke:rgba(255,113,206,.95); stroke-width:0.14;
    opacity:1;
  }
  /* Neighbor region corners/mids — NOT map-art black squares */
  .map-draw-snap-target {
    fill:rgba(255,113,206,.35); stroke:rgba(255,113,206,.55); stroke-width:0.05;
    opacity:.55; vector-effect:non-scaling-stroke;
  }
  .map-draw-snap-target.is-mid {
    fill:rgba(255,113,206,.18); stroke:rgba(255,113,206,.4); stroke-width:0.04;
    opacity:.4;
  }
  .map-draw-snap-ghost {
    fill:none; stroke:rgba(255,251,150,.95); stroke-width:0.12;
    opacity:.9; vector-effect:non-scaling-stroke;
  }
  .pin.is-active { box-shadow: 0 0 22px var(--glow-pink), 0 0 16px var(--glow-cyan); }

  .region-card {
    animation: card-in .45s ease backwards;
  }
  .region-card:nth-child(1) { animation-delay: .04s; }
  .region-card:nth-child(2) { animation-delay: .08s; }
  .region-card:nth-child(3) { animation-delay: .12s; }
  .region-card:nth-child(4) { animation-delay: .16s; }
  .region-card:nth-child(5) { animation-delay: .20s; }
  .region-card:nth-child(6) { animation-delay: .24s; }
  .region-card:nth-child(7) { animation-delay: .28s; }
  .region-card:nth-child(8) { animation-delay: .32s; }
  .region-card:nth-child(9) { animation-delay: .36s; }
  .region-card:nth-child(10) { animation-delay: .40s; }
  .region-card:nth-child(11) { animation-delay: .44s; }
  .region-card:nth-child(12) { animation-delay: .48s; }
  .region-card:nth-child(13) { animation-delay: .52s; }
  .region-card:nth-child(14) { animation-delay: .56s; }
  .lane { animation: lane-breathe 3s ease-in-out infinite; }

  .region-journal::after { display:none; }
  .hud-res.is-on { border-color:var(--sun); color:var(--sun); box-shadow:0 0 12px rgba(255,251,150,.45); }
  /* Named dock parts: RADIO / PHONE / SIM — orange idle → turquoise active; expand over cast/info */
  .hud-dock {
    font:inherit; font-size:.7rem; letter-spacing:.08em; text-transform:uppercase;
    color:#2a1408; background:rgba(255,140,40,.92); border:1px solid #ff8c28;
    padding:4px 12px; cursor:pointer;
    box-shadow:0 0 10px rgba(255,140,40,.45);
  }
  .hud-dock:hover { filter:brightness(1.08); }
  .hud-dock.is-on {
    color:#041612; background:rgba(45,212,191,.95); border-color:#2dd4bf;
    box-shadow:0 0 14px rgba(45,212,191,.55);
  }
  /* CAST — red silo (not orange dock); sits at end of Radio/Phone/Sim strip */
  .hud-cast {
    font:inherit; font-size:.7rem; letter-spacing:.08em; text-transform:uppercase;
    color:#2a0608; background:rgba(220,40,55,.94); border:1px solid #ff3b4a;
    padding:4px 12px; cursor:pointer;
    box-shadow:0 0 12px rgba(255,59,74,.55);
  }
  .hud-cast:hover { filter:brightness(1.08); }
  .hud-cast.is-on {
    color:#140408; background:rgba(255,90,110,.98); border-color:#ff7a88;
    box-shadow:0 0 16px rgba(255,59,74,.75);
  }
  .hud-3d.is-on {
    border-color:#2dd4bf; color:#2dd4bf; background:rgba(45,212,191,.12);
    box-shadow:0 0 12px rgba(45,212,191,.4);
  }
  .dock-side {
    display:flex; flex-direction:column; flex:1; min-height:0; position:relative; z-index:2;
    background:#07070c;
  }
  .dock-side[hidden] { display:none !important; }
  .dock-side-head {
    display:flex; align-items:center; gap:8px; padding:6px 10px;
    border-bottom:1px solid rgba(255,140,40,.35);
    flex-shrink:0;
  }
  .dock-side-head h2 {
    margin:0; flex:1; font:700 .75rem Orbitron,sans-serif; letter-spacing:.12em;
    color:#ff8c28; text-transform:uppercase;
  }
  .dock-side.is-on-active .dock-side-head h2 { color:#2dd4bf; }
  .dock-close {
    font:inherit; font-size:.65rem; letter-spacing:.08em; text-transform:uppercase;
    color:var(--muted); background:transparent; border:1px solid rgba(157,143,201,.4);
    padding:3px 8px; cursor:pointer;
  }
  .dock-close:hover { color:var(--pink); border-color:var(--pink); }
  .dock-frame {
    flex:1; min-height:0; width:100%; height:100%; border:0; background:#07070c;
    display:block;
  }
  .map-3d-overlay {
    position:absolute; inset:0; z-index:8; border:0; width:100%; height:100%;
    background:rgba(8,4,18,.92);
  }
  .map-3d-overlay[hidden] { display:none !important; }
  .map-3d-badge {
    position:absolute; top:10px; left:10px; z-index:9;
    font:700 .65rem Orbitron,sans-serif; letter-spacing:.1em; text-transform:uppercase;
    color:#041612; background:rgba(45,212,191,.92); border:1px solid #2dd4bf;
    padding:4px 10px; pointer-events:none;
  }
  .map-3d-badge[hidden] { display:none !important; }
  .cast-side { display:flex; flex-direction:column; flex:1; min-height:0; position:relative; z-index:1; }
  .cast-side.has-sheet { /* list + full-width sheet reader */
  }
  .cast-side[hidden] { display:none !important; }
  .map-side[hidden] { display:none !important; }
  .cast-meta {
    padding:6px 14px 8px; font-size:.68rem; color:var(--muted); letter-spacing:.06em;
    border-bottom:1px solid rgba(255,113,206,.2);
  }
  .cast-list { overflow:auto; flex:0 0 auto; max-height:38%; padding:10px 10px 14px; }
  .cast-side.has-sheet .cast-list { max-height:28%; }
  .cast-card {
    display:flex; gap:10px; align-items:center; width:100%; text-align:left;
    margin:0 0 8px; padding:8px 10px;
    background:rgba(26,5,51,.75); border:1px solid rgba(1,205,254,.35);
    color:var(--text); cursor:pointer; font:inherit;
    transition:border-color .15s, box-shadow .15s;
    clip-path:polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
  }
  .cast-card:hover { border-color:var(--pink); box-shadow:0 0 16px var(--glow-pink); }
  .cast-card.is-active { border-color:var(--sun); box-shadow:0 0 14px rgba(255,251,150,.4); }
  .cast-face {
    width:44px; height:44px; flex:0 0 44px; border-radius:4px; object-fit:cover;
    background:rgba(13,2,33,.9); border:1px solid rgba(255,113,206,.35);
  }
  .cast-face--empty {
    display:flex; align-items:center; justify-content:center;
    font:1.1rem VT323,monospace; color:var(--muted);
  }
  .cast-card-body { min-width:0; flex:1; }
  .cast-card-body strong { display:block; font:700 .72rem Orbitron,sans-serif; letter-spacing:.06em; color:var(--sun); }
  .cast-card-body .meta { display:block; margin-top:2px; font-size:.68rem; color:var(--muted); }
  .cast-detail {
    border-top:1px solid rgba(255,113,206,.25); padding:12px 14px 16px;
    flex:1; min-height:0; overflow:auto; background:rgba(13,2,33,.55);
    width:100%;
  }
  .cast-detail[hidden] { display:none !important; }
  .cast-detail h3 { margin:0 0 6px; font:700 .8rem Orbitron,sans-serif; color:var(--pink); letter-spacing:.1em; }
  .cast-detail .cast-hero {
    width:100%; max-height:160px; object-fit:cover; border:1px solid rgba(1,205,254,.4);
    margin-bottom:10px; background:#0a0a0e;
  }
  .cast-detail .meta { color:var(--muted); font-size:.72rem; margin:0 0 8px; }
  .cast-detail .notes { white-space:pre-wrap; font-size:.8rem; color:var(--text); margin:0 0 10px; }
  .cast-sheet {
    margin:10px 0 12px; padding:10px 12px; width:100%; max-width:100%;
    border:1px solid rgba(1,205,254,.28); background:rgba(10,4,22,.65);
    font-size:.82rem; line-height:1.45; color:var(--text);
  }
  .cast-sheet h1, .cast-sheet h2, .cast-sheet h3 {
    font-family:Orbitron,sans-serif; color:var(--sun); letter-spacing:.04em;
    margin:0.85em 0 0.35em; font-size:0.95em;
  }
  .cast-sheet h1 { font-size:1.05em; }
  .cast-sheet p, .cast-sheet li { margin:0.35em 0; }
  .cast-sheet ul, .cast-sheet ol { padding-left:1.2em; }
  .cast-sheet code { font-family:Share Tech Mono,monospace; font-size:.9em; color:var(--cyan); }
  .cast-sheet pre {
    overflow:auto; padding:8px; background:rgba(0,0,0,.35);
    border:1px solid rgba(255,113,206,.2); white-space:pre-wrap;
  }
  .cast-sheet a { color:var(--cyan); }
  .cast-rels { list-style:none; margin:0; padding:0; font-size:.75rem; }
  .cast-rels li { margin:0 0 4px; color:var(--cyan); }
  .cast-rels button {
    background:none; border:none; color:var(--cyan); font:inherit; cursor:pointer; padding:0;
    text-decoration:underline; text-underline-offset:2px;
  }
  .cast-admin-hint { margin-top:10px; font-size:.65rem; color:var(--muted); }
  .cast-admin-hint a { color:var(--pink); }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
    /* Prevention: zero-duration + from{opacity:0} forwards left #mapImg invisible. */
    .map-stage img#mapImg,
    .map-layer--terrain-base img#mapImg {
      opacity: 1 !important;
      animation: none !important;
      transform: none !important;
    }
    .fx-scanlines { display: none; }
  }

  /* ─── Day theme: daylight vaporwave pastel — chrome/backdrop only; map art & GM data untouched ─── */
  body.day {
    --void:#f3e9f7; --panel:#fdf3fa; --line:#d63384; --text:#2a1440; --muted:#6d5a8a;
    --pink:#d63384; --cyan:#0a7d99; --purple:#7a3fd4; --sun:#8a6d00; --magenta:#c1005f;
    --glow-pink:rgba(214,51,132,.3); --glow-cyan:rgba(10,125,153,.28);
    background:#f3e9f7;
  }
  body.day .hud {
    background:linear-gradient(180deg, rgba(253,243,250,.98), rgba(243,233,247,.98));
    box-shadow:0 0 24px rgba(214,51,132,.18);
  }
  body.day .map-viewport { background:linear-gradient(180deg,#e8f6fb 0%,#fdeaf5 100%); }
  body.day .region-journal {
    background:linear-gradient(180deg, rgba(253,243,250,.97) 0%, rgba(243,233,247,.99) 100%);
    box-shadow:-8px 0 32px rgba(214,51,132,.14);
  }
  body.day .pilot-note { background:rgba(255,255,255,.85); color-scheme:light; }
  body.day .cast-card { background:rgba(255,255,255,.72); }
  body.day .cast-face { background:rgba(255,255,255,.85); }
  body.day .cast-detail { background:rgba(253,243,250,.55); }
  body.day .cast-detail .cast-hero { background:#e9dff0; }
  body.day .cast-sheet { background:rgba(255,255,255,.72); }
  body.day .map-tooltip,
  body.day .map-hint,
  body.day .map-zoom-label,
  body.day .map-controls button,
  body.day .draw-bar { background:rgba(253,243,250,.92); }
  body.day .fb-card { background:rgba(253,243,250,.97); }
  body.day .fb-card textarea,
  body.day .fb-card input[type=text] { background:rgba(255,255,255,.75); }
  body.day .lane--done { color:#0f7a5c; border-color:#0f7a5c; }
  body.day .draw-bar #drawStatus.is-err { color:#c2233f; }
</style>
</head>
<body>
<script>try{if(localStorage.getItem('tableslop-theme')==='day')document.body.classList.add('day');}catch(e){}</script>
<header class="hud">
  <div class="hud-brand">tableslop</div>
  <span class="hud-setting" id="mapTitle">Isla Primavera</span>
  <button type="button" class="hud-res" id="resToggle" hidden>4K</button>
  <button type="button" class="hud-res" id="areasToggle" hidden>Areas</button>
  <button type="button" class="hud-res" id="labelToggle" hidden>Labels</button>
  <button type="button" class="hud-res" id="citiesToggle" hidden>Cities</button>
  <button type="button" class="hud-res" id="econToggle" hidden>Econ</button>
  <button type="button" class="hud-res" id="roadsToggle" hidden>Roads</button>
  <button type="button" class="hud-res" id="layersToggle" hidden title="Map overlays (roads / wind / water / logistics / pins)">Layers</button>
  <div class="layers-panel" id="layersPanel" hidden role="dialog" aria-label="Map layers">
    <h3>Layers</h3>
    <label><input type="checkbox" id="layerSwitchRoads" role="switch"/> Roads <span class="swatch" style="background:#c9a227"></span></label>
    <label><input type="checkbox" id="layerSwitchWind" role="switch"/> Wind <span class="swatch" style="background:#7ec8e3"></span></label>
    <label><input type="checkbox" id="layerSwitchWater" role="switch"/> Water <span class="swatch" style="background:#2a6f9e"></span></label>
    <label><input type="checkbox" id="layerSwitchLogistics" role="switch"/> Logistics <span class="swatch" style="background:#e07a3d"></span></label>
    <label><input type="checkbox" id="layerSwitchPins" role="switch"/> Pins <span class="swatch" style="background:#e8e8e8"></span></label>
  </div>
  <button type="button" class="hud-res hud-edit" id="editToggle" hidden>Edit</button>
  <button type="button" class="hud-res" id="drawToggle" hidden>Draw borders</button>
  <button type="button" class="hud-res hud-save" id="saveCoordsBtn" hidden>Save coords</button>
  <button type="button" class="hud-res" id="dayToggle" aria-pressed="false" title="Day / night theme">Day</button>
  <button type="button" class="hud-res hud-3d" id="map3dToggle" aria-pressed="false" title="3D shelved — 2D map is working SoT" hidden>3D</button>
  <a class="hud-res" href="/hunter/" title="Hunter board">Hunter</a>
  <button type="button" class="hud-dock" id="dockRadio" data-dock="radio" aria-pressed="false" title="Radio — expands over cast/info">Radio</button>
  <button type="button" class="hud-dock" id="dockPhone" data-dock="phone" aria-pressed="false" title="Phone (call + text) — expands over cast/info">Phone</button>
  <button type="button" class="hud-dock" id="dockSim" data-dock="sim" aria-pressed="false" title="Sim — expands over cast/info">Sim</button>
  <button type="button" class="hud-cast" id="castToggle" aria-pressed="false" title="Cast — expands over info panel (red silo, not a dock app)">Cast</button>
  <a class="hud-res hud-world" id="worldToggle" href="/world" hidden title="World — separate character studio (admin)">World</a>
  <button type="button" class="hud-res" id="reportToggle" title="Paste a screenshot + note for agents">Report</button>
  <a class="hud-res hud-devlog" id="devLogToggle" href="/devlog" title="Dev calendar — dedicated page (timeline / features / bugs)">DEV LOG</a>
  <div class="hud-auth" id="authSlot"></div>
</header>
<div class="draw-bar" id="drawBar" hidden>
  <!-- v1: parent region (R#) only. Next: nest city sub-regions (e.g. paradise-subzones.json); do not hardcode flat R1–R14 forever. -->
  <label for="drawRegionSelect">Region</label>
  <select id="drawRegionSelect" aria-label="Assign polygon to region"></select>
  <button type="button" class="hud-res" id="drawLoadBtn" title="Load this region's saved polygon into the editor">Load border</button>
  <button type="button" class="hud-res" id="drawRebindBtn" hidden title="Keep unsaved verts but change Save target to the selected region">Rebind</button>
  <button type="button" class="hud-res is-on" id="drawSnapBtn" aria-pressed="true" title="While placing NEW vertices only: stick to other regions' corner/mid-edge dots (pink when Snap ON). Not the black squares on the art.">Snap edges ON</button>
  <span class="draw-snap-hint" id="drawSnapHint">Snap = stick to other regions' corner dots (shown when Snap ON)</span>
  <button type="button" class="hud-res" id="drawUndoBtn">Undo pt</button>
  <button type="button" class="hud-res" id="drawCloseBtn">Close poly</button>
  <button type="button" class="hud-res" id="drawClearBtn">Clear</button>
  <button type="button" class="hud-res hud-save" id="drawSaveBtn">Save border</button>
  <span id="drawStatus" style="color:var(--muted)"></span>
</div>
<div class="fb-modal" id="fbModal" hidden>
  <div class="fb-card" role="dialog" aria-labelledby="fbTitle">
    <h3 id="fbTitle">Report map issue</h3>
    <p>Paste a screenshot (Ctrl+V) or pick a file. Optional: draw a highlight rectangle on the map. Short note → opens an agent task.</p>
    <img class="fb-preview" id="fbPreview" alt="Screenshot preview" hidden>
    <input type="file" id="fbFile" accept="image/png,image/jpeg,image/webp" hidden>
    <p class="fb-draw-hint" id="fbDrawHint" hidden>Drag on the map to highlight, then return here to submit.</p>
    <textarea id="fbNote" maxlength="800" placeholder="What’s wrong? (e.g. wrong label on gold region)"></textarea>
    <div class="fb-actions">
      <button type="button" id="fbPasteBtn">Paste</button>
      <button type="button" id="fbFileBtn">Choose file</button>
      <button type="button" id="fbDrawBtn">Highlight on map</button>
      <button type="button" class="primary" id="fbSubmitBtn" disabled>Submit</button>
      <button type="button" id="fbCancelBtn">Cancel</button>
    </div>
    <div class="fb-status" id="fbStatus"></div>
  </div>
</div>
<div class="game-shell">
  <aside class="mobile-map-stub" id="mobileMapStub" aria-label="Map unavailable on phone">
    <p class="mobile-map-stub-title">Map · desktop for now</p>
    <p class="mobile-map-stub-body">Phone map is blocked while we rebuild mobile. Use Cast, Phone, Radio, Sim, and the panel below — open this site on a wider screen for the island map.</p>
  </aside>
  <section class="map-viewport" id="viewport">
    <div class="map-camera" id="mapCamera">
      <div class="map-stage" id="mapStage"></div>
    </div>
    <iframe class="map-3d-overlay" id="map3dOverlay" hidden title="3D map overlay" src="about:blank"></iframe>
    <div class="map-3d-badge" id="map3dBadge" hidden>3D overlay · PCs/routines on 2D when off</div>
    <div class="map-hint" id="mapHint">drag to pan · scroll to zoom · legend to focus · Cast for roster · 3D toggles overlay</div>
    <div class="map-load-chip" id="mapLoadChip" hidden role="status"></div>
    <div class="map-zoom-label" id="zoomLabel">—</div>
    <div class="map-controls" id="mapControls">
      <button type="button" id="zoomIn" aria-label="Zoom in">+</button>
      <button type="button" id="zoomOut" aria-label="Zoom out">−</button>
      <button type="button" id="zoomFit" aria-label="Fit entire map">⌂</button>
    </div>
  </section>
  <aside class="region-journal" id="regionJournal">
    <div class="journal-resize" id="journalResize" title="Drag to widen / narrow panel" role="separator" aria-orientation="vertical" aria-label="Resize info panel"></div>
    <div class="pilot-panel" id="pilotPanel">
      <div class="pilot-name" id="pilotName">Local pilot</div>
      <div class="pilot-meta" id="pilotMeta">Progress saves in this browser</div>
      <div class="pilot-stats" id="pilotStats"></div>
      <label class="pilot-note-label" for="regionNote" id="noteLabel" hidden>Region note</label>
      <textarea class="pilot-note" id="regionNote" hidden placeholder="Session notes for this region…"></textarea>
      <a class="city-map-link" id="cityMapLink" href="#" hidden>City map →</a>
      <div class="lived-in-box" id="livedInBox" hidden>
        <h3>◇ Lived-in</h3>
        <div class="li-stats" id="livedInStats"></div>
        <div class="li-dist" id="livedInDist"></div>
        <ul class="li-list" id="livedInList"></ul>
        <a class="li-more" id="livedInMore" href="/lived-in/" hidden>All listings →</a>
      </div>
    </div>
    <div class="map-side" id="mapSide">
      <h2>◇ Legend</h2>
      <div class="legend-grid" id="legendGrid" aria-label="Region quick select"></div>
      <div class="region-list" id="list"></div>
    </div>
    <div class="cast-side" id="castSide" hidden>
      <h2>◇ Cast</h2>
      <div class="cast-meta" id="castMeta">Loading roster…</div>
      <div class="cast-list" id="castList"></div>
      <div class="cast-detail" id="castDetail" hidden></div>
    </div>
    <div class="dock-side" id="dockSide" hidden data-dock="">
      <div class="dock-side-head">
        <h2 id="dockSideTitle">◇ Dock</h2>
        <button type="button" class="dock-close" id="dockClose" title="Close dock panel">Close</button>
      </div>
      <iframe class="dock-frame" id="dockFrame" title="tableslop dock panel" src="about:blank"></iframe>
    </div>
  </aside>
</div>
<div class="map-tooltip" id="tooltip" hidden></div>
<script>
(function () {
  var THEME_KEY = 'tableslop-theme';
  var dayBtn = document.getElementById('dayToggle');
  function applyTheme(mode) {
    var day = mode === 'day';
    document.body.classList.toggle('day', day);
    if (dayBtn) {
      dayBtn.setAttribute('aria-pressed', day ? 'true' : 'false');
      dayBtn.textContent = day ? 'Night' : 'Day';
    }
  }
  var savedTheme = 'night';
  try { savedTheme = localStorage.getItem(THEME_KEY) === 'day' ? 'day' : 'night'; } catch (e) {}
  applyTheme(savedTheme);
  if (dayBtn) dayBtn.addEventListener('click', function () {
    var next = document.body.classList.contains('day') ? 'night' : 'day';
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    applyTheme(next);
  });
})();
(function () {
  var KEY = 'tableslop-journal-w';
  var shell = document.querySelector('.game-shell');
  var handle = document.getElementById('journalResize');
  if (!shell || !handle) return;
  function clamp(px) {
    var max = Math.floor(window.innerWidth * 0.72);
    var min = 240;
    if (max < min) max = min;
    return Math.max(min, Math.min(max, Math.round(px)));
  }
  function apply(px) {
    var w = clamp(px);
    shell.style.setProperty('--journal-w', w + 'px');
    return w;
  }
  try {
    var saved = parseInt(localStorage.getItem(KEY) || '', 10);
    if (saved) apply(saved);
  } catch (e) {}
  var dragging = false;
  function onMove(ev) {
    if (!dragging) return;
    var x = ev.clientX != null ? ev.clientX : (ev.touches && ev.touches[0] && ev.touches[0].clientX);
    if (x == null) return;
    apply(window.innerWidth - x);
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    shell.classList.remove('is-resizing-journal');
    try {
      var cur = getComputedStyle(shell).getPropertyValue('--journal-w').trim();
      var n = parseInt(cur, 10);
      if (n) localStorage.setItem(KEY, String(n));
    } catch (e) {}
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  }
  handle.addEventListener('pointerdown', function (ev) {
    if (window.matchMedia('(max-width:800px)').matches) return;
    ev.preventDefault();
    dragging = true;
    shell.classList.add('is-resizing-journal');
    try { handle.setPointerCapture(ev.pointerId); } catch (e) {}
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
  handle.addEventListener('dblclick', function () {
    var w = apply(Math.min(520, Math.floor(window.innerWidth * 0.42)));
    try { localStorage.setItem(KEY, String(w)); } catch (e) {}
  });
})();
const PROFILE_KEY = 'tableslop-primavera-profile-v1';
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 4;
const FOCUS_ZOOM = 1.75;
let activeId = null;
let mapRes = '4k';
let mapDataCache = null;
let uiLabelsVisible = true;
let uiAreasVisible = true;
let uiCitiesVisible = true;
let uiEconVisible = false;
let uiRoadsVisible = true; /* labels only — green terrain art is the road paint */
let uiWindVisible = false;
let uiWaterVisible = false;
let uiLogisticsVisible = false;
let roadsLocalCache = null;
let editMode = false;
let drawMode = false;
let drawVerts = [];
let drawClosed = false;
/**
 * Region id that current drawVerts belong to.
 * Save MUST use this (not a stale/mismatched dropdown) so map-click sync cannot
 * write Porto verts under Paradise (or wipe the wrong id).
 */
let drawBoundRegionId = null;
/** Snap new clicks to nearby verts/mid-edges of OTHER regions (map % coords). Default ON. */
let drawSnapEnabled = true;
/** Map-% distance for snap + edit hit-tests (was 0.85 — too picky for GM). */
const DRAW_SNAP_THRESH = 1.6;
const DRAW_VERT_HIT = 1.1;
const DRAW_EDGE_HIT = 0.9;
let drawSnapHover = null;
/** Index of vertex being dragged while editing a closed border; null if none. */
let drawVertDrag = null;
/** Selected vertex index for Delete/Backspace while editing. */
let drawSelectedVert = null;
let regionsDirty = false;
let coordsDirty = false;
/** Last /api/map marker coords (no localStorage overrides). Used to discard unsaved pin drags. */
let serverMarkersCache = null;
let meCache = null;
let cameraReady = false;
let cameraSaveTimer = null;
const camera = { x: 0, y: 0, scale: 1 };
let panDrag = null;
let fitScale = 1;
let tilePyramid = null;
let tileUpdateTimer = null;
let activeTileZ = null;
let tileLoadEpoch = 0;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const tooltip = document.getElementById('tooltip');
let castMode = false;
let castCache = null;
let activeCastId = null;
let wikiEntitiesCache = null;
let wikiEntitiesBound = false;

async function ensureWikiEntities() {
  if (wikiEntitiesCache) return wikiEntitiesCache;
  if (typeof WikiEntities === 'undefined') {
    wikiEntitiesCache = [];
    return wikiEntitiesCache;
  }
  try {
    const data = await WikiEntities.fetchEntities('/api/wiki/entities?campaign=tropic-gooner');
    wikiEntitiesCache = Array.isArray(data) ? data : (data && data.entities) || [];
  } catch (e) {
    wikiEntitiesCache = [];
  }
  if (!wikiEntitiesBound && typeof WikiEntities !== 'undefined') {
    WikiEntities.bindPopovers(document.body, wikiEntitiesCache);
    wikiEntitiesBound = true;
  }
  return wikiEntitiesCache;
}

async function enhanceCastWiki(root) {
  if (!root || typeof WikiEntities === 'undefined') return;
  const ents = await ensureWikiEntities();
  WikiEntities.linkifyDom(root, ents);
}
/** Active dock over cast/info: '' | 'radio' | 'phone' | 'sim' */
let dockMode = '';
let map3dOn = false;

const DOCK_SRC = {
  radio: '/radio/?embed=1',
  phone: '/phone/?embed=1&v=20260813sfx',
  sim: '/sim/?embed=1',
};
const DOCK_TITLE = {
  radio: '◇ Radio',
  phone: '◇ Phone · call + text',
  sim: '◇ Sim',
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function syncInfoColumn() {
  const mapSide = document.getElementById('mapSide');
  const castSide = document.getElementById('castSide');
  const dockSide = document.getElementById('dockSide');
  const pilotPanel = document.getElementById('pilotPanel');
  if (dockMode) {
    if (mapSide) mapSide.hidden = true;
    if (castSide) castSide.hidden = true;
    // Pilot notes steal vertical space and clip phone softkeys in the iframe.
    if (pilotPanel) pilotPanel.hidden = true;
    if (dockSide) {
      dockSide.hidden = false;
      dockSide.dataset.dock = dockMode;
      dockSide.classList.add('is-on-active');
    }
  } else if (castMode) {
    if (mapSide) mapSide.hidden = true;
    if (castSide) castSide.hidden = false;
    if (pilotPanel) pilotPanel.hidden = false;
    if (dockSide) {
      dockSide.hidden = true;
      dockSide.classList.remove('is-on-active');
    }
  } else {
    if (mapSide) mapSide.hidden = false;
    if (castSide) castSide.hidden = true;
    if (pilotPanel) pilotPanel.hidden = false;
    if (dockSide) {
      dockSide.hidden = true;
      dockSide.classList.remove('is-on-active');
    }
  }
}

function setDockMode(name) {
  const next = (name === 'radio' || name === 'phone' || name === 'sim') ? name : '';
  if (dockMode === next) {
    dockMode = '';
  } else {
    dockMode = next;
    if (dockMode) castMode = false;
  }
  const frame = document.getElementById('dockFrame');
  const title = document.getElementById('dockSideTitle');
  if (frame) {
    if (dockMode) {
      const src = DOCK_SRC[dockMode];
      if (frame.getAttribute('data-src') !== src) {
        frame.src = src;
        frame.setAttribute('data-src', src);
      }
    } else {
      frame.src = 'about:blank';
      frame.removeAttribute('data-src');
    }
  }
  if (title) title.textContent = dockMode ? (DOCK_TITLE[dockMode] || '◇ Dock') : '◇ Dock';
  ['radio', 'phone', 'sim'].forEach(function (k) {
    const id = 'dock' + k.charAt(0).toUpperCase() + k.slice(1);
    const btn = document.getElementById(id);
    if (!btn) return;
    const on = dockMode === k;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const castBtn = document.getElementById('castToggle');
  if (castBtn && dockMode) {
    castBtn.classList.remove('is-on');
    castBtn.setAttribute('aria-pressed', 'false');
  }
  syncInfoColumn();
}

function setMap3dOverlay(on) {
  map3dOn = Boolean(on);
  const overlay = document.getElementById('map3dOverlay');
  const badge = document.getElementById('map3dBadge');
  const btn = document.getElementById('map3dToggle');
  if (overlay) {
    if (map3dOn) {
      // Always (re)load so terrain/scale deploys are not stuck behind data-loaded
      overlay.src = '/3d/?embed=1&v=20260811gmaps2';
      overlay.setAttribute('data-loaded', '1');
      overlay.hidden = false;
    } else {
      overlay.hidden = true;
    }
  }
  if (badge) badge.hidden = !map3dOn;
  if (btn) {
    btn.classList.toggle('is-on', map3dOn);
    btn.setAttribute('aria-pressed', map3dOn ? 'true' : 'false');
  }
}

function setCastMode(on, opts) {
  castMode = Boolean(on);
  if (castMode) dockMode = '';
  const btn = document.getElementById('castToggle');
  if (btn) {
    btn.classList.toggle('is-on', castMode);
    btn.setAttribute('aria-pressed', castMode ? 'true' : 'false');
  }
  if (castMode) {
    dockMode = '';
    ['radio', 'phone', 'sim'].forEach(function (k) {
      const id = 'dock' + k.charAt(0).toUpperCase() + k.slice(1);
      const b = document.getElementById(id);
      if (b) {
        b.classList.remove('is-on');
        b.setAttribute('aria-pressed', 'false');
      }
    });
    const frame = document.getElementById('dockFrame');
    if (frame) {
      frame.src = 'about:blank';
      frame.removeAttribute('data-src');
    }
    if (!castCache) loadCast().then(() => {
      if (opts && opts.id) selectCast(opts.id);
    });
    else if (opts && opts.id) selectCast(opts.id);
    if (location.hash.indexOf('#cast') !== 0) {
      history.replaceState(null, '', '#cast' + (opts && opts.id ? '/' + encodeURIComponent(opts.id) : ''));
    }
  } else if (location.hash.indexOf('#cast') === 0) {
    history.replaceState(null, '', location.pathname + location.search);
  }
  syncInfoColumn();
}

function renderCastList() {
  const list = document.getElementById('castList');
  const meta = document.getElementById('castMeta');
  if (!list || !castCache) return;
  const chars = castCache.characters || [];
  if (meta) {
    meta.textContent = chars.length + ' visible · registry v' + (castCache.version || '?') +
      (castCache.updated_at ? ' · ' + String(castCache.updated_at).slice(0, 10) : '');
  }
  list.innerHTML = '';
  if (!chars.length) {
    list.innerHTML = '<p class="meta" style="padding:8px">No cast in registry.</p>';
    return;
  }
  chars.forEach((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cast-card' + (c.id === activeCastId ? ' is-active' : '');
    btn.dataset.id = c.id;
    const initial = (c.display_name || c.id || '?').trim().charAt(0).toUpperCase();
    const face = c.image_url
      ? '<img class="cast-face" alt="" src="' + escapeHtml(c.image_url) + '" loading="lazy"/>'
      : '<div class="cast-face cast-face--empty" aria-hidden="true">' + escapeHtml(initial) + '</div>';
    const role = [c.role, c.status].filter(Boolean).join(' · ');
    btn.innerHTML = face + '<span class="cast-card-body"><strong>' + escapeHtml(c.display_name) +
      '</strong><span class="meta">' + escapeHtml(role || 'cast') + '</span></span>';
    btn.onclick = () => selectCast(c.id);
    list.appendChild(btn);
  });
}

function selectCast(id) {
  if (!castCache) return;
  const c = (castCache.characters || []).find((x) => x.id === id);
  activeCastId = c ? c.id : null;
  renderCastList();
  const detail = document.getElementById('castDetail');
  const castSide = document.getElementById('castSide');
  if (castSide) castSide.classList.toggle('has-sheet', Boolean(c));
  if (!detail) return;
  if (!c) { detail.hidden = true; detail.innerHTML = ''; return; }
  const rels = (c.relations || []).map((r) => {
    return '<li><button type="button" data-to="' + escapeHtml(r.to_id) + '">' +
      escapeHtml(r.to_name || r.to_id) + '</button> · ' + escapeHtml(r.label || r.type) + '</li>';
  }).join('');
  const hero = c.image_url
    ? '<img class="cast-hero" alt="" src="' + escapeHtml(c.image_url) + '"/>'
    : '';
  const aliases = (c.aliases || []).length
    ? '<p class="meta">aka ' + escapeHtml(c.aliases.join(', ')) + '</p>'
    : '';
  const dashEdit =
    'https://abhinavall.net/Linuxbox/?tab=characters&campaign=' +
    encodeURIComponent((castCache.campaign_id || 'tropic-gooner')) +
    '&char=' + encodeURIComponent(c.id);
  detail.innerHTML = hero +
    '<h3>' + escapeHtml(c.display_name) + '</h3>' +
    '<p class="meta">' + escapeHtml([c.role, c.status, c.player_name].filter(Boolean).join(' · ')) + '</p>' +
    aliases +
    (c.notes ? '<p class="notes" id="castNotes">' + escapeHtml(c.notes) + '</p>' : '') +
    '<div class="cast-sheet" id="castSheet" aria-live="polite"><p class="meta">' +
      (c.story_path ? 'Loading sheet…' : 'No story sheet linked.') + '</p></div>' +
    (rels ? '<ul class="cast-rels">' + rels + '</ul>' : '<p class="meta">No relations linked.</p>') +
    ((meCache && meCache.can_edit)
      ? '<p class="cast-admin-hint">Edit / upload / merge on <a href="' + escapeHtml(dashEdit) +
        '" target="_blank" rel="noopener">Linuxbox Chars → ' + escapeHtml(c.display_name) + '</a> (admin). Wiki links: [[school: PIU South]]</p>'
      : '');
  detail.hidden = false;
  detail.querySelectorAll('button[data-to]').forEach((b) => {
    b.onclick = () => selectCast(b.getAttribute('data-to'));
  });
  history.replaceState(null, '', '#cast/' + encodeURIComponent(c.id));
  const notesEl = document.getElementById('castNotes');
  if (notesEl) enhanceCastWiki(notesEl);
  if (c.story_path) loadCastSheet(c.id);
}

async function loadCastSheet(id) {
  const el = document.getElementById('castSheet');
  if (!el || id !== activeCastId) return;
  try {
    const r = await fetch('/api/characters/sheet?id=' + encodeURIComponent(id), { cache: 'no-store' });
    if (id !== activeCastId) return;
    if (!r.ok) {
      el.innerHTML = '<p class="meta">Sheet unavailable (' + r.status + ').</p>';
      return;
    }
    const j = await r.json();
    if (id !== activeCastId) return;
    const md = j.markdown || '';
    if (!md) {
      el.innerHTML = '<p class="meta">Empty sheet' + (j.story_path ? ' · ' + escapeHtml(j.story_path) : '') + '.</p>';
      return;
    }
    if (typeof marked !== 'undefined' && marked.parse) {
      if (marked.setOptions) marked.setOptions({ breaks: true, gfm: true });
      el.innerHTML = marked.parse(md);
    } else {
      el.innerHTML = '<pre>' + escapeHtml(md) + '</pre>';
    }
    enhanceCastWiki(el);
  } catch (e) {
    if (id === activeCastId && el) {
      el.innerHTML = '<p class="meta">Sheet load failed: ' + escapeHtml(e.message || String(e)) + '</p>';
    }
  }
}

async function loadCast() {
  const meta = document.getElementById('castMeta');
  try {
    const r = await fetch('/api/characters', { cache: 'no-store' });
    if (r.status === 401) { location.href = '/'; return null; }
    if (!r.ok) throw new Error('cast ' + r.status);
    castCache = await r.json();
    renderCastList();
    return castCache;
  } catch (e) {
    if (meta) meta.textContent = 'Cast unavailable: ' + (e.message || e);
    return null;
  }
}

function applyCastHash() {
  const h = (location.hash || '').replace(/^#/, '');
  if (h === 'cast' || h.indexOf('cast/') === 0) {
    const id = h.indexOf('/') >= 0 ? decodeURIComponent(h.split('/').slice(1).join('/')) : '';
    setCastMode(true, id ? { id } : {});
  }
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { v: 1, mapRes: '4k', visited: [], notes: {}, coord_overrides: {} };
    const p = JSON.parse(raw);
    if (!p || p.v !== 1) return { v: 1, mapRes: '4k', visited: [], notes: {}, coord_overrides: {} };
    if (!Array.isArray(p.visited)) p.visited = [];
    if (!p.notes || typeof p.notes !== 'object') p.notes = {};
    if (!p.coord_overrides || typeof p.coord_overrides !== 'object') p.coord_overrides = {};
    return p;
  } catch {
    return { v: 1, mapRes: '4k', visited: [], notes: {}, coord_overrides: {} };
  }
}

function saveProfile(patch) {
  const cur = loadProfile();
  const next = { ...cur, ...patch, v: 1, updated_at: new Date().toISOString() };
  if (patch.notes) next.notes = { ...cur.notes, ...patch.notes };
  if (patch.coord_overrides) next.coord_overrides = { ...cur.coord_overrides, ...patch.coord_overrides };
  if (patch.camera) next.camera = { ...cur.camera, ...patch.camera };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  updatePilotStats(next);
  return next;
}

function mapImageSize() {
  if (mapDataCache && mapDataCache.tile_pyramid && mapDataCache.tile_pyramid.width) {
    return { w: mapDataCache.tile_pyramid.width, h: mapDataCache.tile_pyramid.height };
  }
  const img = document.getElementById('mapImg');
  if (!img) return null;
  return { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
}

function computeFitScale() {
  const vp = document.getElementById('viewport');
  const size = mapImageSize();
  if (!vp || !size) return 1;
  const pad = 24;
  const vw = vp.clientWidth - pad * 2;
  const vh = vp.clientHeight - pad * 2;
  if (vw < 1 || vh < 1) return 1;
  return Math.min(vw / size.w, vh / size.h, 1);
}

function pickTileZoom() {
  if (!tilePyramid) return 0;
  // Match pyramid level to on-screen pixel density:
  //   tileCss ≈ tileSize * 2^(maxZoom-z) * camera.scale
  // Aim ~1 source px per CSS px → z ≈ maxZoom + log2(scale).
  // BUG(was): maxZoom + log2(scale/fit) → at fit (ratio≈1) always picked maxZoom,
  // requesting hundreds of z=5 tiles (opacity 0 until load) → black map strip.
  const scale = Math.max(1e-6, camera.scale);
  const ideal = Math.floor(tilePyramid.maxZoom + Math.log2(scale) + 0.35);
  const z = Math.max(tilePyramid.minZoom, Math.min(tilePyramid.maxZoom, ideal));
  if (activeTileZ == null) {
    activeTileZ = z;
    return z;
  }
  // Upgrade tile detail immediately when zooming in; downgrade only after a full level.
  if (z > activeTileZ) activeTileZ = z;
  else if (activeTileZ - z >= 1) activeTileZ = z;
  return activeTileZ;
}

function scheduleTileUpdate() {
  if (!tilePyramid) return;
  window.clearTimeout(tileUpdateTimer);
  tileUpdateTimer = window.setTimeout(updateVisibleTiles, 80);
}

function updateVisibleTiles() {
  const layer = document.querySelector('[data-layer-id="terrain-tiles"] #mapTileLayer')
    || document.getElementById('mapTileLayer');
  if (!layer || !tilePyramid) return;
  const z = pickTileZoom();
  const epoch = ++tileLoadEpoch;
  const nativeScale = Math.pow(2, tilePyramid.maxZoom - z);
  const ts = tilePyramid.tileSize;
  const levelW = Math.max(1, Math.round(tilePyramid.width / nativeScale));
  const levelH = Math.max(1, Math.round(tilePyramid.height / nativeScale));
  const vp = document.getElementById('viewport');
  if (!vp) return;

  const pad = ts * 2;
  const left = (-camera.x) / camera.scale - pad;
  const top = (-camera.y) / camera.scale - pad;
  const right = left + vp.clientWidth / camera.scale + pad * 2;
  const bottom = top + vp.clientHeight / camera.scale + pad * 2;

  const tx0 = Math.max(0, Math.floor(left / nativeScale / ts));
  const ty0 = Math.max(0, Math.floor(top / nativeScale / ts));
  const tx1 = Math.min(Math.ceil(levelW / ts) - 1, Math.ceil(right / nativeScale / ts));
  const ty1 = Math.min(Math.ceil(levelH / ts) - 1, Math.ceil(bottom / nativeScale / ts));

  const needed = new Set();
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) needed.add(z + '/' + ty + '/' + tx);
  }

  layer.querySelectorAll('img').forEach(function(img) {
    if (!needed.has(img.dataset.tileKey)) img.remove();
  });

  needed.forEach(function(key) {
    if (layer.querySelector('[data-tile-key="' + key + '"]')) return;
    const parts = key.split('/');
    const zz = parts[0];
    const ty = parseInt(parts[1], 10);
    const tx = parseInt(parts[2], 10);
    const img = document.createElement('img');
    img.dataset.tileKey = key;
    img.draggable = false;
    img.alt = '';
    const lLeft = tx * ts * nativeScale;
    const lTop = ty * ts * nativeScale;
    const tw = Math.min(ts, levelW - tx * ts) * nativeScale;
    const th = Math.min(ts, levelH - ty * ts) * nativeScale;
    img.style.left = lLeft + 'px';
    img.style.top = lTop + 'px';
    img.style.width = tw + 'px';
    img.style.height = th + 'px';
    img.decoding = 'async';
    // Show tiles as soon as they decode — never hold the viewport at opacity 0
    // while underlay/JS catch up (black void). Fade-in optional via CSS only.
    img.style.opacity = '1';
    img.dataset.epoch = String(epoch);
    img.onerror = function() {
      if (img.dataset.epoch !== String(epoch)) return;
      img.remove();
    };
    img.src = '/map-tiles/' + zz + '/' + ty + '/' + tx + '.webp';
    layer.appendChild(img);
  });
  // Once tiles paint, hide underlay so Roads/SVG never fight a differently-sampled base.
  const under = document.getElementById('mapImg');
  if (under && layer.querySelectorAll('img').length > 0) {
    under.style.opacity = '0';
    under.style.pointerEvents = 'none';
  }
}

function applyCamera(animate) {
  const el = document.getElementById('mapCamera');
  const label = document.getElementById('zoomLabel');
  if (!el) return;
  const t = 'translate(' + camera.x + 'px,' + camera.y + 'px) scale(' + camera.scale + ')';
  if (animate && !prefersReducedMotion) {
    el.style.transition = 'transform 0.32s ease-out';
    el.style.transform = t;
    window.setTimeout(function() { el.style.transition = ''; }, 340);
  } else {
    el.style.transform = t;
  }
  if (label) label.textContent = Math.round(camera.scale * 100) + '%';
  scheduleTileUpdate();
}

function scheduleCameraSave() {
  if (!cameraReady) return;
  window.clearTimeout(cameraSaveTimer);
  cameraSaveTimer = window.setTimeout(function() {
    saveProfile({ camera: { x: camera.x, y: camera.y, scale: camera.scale } });
  }, 400);
}

function fitToView(animate) {
  const vp = document.getElementById('viewport');
  const size = mapImageSize();
  if (!vp || !size) return;
  const scale = computeFitScale();
  camera.scale = scale;
  camera.x = (vp.clientWidth - size.w * scale) / 2;
  camera.y = (vp.clientHeight - size.h * scale) / 2;
  fitScale = scale;
  activeTileZ = null;
  applyCamera(animate);
  scheduleCameraSave();
}

function restoreCameraFromProfile(profile, animate) {
  fitScale = computeFitScale();
  const c = profile && profile.camera;
  const vp = document.getElementById('viewport');
  const size = mapImageSize();
  if (!c || typeof c.scale !== 'number' || !vp || !size || !cameraShowsMap(c, vp, size)) {
    fitToView(animate);
    return;
  }
  camera.x = c.x || 0;
  camera.y = c.y || 0;
  camera.scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.scale));
  activeTileZ = null;
  applyCamera(animate);
  cameraReady = true;
}

function cameraShowsMap(c, vp, size) {
  const cs = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.scale));
  const cx = c.x || 0;
  const cy = c.y || 0;
  const mapR = cx + size.w * cs;
  const mapB = cy + size.h * cs;
  const overlapW = Math.max(0, Math.min(mapR, vp.clientWidth) - Math.max(cx, 0));
  const overlapH = Math.max(0, Math.min(mapB, vp.clientHeight) - Math.max(cy, 0));
  const overlapArea = overlapW * overlapH;
  const vpArea = Math.max(1, vp.clientWidth * vp.clientHeight);
  return overlapArea >= vpArea * 0.28;
}

function zoomAt(factor, clientX, clientY) {
  const vp = document.getElementById('viewport');
  if (!vp) return;
  const rect = vp.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  const wx = (mx - camera.x) / camera.scale;
  const wy = (my - camera.y) / camera.scale;
  camera.scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.scale * factor));
  camera.x = mx - wx * camera.scale;
  camera.y = my - wy * camera.scale;
  applyCamera(false);
  scheduleCameraSave();
}

function focusOnMarker(marker, animate) {
  const vp = document.getElementById('viewport');
  const size = mapImageSize();
  if (!vp || !size || marker.x_pct == null || marker.y_pct == null) return;
  const px = (marker.x_pct / 100) * size.w;
  const py = (marker.y_pct / 100) * size.h;
  camera.scale = FOCUS_ZOOM;
  camera.x = vp.clientWidth / 2 - px * camera.scale;
  camera.y = vp.clientHeight / 2 - py * camera.scale;
  applyCamera(animate);
  scheduleCameraSave();
}

function applyCoordOverrides(markers, profile) {
  // Only while Edit is on. Leftover localStorage overrides must not move pins for viewers
  // (Hiatus-class bug: drag in edit → exit/refresh without Save → ghost positions).
  const allow = editMode || (profile && profile.editMode === true);
  if (!allow) return markers;
  const ov = (profile && profile.coord_overrides) || {};
  return markers.map(function(m) {
    const o = ov[m.id];
    if (!o || o.x_pct == null || o.y_pct == null) return m;
    return { ...m, x_pct: o.x_pct, y_pct: o.y_pct, coord_status: 'manual' };
  });
}

function restoreServerMarkerCoords() {
  if (!mapDataCache || !serverMarkersCache) return;
  mapDataCache.markers = serverMarkersCache.map(function(m) { return Object.assign({}, m); });
  refreshPins();
  (mapDataCache.markers || []).forEach(function(m) {
    syncLabelForMarker(m.id);
    if (m.x_pct != null && m.y_pct != null) syncAreaForMarker(m.id, m.x_pct, m.y_pct);
  });
}

function pointerToMapPct(clientX, clientY) {
  const stage = document.getElementById('mapStage');
  if (!stage) return null;
  const rect = stage.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const x_pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
  const y_pct = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
  return { x_pct: +x_pct.toFixed(2), y_pct: +y_pct.toFixed(2) };
}

function syncLabelForMarker(id) {
  const m = markerById(id);
  if (!m || m.x_pct == null || m.y_pct == null) return;
  const label = document.querySelector('.map-label[data-id="' + id + '"]');
  if (!label) return;
  // SoT: same x_pct/y_pct as pin. CSS translate(-50%,-100%) sits name above pin.
  label.style.left = m.x_pct + '%';
  label.style.top = m.y_pct + '%';
}

function syncAreaForMarker(id, x_pct, y_pct) {
  const zone = document.querySelector('.map-area-zone[data-id="' + id + '"]');
  if (!zone) return;
  zone.setAttribute('cx', String(x_pct));
  zone.setAttribute('cy', String(y_pct));
}

function setMarkerCoord(id, x_pct, y_pct) {
  const m = markerById(id);
  if (!m) return;
  m.x_pct = x_pct;
  m.y_pct = y_pct;
  m.coord_status = 'manual';
  delete m.label_x_pct;
  delete m.label_y_pct;
  delete m.label_dy_pct;
  const pin = document.querySelector('.pin[data-id="' + id + '"]');
  if (pin) {
    pin.style.left = x_pct + '%';
    pin.style.top = y_pct + '%';
  }
  syncLabelForMarker(id);
  syncAreaForMarker(id, x_pct, y_pct);
  const cur = loadProfile();
  saveProfile({ coord_overrides: { ...cur.coord_overrides, [id]: { x_pct, y_pct } } });
  coordsDirty = true;
  const saveBtn = document.getElementById('saveCoordsBtn');
  if (saveBtn) saveBtn.classList.add('is-dirty');
}

function updateEditHint() {
  const hint = document.getElementById('mapHint');
  if (!hint) return;
  if (drawMode) {
    if (drawClosed) {
      hint.textContent = 'EDIT BORDER — drag yellow handles · click edge to add · Alt+click / Del removes vert · Save border';
    } else if (drawSnapEnabled) {
      hint.textContent = 'DRAW — pink dots = snap targets (other regions) · yellow ring = snapped · black art squares are NOT snaps';
    } else {
      hint.textContent = 'DRAW — click map to add vertices · Close poly (≥3 pts) · pan still works if you drag';
    }
    return;
  }
  hint.textContent = editMode
    ? 'EDIT — drag pins to reposition · Save coords when done'
    : 'drag to pan · scroll to zoom · legend to focus';
}

function refreshPins() {
  const pinLayer = document.querySelector('[data-layer-id="poi-pins"]');
  if (!pinLayer || !mapDataCache) return;
  pinLayer.innerHTML = '';
  placePins(pinLayer, mapDataCache.markers || []);
}

function setDrawStatus(msg, kind) {
  const el = document.getElementById('drawStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('is-err', kind === 'err');
  el.classList.toggle('is-ok', kind === 'ok');
}

/** Save enabled when ≥3 finite verts and a region is bound/selected (edit mode already closed). */
function syncDrawSaveBtnState() {
  const saveBtn = document.getElementById('drawSaveBtn');
  const closeBtn = document.getElementById('drawCloseBtn');
  const sel = document.getElementById('drawRegionSelect');
  const id = drawBoundRegionId || (sel && sel.value);
  const nValid = validDrawVerts(drawVerts).length;
  const canSave = drawMode && nValid >= 3 && Boolean(id);
  if (saveBtn && !saveBtn.dataset.saving) {
    saveBtn.disabled = !canSave;
    saveBtn.classList.toggle('is-ready', canSave);
    saveBtn.title = canSave
      ? 'Save border (Ctrl+S)'
      : (nValid < 3 ? 'Need ≥3 points' : 'Pick a region');
  }
  if (closeBtn) {
    closeBtn.textContent = drawClosed && nValid >= 3 ? 'Closed ✓' : 'Close poly';
    closeBtn.title = drawClosed && nValid >= 3
      ? 'Polygon closed — click Save border (or Ctrl+S)'
      : 'Close polygon (≥3 points), then Save';
  }
  syncDrawRebindBtn();
}

function regionDrawLabel(id) {
  const m = markerById(id);
  return (m && (m.label || m.name)) || id;
}

function syncDrawRebindBtn() {
  const btn = document.getElementById('drawRebindBtn');
  const sel = document.getElementById('drawRegionSelect');
  if (!btn) return;
  const selectedId = sel && sel.value;
  const mismatch = Boolean(
    drawMode && drawVerts.length && drawBoundRegionId && selectedId && drawBoundRegionId !== selectedId
  );
  btn.hidden = !mismatch;
  if (mismatch) {
    const tgt = regionDrawLabel(selectedId);
    btn.textContent = 'Rebind → ' + tgt;
    btn.title = 'Keep ' + drawVerts.length + ' verts; Save border as ' + tgt;
  }
}

function rebindDrawVertsToSelectedRegion() {
  const sel = document.getElementById('drawRegionSelect');
  const nextId = sel && sel.value;
  if (!nextId || !drawVerts.length) return false;
  drawBoundRegionId = nextId;
  markDrawDirty();
  syncDrawRebindBtn();
  syncDrawSaveBtnState();
  const label = regionDrawLabel(nextId);
  setDrawStatus('Rebound ' + drawVerts.length + ' verts to ' + label + ' — click Save border', 'ok');
  showDrawToast('Save target: ' + label, 'ok');
  return true;
}

/** Dirty verts bound elsewhere: rebind, clear+switch, or cancel (caller reverts select). */
function tryDrawRegionSwitch(nextId) {
  if (!drawVerts.length || !drawBoundRegionId || drawBoundRegionId === nextId) return true;
  const fromLabel = regionDrawLabel(drawBoundRegionId);
  const toLabel = regionDrawLabel(nextId);
  if (window.confirm(
    'Unsaved verts are bound to "' + fromLabel + '".\\n\\n' +
    'OK = Keep verts and rebind to "' + toLabel + '" (Save writes ' + toLabel + ').\\n' +
    'Cancel = offer Clear-and-switch or stay on ' + fromLabel + '.'
  )) {
    drawBoundRegionId = nextId;
    markDrawDirty();
    syncDrawRebindBtn();
    syncDrawSaveBtnState();
    setDrawStatus('Rebound to ' + toLabel + ' — Save border when ready', 'ok');
    return true;
  }
  if (window.confirm(
    'Clear ' + drawVerts.length + ' unsaved verts and switch to "' + toLabel + '"?'
  )) {
    clearDrawVerts();
    drawBoundRegionId = nextId;
    syncDrawRebindBtn();
    return true;
  }
  return false;
}

function syncDrawSnapBtn() {
  const btn = document.getElementById('drawSnapBtn');
  if (!btn) return;
  btn.textContent = drawSnapEnabled ? 'Snap edges ON' : 'Snap edges OFF';
  btn.classList.toggle('is-on', drawSnapEnabled);
  btn.setAttribute('aria-pressed', drawSnapEnabled ? 'true' : 'false');
  const hint = document.getElementById('drawSnapHint');
  if (hint) {
    hint.textContent = drawSnapEnabled
      ? "Snap = stick to other regions' corner dots (shown when Snap ON)"
      : 'Snap OFF — clicks place free vertices (no neighbor stick)';
  }
}

/** Saved polygon for a region id, or null if empty / missing. */
function getRegionSavedPoints(id) {
  if (!id || !mapDataCache) return null;
  const areas = (mapDataCache.regions_ui_data && mapDataCache.regions_ui_data.areas) || [];
  const a = areas.find(function(x) { return x && x.id === id; });
  if (!a || (a.shape && a.shape !== 'polygon')) return null;
  const pts = parseAreaPoints(a.points);
  return pts.length >= 3 ? pts : null;
}

/** Parse SVG points="x,y x,y …" into {x,y}[]. */
function parseAreaPoints(pointsStr) {
  if (!pointsStr || typeof pointsStr !== 'string') return [];
  return pointsStr.trim().split(/\s+/).map(function(pair) {
    const parts = pair.split(',');
    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: x, y: y };
  }).filter(Boolean);
}

/** Normalize one draw vertex ({x,y} or [x,y]) to finite map coords, or null. */
function xyFromDrawVert(v) {
  if (!v) return null;
  let x;
  let y;
  if (Array.isArray(v)) {
    x = Number(v[0]);
    y = Number(v[1]);
  } else {
    x = Number(v.x != null ? v.x : v[0]);
    y = Number(v.y != null ? v.y : v[1]);
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: +x.toFixed(2), y: +y.toFixed(2) };
}

/** Keep only finite draw verts (fixes array-format drafts and NaN slots). */
function validDrawVerts(raw) {
  const out = [];
  (raw || []).forEach(function(v) {
    const p = xyFromDrawVert(v);
    if (p) out.push({ x: p.x, y: p.y, snapped: Boolean(v && v.snapped) });
  });
  return out;
}

/** Serialize draw verts → SVG points string; null when <3 finite verts. */
function serializeDrawVerts(raw) {
  const verts = validDrawVerts(raw);
  if (verts.length < 3) return { verts: verts, pointsStr: null };
  const pointsStr = verts.map(function(v) { return v.x + ',' + v.y; }).join(' ');
  return { verts: verts, pointsStr: pointsStr };
}

function showDrawToast(msg, kind) {
  let el = document.getElementById('drawToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'drawToast';
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;bottom:4.5rem;left:50%;transform:translateX(-50%);z-index:9999;padding:8px 14px;border-radius:6px;font-size:.78rem;letter-spacing:.03em;max-width:92vw;pointer-events:none;transition:opacity .2s';
    document.body.appendChild(el);
  }
  el.textContent = msg || '';
  el.style.background = kind === 'err' ? 'rgba(120,20,40,.92)' : 'rgba(10,30,50,.92)';
  el.style.color = kind === 'err' ? '#ffb4c0' : '#e8f4ff';
  el.style.border = '1px solid ' + (kind === 'err' ? '#ff8a9a' : 'var(--sun,#ffd54a)');
  el.style.opacity = '1';
  clearTimeout(el._hideTimer);
  el._hideTimer = window.setTimeout(function() { el.style.opacity = '0'; }, kind === 'err' ? 5000 : 2800);
}

/** Ray-cast point-in-polygon (percent map coords). poly = [{x,y}, …]. */
function pointInPolygon(x, y, poly) {
  const n = poly && poly.length;
  if (!n || n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const denom = (yj - yi) || 1e-15;
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / denom + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Bind city pins → containing area by PIP.
 * Sets marker.region_id / containing_area_id; area.pin_ids; mismatch flags.
 */
function bindPinsToAreas() {
  if (!mapDataCache) return;
  const markers = mapDataCache.markers || [];
  const areas = (mapDataCache.regions_ui_data && mapDataCache.regions_ui_data.areas) || [];
  markers.forEach(function(m) {
    m.containing_area_id = null;
    m.region_id = null;
    m.area_pin_mismatch = false;
  });
  areas.forEach(function(a) {
    a.pin_ids = [];
    a.display_pin_name = null;
    a.pin_mismatch = false;
  });
  const polys = [];
  areas.forEach(function(a) {
    if (!a || (a.shape && a.shape !== 'polygon')) return;
    const pts = parseAreaPoints(a.points);
    if (pts.length >= 3) polys.push({ a: a, pts: pts });
  });
  markers.forEach(function(m) {
    if (m.x_pct == null || m.y_pct == null) return;
    const x = +m.x_pct;
    const y = +m.y_pct;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    for (let i = 0; i < polys.length; i++) {
      const row = polys[i];
      if (!pointInPolygon(x, y, row.pts)) continue;
      m.containing_area_id = row.a.id;
      m.region_id = row.a.id;
      row.a.pin_ids.push(m.id);
      if (!row.a.display_pin_name) {
        row.a.display_pin_name = m.label || m.name || m.id;
      }
      if (m.id !== row.a.id) {
        m.area_pin_mismatch = true;
        row.a.pin_mismatch = true;
      }
      break;
    }
  });
}

/** First city pin inside verts (for Draw Save suggest). */
function findPinInsideVerts(verts) {
  if (!verts || verts.length < 3 || !mapDataCache) return null;
  const poly = verts.map(function(v) { return { x: +v.x, y: +v.y }; });
  const markers = mapDataCache.markers || [];
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    if (m.x_pct == null || m.y_pct == null) continue;
    if (pointInPolygon(+m.x_pct, +m.y_pct, poly)) return m;
  }
  return null;
}

/** Area hover/label: prefer pin name inside poly; warn if area id ≠ that pin. */
function areaDisplayTip(a) {
  if (!a) return '';
  const idName = displayNameForRegionId(a.id, a.name);
  if (a.pin_ids && a.pin_ids.length) {
    const pin = markerById(a.pin_ids[0]);
    const pinName = (pin && (pin.label || pin.name)) || a.display_pin_name || idName;
    if (a.pin_mismatch) return pinName + ' ⚠ area labeled ' + idName;
    return pinName;
  }
  return idName;
}

/**
 * Snap targets from OTHER regions' polygons: vertices + mid-edge points.
 * excludeId = region currently being drawn (do not snap to its own old geom).
 */
function collectDrawSnapTargets(excludeId) {
  const areas = (mapDataCache && mapDataCache.regions_ui_data && mapDataCache.regions_ui_data.areas) || [];
  const out = [];
  areas.forEach(function(a) {
    if (!a || a.id === excludeId) return;
    if (a.shape && a.shape !== 'polygon') return;
    const pts = parseAreaPoints(a.points);
    if (pts.length < 2) return;
    pts.forEach(function(p) {
      out.push({ x: p.x, y: p.y, kind: 'vertex', from: a.id });
    });
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a0 = pts[i];
      const a1 = pts[(i + 1) % n];
      out.push({
        x: (a0.x + a1.x) / 2,
        y: (a0.y + a1.y) / 2,
        kind: 'mid',
        from: a.id,
      });
    }
  });
  return out;
}

function findDrawSnapTarget(x_pct, y_pct) {
  if (!drawSnapEnabled) return null;
  const sel = document.getElementById('drawRegionSelect');
  // Exclude the region being drawn (bound id), not a mismatched dropdown.
  const excludeId = drawBoundRegionId || (sel && sel.value);
  const targets = collectDrawSnapTargets(excludeId);
  let best = null;
  let bestD = DRAW_SNAP_THRESH;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const dx = t.x - x_pct;
    const dy = t.y - y_pct;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

function setDrawSnapHover(target) {
  drawSnapHover = target;
  const vp = document.getElementById('viewport');
  if (vp) vp.classList.toggle('is-snap-hot', Boolean(target));
}

function updateDrawSnapHoverFromPointer(clientX, clientY) {
  if (!drawMode || drawClosed || !drawSnapEnabled) {
    setDrawSnapHover(null);
    return;
  }
  const p = pointerToMapPct(clientX, clientY);
  if (!p) {
    setDrawSnapHover(null);
    return;
  }
  setDrawSnapHover(findDrawSnapTarget(p.x_pct, p.y_pct));
}

/** Nearest draw vertex index within DRAW_VERT_HIT, or -1. */
function hitDrawVertexIndex(x_pct, y_pct) {
  let best = -1;
  let bestD = DRAW_VERT_HIT;
  for (let i = 0; i < drawVerts.length; i++) {
    const v = drawVerts[i];
    const d = Math.hypot(v.x - x_pct, v.y - y_pct);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Nearest edge for insert-on-edge while editing a closed poly.
 * Returns { index: insertAfter, x, y } or null.
 */
function hitDrawEdgeInsert(x_pct, y_pct) {
  if (drawVerts.length < 2) return null;
  const n = drawVerts.length;
  let best = null;
  let bestD = DRAW_EDGE_HIT;
  for (let i = 0; i < n; i++) {
    const a0 = drawVerts[i];
    const a1 = drawVerts[(i + 1) % n];
    const dx = a1.x - a0.x;
    const dy = a1.y - a0.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-8) continue;
    let t = ((x_pct - a0.x) * dx + (y_pct - a0.y) * dy) / len2;
    if (t < 0.08 || t > 0.92) continue; // avoid verts (use vert hit instead)
    const px = a0.x + t * dx;
    const py = a0.y + t * dy;
    const d = Math.hypot(px - x_pct, py - y_pct);
    if (d <= bestD) {
      bestD = d;
      best = { index: i + 1, x: +px.toFixed(2), y: +py.toFixed(2) };
    }
  }
  return best;
}

const DRAW_DRAFT_KEY = 'tableslop-draw-draft-v1';

function persistDrawDraft() {
  try {
    const verts = validDrawVerts(drawVerts);
    if (verts.length < 3) {
      localStorage.removeItem(DRAW_DRAFT_KEY);
      return;
    }
    localStorage.setItem(DRAW_DRAFT_KEY, JSON.stringify({
      v: 1,
      id: drawBoundRegionId,
      closed: drawClosed,
      dirty: regionsDirty,
      verts: verts.map(function(p) {
        return { x: p.x, y: p.y, snapped: Boolean(p.snapped) };
      }),
      saved_at: new Date().toISOString(),
    }));
  } catch (_) { /* quota / private mode */ }
}

function clearDrawDraft() {
  try { localStorage.removeItem(DRAW_DRAFT_KEY); } catch (_) { /* ignore */ }
}

/** Restore draft verts into editor (shared by confirm + silent save paths). */
function applyDrawDraftPayload(d) {
  const verts = validDrawVerts(d && d.verts);
  if (verts.length < 3) return false;
  drawVerts = verts;
  drawBoundRegionId = (d && d.id) || drawBoundRegionId || null;
  drawClosed = !d || d.closed !== false;
  drawSelectedVert = null;
  drawVertDrag = null;
  regionsDirty = true;
  const sel = document.getElementById('drawRegionSelect');
  if (sel && drawBoundRegionId) sel.value = drawBoundRegionId;
  const saveBtn = document.getElementById('drawSaveBtn');
  if (saveBtn) saveBtn.classList.add('is-dirty');
  renderDrawPreview();
  updateEditHint();
  syncDrawSaveBtnState();
  return true;
}

/** Restore unsaved verts after hard-refresh (GM mid-draw safety net). */
function tryRestoreDrawDraft() {
  try {
    const raw = localStorage.getItem(DRAW_DRAFT_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.verts) || d.verts.length < 3) return false;
    const nValid = validDrawVerts(d.verts).length;
    if (nValid < 3) return false;
    const label = d.id || 'region';
    if (!window.confirm(
      'Restore unsaved border draft (' + nValid + ' pts' +
      (d.id ? ' · ' + d.id : '') + ')? Cancel discards the draft.'
    )) {
      clearDrawDraft();
      return false;
    }
    applyDrawDraftPayload(d);
    setDrawStatus('Restored draft ' + drawVerts.length + ' pts · ' + label + ' — Save border now', 'ok');
    return true;
  } catch (_) {
    return false;
  }
}

/** Save-time draft restore — no confirm (GM already clicked Save). */
function tryRestoreDrawDraftSilent() {
  try {
    const raw = localStorage.getItem(DRAW_DRAFT_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.verts) || validDrawVerts(d.verts).length < 3) return false;
    return applyDrawDraftPayload(d);
  } catch (_) {
    return false;
  }
}

function markDrawDirty() {
  regionsDirty = true;
  const saveBtn = document.getElementById('drawSaveBtn');
  if (saveBtn) saveBtn.classList.add('is-dirty');
  syncDrawSaveBtnState();
  persistDrawDraft();
}

/**
 * Load saved polygon for the selected region into the draw editor.
 * @param {{force?:boolean}} opts — force=true skips dirty confirm (Load border click).
 */
function loadBorderForSelectedRegion(opts) {
  opts = opts || {};
  const sel = document.getElementById('drawRegionSelect');
  const id = sel && sel.value;
  if (!id) {
    setDrawStatus('Pick a region');
    return false;
  }
  const pts = getRegionSavedPoints(id);
  if (!pts) {
    setDrawStatus('No saved border for this region — draw new');
    return false;
  }
  if (!opts.force && drawVerts.length && regionsDirty) {
    setDrawStatus('Unsaved pts — Clear or click Load border');
    return false;
  }
  if (opts.force && drawVerts.length && regionsDirty) {
    if (!window.confirm('Replace current unsaved vertices with saved border?')) return false;
  }
  drawVerts = pts.map(function(p) {
    return { x: +Number(p.x).toFixed(2), y: +Number(p.y).toFixed(2), snapped: false };
  });
  drawBoundRegionId = id;
  drawClosed = true;
  drawSelectedVert = null;
  drawVertDrag = null;
  regionsDirty = false;
  setDrawSnapHover(null);
  const saveBtn = document.getElementById('drawSaveBtn');
  if (saveBtn) saveBtn.classList.remove('is-dirty');
  renderDrawPreview();
  updateEditHint();
  syncDrawSaveBtnState();
  const m = markerById(id);
  setDrawStatus('Loaded ' + drawVerts.length + ' pts · editing · ' + ((m && (m.label || m.name)) || id) + ' — Save ready');
  return true;
}

function deleteSelectedDrawVertex() {
  if (!drawClosed || drawSelectedVert == null) return;
  if (drawVerts.length <= 3) {
    setDrawStatus('Need ≥3 verts — cannot delete');
    return;
  }
  drawVerts.splice(drawSelectedVert, 1);
  drawSelectedVert = null;
  markDrawDirty();
  renderDrawPreview();
  updateEditHint();
}

/** v1: parent region markers only. Nesting stub: later union options from city *-subzones.json (draw target = region OR sub-region). */
function fillDrawRegionSelect() {
  const sel = document.getElementById('drawRegionSelect');
  if (!sel || !mapDataCache) return;
  const markers = (mapDataCache.markers || []).slice().sort(function(a, b) {
    return (a.region || 999) - (b.region || 999);
  });
  const prev = sel.value;
  sel.innerHTML = markers.map(function(m) {
    const num = m.region != null ? 'R' + m.region + ' · ' : '';
    const label = m.label || m.name || m.id;
    const has = getRegionSavedPoints(m.id) ? ' ●' : '';
    return '<option value="' + escapeHtml(m.id) + '">' + escapeHtml(num + label + has) + '</option>';
  }).join('');
  if (prev && markers.some(function(m) { return m.id === prev; })) sel.value = prev;
  if (!sel.dataset.loadBound) {
    sel.dataset.loadBound = '1';
    sel.addEventListener('change', function() {
      if (!drawMode) return;
      const nextId = sel.value;
      // Verts already bound to another region: confirm rebind / clear+switch / cancel.
      if (drawVerts.length && drawBoundRegionId && drawBoundRegionId !== nextId) {
        if (regionsDirty) {
          if (!tryDrawRegionSwitch(nextId)) {
            sel.value = drawBoundRegionId;
            syncDrawRebindBtn();
            setDrawStatus(
              'Still editing ' + regionDrawLabel(drawBoundRegionId) + ' — Rebind or Clear',
              'err'
            );
            return;
          }
        } else {
          // Clean editor (loaded border): switch means leave that border alone on disk.
          clearDrawVerts();
        }
      }
      if (!drawBoundRegionId && drawVerts.length) drawBoundRegionId = nextId;
      // Auto-load when region already has geom and editor is empty / clean
      if (getRegionSavedPoints(nextId)) {
        if (!drawVerts.length || !regionsDirty) loadBorderForSelectedRegion({});
        else setDrawStatus('Has saved border — click Load border');
      } else if (!drawVerts.length) {
        drawBoundRegionId = nextId;
        setDrawStatus('No saved border — draw new');
      }
    });
  }
}

function ensureDrawSvg() {
  const stage = document.getElementById('mapStage');
  if (!stage) return null;
  let svg = document.getElementById('drawPreviewSvg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'drawPreviewSvg';
    svg.setAttribute('class', 'map-draw-svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    stage.appendChild(svg);
  }
  return svg;
}

function renderDrawPreview() {
  const svg = ensureDrawSvg();
  if (!svg) return;
  svg.innerHTML = '';
  if (!drawMode) return;

  // Drop invalid slots so UI count matches what Save will serialize.
  if (drawVerts.length) {
    const normalized = validDrawVerts(drawVerts);
    if (normalized.length >= 3 && normalized.length !== drawVerts.length) {
      drawVerts = normalized;
    }
  }

  // Neighbor snap targets (pink) — only while placing new verts with Snap ON
  if (drawSnapEnabled && !drawClosed) {
    const sel = document.getElementById('drawRegionSelect');
    const excludeId = drawBoundRegionId || (sel && sel.value);
    collectDrawSnapTargets(excludeId).forEach(function(t) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', 'map-draw-snap-target' + (t.kind === 'mid' ? ' is-mid' : ''));
      c.setAttribute('cx', String(t.x));
      c.setAttribute('cy', String(t.y));
      c.setAttribute('r', t.kind === 'mid' ? '0.18' : '0.28');
      svg.appendChild(c);
    });
  }

  if (drawVerts.length) {
    const ser = serializeDrawVerts(drawVerts);
    const pts = ser.pointsStr;
    if (pts && ser.verts.length >= 3) {
      if (drawClosed) {
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('class', 'map-draw-poly');
        poly.setAttribute('points', pts);
        svg.appendChild(poly);
      } else {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        line.setAttribute('class', 'map-draw-line');
        line.setAttribute('points', pts);
        svg.appendChild(line);
      }
    }
    ser.verts.forEach(function(v, i) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      let cls = 'map-draw-vert';
      if (drawClosed) {
        cls += ' is-edit';
        if (drawSelectedVert === i) cls += ' is-edit-sel';
      } else if (v.snapped) {
        cls += ' is-snapped';
      }
      c.setAttribute('class', cls);
      c.setAttribute('cx', String(v.x));
      c.setAttribute('cy', String(v.y));
      let r = 0.12;
      if (drawClosed) r = drawSelectedVert === i ? 0.42 : 0.35;
      else if (v.snapped) r = 0.22;
      c.setAttribute('r', String(r));
      svg.appendChild(c);
    });
  }
  if (drawSnapHover && !drawClosed) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    g.setAttribute('class', 'map-draw-snap-ghost');
    g.setAttribute('cx', String(drawSnapHover.x));
    g.setAttribute('cy', String(drawSnapHover.y));
    g.setAttribute('r', '0.55');
    svg.appendChild(g);
  }
  const n = validDrawVerts(drawVerts).length;
  let status = n + ' pt' + (n === 1 ? '' : 's') + (drawClosed ? ' · editing' : '');
  if (drawSnapHover && !drawClosed) status += ' · snap ' + (drawSnapHover.kind || 'edge');
  if (drawClosed && drawSelectedVert != null) status += ' · vert #' + (drawSelectedVert + 1);
  if (drawClosed && n >= 3) status += ' · Save ready';
  setDrawStatus(status);
  syncDrawSaveBtnState();
  if (regionsDirty && n >= 3) persistDrawDraft();
}

function clearDrawVerts() {
  drawVerts = [];
  drawClosed = false;
  drawSelectedVert = null;
  drawVertDrag = null;
  drawBoundRegionId = null;
  regionsDirty = false;
  setDrawSnapHover(null);
  // Keep draft until explicit Clear after confirm — only wipe draft when empty clear is intentional.
  clearDrawDraft();
  renderDrawPreview();
  updateEditHint();
  const saveBtn = document.getElementById('drawSaveBtn');
  if (saveBtn) saveBtn.classList.remove('is-dirty');
  syncDrawSaveBtnState();
}

function addDrawVertex(x_pct, y_pct) {
  if (drawClosed) {
    setDrawStatus('Editing — drag handles / click edge / Clear to redraw · Save border when done');
    return;
  }
  const sel = document.getElementById('drawRegionSelect');
  if (!drawBoundRegionId && sel && sel.value) drawBoundRegionId = sel.value;
  const snap = findDrawSnapTarget(x_pct, y_pct);
  const x = snap ? snap.x : x_pct;
  const y = snap ? snap.y : y_pct;
  drawVerts.push({
    x: +Number(x).toFixed(2),
    y: +Number(y).toFixed(2),
    snapped: Boolean(snap),
  });
  markDrawDirty();
  setDrawSnapHover(null);
  renderDrawPreview();
  updateEditHint();
}

function closeDrawPolygon() {
  if (drawVerts.length < 3) {
    setDrawStatus('Need ≥3 points to close', 'err');
    syncDrawSaveBtnState();
    return;
  }
  // Already closed (edit mode): Close is a no-op gate — tell GM to Save.
  if (drawClosed) {
    setDrawStatus(drawVerts.length + ' pts · editing · already closed — click Save border (or Ctrl+S)', 'ok');
    syncDrawSaveBtnState();
    return;
  }
  drawClosed = true;
  drawSelectedVert = null;
  markDrawDirty();
  setDrawSnapHover(null);
  renderDrawPreview();
  updateEditHint();
  setDrawStatus(drawVerts.length + ' pts · editing · Save ready (Ctrl+S)', 'ok');
  syncDrawSaveBtnState();
}

/**
 * Persist current drawVerts to bound/selected region.
 * Edit mode: polygon is already closed — do NOT require Close again.
 */
async function saveDrawBorder() {
  const saveBtn = document.getElementById('drawSaveBtn');
  if (saveBtn && saveBtn.dataset.saving === '1') return false;
  const sel = document.getElementById('drawRegionSelect');
  // Bound id wins over dropdown — prevents map-select race writing wrong region.
  let id = drawBoundRegionId || (sel && sel.value);
  if (!id) {
    setDrawStatus('Pick a region before Save', 'err');
    showDrawToast('Pick a region before Save', 'err');
    alert('Pick a region');
    return false;
  }
  if (sel && sel.value !== id) sel.value = id;

  // Normalize in-memory verts; restore draft if editor looks closed but coords are missing.
  let ser = serializeDrawVerts(drawVerts);
  if (ser.verts.length < 3 && tryRestoreDrawDraftSilent()) {
    ser = serializeDrawVerts(drawVerts);
  }
  if (ser.verts.length >= 3) drawVerts = ser.verts;

  if (ser.verts.length < 3) {
    const rawN = (drawVerts && drawVerts.length) || 0;
    const msg = rawN >= 3
      ? 'Verts in editor are invalid — restore draft or redraw (' + rawN + ' slots, 0 finite coords)'
      : 'Need ≥3 points to save (editor empty — restore draft?)';
    setDrawStatus(msg, 'err');
    showDrawToast(msg, 'err');
    alert(msg);
    return false;
  }

  // Edit / already-closed: auto-close so Save never blocks on Close poly.
  if (!drawClosed) {
    drawClosed = true;
    drawSelectedVert = null;
    setDrawSnapHover(null);
    renderDrawPreview();
    updateEditHint();
  }

  const pointsStr = ser.pointsStr;
  if (!pointsStr) {
    const msg = 'Cannot serialize border — restore draft or redraw';
    setDrawStatus(msg, 'err');
    showDrawToast(msg, 'err');
    alert(msg);
    return false;
  }

  const m = markerById(id);
  const label = (m && (m.label || m.name)) || id;
  showDrawToast('Saving ' + label + ' · ' + ser.verts.length + ' verts · ' + id, 'ok');

  // PIP suggest only when region is NOT explicitly bound (GM chose target).
  // Bound draw must Save as-is — confirm→cancel was stranding mid-edit saves.
  if (!drawBoundRegionId) {
    const insidePin = findPinInsideVerts(drawVerts);
    if (insidePin && insidePin.id !== id) {
      const curM = markerById(id);
      const curLabel = (curM && (curM.label || curM.name)) || id;
      const sugLabel = insidePin.label || insidePin.name || insidePin.id;
      if (window.confirm(
        'Pin "' + sugLabel + '" is inside this border, but Save target is "' + curLabel +
        '". Switch Save to ' + sugLabel + '?'
      )) {
        id = insidePin.id;
        drawBoundRegionId = id;
        if (sel) sel.value = id;
      }
    }
  }
  const areas = (mapDataCache.regions_ui_data && mapDataCache.regions_ui_data.areas) || [];
  const prev = areas.find(function(a) { return a.id === id; }) || {};
  const prevPts = parseAreaPoints(prev.points);
  if (prevPts.length >= 3) {
    const prevLabel = (m && (m.label || m.name)) || prev.name || id;
    if (!window.confirm('Replace existing border for ' + prevLabel + ' (' + prevPts.length + ' pts → ' + drawVerts.length + ' pts)?')) {
      setDrawStatus('Save cancelled — ' + drawVerts.length + ' pts still in editor (not lost)', 'err');
      showDrawToast('Save cancelled — ' + drawVerts.length + ' pts kept', 'err');
      syncDrawSaveBtnState();
      return false;
    }
  }
  const regionNum = m && m.region != null ? m.region : prev.region;
  // Always paint from this region's palette (never inherit a sibling city's gold/teal after rebind).
  const paint = shadeForArea({ id: id, region: regionNum });
  const area = {
    id: id,
    region: regionNum,
    name: (m && (m.label || m.name)) || prev.name || id,
    shape: 'polygon',
    points: pointsStr,
    stroke: paint.stroke,
    fill: paint.fill,
    note: 'GM Draw borders ' + new Date().toISOString().slice(0, 10),
  };
  if (saveBtn) {
    saveBtn.dataset.saving = '1';
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
  }
  try {
    const r = await fetch('/api/map/regions-ui', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area: area, enabled: true }),
    });
    let out = {};
    try { out = await r.json(); } catch (_) { out = {}; }
    if (!r.ok) throw new Error(out.error || ('HTTP ' + r.status));
    if (!mapDataCache.regions_ui_data) mapDataCache.regions_ui_data = { areas: [], viewBox: '0 0 100 100' };
    mapDataCache.regions_ui_data.enabled = true;
    const list = mapDataCache.regions_ui_data.areas || [];
    // Update ONLY the saved id — never touch sibling region geom in client cache.
    const ix = list.findIndex(function(a) { return a.id === id; });
    if (ix >= 0) list[ix] = Object.assign({}, list[ix], area); else list.push(area);
    mapDataCache.regions_ui_data.areas = list;
    bindPinsToAreas();
    clearDrawDraft();
    clearDrawVerts();
    uiAreasVisible = true;
    saveProfile({ showAreas: true });
    const areasBtn = document.getElementById('areasToggle');
    if (areasBtn) areasBtn.textContent = 'Areas ON';
    const stage = document.getElementById('mapStage');
    if (stage) renderMapStage(stage, mapDataCache, loadProfile());
    syncDrawUi();
    refreshRegionListPipHints();
    if (saveBtn) saveBtn.textContent = 'Saved ✓';
    setDrawStatus('Saved ' + ((m && (m.label || m.name)) || id) + ' (' + (out.points || ser.verts.length) + ' pts)', 'ok');
    showDrawToast('Saved ' + label + ' · ' + (out.points || ser.verts.length) + ' pts', 'ok');
    window.setTimeout(function() {
      if (saveBtn) saveBtn.textContent = 'Save border';
    }, 2000);
    return true;
  } catch (err) {
    const msg = (err && err.message) || String(err);
    if (saveBtn) saveBtn.textContent = 'Save failed';
    persistDrawDraft();
    setDrawStatus('Save failed: ' + msg + ' — ' + drawVerts.length + ' pts still in editor', 'err');
    alert('Save border failed: ' + msg);
    window.setTimeout(function() {
      if (saveBtn) saveBtn.textContent = 'Save border';
    }, 2500);
    return false;
  } finally {
    if (saveBtn) {
      delete saveBtn.dataset.saving;
      saveBtn.disabled = false;
    }
    syncDrawSaveBtnState();
  }
}

function syncDrawUi() {
  const btn = document.getElementById('drawToggle');
  const bar = document.getElementById('drawBar');
  const vp = document.getElementById('viewport');
  if (btn) {
    btn.textContent = drawMode ? 'Draw ON' : 'Draw borders';
    btn.classList.toggle('is-on', drawMode);
  }
  if (bar) bar.hidden = !drawMode;
  if (vp) {
    vp.classList.toggle('is-draw-mode', drawMode);
    if (!drawMode) vp.classList.remove('is-snap-hot');
  }
  syncDrawSnapBtn();
  if (drawMode) {
    fillDrawRegionSelect();
    // Show areas while drawing so prior GM borders stay visible under the preview
    if (!uiAreasVisible) {
      uiAreasVisible = true;
      saveProfile({ showAreas: true });
      const areasBtn = document.getElementById('areasToggle');
      if (areasBtn) areasBtn.textContent = 'Areas ON';
      const stage = document.getElementById('mapStage');
      if (stage && mapDataCache) renderMapStage(stage, mapDataCache, loadProfile());
    }
    // Auto-load if current dropdown region already has a border and editor empty
    const sel = document.getElementById('drawRegionSelect');
    if (sel && !drawVerts.length && getRegionSavedPoints(sel.value)) {
      loadBorderForSelectedRegion({});
    }
  } else {
    setDrawSnapHover(null);
    drawVertDrag = null;
    drawSelectedVert = null;
    const svg = document.getElementById('drawPreviewSvg');
    if (svg) svg.remove();
  }
  renderDrawPreview();
  updateEditHint();
}

function initDrawMode() {
  const btn = document.getElementById('drawToggle');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  const undoBtn = document.getElementById('drawUndoBtn');
  const closeBtn = document.getElementById('drawCloseBtn');
  const clearBtn = document.getElementById('drawClearBtn');
  const saveBtn = document.getElementById('drawSaveBtn');
  const snapBtn = document.getElementById('drawSnapBtn');
  const loadBtn = document.getElementById('drawLoadBtn');
  const rebindBtn = document.getElementById('drawRebindBtn');

  btn.onclick = function() {
    if (meCache && meCache.auth_gating && meCache.can_edit !== true) return;
    drawMode = !drawMode;
    if (drawMode && editMode) {
      editMode = false;
      saveProfile({ editMode: false });
      initEditMode(loadProfile());
      refreshPins();
    }
    if (!drawMode) {
      if (drawVerts.length >= 3) persistDrawDraft();
      // Leaving draw: keep draft in localStorage; clear only in-memory preview.
      drawVerts = [];
      drawClosed = false;
      drawSelectedVert = null;
      drawVertDrag = null;
      // keep drawBoundRegionId in draft; null in-memory
      drawBoundRegionId = null;
      regionsDirty = false;
      setDrawSnapHover(null);
      const svg = document.getElementById('drawPreviewSvg');
      if (svg) svg.remove();
    }
    syncDrawUi();
    if (drawMode && !drawVerts.length) tryRestoreDrawDraft();
  };
  if (snapBtn) snapBtn.onclick = function() {
    drawSnapEnabled = !drawSnapEnabled;
    if (!drawSnapEnabled) setDrawSnapHover(null);
    syncDrawSnapBtn();
    updateEditHint();
    renderDrawPreview();
  };
  if (loadBtn) loadBtn.onclick = function() {
    loadBorderForSelectedRegion({ force: true });
  };
  if (rebindBtn) rebindBtn.onclick = function() {
    rebindDrawVertsToSelectedRegion();
  };
  if (undoBtn) undoBtn.onclick = function() {
    if (!drawVerts.length) return;
    if (drawClosed && drawSelectedVert != null) {
      deleteSelectedDrawVertex();
      return;
    }
    // Editing closed poly: Undo without a selected vert removes last pt but keeps closed if ≥3.
    if (drawClosed && drawVerts.length > 3) {
      drawVerts.pop();
      markDrawDirty();
      renderDrawPreview();
      updateEditHint();
      return;
    }
    drawVerts.pop();
    drawClosed = false;
    drawSelectedVert = null;
    regionsDirty = drawVerts.length > 0;
    renderDrawPreview();
    updateEditHint();
    syncDrawSaveBtnState();
  };
  if (closeBtn) closeBtn.onclick = closeDrawPolygon;
  if (clearBtn) clearBtn.onclick = function() {
    if (drawVerts.length >= 3 && regionsDirty) {
      if (!window.confirm('Clear ' + drawVerts.length + ' unsaved points? Draft will be discarded.')) return;
    }
    clearDrawVerts();
  };
  if (saveBtn) saveBtn.onclick = function() { saveDrawBorder(); };
  syncDrawUi();
  syncDrawSaveBtnState();
  // After Draw UI ready: offer restore if hard-refresh wiped the editor.
  if (drawMode && !drawVerts.length) tryRestoreDrawDraft();
}

function initEditMode(profile) {
  const btn = document.getElementById('editToggle');
  const saveBtn = document.getElementById('saveCoordsBtn');
  const vp = document.getElementById('viewport');
  if (!btn) return;
  // Auth gating: never restore a persisted editMode for viewers — server rejects saves anyway.
  const gatedOut = meCache && meCache.auth_gating && !(meCache.can_edit === true || (meCache.logged_in && (meCache.role === 'owner' || meCache.role === 'admin')));
  editMode = gatedOut ? false : profile.editMode === true;
  btn.textContent = editMode ? 'Edit ON' : 'Edit';
  btn.classList.toggle('is-on', editMode);
  if (saveBtn) {
    saveBtn.hidden = !editMode;
    saveBtn.classList.toggle('is-dirty', coordsDirty && editMode);
  }
  if (vp) vp.classList.toggle('is-edit-mode', editMode);
  updateEditHint();
  btn.onclick = function() {
    if (meCache && meCache.auth_gating && meCache.can_edit !== true) return;
    const leavingEdit = editMode;
    editMode = !editMode;
    if (editMode && drawMode) {
      drawMode = false;
      clearDrawVerts();
      syncDrawUi();
    }
    if (leavingEdit && !editMode) {
      // Discard unsaved pin drags — view must match server SoT (GM pin lock).
      coordsDirty = false;
      saveProfile({ editMode: false, coord_overrides: {} });
      restoreServerMarkerCoords();
    } else {
      saveProfile({ editMode });
    }
    initEditMode(loadProfile());
    refreshPins();
  };
  if (saveBtn) {
    saveBtn.onclick = async function() {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      try {
        const regions = {};
        (mapDataCache.markers || []).forEach(function(m) {
          if (m.x_pct != null && m.y_pct != null) regions[m.id] = { x_pct: m.x_pct, y_pct: m.y_pct };
        });
        const r = await fetch('/api/map/coords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regions }),
        });
        const out = await r.json();
        if (!r.ok) throw new Error(out.error || ('HTTP ' + r.status));
        coordsDirty = false;
        saveBtn.classList.remove('is-dirty');
        saveProfile({ coord_overrides: {} });
        serverMarkersCache = (mapDataCache.markers || []).map(function(m) {
          return Object.assign({}, m);
        });
        saveBtn.textContent = 'Saved ✓';
        window.setTimeout(function() { saveBtn.textContent = 'Save coords'; }, 2000);
      } catch (err) {
        saveBtn.textContent = 'Save failed';
        alert('Save coords failed: ' + err.message);
        window.setTimeout(function() { saveBtn.textContent = 'Save coords'; }, 2500);
      } finally {
        saveBtn.disabled = false;
      }
    };
  }
}

/** Map issue report: paste screenshot + optional highlight rect → agent task. */
function initFeedbackUi() {
  const modal = document.getElementById('fbModal');
  const openBtn = document.getElementById('reportToggle');
  if (!modal || !openBtn || openBtn.dataset.bound) return;
  openBtn.dataset.bound = '1';
  const preview = document.getElementById('fbPreview');
  const noteEl = document.getElementById('fbNote');
  const statusEl = document.getElementById('fbStatus');
  const submitBtn = document.getElementById('fbSubmitBtn');
  const fileInput = document.getElementById('fbFile');
  const drawHint = document.getElementById('fbDrawHint');
  let imageDataUrl = '';
  let highlight = null;

  function syncSubmit() {
    submitBtn.disabled = !imageDataUrl && !(noteEl.value || '').trim();
  }
  function setImage(dataUrl) {
    imageDataUrl = dataUrl || '';
    if (imageDataUrl) {
      preview.src = imageDataUrl;
      preview.hidden = false;
    } else {
      preview.removeAttribute('src');
      preview.hidden = true;
    }
    syncSubmit();
  }
  function closeModal() {
    modal.hidden = true;
    endDrawMode(false);
  }
  function openModal() {
    modal.hidden = false;
    statusEl.textContent = '';
    syncSubmit();
  }

  function endDrawMode(keep) {
    const layer = document.getElementById('fbDrawLayer');
    if (layer) layer.remove();
    if (drawHint) drawHint.hidden = !highlight;
    if (!keep) return;
    if (drawHint) drawHint.hidden = false;
  }

  function startDrawMode() {
    modal.hidden = true;
    endDrawMode(false);
    const vp = document.getElementById('viewport');
    if (!vp) return;
    const layer = document.createElement('div');
    layer.id = 'fbDrawLayer';
    let start = null;
    let box = null;
    layer.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const r = vp.getBoundingClientRect();
      start = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (box) box.remove();
      box = document.createElement('div');
      box.style.cssText = 'position:absolute;border:2px solid #fffb96;background:rgba(255,251,150,.15);pointer-events:none;';
      layer.appendChild(box);
      layer.setPointerCapture(e.pointerId);
    });
    layer.addEventListener('pointermove', function(e) {
      if (!start || !box) return;
      const r = vp.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const left = Math.min(start.x, x);
      const top = Math.min(start.y, y);
      const w = Math.abs(x - start.x);
      const h = Math.abs(y - start.y);
      box.style.left = left + 'px';
      box.style.top = top + 'px';
      box.style.width = w + 'px';
      box.style.height = h + 'px';
    });
    layer.addEventListener('pointerup', function(e) {
      if (!start) return;
      const r = vp.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const left = Math.min(start.x, x);
      const top = Math.min(start.y, y);
      const w = Math.abs(x - start.x);
      const h = Math.abs(y - start.y);
      if (w > 8 && h > 8) {
        highlight = {
          x_pct: +((left / r.width) * 100).toFixed(2),
          y_pct: +((top / r.height) * 100).toFixed(2),
          w_pct: +((w / r.width) * 100).toFixed(2),
          h_pct: +((h / r.height) * 100).toFixed(2),
        };
      }
      start = null;
      endDrawMode(true);
      openModal();
      statusEl.textContent = highlight
        ? 'Highlight saved (' + highlight.w_pct + '% × ' + highlight.h_pct + '%).'
        : 'Highlight too small — try again.';
    });
    vp.appendChild(layer);
    if (drawHint) {
      drawHint.hidden = false;
      drawHint.textContent = 'Drag on the map to highlight, then this dialog reopens.';
    }
  }

  async function readClipboardImage() {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const type = item.types.find(function(t) { return t.startsWith('image/'); });
          if (!type) continue;
          const blob = await item.getType(type);
          return await new Promise(function(resolve, reject) {
            const fr = new FileReader();
            fr.onload = function() { resolve(fr.result); };
            fr.onerror = reject;
            fr.readAsDataURL(blob);
          });
        }
      }
    } catch (err) {
      /* fall through to paste event */
    }
    return null;
  }

  openBtn.onclick = openModal;
  document.getElementById('fbCancelBtn').onclick = closeModal;
  document.getElementById('fbFileBtn').onclick = function() { fileInput.click(); };
  document.getElementById('fbDrawBtn').onclick = startDrawMode;
  document.getElementById('fbPasteBtn').onclick = async function() {
    statusEl.textContent = 'Reading clipboard…';
    const dataUrl = await readClipboardImage();
    if (dataUrl) {
      setImage(dataUrl);
      statusEl.textContent = 'Screenshot pasted.';
    } else {
      statusEl.textContent = 'No image in clipboard — use Ctrl+V here or Choose file.';
    }
  };
  fileInput.onchange = function() {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = function() { setImage(fr.result); statusEl.textContent = 'Image loaded.'; };
    fr.readAsDataURL(f);
  };
  noteEl.addEventListener('input', syncSubmit);
  modal.addEventListener('paste', function(e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (!items[i].type.startsWith('image/')) continue;
      e.preventDefault();
      const blob = items[i].getAsFile();
      const fr = new FileReader();
      fr.onload = function() { setImage(fr.result); statusEl.textContent = 'Screenshot pasted.'; };
      fr.readAsDataURL(blob);
      return;
    }
  });
  submitBtn.onclick = async function() {
    submitBtn.disabled = true;
    statusEl.textContent = 'Submitting…';
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: (noteEl.value || '').trim(),
          image_data_url: imageDataUrl || '',
          highlight: highlight,
          map_title: (mapDataCache && (mapDataCache.title || mapDataCache.island)) || 'Isla Primavera',
          active_region: activeId || null,
        }),
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || ('HTTP ' + r.status));
      statusEl.textContent = 'Saved — task ' + (out.task_id || '') + ' · ' + (out.screenshot_rel || '');
      noteEl.value = '';
      highlight = null;
      setImage('');
      window.setTimeout(closeModal, 1200);
    } catch (err) {
      statusEl.textContent = 'Failed: ' + err.message;
      syncSubmit();
    }
  };
}

/** Dev calendar overlay on the map page — DISABLED.
 * DEV LOG is a dedicated /devlog page (hard nav). Kept as no-op so any stray call cannot steal the chip. */
function initDevCalendarUi() {
  return;
}

function markerById(id) {
  return (mapDataCache && mapDataCache.markers || []).find(function(m) { return m.id === id; });
}

/** Display name SoT = markers[].label (then name). Never aliases / regions-ui lore. */
function displayNameForRegionId(id, fallback) {
  const m = markerById(id);
  if (m) return m.label || m.name || m.id;
  return fallback || id;
}

function initMapCamera() {
  const vp = document.getElementById('viewport');
  if (!vp || vp.dataset.cameraBound) return;
  vp.dataset.cameraBound = '1';

  document.getElementById('zoomIn').addEventListener('click', function() {
    const r = vp.getBoundingClientRect();
    zoomAt(1.25, r.left + r.width / 2, r.top + r.height / 2);
  });
  document.getElementById('zoomOut').addEventListener('click', function() {
    const r = vp.getBoundingClientRect();
    zoomAt(1 / 1.25, r.left + r.width / 2, r.top + r.height / 2);
  });
  document.getElementById('zoomFit').addEventListener('click', function() { fitToView(true); });

  vp.addEventListener('wheel', function(e) {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
  }, { passive: false });

  vp.addEventListener('pointerdown', function(e) {
    if (e.button > 1) return;
    if (e.target.closest('.pin, .map-controls, button')) return;
    // Edit closed border: start vertex drag instead of pan
    if (drawMode && drawClosed && e.button === 0) {
      const p = pointerToMapPct(e.clientX, e.clientY);
      if (p) {
        const vi = hitDrawVertexIndex(p.x_pct, p.y_pct);
        if (vi >= 0) {
          drawVertDrag = {
            id: e.pointerId,
            index: vi,
            x: e.clientX,
            y: e.clientY,
            moved: false,
          };
          drawSelectedVert = vi;
          renderDrawPreview();
          vp.setPointerCapture(e.pointerId);
          return;
        }
      }
    }
    panDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, camX: camera.x, camY: camera.y, moved: false };
    vp.classList.add('is-dragging');
    vp.setPointerCapture(e.pointerId);
  });

  vp.addEventListener('pointermove', function(e) {
    if (drawVertDrag && drawVertDrag.id === e.pointerId) {
      const p = pointerToMapPct(e.clientX, e.clientY);
      if (p && drawVerts[drawVertDrag.index]) {
        if (Math.abs(e.clientX - drawVertDrag.x) + Math.abs(e.clientY - drawVertDrag.y) > 3) {
          drawVertDrag.moved = true;
        }
        let x = p.x_pct;
        let y = p.y_pct;
        // Snap while dragging a handle if Snap ON
        if (drawSnapEnabled) {
          const snap = findDrawSnapTarget(x, y);
          if (snap) {
            x = snap.x;
            y = snap.y;
            drawVerts[drawVertDrag.index].snapped = true;
          } else {
            drawVerts[drawVertDrag.index].snapped = false;
          }
        }
        drawVerts[drawVertDrag.index].x = +Number(x).toFixed(2);
        drawVerts[drawVertDrag.index].y = +Number(y).toFixed(2);
        markDrawDirty();
        renderDrawPreview();
      }
      return;
    }
    if (panDrag && panDrag.id === e.pointerId) {
      const dx = e.clientX - panDrag.x;
      const dy = e.clientY - panDrag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) panDrag.moved = true;
      camera.x = panDrag.camX + dx;
      camera.y = panDrag.camY + dy;
      applyCamera(false);
      return;
    }
    if (drawMode && !drawClosed && drawSnapEnabled) {
      const prev = drawSnapHover;
      updateDrawSnapHoverFromPointer(e.clientX, e.clientY);
      const next = drawSnapHover;
      const changed = (!prev && next) || (prev && !next)
        || (prev && next && (prev.x !== next.x || prev.y !== next.y));
      if (changed) renderDrawPreview();
    }
  });

  vp.addEventListener('pointerup', function(e) {
    if (drawVertDrag && drawVertDrag.id === e.pointerId) {
      const wasClick = !drawVertDrag.moved;
      const idx = drawVertDrag.index;
      drawVertDrag = null;
      if (wasClick && e.altKey) {
        drawSelectedVert = idx;
        deleteSelectedDrawVertex();
      } else {
        drawSelectedVert = idx;
        renderDrawPreview();
      }
      return;
    }
    if (!panDrag || panDrag.id !== e.pointerId) return;
    vp.classList.remove('is-dragging');
    const wasClick = !panDrag.moved;
    if (panDrag.moved) scheduleCameraSave();
    panDrag = null;
    if (drawMode && wasClick && !e.target.closest('.pin, .map-controls, button, .draw-bar, select')) {
      const p = pointerToMapPct(e.clientX, e.clientY);
      if (!p) return;
      if (drawClosed) {
        // Insert vertex on edge (not near existing vert — those start drag)
        const edge = hitDrawEdgeInsert(p.x_pct, p.y_pct);
        if (edge) {
          drawVerts.splice(edge.index, 0, { x: edge.x, y: edge.y, snapped: false });
          drawSelectedVert = edge.index;
          markDrawDirty();
          renderDrawPreview();
          updateEditHint();
        }
        return;
      }
      addDrawVertex(p.x_pct, p.y_pct);
    }
  });

  vp.addEventListener('pointercancel', function() {
    vp.classList.remove('is-dragging');
    panDrag = null;
    drawVertDrag = null;
  });

  vp.addEventListener('dblclick', function(e) {
    if (e.target.closest('.pin, .map-controls, .draw-bar')) return;
    if (drawMode) {
      e.preventDefault();
      if (!drawClosed) closeDrawPolygon();
      return;
    }
    zoomAt(1.35, e.clientX, e.clientY);
  });

  window.addEventListener('keydown', function(e) {
    if (e.target.closest('textarea, input, select')) return;
    // Ctrl+S / Cmd+S — save border while drawing/editing (do not lose verts).
    if (drawMode && (e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveDrawBorder();
      return;
    }
    if (drawMode && (e.key === 'Delete' || e.key === 'Backspace')) {
      if (drawClosed && drawSelectedVert != null) {
        e.preventDefault();
        deleteSelectedDrawVertex();
        return;
      }
    }
    if (drawMode && e.key === 'Escape') {
      if (drawVerts.length >= 3 && regionsDirty) {
        if (!window.confirm('Clear ' + drawVerts.length + ' unsaved points? (draft kept in browser for restore)')) return;
        persistDrawDraft();
        // Clear editor only — draft remains for Draw ON restore.
        drawVerts = [];
        drawClosed = false;
        drawSelectedVert = null;
        drawVertDrag = null;
        drawBoundRegionId = null;
        regionsDirty = false;
        setDrawSnapHover(null);
        renderDrawPreview();
        updateEditHint();
        syncDrawSaveBtnState();
        setDrawStatus('Cleared editor — draft kept; toggle Draw to restore', 'ok');
        return;
      }
      clearDrawVerts();
      return;
    }
    if (drawMode && !drawClosed && (e.key === 'Enter' || e.key === 'c' || e.key === 'C')) {
      closeDrawPolygon();
      return;
    }
    // Enter while editing closed poly → Save (Close already done).
    if (drawMode && drawClosed && e.key === 'Enter') {
      e.preventDefault();
      saveDrawBorder();
      return;
    }
    if (e.key === '+' || e.key === '=') {
      const r = vp.getBoundingClientRect();
      zoomAt(1.2, r.left + r.width / 2, r.top + r.height / 2);
    } else if (e.key === '-') {
      const r = vp.getBoundingClientRect();
      zoomAt(1 / 1.2, r.left + r.width / 2, r.top + r.height / 2);
    } else if (e.key === '0' || e.key === 'f' || e.key === 'F') {
      fitToView(true);
    }
  });
}

function buildLegendGrid(markers) {
  const grid = document.getElementById('legendGrid');
  if (!grid) return;
  grid.innerHTML = '';
  markers.slice().sort(function(a, b) { return (a.region || 0) - (b.region || 0); }).forEach(function(m) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'legend-chip legend-chip--' + (m.type || 'default');
    if (m.beta_deferred_lore) chip.className += ' legend-chip--stub';
    if (m.area_pin_mismatch) chip.className += ' legend-chip--mismatch';
    chip.dataset.id = m.id;
    const pc = cityPinColor(m);
    chip.style.background = pc;
    chip.style.borderColor = pc;
    chip.style.color = '#111';
    let title = (m.label || m.name || m.id) + (m.beta_deferred_lore ? ' (vibes stub · lore deferred)' : '') + ' — click to focus';
    if (m.containing_area_id) {
      title += ' · area ' + m.containing_area_id;
      if (m.area_pin_mismatch) title += ' (⚠ id mismatch)';
    } else {
      title += ' · no containing area';
    }
    chip.title = title;
    chip.textContent = m.region != null ? String(m.region) : '?';
    chip.addEventListener('click', function() { selectMarker(m.id, { focus: true }); });
    grid.appendChild(chip);
  });
}

/** Update side-panel cards with PIP area / mismatch hints (no full rebuild). */
function refreshRegionListPipHints() {
  const listEl = document.getElementById('list');
  if (!listEl || !mapDataCache) return;
  listEl.querySelectorAll('.region-card').forEach(function(btn) {
    const m = markerById(btn.dataset.id);
    if (!m) return;
    let warn = btn.querySelector('.pip-warn');
    if (m.area_pin_mismatch && m.containing_area_id) {
      const areaName = displayNameForRegionId(m.containing_area_id, m.containing_area_id);
      const msg = '⚠ pin inside area labeled ' + areaName;
      if (!warn) {
        warn = document.createElement('span');
        warn.className = 'pip-warn';
        btn.appendChild(warn);
      }
      warn.textContent = msg;
    } else if (warn) {
      warn.remove();
    }
  });
  buildLegendGrid(mapDataCache.markers || []);
}

function markVisited(id) {
  const p = loadProfile();
  if (!p.visited.includes(id)) p.visited.push(id);
  saveProfile({ visited: p.visited, lastRegionId: id });
}

function updatePilotStats(profile) {
  const el = document.getElementById('pilotStats');
  if (!el) return;
  const n = (profile.visited || []).length;
  el.textContent = n ? ('Explored ' + n + ' region' + (n === 1 ? '' : 's')) : 'No regions visited yet';
}

function updateAuthUi(me) {
  const slot = document.getElementById('authSlot');
  if (!slot) return;
  slot.innerHTML = '';
  // Prefer server can_edit; fall back to role check if older payload.
  const canEdit = typeof me.can_edit === 'boolean'
    ? me.can_edit
    : (!me.auth_gating || (me.logged_in && (me.role === 'owner' || me.role === 'admin')));
  applyEditChrome(canEdit);
  if (me.logged_in && me.username) {
    let html = '';
    if (me.avatar) html += '<img class="hud-avatar" alt="" src="' + escapeHtml(me.avatar) + '"/>';
    html += '<span class="hud-user">@' + escapeHtml(me.username) + '</span>';
    if (me.role) html += '<span class="hud-role hud-role--' + escapeHtml(me.role) + '">' + escapeHtml(me.role) + '</span>';
    if (me.my_character && me.my_character.id) {
      html += '<a class="hud-mychar" href="#cast/' + encodeURIComponent(me.my_character.id) + '" id="myCharLink" title="Your linked character">' +
        escapeHtml(me.my_character.display_name || me.my_character.id) + '</a>';
    }
    if (me.role === 'owner') html += '<button type="button" class="hud-users-btn" id="usersPanelBtn">Users</button>';
    html += '<a class="hud-logout" href="/auth/logout">logout</a>';
    slot.innerHTML = html;
    if (me.role === 'owner') initUsersPanel();
    const myLink = document.getElementById('myCharLink');
    if (myLink) {
      myLink.onclick = function (ev) {
        ev.preventDefault();
        setCastMode(true);
        selectCast(me.my_character.id);
      };
    }
    const name = document.getElementById('pilotName');
    if (name) name.textContent = me.username;
    const meta = document.getElementById('pilotMeta');
    if (meta) {
      if (me.my_character && me.my_character.display_name) {
        meta.textContent = 'PC · ' + me.my_character.display_name + (me.cloud_save ? ' · cloud' : ' · local saves');
      } else {
        meta.textContent = me.cloud_save ? 'Synced to tableslop' : 'Linked Discord · saves still local until cloud sync';
      }
    }
    if (me.auth_gating && !canEdit) {
      slot.insertAdjacentHTML('beforeend', '<span class="hud-login-hint">view only</span>');
    }
  } else if (me.dev_auth) {
    slot.innerHTML = '<span class="hud-login-hint">dev</span> <a href="/auth/dev-login?as=owner">owner</a> <a href="/auth/dev-login?as=admin">admin</a> <a href="/auth/dev-login?as=user">user</a>';
  } else {
    // Always expose /login (Discord OAuth when configured; setup status when not).
    slot.innerHTML = '<a class="hud-login" href="/login">Login</a>';
    if (me.auth_gating) slot.insertAdjacentHTML('beforeend', '<span class="hud-login-hint">login required to edit</span>');
    else if (!me.discord_configured) slot.insertAdjacentHTML('beforeend', '<span class="hud-login-hint">auth setup</span>');
  }
}

/** Hide / force-off map edit chrome for observers (server still 401/403s writes). */
function applyEditChrome(canEdit) {
  const editBtn = document.getElementById('editToggle');
  const drawBtn = document.getElementById('drawToggle');
  const worldBtn = document.getElementById('worldToggle');
  const saveCoords = document.getElementById('saveCoordsBtn');
  if (editBtn) editBtn.hidden = !canEdit;
  if (drawBtn) drawBtn.hidden = !canEdit;
  if (worldBtn) worldBtn.hidden = !canEdit;
  if (!canEdit) {
    if (typeof drawMode !== 'undefined' && drawMode) {
      drawMode = false;
      if (typeof clearDrawVerts === 'function') clearDrawVerts();
      if (typeof syncDrawUi === 'function') syncDrawUi();
    }
    if (typeof editMode !== 'undefined' && editMode) {
      editMode = false;
      if (editBtn) {
        editBtn.textContent = 'Edit';
        editBtn.classList.remove('is-on');
      }
      if (saveCoords) saveCoords.hidden = true;
      const vp = document.getElementById('viewport');
      if (vp) vp.classList.remove('is-edit-mode');
      if (typeof updateEditHint === 'function') updateEditHint();
    }
  }
}

/** Owner-only role panel: list users, set admin/user. Owner role itself is env-only. */
function initUsersPanel() {
  const btn = document.getElementById('usersPanelBtn');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  let panel = null;
  btn.onclick = async () => {
    if (panel) { panel.remove(); panel = null; return; }
    panel = document.createElement('div');
    panel.className = 'auth-users';
    panel.innerHTML = '<h3>Users</h3><div class="au-rows">loading…</div>' +
      '<form class="au-add" id="auAddForm">' +
      '<input name="username" placeholder="Discord username" required />' +
      '<input name="id" placeholder="Discord user id" inputmode="numeric" required />' +
      '<select name="role"><option value="user">user</option><option value="admin">admin</option></select>' +
      '<button type="submit">Add account</button></form>' +
      '<div class="au-status"></div>';
    document.body.appendChild(panel);
    const rowsEl = panel.querySelector('.au-rows');
    const statusEl = panel.querySelector('.au-status');
    const addForm = panel.querySelector('#auAddForm');
    addForm.onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(addForm);
      statusEl.textContent = 'Adding…';
      try {
        const r = await fetch('/api/auth/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            create: true,
            id: String(fd.get('id') || '').trim(),
            username: String(fd.get('username') || '').trim(),
            role: String(fd.get('role') || 'user'),
          }),
        });
        const out = await r.json();
        if (!r.ok) throw new Error(out.error || r.status);
        statusEl.textContent = 'Added @' + fd.get('username');
        panel.remove();
        panel = null;
        btn.click();
      } catch (e) {
        statusEl.textContent = 'failed: ' + e.message;
      }
    };
    let data;
    try {
      const r = await fetch('/api/auth/users');
      data = await r.json();
      if (!r.ok) throw new Error(data.error || r.status);
    } catch (e) {
      rowsEl.textContent = 'failed: ' + e.message;
      return;
    }
    rowsEl.innerHTML = '';
    for (const u of data.users || []) {
      const row = document.createElement('div');
      row.className = 'au-row';
      if (u.role === 'owner') {
        row.innerHTML = '<span class="au-name">@' + escapeHtml(u.username) + '</span><span class="au-role-badge">owner (env)</span>';
      } else {
        row.innerHTML = '<span class="au-name">@' + escapeHtml(u.username) + '</span>' +
          '<select><option value="user"' + (u.role === 'user' ? ' selected' : '') + '>user</option>' +
          '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>admin</option></select>' +
          '<button type="button">Save</button>';
        row.querySelector('button').onclick = async (ev) => {
          const b = ev.currentTarget;
          b.disabled = true;
          try {
            const r = await fetch('/api/auth/users', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: u.discord_id, role: row.querySelector('select').value }),
            });
            const out = await r.json();
            if (!r.ok) throw new Error(out.error || r.status);
            statusEl.textContent = '@' + u.username + ' → ' + row.querySelector('select').value;
          } catch (e) {
            statusEl.textContent = 'failed: ' + e.message;
          }
          b.disabled = false;
        };
      }
      rowsEl.appendChild(row);
    }
  };
}

let livedInCache = null;
let livedInCacheAt = 0;

async function loadLivedInListings() {
  const now = Date.now();
  if (livedInCache && now - livedInCacheAt < 60000) return livedInCache;
  try {
    const r = await fetch('/lived-in/listings.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(String(r.status));
    livedInCache = await r.json();
    livedInCacheAt = now;
    return livedInCache;
  } catch (e) {
    return null;
  }
}

function moneyLi(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US');
}

async function updateLivedInPanel(regionId, hasCityMap) {
  const box = document.getElementById('livedInBox');
  if (!box) return;
  if (!regionId || !hasCityMap) {
    box.hidden = true;
    return;
  }
  const doc = await loadLivedInListings();
  const city = doc && (doc.cities || []).find(function (c) { return c.region_id === regionId; });
  if (!city) {
    box.hidden = true;
    return;
  }
  const pop = city.population || {};
  const stats = document.getElementById('livedInStats');
  const dist = document.getElementById('livedInDist');
  const list = document.getElementById('livedInList');
  const more = document.getElementById('livedInMore');
  if (stats) {
    stats.textContent =
      (pop.total ? Number(pop.total).toLocaleString('en-US') : '—') +
      ' pop · age ' + (pop.age_peak || '—') +
      ' · ' + String(pop.class_top || '—').replace(/_/g, ' ') +
      (city.stub ? ' · stub' : '') +
      ' · ' + (city.listing_count || 0) + ' listings';
  }
  if (dist) {
    dist.textContent = (city.districts || [])
      .slice(0, 4)
      .map(function (d) {
        return (d.name || d.id) + ' ' + Number(d.population || 0).toLocaleString('en-US');
      })
      .join(' · ');
  }
  const flat = [];
  for (const d of city.districts || []) {
    for (const L of d.listings || []) flat.push(L);
  }
  flat.sort(function (a, b) {
    return (a.price_month || a.price_sale || 0) - (b.price_month || b.price_sale || 0);
  });
  if (list) {
    list.innerHTML = flat.slice(0, 4).map(function (L) {
      const price = L.offer === 'sale' ? moneyLi(L.price_sale) + ' sale' : moneyLi(L.price_month) + '/mo';
      return (
        '<li><span class="li-price">' + escapeHtml(price) + '</span>' +
        escapeHtml(L.title || L.kind) +
        '<div style="color:var(--muted);font-size:.65rem;clear:both">' +
        escapeHtml(L.district_name || '') + ' · ' + escapeHtml(L.offer) +
        '</div></li>'
      );
    }).join('');
  }
  if (more) {
    more.hidden = false;
    more.href = '/lived-in/?region=' + encodeURIComponent(regionId);
  }
  box.hidden = false;
}

function syncNoteField(id) {
  const noteEl = document.getElementById('regionNote');
  const labelEl = document.getElementById('noteLabel');
  if (!noteEl || !labelEl) return;
  if (!id) {
    noteEl.hidden = true;
    labelEl.hidden = true;
    updateLivedInPanel(null, false);
    return;
  }
  noteEl.hidden = false;
  labelEl.hidden = false;
  const m = markerById(id);
  const name = (m && (m.label || m.name)) || id;
  const num = m && m.region != null ? 'R' + m.region + ' · ' : '';
  labelEl.textContent = 'Region note · ' + num + name;
  const p = loadProfile();
  noteEl.value = (p.notes && p.notes[id]) || '';
  noteEl.oninput = () => {
    saveProfile({ notes: { [id]: noteEl.value } });
  };
  const cityLink = document.getElementById('cityMapLink');
  const cm = m && m.city_map;
  if (cityLink) {
    cityLink.hidden = !cm;
    if (cm) {
      cityLink.href = cm;
      cityLink.textContent = 'City map · ' + name + ' →';
    }
  }
  updateLivedInPanel(id, !!cm);
}

/**
 * Keep Draw toolbar Region <select> in sync with map focus/selection.
 * Runs even when Draw is OFF so turning Draw ON shows the focused region.
 * While Draw has bound verts, do NOT steal the dropdown (wrong-id Save wipe).
 */
function syncDrawRegionSelectToActive(id) {
  if (!id || !mapDataCache) return;
  fillDrawRegionSelect();
  const sel = document.getElementById('drawRegionSelect');
  if (!sel) return;
  let has = false;
  for (let i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === id) { has = true; break; }
  }
  if (!has) return;
  // Protect in-progress border unless GM confirms rebind or clear+switch.
  if (drawMode && drawVerts.length && drawBoundRegionId && drawBoundRegionId !== id) {
    if (!tryDrawRegionSwitch(id)) {
      if (sel.value !== drawBoundRegionId) sel.value = drawBoundRegionId;
      syncDrawRebindBtn();
      setDrawStatus(
        'Still editing ' + regionDrawLabel(drawBoundRegionId) + ' — Rebind → ' + regionDrawLabel(id) + ' or Clear',
        'err'
      );
      return;
    }
  }
  if (sel.value === id) return;
  sel.value = id;
  // Fire change so Load border / snap exclude follow when Draw is ON
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

function labelsUiEnabled() {
  return mapDataCache && mapDataCache.label_layer === 'ui' && uiLabelsVisible;
}

function areasUiEnabled() {
  return mapDataCache && mapDataCache.overlay_layer === 'ui' && uiAreasVisible && mapDataCache.regions_ui_data;
}

function citiesUiEnabled() {
  return mapDataCache && mapDataCache.overlay_layer === 'ui' && uiCitiesVisible;
}

/** Unique R1–R17 map fills — neon HUD colors never used for region fills. */
const REGION_SHADE_PALETTE = {
  1: { fill: '#c4a035', stroke: '#8a7020' },
  2: { fill: '#3d7a9e', stroke: '#2a5570' },
  3: { fill: '#2a8f7a', stroke: '#1d6556' },
  4: { fill: '#c17a28', stroke: '#8a561c' },
  5: { fill: '#5a9a45', stroke: '#3f6e30' },
  6: { fill: '#b85a6a', stroke: '#82404c' },
  7: { fill: '#6a7088', stroke: '#4a5060' },
  8: { fill: '#d4a820', stroke: '#957518' },
  9: { fill: '#2d7a4e', stroke: '#1f5536' },
  10: { fill: '#b8734a', stroke: '#825234' },
  11: { fill: '#3a8a85', stroke: '#28615e' },
  12: { fill: '#7a6e5a', stroke: '#554c3e' },
  13: { fill: '#a06a2e', stroke: '#704a20' },
  14: { fill: '#4a7a9e', stroke: '#345670' },
  15: { fill: '#8a5a9e', stroke: '#5f3e6e' },
  16: { fill: '#5a6e9e', stroke: '#3e4c6e' },
  17: { fill: '#2e8a6a', stroke: '#20604a' },
};
const CITY_PIN_PALETTE = {
  1: '#e8c547', 2: '#5eb0d9', 3: '#3ec9ad', 4: '#e89a3c', 5: '#7bc45e',
  6: '#e07a8c', 7: '#9aa3b8', 8: '#f0c530', 9: '#45b06e', 10: '#e09262',
  11: '#52c4bd', 12: '#c4b08a', 13: '#d49248', 14: '#6aabd4', 15: '#b47acc',
  16: '#7a94d4', 17: '#48c498',
};
function cityPinColor(m) {
  if (m && m.pin_color) return String(m.pin_color);
  const n = Number(m && m.region) || 0;
  return CITY_PIN_PALETTE[n] || CITY_PIN_PALETTE[((Math.max(1, n) - 1) % 17) + 1] || '#c4a035';
}

function isNeonShadeColor(s) {
  if (!s) return true;
  const t = String(s).toLowerCase().replace(/\s/g, '');
  return /255,113,206|ff71ce|185,103,255|b967ff|255,251,150|fffb96|1,205,254|01cdfe|c0c0c0|#c0c0c0|180,180,180/.test(t);
}

function paletteOwnerRegion(color) {
  if (!color) return 0;
  const t = String(color).toLowerCase().replace(/\s/g, '');
  for (const key of Object.keys(REGION_SHADE_PALETTE)) {
    const p = REGION_SHADE_PALETTE[key];
    if (!p) continue;
    if (String(p.fill).toLowerCase() === t || String(p.stroke).toLowerCase() === t) return Number(key);
  }
  return 0;
}

function shadeForArea(a) {
  let n = Number(a && a.region) || 0;
  if (!n && a && a.id) {
    const m = markerById(a.id);
    if (m && m.region != null) n = Number(m.region);
  }
  if (!n || n < 1) n = 1;
  const pal = REGION_SHADE_PALETTE[n] || REGION_SHADE_PALETTE[((n - 1) % 17) + 1] || REGION_SHADE_PALETTE[1];
  // Keep true custom fills; drop neon + sibling-region palette leftovers (e.g. Paradise gold on Porto).
  function pick(stored, side) {
    if (!stored || isNeonShadeColor(stored)) return pal[side];
    const owner = paletteOwnerRegion(stored);
    if (owner && owner !== n) return pal[side];
    return stored;
  }
  return { fill: pick(a && a.fill, 'fill'), stroke: pick(a && a.stroke, 'stroke') };
}

function placeRegionAreas(container, areasData) {
  if (!areasUiEnabled() || !container || !areasData) return;
  const areas = areasData.areas || [];
  const vb = areasData.viewBox || '0 0 100 100';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'map-area-svg');
  svg.setAttribute('viewBox', vb);
  svg.setAttribute('preserveAspectRatio', 'none');
  areas.forEach(function(a) {
    let shape;
    if (a.shape === 'ellipse') {
      shape = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      shape.setAttribute('cx', String(a.cx));
      shape.setAttribute('cy', String(a.cy));
      shape.setAttribute('rx', String(a.rx));
      shape.setAttribute('ry', String(a.ry));
    } else if (a.shape === 'polygon' && a.points) {
      shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      shape.setAttribute('points', a.points);
    } else {
      return;
    }
    shape.setAttribute('class', 'map-area-zone');
    shape.dataset.id = a.id;
    const paint = shadeForArea(a);
    shape.style.fill = paint.fill;
    shape.style.stroke = paint.stroke;
    // Inline fillOpacity so large mustard polys cannot look solid if CSS loses.
    shape.style.fillOpacity = a.id === activeId ? '0.26' : '0.18';
    if (activeId && a.id !== activeId) shape.classList.add('is-dim');
    if (a.id === activeId) shape.classList.add('is-active');
    shape.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
    shape.addEventListener('click', function() {
      // Prefer focusing the pin inside this area when PIP matched
      const focusId = (a.pin_ids && a.pin_ids[0]) || a.id;
      selectMarker(focusId, { focus: true });
    });
    // Prefer pin name for containing area; warn if area id ≠ pin inside
    const tip = areaDisplayTip(a);
    shape.addEventListener('mouseenter', function(e) {
      showTooltip(tip, e.clientX, e.clientY);
    });
    shape.addEventListener('mousemove', function(e) {
      showTooltip(tip, e.clientX, e.clientY);
    });
    shape.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(shape);
  });
  container.appendChild(svg);
}

function syncLayerVisibility(layerId, visible) {
  const el = document.querySelector('[data-layer-id="' + layerId + '"]');
  if (el) el.classList.toggle('is-hidden', !visible);
}

function syncAreaLayerVisibility() {
  syncLayerVisibility('regions', areasUiEnabled());
}

function syncCitiesLayerVisibility() {
  syncLayerVisibility('poi-pins', citiesUiEnabled());
}

function initAreaToggle(data, profile) {
  const btn = document.getElementById('areasToggle');
  if (!btn) return;
  if (data.overlay_layer !== 'ui' || !data.regions_ui_data) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  uiAreasVisible = profile.showAreas !== false;
  btn.textContent = uiAreasVisible ? 'Areas ON' : 'Areas OFF';
  btn.onclick = function() {
    uiAreasVisible = !uiAreasVisible;
    btn.textContent = uiAreasVisible ? 'Areas ON' : 'Areas OFF';
    saveProfile({ showAreas: uiAreasVisible });
    const stage = document.getElementById('mapStage');
    if (stage && mapDataCache) renderMapStage(stage, mapDataCache, loadProfile());
  };
}

function initCitiesToggle(data, profile) {
  const btn = document.getElementById('citiesToggle');
  if (!btn) return;
  if (data.overlay_layer !== 'ui') {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  uiCitiesVisible = profile.showCities !== false;
  btn.textContent = uiCitiesVisible ? 'Cities ON' : 'Cities OFF';
  btn.onclick = function() {
    uiCitiesVisible = !uiCitiesVisible;
    btn.textContent = uiCitiesVisible ? 'Cities ON' : 'Cities OFF';
    saveProfile({ showCities: uiCitiesVisible });
    syncCitiesLayerVisibility();
  };
}

function econUiEnabled() {
  return mapDataCache && mapDataCache.economy_overlay && uiEconVisible;
}

function syncEconLayerVisibility() {
  syncLayerVisibility('economy-resources', econUiEnabled());
}

function placeEconomySites(container, overlay) {
  if (!container || !overlay) return;
  (overlay.sites || []).forEach(function(s) {
    if (s.x_pct == null || s.y_pct == null) return;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'econ-site econ-site--' + (s.kind || 'other');
    el.style.left = s.x_pct + '%';
    el.style.top = s.y_pct + '%';
    el.dataset.id = s.id;
    const tip = (s.name || s.id) + ' · ' + (s.kind || '?') +
      (s.stock != null ? ' · stock ' + s.stock + '/' + (s.capacity != null ? s.capacity : '?') : '') +
      (s.note ? ' — ' + s.note : '');
    el.setAttribute('aria-label', tip);
    el.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
    el.addEventListener('mouseenter', function(e) { showTooltip(tip, e.clientX, e.clientY); });
    el.addEventListener('mousemove', function(e) { showTooltip(tip, e.clientX, e.clientY); });
    el.addEventListener('mouseleave', hideTooltip);
    container.appendChild(el);
  });
}

function initEconToggle(data, profile) {
  const btn = document.getElementById('econToggle');
  if (!btn) return;
  if (!data.economy_overlay || !(data.economy_overlay.sites || []).length) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  uiEconVisible = profile.showEcon === true;
  btn.textContent = uiEconVisible ? 'Econ ON' : 'Econ OFF';
  btn.onclick = function() {
    uiEconVisible = !uiEconVisible;
    btn.textContent = uiEconVisible ? 'Econ ON' : 'Econ OFF';
    saveProfile({ showEcon: uiEconVisible });
    const layer = document.querySelector('[data-layer-id="economy-resources"]');
    if (layer) {
      layer.innerHTML = '';
      if (uiEconVisible) placeEconomySites(layer, mapDataCache.economy_overlay);
    }
    syncEconLayerVisibility();
  };
  syncEconLayerVisibility();
}

function roadsUiEnabled() {
  return !!(mapDataCache && uiRoadsVisible && (
    mapDataCache.highways_wireframe_url
    || (mapDataCache.highways_data && (mapDataCache.highways_data.routes || []).length)
  ));
}

function syncRoadsLayerVisibility() {
  syncLayerVisibility('highways', roadsUiEnabled());
  syncLayerVisibility('roads-local', !!(uiRoadsVisible && roadsLocalCache && (roadsLocalCache.features || []).length));
  syncLayerVisibility('wind', uiWindVisible);
  syncLayerVisibility('water', uiWaterVisible);
  syncLayerVisibility('logistics', uiLogisticsVisible);
}

function placeLocalRoads(container, payload) {
  if (!container) return;
  container.innerHTML = '';
  const feats = (payload && payload.features) || [];
  if (!feats.length) return;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'roads-local-svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
  feats.forEach(function(f) {
    const coords = f.coords || [];
    if (coords.length < 2) return;
    const d = coords.map(function(c, i) {
      return (i ? 'L' : 'M') + Number(c[0]).toFixed(3) + ' ' + Number(c[1]).toFixed(3);
    }).join(' ');
    const pathEl = document.createElementNS(NS, 'path');
    pathEl.setAttribute('d', d);
    pathEl.setAttribute('fill', 'none');
    pathEl.setAttribute('stroke-linecap', 'round');
    pathEl.setAttribute('stroke-linejoin', 'round');
    /* Screen-px strokes so roads stay visible at Fit (island-wide) zoom. */
    pathEl.setAttribute('vector-effect', 'non-scaling-stroke');
    const kind = f.kind || 'local';
    if (kind === 'hwy') {
      pathEl.setAttribute('stroke', '#f5d76a');
      pathEl.setAttribute('stroke-width', '3.2');
    } else if (kind === 'arterial') {
      pathEl.setAttribute('stroke', '#f2ebe0');
      pathEl.setAttribute('stroke-width', '2.4');
    } else {
      pathEl.setAttribute('stroke', '#d8d0bc');
      pathEl.setAttribute('stroke-width', '1.6');
    }
    pathEl.setAttribute('opacity', kind === 'hwy' ? '0.95' : '0.88');
    pathEl.setAttribute('data-road-id', f.id || '');
    pathEl.setAttribute('data-road-kind', kind);
    if (f.name) pathEl.setAttribute('data-road-name', f.name);
    svg.appendChild(pathEl);
  });
  container.appendChild(svg);
}

function placeWindStub(container) {
  if (!container) return;
  container.innerHTML = '';
  const c = document.createElement('canvas');
  c.id = 'envOverlayCanvas';
  c.width = 320; c.height = 200;
  c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:.35;';
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.strokeStyle = 'rgba(126,200,227,0.7)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const y = 10 + i * 15;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(80, y - 8, 160, y + 8, 320, y);
      ctx.stroke();
    }
  }
  container.appendChild(c);
}

function placeWaterStub(container) {
  if (!container) return;
  container.innerHTML = '';
  const c = document.createElement('canvas');
  c.width = 320; c.height = 200;
  c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:.28;';
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(42,111,158,0.25)';
    ctx.fillRect(0, 140, 320, 60);
    ctx.strokeStyle = 'rgba(90,170,220,0.8)';
    for (let i = 0; i < 6; i++) {
      const y = 150 + i * 8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(160, y + 6, 320, y);
      ctx.stroke();
    }
  }
  container.appendChild(c);
}

function placeLogistics(container, routes) {
  if (!container) return;
  container.innerHTML = '';
  const list = routes || [];
  if (!list.length) return;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  list.forEach(function(r) {
    const coords = r.coords || [];
    if (coords.length < 2) return;
    const d = coords.map(function(c, i) {
      return (i ? 'L' : 'M') + Number(c[0]).toFixed(3) + ' ' + Number(c[1]).toFixed(3);
    }).join(' ');
    const pathEl = document.createElementNS(NS, 'path');
    pathEl.setAttribute('d', d);
    pathEl.setAttribute('fill', 'none');
    pathEl.setAttribute('stroke', '#e07a3d');
    pathEl.setAttribute('stroke-width', '2.6');
    pathEl.setAttribute('stroke-dasharray', '8 5');
    pathEl.setAttribute('vector-effect', 'non-scaling-stroke');
    pathEl.setAttribute('opacity', '0.9');
    if (r.name) pathEl.setAttribute('data-logistics-name', r.name);
    svg.appendChild(pathEl);
  });
  container.appendChild(svg);
}

async function loadRoadsLocalShard() {
  try {
    const r = await fetch('/api/world/roads?all=1', { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

async function loadLogisticsRoutes() {
  try {
    const r = await fetch('/api/world/logistics', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j.routes || [];
  } catch (e) { return []; }
}

function refreshOverlayLayers() {
  const stack = document.querySelector('#mapStack') || document.querySelector('.map-stack');
  if (!stack) return;
  const local = layerEl(stack, 'roads-local');
  if (local) {
    local.innerHTML = '';
    if (uiRoadsVisible && roadsLocalCache) placeLocalRoads(local, roadsLocalCache);
  }
  const wind = layerEl(stack, 'wind');
  if (wind) {
    wind.innerHTML = '';
    if (uiWindVisible) placeWindStub(wind);
  }
  const water = layerEl(stack, 'water');
  if (water) {
    water.innerHTML = '';
    if (uiWaterVisible) placeWaterStub(water);
  }
  const logi = layerEl(stack, 'logistics');
  if (logi) {
    logi.innerHTML = '';
    if (uiLogisticsVisible && mapDataCache && mapDataCache.logistics_routes) {
      placeLogistics(logi, mapDataCache.logistics_routes);
    }
  }
  syncRoadsLayerVisibility();
  syncLayerVisibility('poi-pins', uiCitiesVisible !== false);
}

function initLayersPanel(profile) {
  const btn = document.getElementById('layersToggle');
  const panel = document.getElementById('layersPanel');
  if (!btn || !panel) return;
  btn.hidden = false;
  uiWindVisible = profile.showWind === true;
  uiWaterVisible = profile.showWater === true;
  /* Logistics ON by default so bay corridors are visible without digging Layers. */
  uiLogisticsVisible = profile.showLogistics !== false;
  const swRoads = document.getElementById('layerSwitchRoads');
  const swWind = document.getElementById('layerSwitchWind');
  const swWater = document.getElementById('layerSwitchWater');
  const swLogi = document.getElementById('layerSwitchLogistics');
  const swPins = document.getElementById('layerSwitchPins');
  if (swRoads) swRoads.checked = uiRoadsVisible;
  if (swWind) swWind.checked = uiWindVisible;
  if (swWater) swWater.checked = uiWaterVisible;
  if (swLogi) swLogi.checked = uiLogisticsVisible;
  if (swPins) swPins.checked = uiCitiesVisible !== false;
  function countOn() {
    let n = 0;
    if (uiRoadsVisible) n++;
    if (uiWindVisible) n++;
    if (uiWaterVisible) n++;
    if (uiLogisticsVisible) n++;
    if (uiCitiesVisible !== false) n++;
    btn.textContent = 'Layers (' + n + ')';
  }
  countOn();
  btn.onclick = function() {
    panel.hidden = !panel.hidden;
  };
  function bind(sw, key, apply) {
    if (!sw) return;
    sw.onchange = function() {
      apply(!!sw.checked);
      const patch = {};
      patch[key] = !!sw.checked;
      saveProfile(patch);
      refreshOverlayLayers();
      countOn();
    };
  }
  bind(swRoads, 'showRoads', function(v) {
    uiRoadsVisible = v;
    const rbtn = document.getElementById('roadsToggle');
    if (rbtn) rbtn.textContent = uiRoadsVisible ? 'Hwy wire ON' : 'Hwy wire OFF';
    const layer = document.querySelector('[data-layer-id="highways"]');
    if (layer) {
      layer.innerHTML = '';
      if (uiRoadsVisible) placeHighways(layer, mapDataCache.highways_data || {});
    }
  });
  bind(swWind, 'showWind', function(v) { uiWindVisible = v; });
  bind(swWater, 'showWater', function(v) { uiWaterVisible = v; });
  bind(swLogi, 'showLogistics', function(v) { uiLogisticsVisible = v; });
  bind(swPins, 'showCities', function(v) {
    uiCitiesVisible = v;
    const cbtn = document.getElementById('citiesToggle');
    if (cbtn) cbtn.textContent = uiCitiesVisible ? 'Cities ON' : 'Cities OFF';
  });
}


function placeHighways(container, hwy) {
  // Plane overlay: wireframe PNG copied from green+black art + named labels.
  if (!container || !hwy) return;
  container.innerHTML = '';
  const NS = 'http://www.w3.org/2000/svg';
  const wrap = document.createElement('div');
  wrap.className = 'hwy-plane';
  wrap.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  const wireUrl = (mapDataCache && mapDataCache.highways_wireframe_url)
    || '/map-highways-wireframe?v=20260810wf';
  const img = document.createElement('img');
  img.className = 'hwy-wireframe-img';
  img.alt = 'highway wireframe';
  img.draggable = false;
  img.src = wireUrl;
  img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
  wrap.appendChild(img);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'hwy-svg');
  svg.setAttribute('viewBox', hwy.viewBox || '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  // Named IP labels (Bay Ring / SwitchBack / …) hidden — GM clear view for terrain/3D.
  // Wireframe PNG alone stays when Hwy wire ON. Restore label SVG here when asked.
  wrap.appendChild(svg);
  container.appendChild(wrap);
}

function initRoadsToggle(data, profile) {
  const btn = document.getElementById('roadsToggle');
  if (!btn) return;
  const hasData = data.highways_data && (
    (data.highways_data.routes || []).length || data.highways_wireframe_url
  );
  if (!hasData) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  uiRoadsVisible = profile.showRoads !== false;
  btn.textContent = uiRoadsVisible ? 'Hwy wire ON' : 'Hwy wire OFF';
  btn.onclick = function() {
    uiRoadsVisible = !uiRoadsVisible;
    btn.textContent = uiRoadsVisible ? 'Hwy wire ON' : 'Hwy wire OFF';
    saveProfile({ showRoads: uiRoadsVisible });
    const layer = document.querySelector('[data-layer-id="highways"]');
    if (layer) {
      layer.innerHTML = '';
      if (uiRoadsVisible) placeHighways(layer, mapDataCache.highways_data || {});
    }
    syncRoadsLayerVisibility();
  };
  syncRoadsLayerVisibility();
}

function placeMapLabels(container, markers) {
  if (!labelsUiEnabled() || !container) return;
  markers.forEach(function(m) {
    if (m.show_on_map === false) return;
    if (m.x_pct == null || m.y_pct == null) return;
    const el = document.createElement('div');
    el.className = 'map-label map-label--' + (m.type || 'default');
    el.dataset.id = m.id;
    // SoT: name uses pin coords only (ignore stale label_x/y_pct).
    el.style.left = m.x_pct + '%';
    el.style.top = m.y_pct + '%';
    el.style.color = cityPinColor(m);
    el.textContent = m.label || m.name || m.id;
    if (activeId && m.id !== activeId) el.classList.add('is-dim');
    if (m.id === activeId) el.classList.add('is-active');
    container.appendChild(el);
  });
}

function syncLabelLayerVisibility() {
  syncLayerVisibility('labels', labelsUiEnabled());
}

function buildLayerStack(stack) {
  const manifest = (mapDataCache && mapDataCache.layers_manifest) || [];
  stack.innerHTML = '';
  manifest.slice().sort(function(a, b) { return a.z - b.z; }).forEach(function(def) {
    const div = document.createElement('div');
    div.className = 'map-layer map-layer--' + def.id;
    div.dataset.layerId = def.id;
    div.style.zIndex = String(def.z);
    stack.appendChild(div);
  });
}

function getMapStack(stage) {
  let stack = stage.querySelector('.map-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'map-stack';
    stack.id = 'mapStack';
    stage.appendChild(stack);
    buildLayerStack(stack);
  }
  return stack;
}

function layerEl(stack, layerId) {
  return stack.querySelector('[data-layer-id="' + layerId + '"]');
}

function initLabelToggle(data, profile) {
  const btn = document.getElementById('labelToggle');
  if (!btn) return;
  if (data.label_layer !== 'ui') {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  uiLabelsVisible = profile.showLabels !== false;
  btn.textContent = uiLabelsVisible ? 'Labels ON' : 'Labels OFF';
  btn.onclick = function() {
    uiLabelsVisible = !uiLabelsVisible;
    btn.textContent = uiLabelsVisible ? 'Labels ON' : 'Labels OFF';
    saveProfile({ showLabels: uiLabelsVisible });
    const stage = document.getElementById('mapStage');
    if (stage && mapDataCache) {
      renderMapStage(stage, mapDataCache, loadProfile());
    }
  };
}

function selectMarker(id, opts) {
  opts = opts || {};
  activeId = id;
  markVisited(id);
  syncNoteField(id);
  syncDrawRegionSelectToActive(id);
  document.querySelectorAll('.pin, .region-card, .legend-chip').forEach(function(el) {
    el.classList.toggle('is-active', el.dataset.id === id);
  });
  document.querySelectorAll('.map-label').forEach(function(el) {
    el.classList.toggle('is-active', el.dataset.id === id);
    el.classList.toggle('is-dim', activeId && el.dataset.id !== id);
  });
  document.querySelectorAll('.map-area-zone').forEach(function(el) {
    el.classList.toggle('is-active', el.dataset.id === id);
    el.classList.toggle('is-dim', activeId && el.dataset.id !== id);
  });
  const card = document.querySelector('.region-card[data-id="' + id + '"]');
  if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  if (opts.focus !== false) {
    const marker = markerById(id);
    if (marker) focusOnMarker(marker, true);
  }
}

function showTooltip(text, x, y) {
  tooltip.textContent = text;
  tooltip.hidden = false;
  tooltip.classList.add('visible');
  tooltip.style.left = (x + 12) + 'px';
  tooltip.style.top = (y + 12) + 'px';
}
function hideTooltip() {
  tooltip.classList.remove('visible');
  tooltip.hidden = true;
}

async function load() {
  // let (not const): stale coord_overrides clear reassigns profile — const threw and left the map black.
  let profile = loadProfile();
  if (profile.mapRes === '2k' || profile.mapRes === '4k') mapRes = profile.mapRes;
  updatePilotStats(profile);

  try {
    const meR = await fetch('/api/me');
    if (meR.ok) {
      meCache = await meR.json();
      updateAuthUi(meCache);
    }
  } catch (_) { /* offline — local profile still works */ }

  const r = await fetch('/api/map');
  if (r.status === 401) { location.href = '/'; return; }
  const data = await r.json();
  serverMarkersCache = (data.markers || []).map(function(m) { return Object.assign({}, m); });
  // Drop stale overrides unless Edit was left ON — otherwise ghost pins diverge from SoT.
  if (!(profile && profile.editMode === true) && profile.coord_overrides && Object.keys(profile.coord_overrides).length) {
    saveProfile({ coord_overrides: {} });
    profile = loadProfile();
  }
  data.markers = applyCoordOverrides(data.markers || [], profile);
  mapDataCache = data;
  const titleEl = document.getElementById('mapTitle');
  if (titleEl) titleEl.textContent = data.title || data.island || 'Isla Primavera';
  const stage = document.getElementById('mapStage');
  const listEl = document.getElementById('list');
  const resBtn = document.getElementById('resToggle');
  if (data.base_image_2k_url) {
    resBtn.hidden = false;
    resBtn.textContent = mapRes === '2k' ? '2K' : '4K';
    resBtn.onclick = () => {
      mapRes = mapRes === '2k' ? '4k' : '2k';
      resBtn.textContent = mapRes === '2k' ? '2K' : '4K';
      saveProfile({ mapRes });
      renderMapStage(stage, data, loadProfile());
    };
  }
  if (data.tile_pyramid_ready) resBtn.hidden = true;
  initLabelToggle(data, profile);
  initAreaToggle(data, profile);
  initCitiesToggle(data, profile);
  initEconToggle(data, profile);
  initRoadsToggle(data, profile);
  initLayersPanel(profile);
  loadRoadsLocalShard().then(function(shard) {
    roadsLocalCache = shard;
    return loadLogisticsRoutes();
  }).then(function(routes) {
    if (mapDataCache) mapDataCache.logistics_routes = routes || [];
    refreshOverlayLayers();
  });
  initEditMode(profile);
  initDrawMode();
  initFeedbackUi();
  // DEV LOG + WORLD: hard navigate (location.assign). Never overlay; never rely on
  // default <a> alone if a capture handler cancelable-clicks the HUD.
  (function bindHardNavChips() {
    const worldBtn = document.getElementById('worldToggle');
    if (worldBtn && !worldBtn.dataset.navBound) {
      worldBtn.dataset.navBound = '1';
      worldBtn.addEventListener('click', function(ev) {
        ev.preventDefault();
        location.assign('/world');
      });
    }
    const devBtn = document.getElementById('devLogToggle');
    if (devBtn && !devBtn.dataset.navBound) {
      devBtn.dataset.navBound = '1';
      devBtn.addEventListener('click', function(ev) {
        ev.preventDefault();
        location.assign('/devlog');
      });
    }
  })();
  coordsDirty = Object.keys(profile.coord_overrides || {}).length > 0;
  const castBtn = document.getElementById('castToggle');
  if (castBtn) {
    castBtn.onclick = () => setCastMode(!castMode);
  }
  const dockClose = document.getElementById('dockClose');
  if (dockClose) dockClose.onclick = () => setDockMode('');
  ['radio', 'phone', 'sim'].forEach(function (k) {
    const id = 'dock' + k.charAt(0).toUpperCase() + k.slice(1);
    const b = document.getElementById(id);
    if (b) b.onclick = () => setDockMode(k);
  });
  const map3dBtn = document.getElementById('map3dToggle');
  if (map3dBtn) map3dBtn.onclick = () => setMap3dOverlay(!map3dOn);
  window.addEventListener('hashchange', applyCastHash);
  applyCastHash();
  loadCast();
  if (data.error) {
    stage.innerHTML = '<p class="err">' + data.error + '</p>';
    return;
  }
  const markers = data.markers || [];
  bindPinsToAreas();
  initMapCamera();
  buildLegendGrid(markers);
  renderMapStage(stage, data, profile);
  markers.forEach(m => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'region-card';
    btn.dataset.id = m.id;
    const label = m.label || m.name || m.id;
    const kind = m.type || m.kind || 'site';
    const num = m.region != null ? '<span class="region-num">R' + m.region + '</span>' : '';
    const coord = (m.x_pct != null && m.y_pct != null)
      ? m.x_pct.toFixed(1) + '%, ' + m.y_pct.toFixed(1) + '%' : 'unmapped';
    const lane = m.workflow_status || 'planning';
    let html = num + '<strong>' + label + '</strong><span class="meta">' + kind + ' · ' + coord +
      '</span><span class="lane lane--' + lane + '">' + lane + '</span>';
    if (m.area_pin_mismatch && m.containing_area_id) {
      html += '<span class="pip-warn">⚠ pin inside area labeled ' +
        displayNameForRegionId(m.containing_area_id, m.containing_area_id) + '</span>';
    }
    btn.innerHTML = html;
    btn.addEventListener('click', function() { selectMarker(m.id, { focus: true }); });
    listEl.appendChild(btn);
  });
  if (profile.lastRegionId && markers.some(function(m) { return m.id === profile.lastRegionId; })) {
    selectMarker(profile.lastRegionId, { focus: false });
  }
}

function mapImageUrl(data) {
  if (mapRes === '2k' && data.base_image_2k_url) return data.base_image_2k_url;
  return data.base_image_url;
}

function finishMapStage(stage, markers, profile) {
  const stack = getMapStack(stage);
  const areaLayer = layerEl(stack, 'regions');
  const pinLayer = layerEl(stack, 'poi-pins');
  const labelLayer = layerEl(stack, 'labels');
  bindPinsToAreas();
  if (areaLayer) {
    areaLayer.innerHTML = '';
    if (mapDataCache && mapDataCache.regions_ui_data) {
      placeRegionAreas(areaLayer, mapDataCache.regions_ui_data);
    }
  }
  if (pinLayer) {
    pinLayer.innerHTML = '';
    placePins(pinLayer, markers);
  }
  const econLayer = layerEl(stack, 'economy-resources');
  if (econLayer) {
    econLayer.innerHTML = '';
    if (uiEconVisible && mapDataCache && mapDataCache.economy_overlay) {
      placeEconomySites(econLayer, mapDataCache.economy_overlay);
    }
  }
  const hwyLayer = layerEl(stack, 'highways');
  if (hwyLayer) {
    hwyLayer.innerHTML = '';
    if (uiRoadsVisible && mapDataCache && (mapDataCache.highways_data || mapDataCache.highways_wireframe_url)) {
      placeHighways(hwyLayer, mapDataCache.highways_data || { viewBox: '0 0 100 100', routes: [] });
    }
  }

  refreshOverlayLayers();
  if (labelLayer) {
    labelLayer.classList.add('map-label-layer');
    labelLayer.innerHTML = '';
    placeMapLabels(labelLayer, markers);
  }
  syncAreaLayerVisibility();
  syncCitiesLayerVisibility();
  syncEconLayerVisibility();
  syncRoadsLayerVisibility();
  syncLabelLayerVisibility();
  if (typeof renderDrawPreview === 'function') renderDrawPreview();
  restoreCameraFromProfile(profile || loadProfile(), !prefersReducedMotion);
  cameraReady = true;
  scheduleTileUpdate();
  if (tilePyramid) {
    window.setTimeout(function() {
      const layer = document.getElementById('mapTileLayer');
      const loaded = layer
        ? Array.from(layer.querySelectorAll('img')).filter(function(i) { return i.complete && i.naturalWidth > 0; }).length
        : 0;
      if (loaded < 3) fitToView(false);
    }, 2500);
  }
}

function setMapLoadChip(msg, isErr) {
  const el = document.getElementById('mapLoadChip');
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('is-err');
    return;
  }
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle('is-err', !!isErr);
}

function watchMapArtLoad() {
  setMapLoadChip('Loading map…', false);
  const started = Date.now();
  function tick() {
    const img = document.getElementById('mapImg');
    const layer = document.getElementById('mapTileLayer');
    const tilesLoaded = layer
      ? Array.from(layer.querySelectorAll('img')).filter(function(i) {
          return i.complete && i.naturalWidth > 0;
        }).length
      : 0;
    if (img) {
      // Belt: never leave CSS animation / reduced-motion fill at opacity 0.
      img.style.opacity = '1';
    }
    const underOk = !!(img && img.complete && img.naturalWidth > 0);
    const visible = underOk && img && getComputedStyle(img).opacity !== '0';
    if ((underOk && visible) || tilesLoaded > 0) {
      setMapLoadChip('', false);
      return;
    }
    if (Date.now() - started > 10000) {
      if (underOk && !visible) {
        setMapLoadChip('Map art loaded but invisible (opacity). Forcing visible — hard-refresh if still black.', true);
        if (img) {
          img.style.setProperty('opacity', '1', 'important');
          img.style.animation = 'none';
        }
        return;
      }
      setMapLoadChip('Map art failed to load — hard-refresh (Ctrl+Shift+R). If still black, report.', true);
      return;
    }
    window.setTimeout(tick, 400);
  }
  window.setTimeout(tick, 200);
}

function renderMapPyramid(stage, data, profile) {
  const py = data.tile_pyramid;
  tilePyramid = py;
  activeTileZ = null;
  tileLoadEpoch = 0;
  stage.innerHTML = '';
  stage.style.width = py.width + 'px';
  stage.style.height = py.height + 'px';
  const stack = document.createElement('div');
  stack.className = 'map-stack';
  stack.id = 'mapStack';
  stage.appendChild(stack);
  buildLayerStack(stack);
  // Instant underlay so fit-view is never a black void while pyramid tiles stream in.
  // Prefer master (pyramid source) over mislabeled 1024 "2k" — stretched 2k drifted vs tiles/Roads on zoom.
  const terrainBase = layerEl(stack, 'terrain-base') || layerEl(stack, 'terrain-tiles');
  const underUrl = data.base_image_url || data.base_image_2k_url;
  if (terrainBase && underUrl) {
    const img = document.createElement('img');
    img.id = 'mapImg';
    img.src = underUrl.indexOf('?') >= 0 ? underUrl + '&v=20260810roads' : underUrl + '?v=20260810roads';
    img.alt = data.title || 'campaign map';
    img.draggable = false;
    img.fetchPriority = 'high';
    img.style.opacity = '1';
    img.onerror = function() {
      if (data.base_image_2k_url && img.src.indexOf('res=2k') < 0) {
        img.src = data.base_image_2k_url + (data.base_image_2k_url.indexOf('?') >= 0 ? '&' : '?') + 'v=20260810roads';
        return;
      }
      setMapLoadChip('Map underlay URL failed (HTTP error). Try hard-refresh.', true);
    };
    img.onload = function() {
      img.style.opacity = '1';
      /* Underlay decode can finish after a bad restored camera — snap to Fit if island not in view. */
      const vp = document.getElementById('viewport');
      const size = mapImageSize();
      if (vp && size && !cameraShowsMap(camera, vp, size)) fitToView(false);
      else if (!cameraReady) fitToView(false);
      scheduleTileUpdate();
    };
    terrainBase.appendChild(img);
  } else {
    setMapLoadChip('Map underlay missing from /api/map — check base_image on server.', true);
  }
  const terrainTiles = layerEl(stack, 'terrain-tiles');
  if (terrainTiles) {
    const tileWrap = document.createElement('div');
    tileWrap.id = 'mapTileLayer';
    tileWrap.className = 'map-tile-layer';
    terrainTiles.appendChild(tileWrap);
  }
  watchMapArtLoad();
  finishMapStage(stage, data.markers || [], profile);
}

function renderMapStage(stage, data, profile) {
  if (data.tile_pyramid_ready && data.tile_pyramid) {
    renderMapPyramid(stage, data, profile);
    return;
  }
  stage.style.width = '';
  stage.style.height = '';
  tilePyramid = null;
  stage.innerHTML = '';
  const url = mapImageUrl(data);
  const markers = data.markers || [];
  if (url) {
    const stack = document.createElement('div');
    stack.className = 'map-stack';
    stack.id = 'mapStack';
    stage.appendChild(stack);
    buildLayerStack(stack);
    const terrainBase = layerEl(stack, 'terrain-base') || layerEl(stack, 'terrain-tiles');
    const img = document.createElement('img');
    img.id = 'mapImg';
    img.src = url;
    img.alt = data.title || 'campaign map';
    img.draggable = false;
    img.onload = function() {
      finishMapStage(stage, markers, profile);
    };
    img.onerror = function() {
      const alt = mapRes === '2k' && data.base_image_url ? data.base_image_url
        : mapRes === '4k' && data.base_image_2k_url ? data.base_image_2k_url : null;
      if (alt && img.src.indexOf(alt) < 0) {
        mapRes = alt.indexOf('res=2k') >= 0 ? '2k' : '4k';
        const resBtn = document.getElementById('resToggle');
        if (resBtn) resBtn.textContent = mapRes === '2k' ? '2K' : '4K';
        img.src = alt;
      } else {
        stage.innerHTML = '<p class="err">Map image unavailable — origin may be restarting. Retry in a moment.</p>';
      }
    };
    if (terrainBase) terrainBase.appendChild(img);
    else stage.appendChild(img);
  } else {
    stage.innerHTML = '<p class="muted">Base map image missing</p>';
  }
}

function placePins(stage, markers) {
  markers.forEach(m => {
    if (m.x_pct == null || m.y_pct == null) return;
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'pin pin--' + (m.type || 'default') + (editMode ? ' is-editable' : '');
    pin.dataset.id = m.id;
    pin.style.pointerEvents = 'auto';
    const pc = cityPinColor(m);
    pin.style.background = pc;
    pin.style.borderColor = '#1a1208';
    const num = m.region != null ? m.region : '';
    pin.innerHTML = '<span class="pin-num">' + num + '</span>';
    pin.style.left = m.x_pct + '%';
    pin.style.top = m.y_pct + '%';
    const label = m.label || m.name || m.id;
    pin.setAttribute('aria-label', label);
    if (editMode) {
      let drag = null;
      pin.addEventListener('pointerdown', function(e) {
        e.stopPropagation();
        drag = { id: e.pointerId, pinId: m.id };
        pin.setPointerCapture(e.pointerId);
        pin.classList.add('is-dragging');
        hideTooltip();
      });
      pin.addEventListener('pointermove', function(e) {
        if (!drag || drag.id !== e.pointerId) return;
        const p = pointerToMapPct(e.clientX, e.clientY);
        if (!p) return;
        pin.style.left = p.x_pct + '%';
        pin.style.top = p.y_pct + '%';
        showTooltip(p.x_pct + '%, ' + p.y_pct + '%', e.clientX, e.clientY);
      });
      pin.addEventListener('pointerup', function(e) {
        if (!drag || drag.id !== e.pointerId) return;
        const p = pointerToMapPct(e.clientX, e.clientY);
        if (p) setMarkerCoord(m.id, p.x_pct, p.y_pct);
        drag = null;
        pin.classList.remove('is-dragging');
        hideTooltip();
        try { pin.releasePointerCapture(e.pointerId); } catch (_) { /* ok */ }
      });
      pin.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        selectMarker(m.id, { focus: false });
      });
    } else {
      const tip = m.city_map ? label + ' · city map (click, then link in panel)' : label;
      pin.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
      pin.addEventListener('click', function() { selectMarker(m.id, { focus: true }); });
      pin.addEventListener('mouseenter', e => showTooltip(tip, e.clientX, e.clientY));
      pin.addEventListener('mousemove', e => showTooltip(tip, e.clientX, e.clientY));
      pin.addEventListener('mouseleave', hideTooltip);
    }
    stage.appendChild(pin);
  });
}
load();
</script>
</body>
</html>`;
}

/** Generated city maps (proposal-grade; GM edits win) — campaigns/<c>/map/cities/<region-id>.json */
const CITIES_DIR = path.join(CAMPAIGN_DIR, "map", "cities");
const CITY_ID_RE = /^r\d{2}-[a-z0-9-]+$/;
const cityCache = new Map(); // id -> { mtimeMs, data }

/** Standalone silo UIs under tableslop-static/ — public view, no auth gate. */
const STATIC_ROOT = path.join(__dirname, "tableslop-static");
const STATIC_MOUNTS = {
  "3d": { dir: path.join(STATIC_ROOT, "3d"), cacheSec: 15 },
  radio: { dir: path.join(STATIC_ROOT, "radio"), cacheSec: 300 },
  phone: { dir: path.join(STATIC_ROOT, "phone"), cacheSec: 300 },
  sfx: { dir: path.join(STATIC_ROOT, "sfx"), cacheSec: 300 },
  hunter: { dir: path.join(STATIC_ROOT, "hunter"), cacheSec: 300 },
  sim: { dir: path.join(STATIC_ROOT, "sim"), cacheSec: 60, jsonCacheSec: 30 },
  "lived-in": { dir: path.join(STATIC_ROOT, "lived-in"), cacheSec: 120, jsonCacheSec: 30 },
};
const STATIC_MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream",
};

function serveStaticFile(res, abs, cacheSec) {
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(abs).toLowerCase();
  res.writeHead(200, {
    "Content-Type": STATIC_MIME[ext] || "application/octet-stream",
    "Cache-Control": `public, max-age=${cacheSec}`,
  });
  const stream = fs.createReadStream(abs);
  stream.on("error", () => {
    try {
      res.destroy();
    } catch (_) {
      /* ignore */
    }
  });
  stream.pipe(res);
}

/** Serve /{name}/… from STATIC_MOUNTS. Returns true if handled. */
function tryServeStaticMount(url, res) {
  for (const [name, cfg] of Object.entries(STATIC_MOUNTS)) {
    const prefix = `/${name}`;
    if (url === prefix || url === `${prefix}/` || url === `${prefix}/index.html`) {
      serveStaticFile(res, path.join(cfg.dir, "index.html"), cfg.cacheSec);
      return true;
    }
    if (!url.startsWith(`${prefix}/`)) continue;
    let rel = "";
    try {
      rel = decodeURIComponent(url.slice(prefix.length + 1));
    } catch {
      rel = "";
    }
    if (!rel || rel.includes("..") || path.isAbsolute(rel)) {
      res.writeHead(404);
      res.end("Not found");
      return true;
    }
    const abs = path.join(cfg.dir, rel);
    const root = cfg.dir.endsWith(path.sep) ? cfg.dir : cfg.dir + path.sep;
    if (abs !== cfg.dir && !abs.startsWith(root)) {
      res.writeHead(404);
      res.end("Not found");
      return true;
    }
    const ext = path.extname(abs).toLowerCase();
    const cache =
      ext === ".json" && cfg.jsonCacheSec != null ? cfg.jsonCacheSec : cfg.cacheSec;
    serveStaticFile(res, abs, cache);
    return true;
  }
  return false;
}

function loadCityData(regionId) {
  if (!CITY_ID_RE.test(regionId || "")) return null;
  const abs = path.join(CITIES_DIR, `${regionId}.json`);
  if (!fs.existsSync(abs)) return null;
  try {
    const mtimeMs = fs.statSync(abs).mtimeMs;
    const hit = cityCache.get(regionId);
    if (hit && hit.mtimeMs === mtimeMs) return hit.data;
    const data = JSON.parse(fs.readFileSync(abs, "utf8"));
    cityCache.set(regionId, { mtimeMs, data });
    return data;
  } catch {
    return null;
  }
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** City detail page — same hand-rolled DOM+SVG stack as the island viewer, fit-to-view. */
function cityHtml(city) {
  const dataJson = JSON.stringify(city).replace(/</g, "\\u003c");
  const title = `${city.name || city.region_id} — city map`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>tableslop — ${escHtml(city.name || city.region_id)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=VT323&family=Share+Tech+Mono&display=swap" rel="stylesheet"/>
<style>
  :root {
    --void:#0d0221; --panel:#16082a; --text:#e8f4ff; --muted:#9d8fc9;
    --pink:#ff71ce; --cyan:#01cdfe; --sun:#fffb96;
    --glow-pink:rgba(255,113,206,.55); --glow-cyan:rgba(1,205,254,.45);
  }
  * { box-sizing:border-box; }
  html, body { height:100%; margin:0; overflow:hidden; }
  body {
    display:flex; flex-direction:column; height:100vh; height:100dvh;
    font:15px/1.4 "Share Tech Mono",monospace; background:#0a0a0e; color:var(--text);
  }
  .hud {
    flex:0 0 auto; display:flex; align-items:center; gap:14px; flex-wrap:wrap;
    padding:10px 16px; border-bottom:2px solid transparent;
    border-image:linear-gradient(90deg, var(--pink), var(--cyan)) 1;
    background:linear-gradient(180deg, rgba(22,8,42,.98), rgba(13,2,33,.98));
  }
  .hud-brand {
    font:700 1rem Orbitron,sans-serif; letter-spacing:.18em; text-transform:uppercase;
    background:linear-gradient(90deg, var(--pink), var(--cyan));
    -webkit-background-clip:text; background-clip:text; color:transparent;
  }
  .hud-setting { font:1.1rem VT323,monospace; color:var(--sun); letter-spacing:.06em; }
  .hud-link {
    font:700 .7rem Orbitron,sans-serif; letter-spacing:.1em; text-transform:uppercase;
    color:var(--cyan); text-decoration:none; border:1px solid var(--cyan); padding:4px 12px;
  }
  .hud-link:hover { color:var(--pink); border-color:var(--pink); }
  .hud-note { margin-left:auto; color:var(--muted); font-size:.72rem; letter-spacing:.06em; }
  .city-shell {
    flex:1; min-height:0; display:grid; grid-template-columns:1fr min(300px,32vw);
  }
  @media (max-width:800px) { .city-shell { grid-template-columns:1fr; grid-template-rows:1fr auto; } }
  .city-stage { position:relative; min-height:0; background:#0a0a0e; padding:10px; }
  .city-svg { width:100%; height:100%; display:block; }
  .city-parent { fill:none; stroke:rgba(232,220,192,.45); }
  .city-district { cursor:pointer; transition:fill-opacity .15s, filter .15s, opacity .15s; }
  .city-district:hover { filter:drop-shadow(0 0 3px rgba(1,205,254,.55)); }
  .city-district.is-dim { opacity:.3; }
  .city-street { fill:none; pointer-events:none; }
  .city-lm { cursor:pointer; }
  .city-lm.is-dim { opacity:.3; }
  .city-side {
    min-height:0; overflow-y:auto; padding:12px 14px;
    border-left:1px solid rgba(255,113,206,.25);
    background:linear-gradient(180deg, rgba(22,8,42,.97), rgba(13,2,33,.99));
  }
  .city-side h2 {
    margin:10px 0 8px; font:700 .8rem Orbitron,sans-serif; letter-spacing:.14em;
    color:var(--pink); text-transform:uppercase;
  }
  .city-blurb { color:var(--muted); font-size:.8rem; line-height:1.4; }
  .city-list { display:flex; flex-direction:column; gap:4px; }
  .city-row {
    font:inherit; font-size:.82rem; text-align:left; cursor:pointer;
    background:rgba(1,205,254,.06); color:var(--text);
    border:1px solid rgba(1,205,254,.25); padding:6px 9px;
  }
  .city-row:hover, .city-row.is-active { border-color:var(--sun); color:var(--sun); }
  .city-row--static { cursor:default; opacity:.85; }
  .city-row--static:hover { border-color:rgba(1,205,254,.25); color:var(--text); }
  .city-row .kind-tag { color:var(--muted); font-size:.7rem; margin-left:6px; }
  .city-detail {
    margin-top:12px; padding:10px 12px; font-size:.8rem;
    border:1px solid rgba(255,251,150,.35); background:rgba(13,2,33,.8);
  }
  .city-detail h3 { margin:0 0 6px; font:1rem VT323,monospace; color:var(--sun); }
  .city-detail p { margin:4px 0; color:var(--muted); }
  .city-detail ul { margin:6px 0 0; padding-left:16px; }
  .city-detail li { margin:2px 0; }
  .city-detail button { background:none; border:none; padding:0; font:inherit; color:var(--cyan); cursor:pointer; }
  .city-detail button:hover { color:var(--pink); }
  .city-meta { margin-top:14px; color:var(--muted); font-size:.65rem; letter-spacing:.04em; }
  .map-tooltip {
    position:fixed; z-index:30; pointer-events:none; max-width:260px;
    background:rgba(13,2,33,.94); border:1px solid var(--cyan);
    color:var(--text); font-size:.75rem; padding:6px 10px;
    box-shadow:0 0 14px var(--glow-cyan);
  }
</style>
</head>
<body>
<header class="hud">
  <div class="hud-brand">tableslop</div>
  <span class="hud-setting">${escHtml(title)}</span>
  <a class="hud-link" href="/">&#8592; Island map</a>
  <span class="hud-note">generated proposal — GM edits win</span>
</header>
<div class="city-shell">
  <section class="city-stage" id="stage"></section>
  <aside class="city-side">
    <div class="city-blurb">${escHtml(city.blurb || "")}</div>
    <h2>Districts</h2>
    <div class="city-list" id="districtList"></div>
    <h2>Landmarks</h2>
    <div class="city-list" id="landmarkList"></div>
    <h2>Streets</h2>
    <div class="city-list" id="streetList"></div>
    <div class="city-detail" id="detail" hidden></div>
    <div class="city-meta" id="cityMeta"></div>
  </aside>
</div>
<div class="map-tooltip" id="tooltip" hidden></div>
<script>const CITY = ${dataJson};</script>
<script>
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var KIND_COLORS = {
    bar: '#e07a8c', dock: '#5eb0d9', hotel: '#e8c547', church: '#c9b8e8',
    market: '#7bc45e', civic: '#9aa3b8', hideout: '#b8734a'
  };
  var tooltip = document.getElementById('tooltip');
  var stage = document.getElementById('stage');
  var detail = document.getElementById('detail');
  var vb = String(CITY.viewBox || '0 0 100 100').split(/\\s+/).map(Number);
  var U = (vb[2] || 15) / 15; // px-consistent sizing across cities
  var activeId = null;

  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', CITY.viewBox);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'city-svg');

  function showTooltip(text, x, y) {
    tooltip.textContent = text;
    tooltip.hidden = false;
    tooltip.style.left = (x + 12) + 'px';
    tooltip.style.top = (y + 12) + 'px';
  }
  function hideTooltip() { tooltip.hidden = true; }
  function hover(el, text) {
    el.addEventListener('mouseenter', function (e) { showTooltip(text, e.clientX, e.clientY); });
    el.addEventListener('mousemove', function (e) { showTooltip(text, e.clientX, e.clientY); });
    el.addEventListener('mouseleave', hideTooltip);
  }
  function midPoint(pointsStr) {
    var pts = String(pointsStr).trim().split(/\\s+/).map(function (p) {
      var xy = p.split(',').map(Number);
      return { x: xy[0], y: xy[1] };
    });
    return pts[Math.floor(pts.length / 2)] || { x: 0, y: 0 };
  }
  function makeText(x, y, str, size, cls) {
    var t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', size);
    t.setAttribute('class', cls);
    t.setAttribute('pointer-events', 'none');
    t.textContent = str;
    return t;
  }
  function syncActive() {
    svg.querySelectorAll('.city-district, .city-lm').forEach(function (el) {
      el.classList.toggle('is-dim', !!(activeId && el.dataset.id !== activeId && el.dataset.kind !== 'street'));
    });
    document.querySelectorAll('.city-row').forEach(function (el) {
      el.classList.toggle('is-active', el.dataset.id === activeId);
    });
  }
  function districtById(id) {
    return (CITY.districts || []).find(function (d) { return d.id === id; });
  }
  function districtName(id) {
    var d = districtById(id);
    return d ? d.name : id;
  }
  function showDistrict(d) {
    activeId = d.id;
    var lms = (CITY.landmarks || []).filter(function (l) { return l.district === d.id; });
    var html = '<h3></h3><p></p><p style="color:var(--cyan)">' + lms.length + ' landmark' + (lms.length === 1 ? '' : 's') + '</p>';
    detail.innerHTML = html;
    detail.querySelector('h3').textContent = d.name;
    detail.querySelector('p').textContent = d.note || '';
    if (lms.length) {
      var ul = document.createElement('ul');
      lms.forEach(function (l) {
        var li = document.createElement('li');
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = l.name + ' (' + l.kind + ')';
        b.addEventListener('click', function () { showLandmark(l); });
        li.appendChild(b);
        ul.appendChild(li);
      });
      detail.appendChild(ul);
    }
    detail.hidden = false;
    syncActive();
  }
  function showLandmark(l) {
    activeId = l.id;
    detail.innerHTML = '<h3></h3><p class="lm-kind"></p><p class="lm-desc"></p>';
    detail.querySelector('h3').textContent = l.name;
    detail.querySelector('.lm-kind').textContent = l.kind + ' · ' + districtName(l.district);
    detail.querySelector('.lm-desc').textContent = l.desc || '';
    detail.hidden = false;
    syncActive();
  }

  if (CITY.parent_region && CITY.parent_region.points) {
    var parent = document.createElementNS(NS, 'polygon');
    parent.setAttribute('points', CITY.parent_region.points);
    parent.setAttribute('class', 'city-parent');
    parent.setAttribute('stroke-width', 0.07 * U);
    parent.setAttribute('stroke-dasharray', (0.22 * U) + ' ' + (0.14 * U));
    svg.appendChild(parent);
  }

  (CITY.districts || []).forEach(function (d) {
    var poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', d.points);
    poly.setAttribute('class', 'city-district');
    poly.dataset.id = d.id;
    poly.style.fill = d.fill || '#5a7a8a';
    poly.style.fillOpacity = '0.16';
    poly.style.stroke = d.stroke || '#3e5560';
    poly.style.strokeWidth = String(0.05 * U);
    poly.addEventListener('mouseenter', function () { poly.style.fillOpacity = '0.3'; });
    poly.addEventListener('mouseleave', function () { poly.style.fillOpacity = '0.16'; });
    poly.addEventListener('click', function () { showDistrict(d); });
    hover(poly, d.name);
    svg.appendChild(poly);
  });

  var STREET_STYLE = {
    main: { stroke: '#e8dcc0', w: 0.075, o: '0.8' },
    side: { stroke: '#9d8fc9', w: 0.05, o: '0.65' },
    alley: { stroke: '#9d8fc9', w: 0.035, o: '0.5' }
  };
  (CITY.streets || []).forEach(function (s) {
    var st = STREET_STYLE[s.kind] || STREET_STYLE.side;
    var line = document.createElementNS(NS, 'polyline');
    line.setAttribute('points', s.points);
    line.setAttribute('class', 'city-street');
    line.style.stroke = st.stroke;
    line.style.strokeWidth = String(st.w * U);
    line.style.opacity = st.o;
    if (s.kind === 'alley') line.style.strokeDasharray = (0.14 * U) + ' ' + (0.1 * U);
    svg.appendChild(line);
    if (s.kind === 'main') {
      var mid = midPoint(s.points);
      var lbl = makeText(mid.x, mid.y - 0.14 * U, s.name, 0.4 * U, 'city-slabel');
      lbl.setAttribute('fill', '#9d8fc9');
      lbl.setAttribute('opacity', '0.85');
      svg.appendChild(lbl);
    }
  });

  (CITY.landmarks || []).forEach(function (l) {
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'city-lm');
    g.setAttribute('transform', 'translate(' + l.x + ',' + l.y + ')');
    g.dataset.id = l.id;
    var c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', 0.3 * U);
    c.setAttribute('fill', KIND_COLORS[l.kind] || '#9aa3b8');
    c.setAttribute('stroke', '#1a1208');
    c.setAttribute('stroke-width', 0.05 * U);
    g.appendChild(c);
    var t = makeText(0, 0.15 * U, (l.kind || '?')[0].toUpperCase(), 0.4 * U, 'city-lm-letter');
    t.setAttribute('fill', '#1a1208');
    t.setAttribute('font-weight', '700');
    g.appendChild(t);
    g.addEventListener('click', function () { showLandmark(l); });
    hover(g, l.name + ' · ' + l.kind + ' · ' + districtName(l.district));
    svg.appendChild(g);
  });

  (CITY.districts || []).forEach(function (d) {
    if (d.label_x == null || d.label_y == null) return;
    var lbl = makeText(d.label_x, d.label_y, d.name, 0.5 * U, 'city-dlabel');
    lbl.setAttribute('fill', '#e8dcc0');
    lbl.setAttribute('stroke', '#0a0a0e');
    lbl.setAttribute('stroke-width', 0.09 * U);
    lbl.setAttribute('paint-order', 'stroke');
    lbl.setAttribute('opacity', '0.9');
    svg.appendChild(lbl);
  });

  stage.appendChild(svg);

  var dList = document.getElementById('districtList');
  (CITY.districts || []).forEach(function (d) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'city-row';
    b.dataset.id = d.id;
    b.textContent = d.name;
    b.addEventListener('click', function () { showDistrict(d); });
    dList.appendChild(b);
  });
  var lList = document.getElementById('landmarkList');
  (CITY.landmarks || []).forEach(function (l) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'city-row';
    b.dataset.id = l.id;
    b.textContent = l.name;
    var tag = document.createElement('span');
    tag.className = 'kind-tag';
    tag.textContent = l.kind;
    b.appendChild(tag);
    b.addEventListener('click', function () { showLandmark(l); });
    lList.appendChild(b);
  });

  var sList = document.getElementById('streetList');
  (CITY.streets || []).forEach(function (s) {
    var row = document.createElement('div');
    row.className = 'city-row city-row--static';
    row.textContent = s.name;
    var tag = document.createElement('span');
    tag.className = 'kind-tag';
    tag.textContent = s.kind;
    row.appendChild(tag);
    sList.appendChild(row);
  });

  var gen = CITY.generated || {};
  document.getElementById('cityMeta').textContent =
    'map/cities/' + CITY.region_id + '.json · seed ' + gen.seed + ' · ' + gen.at;
})();
</script>
</body>
</html>`;
}

function loadRegionsBoard() {
  if (!fs.existsSync(REGIONS_BOARD)) return null;
  try {
    return JSON.parse(fs.readFileSync(REGIONS_BOARD, "utf8"));
  } catch {
    return null;
  }
}

function emptyDevCalendar() {
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    timeline: [],
    features: [],
    bugs: [],
  };
}

function loadDevCalendar() {
  if (!fs.existsSync(DEV_CALENDAR_JSON)) return emptyDevCalendar();
  try {
    const data = JSON.parse(fs.readFileSync(DEV_CALENDAR_JSON, "utf8"));
    if (!data || typeof data !== "object") return emptyDevCalendar();
    return {
      version: Number(data.version) || 1,
      updated_at: String(data.updated_at || ""),
      notes: data.notes ? String(data.notes) : undefined,
      timeline: Array.isArray(data.timeline) ? data.timeline : [],
      features: Array.isArray(data.features) ? data.features : [],
      bugs: Array.isArray(data.bugs) ? data.bugs : [],
    };
  } catch {
    return emptyDevCalendar();
  }
}

function slugId(prefix, title) {
  const base = String(title || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${prefix}-${base || "item"}-${Date.now().toString(36).slice(-4)}`;
}

function saveDevCalendarAdd(payload) {
  const cal = loadDevCalendar();
  const baseVersion = payload && payload.base_version != null ? Number(payload.base_version) : null;
  if (baseVersion != null && Number.isFinite(baseVersion) && baseVersion !== cal.version) {
    const err = new Error("version_conflict");
    err.code = "version_conflict";
    err.detail = { version: cal.version, base_version: baseVersion };
    throw err;
  }
  const section = String((payload && payload.section) || "");
  if (!["timeline", "features", "bugs"].includes(section)) {
    throw new Error("section must be timeline|features|bugs");
  }
  const raw = (payload && payload.item) || {};
  const title = String(raw.title || "").trim();
  if (!title) throw new Error("title required");
  const prefix = section === "bugs" ? "bug" : section === "features" ? "feat" : "tl";
  const item = {
    id: String(raw.id || slugId(prefix, title)).slice(0, 80),
    title: title.slice(0, 160),
    notes: String(raw.notes || "").trim().slice(0, 800),
    status: String(raw.status || (section === "bugs" ? "open" : "planned")).slice(0, 24),
  };
  if (section === "timeline") item.when = String(raw.when || "TBD").slice(0, 80);
  if (section === "features") item.target = String(raw.target || raw.when || "TBD").slice(0, 80);
  if (section === "bugs") {
    const sev = String(raw.severity || "med").toLowerCase();
    item.severity = ["low", "med", "high"].includes(sev) ? sev : "med";
  }
  cal[section].push(item);
  cal.version = (Number(cal.version) || 1) + 1;
  cal.updated_at = new Date().toISOString();
  const dir = path.dirname(DEV_CALENDAR_JSON);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DEV_CALENDAR_JSON, JSON.stringify(cal, null, 2) + "\n", "utf8");
  return { calendar: cal, item };
}

/** Place-name SoT: markers[].label (then .name). Lore aliases never win on display. */
function markerDisplayName(m) {
  if (!m) return "";
  return String(m.label || m.name || m.id || "").trim();
}

function alignAreaNamesToMarkers(markers, regionsUiData) {
  if (!regionsUiData || !Array.isArray(regionsUiData.areas)) return;
  const byId = Object.create(null);
  for (const m of markers || []) byId[m.id] = m;
  for (const a of regionsUiData.areas) {
    const dn = markerDisplayName(byId[a.id]);
    if (dn) a.name = dn;
  }
}

/** Server-side ray-cast PIP (percent coords). poly = [[x,y],…] or [{x,y}]. */
function pointInPolygonServer(x, y, poly) {
  const n = poly && poly.length;
  if (!n || n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    const xi = Array.isArray(pi) ? +pi[0] : +pi.x;
    const yi = Array.isArray(pi) ? +pi[1] : +pi.y;
    const xj = Array.isArray(pj) ? +pj[0] : +pj.x;
    const yj = Array.isArray(pj) ? +pj[1] : +pj.y;
    const denom = (yj - yi) || 1e-15;
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / denom + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function parseAreaPointsServer(pointsStr) {
  if (!pointsStr || typeof pointsStr !== "string") return [];
  return pointsStr.trim().split(/\s+/).map((pair) => {
    const parts = pair.split(",");
    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }).filter(Boolean);
}

/**
 * Bind pins → containing area by PIP for /api/map payloads.
 * Pins bind by containment (ray-cast), not manual region_id alone.
 */
function bindPinsToAreasServer(markers, regionsUiData) {
  if (!regionsUiData || !Array.isArray(regionsUiData.areas)) return;
  const areas = regionsUiData.areas;
  for (const m of markers || []) {
    m.containing_area_id = null;
    m.region_id = null;
    m.area_pin_mismatch = false;
  }
  for (const a of areas) {
    a.pin_ids = [];
    a.display_pin_name = null;
    a.pin_mismatch = false;
  }
  const polys = [];
  for (const a of areas) {
    if (!a || (a.shape && a.shape !== "polygon")) continue;
    const pts = parseAreaPointsServer(a.points);
    if (pts.length >= 3) polys.push({ a, pts });
  }
  for (const m of markers || []) {
    if (m.x_pct == null || m.y_pct == null) continue;
    const x = +m.x_pct;
    const y = +m.y_pct;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    for (const row of polys) {
      if (!pointInPolygonServer(x, y, row.pts)) continue;
      m.containing_area_id = row.a.id;
      m.region_id = row.a.id;
      row.a.pin_ids.push(m.id);
      if (!row.a.display_pin_name) {
        row.a.display_pin_name = markerDisplayName(m) || m.id;
      }
      if (m.id !== row.a.id) {
        m.area_pin_mismatch = true;
        row.a.pin_mismatch = true;
      }
      break;
    }
  }
}

function alignBoardNamesToMarkers(board, markers) {
  if (!board || !Array.isArray(board.regions)) return board;
  const byId = Object.create(null);
  for (const m of markers || []) byId[m.id] = m;
  return {
    ...board,
    regions: board.regions.map((r) => {
      const dn = markerDisplayName(byId[r.id]);
      return dn ? { ...r, name: dn } : r;
    }),
  };
}

// ponytail: merge map + board once per mtime — bust when map.json OR regions-ui.json changes
let mapJsonCache = { mapMtimeMs: 0, regionsMtimeMs: 0, data: null };

function regionsUiMtimeMs() {
  try {
    if (fs.existsSync(REGIONS_UI_JSON)) return fs.statSync(REGIONS_UI_JSON).mtimeMs;
  } catch (_) {
    /* stat best-effort */
  }
  return 0;
}

/** Resolve on-disk map PNG/WebP without pulling regions-ui / full /api/map merge. */
function resolveMapImageAbs(imgRes) {
  try {
    let rel = null;
    if (mapJsonCache && mapJsonCache.data) {
      const data = mapJsonCache.data;
      rel =
        imgRes === "2k" && data.base_image_2k && !String(data.base_image_2k).includes("..")
          ? data.base_image_2k
          : data.base_image;
    } else if (fs.existsSync(MAP_JSON)) {
      const raw = JSON.parse(fs.readFileSync(MAP_JSON, "utf8"));
      rel =
        imgRes === "2k" && raw.base_image_2k && !String(raw.base_image_2k).includes("..")
          ? raw.base_image_2k
          : raw.base_image;
    }
    if (!rel || String(rel).includes("..")) return null;
    const abs = path.join(CAMPAIGN_DIR, rel);
    return fs.existsSync(abs) ? abs : null;
  } catch {
    return null;
  }
}

function loadMapJson() {
  if (!fs.existsSync(MAP_JSON)) {
    return { campaign: CAMPAIGN, markers: [], error: "map.json missing" };
  }
  try {
    const st = fs.statSync(MAP_JSON);
    const ruiMs = regionsUiMtimeMs();
    const hwyAbs = path.join(CAMPAIGN_DIR, "map", "highways.json");
    const hwyMs = fs.existsSync(hwyAbs) ? fs.statSync(hwyAbs).mtimeMs : 0;
    const econOvAbsEarly = path.join(CAMPAIGN_DIR, "map", "economy-overlay.json");
    const econMs = fs.existsSync(econOvAbsEarly) ? fs.statSync(econOvAbsEarly).mtimeMs : 0;
    if (
      mapJsonCache.data &&
      mapJsonCache.mapMtimeMs === st.mtimeMs &&
      mapJsonCache.regionsMtimeMs === ruiMs &&
      mapJsonCache.highwaysMtimeMs === hwyMs &&
      mapJsonCache.econMtimeMs === econMs
    ) {
      return mapJsonCache.data;
    }
    const data = JSON.parse(fs.readFileSync(MAP_JSON, "utf8"));
    const board = loadRegionsBoard();
    if (board) {
      data.island = data.title || board.island;
      if (!data.brand && board.brand) data.brand = board.brand;
      const byId = {};
      for (const r of board.regions || []) byId[r.id] = r;
      data.markers = (data.markers || []).map((m) => {
        const row = byId[m.id];
        if (!row) return m;
        return { ...m, workflow_status: row.status, region_tasks: row.tasks };
      });
    }
    const rel = data.base_image;
    if (rel && !rel.includes("..")) {
      const abs = path.join(CAMPAIGN_DIR, rel);
      data.base_image_exists = fs.existsSync(abs);
      data.base_image_url = data.base_image_exists ? "/map-image" : null;
    }
    const rel2k = data.base_image_2k;
    if (rel2k && !rel2k.includes("..")) {
      const abs2k = path.join(CAMPAIGN_DIR, rel2k);
      data.base_image_2k_exists = fs.existsSync(abs2k);
      data.base_image_2k_url = data.base_image_2k_exists ? "/map-image?res=2k" : null;
    }
    const pyramidRel = data.tile_pyramid;
    if (pyramidRel && typeof pyramidRel === "string" && !pyramidRel.includes("..")) {
      const absPy = path.join(CAMPAIGN_DIR, pyramidRel);
      if (fs.existsSync(absPy)) {
        try {
          const py = JSON.parse(fs.readFileSync(absPy, "utf8"));
          data.tile_pyramid = py;
          data.tile_pyramid_ready = true;
        } catch {
          data.tile_pyramid_ready = false;
        }
      }
    }
    const regionsRel = data.regions_ui;
    const regionsAbs = regionsRel && !regionsRel.includes("..")
      ? path.join(CAMPAIGN_DIR, regionsRel)
      : REGIONS_UI_JSON;
    if (fs.existsSync(regionsAbs)) {
      try {
        data.regions_ui_data = JSON.parse(fs.readFileSync(regionsAbs, "utf8"));
        alignAreaNamesToMarkers(data.markers, data.regions_ui_data);
        // coords may override x_pct below — re-bind after coords merge
      } catch {
        data.regions_ui_data = null;
      }
    }
    if (!data.overlay_layer && data.label_layer === "ui") data.overlay_layer = "ui";
    const coordsRel = data.coords;
    const coordsAbs = coordsRel && !coordsRel.includes("..")
      ? path.join(CAMPAIGN_DIR, coordsRel)
      : COORDS_JSON;
    if (fs.existsSync(coordsAbs)) {
      try {
        data.coords_data = JSON.parse(fs.readFileSync(coordsAbs, "utf8"));
        const reg = data.coords_data.regions || {};
        data.markers = (data.markers || []).map((m) => {
          const c = reg[m.id];
          if (!c) return m;
          return { ...m, x_pct: c.x_pct, y_pct: c.y_pct, coord_status: "calibrated" };
        });
      } catch {
        data.coords_data = null;
      }
    }
    try {
      const econOvAbs = path.join(CAMPAIGN_DIR, "map", "economy-overlay.json");
      if (fs.existsSync(econOvAbs)) {
        data.economy_overlay = JSON.parse(fs.readFileSync(econOvAbs, "utf8"));
      }
    } catch {
      data.economy_overlay = null;
    }
    try {
      const hwyAbs = path.join(CAMPAIGN_DIR, "map", "highways.json");
      if (fs.existsSync(hwyAbs)) {
        data.highways_data = JSON.parse(fs.readFileSync(hwyAbs, "utf8"));
      }
    } catch {
      data.highways_data = null;
    }
    const hwyWireAbs = path.join(CAMPAIGN_DIR, "map", "highways-wireframe.png");
    data.highways_wireframe_url = fs.existsSync(hwyWireAbs)
      ? "/map-highways-wireframe?v=20260810wf"
      : null;
    const layersRel = data.layers_manifest;
    const layersAbs = layersRel && !layersRel.includes("..")
      ? path.join(CAMPAIGN_DIR, layersRel)
      : LAYERS_JSON;
    if (fs.existsSync(layersAbs)) {
      try {
        const lm = JSON.parse(fs.readFileSync(layersAbs, "utf8"));
        data.layers_manifest = lm.layers || [];
      } catch {
        data.layers_manifest = [];
      }
    }
    if (data.regions_ui_data) {
      bindPinsToAreasServer(data.markers, data.regions_ui_data);
    }
    mapJsonCache = {
      mapMtimeMs: st.mtimeMs,
      regionsMtimeMs: ruiMs,
      highwaysMtimeMs: hwyMs,
      econMtimeMs: econMs,
      data,
    };
    return data;
  } catch (err) {
    return { campaign: CAMPAIGN, markers: [], error: err.message };
  }
}

function sendJson(res, data, status = 200, cacheSec = 0) {
  const body = JSON.stringify(data);
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  if (cacheSec > 0) headers["Cache-Control"] = `public, max-age=${cacheSec}`;
  res.writeHead(status, headers);
  res.end(body);
}

function normalizeCampaignRelPath(imagePath) {
  if (!imagePath || typeof imagePath !== "string") return "";
  const normalized = imagePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || path.isAbsolute(normalized)) return "";
  return normalized;
}

function characterImageAbs(relPath) {
  const normalized = normalizeCampaignRelPath(relPath);
  if (!normalized) return null;
  const ext = path.extname(normalized).toLowerCase();
  if (!CHAR_IMAGE_EXTS.has(ext)) return null;
  const abs = path.join(CAMPAIGN_DIR, normalized);
  if (!abs.startsWith(CAMPAIGN_DIR + path.sep) && abs !== CAMPAIGN_DIR) return null;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return abs;
}

function characterImageContentType(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function listImageFilesInAbsDir(absDir, relPrefix) {
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) return [];
  return fs
    .readdirSync(absDir)
    .filter((f) => CHAR_IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .map((f) => `${relPrefix}/${f}`.replace(/\\/g, "/"))
    .sort((a, b) => a.localeCompare(b));
}

function preferStillPrimary(paths) {
  const still = paths.filter((p) => /\.(jpe?g|png|webp)$/i.test(p));
  return still[0] || paths[0] || "";
}

/** Disk portraits for an id — mirrors dashboard characterPortraitDirs (read-only). */
function characterPortraitDirs(charId) {
  const rels = [];
  const portraitDirRel = `characters/portraits/${charId}`;
  rels.push(...listImageFilesInAbsDir(path.join(CAMPAIGN_DIR, portraitDirRel), portraitDirRel));
  for (const ext of CHAR_IMAGE_EXTS) {
    const leaf = `characters/portraits/${charId}${ext}`;
    if (characterImageAbs(leaf)) rels.push(leaf);
  }
  const folder = CHAR_IMAGE_FOLDER_BY_ID[charId];
  if (folder) {
    const folderRel = `Character Images/${folder}`;
    rels.push(...listImageFilesInAbsDir(path.join(CAMPAIGN_DIR, folderRel), folderRel));
  }
  return [...new Set(rels)];
}

function readCharactersRegistryRaw() {
  if (!fs.existsSync(REGISTRY_JSON)) {
    return { version: 0, campaign_id: CAMPAIGN, characters: [], updated_at: null, missing: true };
  }
  try {
    const data = JSON.parse(fs.readFileSync(REGISTRY_JSON, "utf8"));
    data.characters = Array.isArray(data.characters) ? data.characters : [];
    data.campaign_id = data.campaign_id || CAMPAIGN;
    return data;
  } catch (err) {
    return {
      version: 0,
      campaign_id: CAMPAIGN,
      characters: [],
      updated_at: null,
      error: err.message || "parse_failed",
    };
  }
}

function allowedImagePathsForChar(c) {
  const out = [];
  const seen = new Set();
  const push = (p) => {
    const n = normalizeCampaignRelPath(p);
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  push(c.image_path);
  for (const p of Array.isArray(c.images) ? c.images : []) push(p);
  // Registry often has empty image_path on potato — same disk folders as dashboard Chars
  if (!(c.hidden || c.role === "gm")) {
    for (const p of characterPortraitDirs(c.id)) push(p);
  }
  return out;
}

/** Read-only cast payload for map UI — same registry file as dashboard. */
function loadCastRegistry(opts = {}) {
  const includeHidden = Boolean(opts.includeHidden);
  const raw = readCharactersRegistryRaw();
  const byId = new Map();
  for (const c of raw.characters || []) {
    if (c && c.id) byId.set(String(c.id), c);
  }
  const characters = (raw.characters || [])
    .filter((c) => c && c.id && (includeHidden || (!c.hidden && c.role !== "gm")))
    .map((c) => {
      const allowed = allowedImagePathsForChar(c).filter((p) => characterImageAbs(p));
      const primary =
        (normalizeCampaignRelPath(c.image_path) && characterImageAbs(c.image_path)
          ? normalizeCampaignRelPath(c.image_path)
          : null) ||
        preferStillPrimary(allowed) ||
        "";
      const hasImage = Boolean(primary);
      const relations = (Array.isArray(c.relations) ? c.relations : [])
        .map((r) => {
          const toId = String(r.to_id || r.to || "").trim();
          if (!toId) return null;
          const other = byId.get(toId);
          return {
            to_id: toId,
            type: String(r.type || "related").slice(0, 48),
            label: String(r.label || r.type || "related").slice(0, 80),
            to_name: other ? other.display_name || toId : toId,
          };
        })
        .filter(Boolean);
      return {
        id: c.id,
        display_name: c.display_name || c.id,
        role: c.role || "npc",
        status: c.status || "",
        notes: c.notes || "",
        player_name: c.player_name || "",
        aliases: Array.isArray(c.aliases) ? c.aliases : [],
        story_path: c.story_path || "",
        relations,
        image_path: primary,
        images: allowed,
        has_image: hasImage,
        // ponytail: no invented faces — only on-disk registry paths
        image_url: hasImage
          ? `/api/characters/image?id=${encodeURIComponent(c.id)}`
          : null,
        gallery_urls: allowed.map(
          (p) =>
            `/api/characters/image?id=${encodeURIComponent(c.id)}&path=${encodeURIComponent(p)}`
        ),
        hidden: Boolean(c.hidden),
      };
    });
  characters.sort((a, b) =>
    String(a.display_name).localeCompare(String(b.display_name), undefined, { sensitivity: "base" })
  );
  return {
    campaign_id: raw.campaign_id || CAMPAIGN,
    version: raw.version || 0,
    revision: raw.version || 0,
    updated_at: raw.updated_at || null,
    source: "campaigns/" + CAMPAIGN + "/characters-registry.json",
    characters,
    count: characters.length,
    missing: Boolean(raw.missing),
    error: raw.error || null,
  };
}

function findCastCharacter(id) {
  const raw = readCharactersRegistryRaw();
  return (raw.characters || []).find((c) => c && String(c.id) === String(id)) || null;
}

/** Read-only Discord/story sheet markdown for cast detail (ts-f). */
function readCastSheetMarkdown(id) {
  const char = findCastCharacter(id);
  if (!char) return null;
  const sp = String(char.story_path || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!sp || sp.includes("..") || !sp.toLowerCase().endsWith(".md")) {
    return {
      id: char.id,
      display_name: char.display_name || char.id,
      story_path: sp || "",
      markdown: "",
      error: "no_sheet",
    };
  }
  const prefix = `campaigns/${CAMPAIGN}/`;
  let abs = null;
  if (sp.startsWith(prefix)) {
    abs = path.join(REPO, sp);
  } else {
    const rel = normalizeCampaignRelPath(sp);
    if (rel) abs = path.join(CAMPAIGN_DIR, rel);
  }
  if (!abs) {
    return {
      id: char.id,
      display_name: char.display_name || char.id,
      story_path: sp,
      markdown: "",
      error: "bad_path",
    };
  }
  const rootOk =
    abs.startsWith(path.join(REPO, "campaigns", CAMPAIGN) + path.sep) ||
    abs.startsWith(CAMPAIGN_DIR + path.sep);
  if (!rootOk || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return {
      id: char.id,
      display_name: char.display_name || char.id,
      story_path: sp,
      markdown: "",
      error: "not_found",
    };
  }
  // ponytail: 400k ceiling — sheets are design-doc grade but avoid RAM blowups on 2GB box
  const raw = fs.readFileSync(abs, "utf8");
  const markdown = raw.length > 400000 ? raw.slice(0, 400000) + "\n\n…(truncated)" : raw;
  return {
    id: char.id,
    display_name: char.display_name || char.id,
    story_path: sp,
    markdown,
    bytes: Buffer.byteLength(markdown, "utf8"),
  };
}

function cleanWorldText(v, max) {
  return String(v == null ? "" : v).replace(/\s+$/,"").slice(0, max || 2000);
}

function slugifyCharacterId(name) {
  const slug = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || `character-${Date.now()}`;
}

function normalizeStoryPathInput(v) {
  const s = String(v || "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!s) return "";
  if (s.includes("..") || path.isAbsolute(s) || !s.toLowerCase().endsWith(".md")) {
    throw new Error("story_path must be a campaign-relative .md path");
  }
  return s;
}

function normalizeWorldRelations(input, raw) {
  const ids = new Set((raw.characters || []).map((c) => String(c.id)));
  const out = [];
  const seen = new Set();
  for (const r of Array.isArray(input) ? input : []) {
    const to_id = String(r && (r.to_id || r.to) || "").trim();
    if (!to_id || !ids.has(to_id)) continue;
    const type = String(r.type || "related").trim().slice(0, 48) || "related";
    const label = String(r.label || type).trim().slice(0, 80);
    const key = to_id.toLowerCase() + "::" + type.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ to_id, type, label });
  }
  return out;
}

/** Full-page World studio write path — version-checked, locked, revision-backed. */
function patchWorldCharacter(payload) {
  const raw = readCharactersRegistryRaw();
  if (raw.error) throw new Error("registry_read_failed: " + raw.error);
  raw.characters = Array.isArray(raw.characters) ? raw.characters : [];
  const baseVersion = payload.base_version;
  let id = String(payload.id || "").trim();
  let row = null;

  if (payload.create === true) {
    const name = cleanWorldText(payload.display_name, 120);
    if (!name) throw new Error("display_name required");
    id = slugifyCharacterId(name);
    let n = 2;
    while (raw.characters.some((c) => c && String(c.id) === id)) {
      id = `${slugifyCharacterId(name)}-${n++}`;
    }
    row = {
      id,
      display_name: name,
      role: "npc",
      status: "draft",
      notes: "",
      player_name: "",
      aliases: [],
      relations: [],
      images: [],
      image_path: "",
      hidden: false,
      created_at: new Date().toISOString(),
    };
    raw.characters.push(row);
  } else {
    if (!id) throw new Error("id required");
    row = raw.characters.find((c) => c && String(c.id) === id);
    if (!row) throw new Error("character_not_found");
  }

  if (payload.create !== true) {
    if (payload.display_name !== undefined) {
      const name = cleanWorldText(payload.display_name, 120);
      if (!name) throw new Error("display_name required");
      row.display_name = name;
    }
    if (payload.role !== undefined) {
      const role = String(payload.role || "").trim();
      if (!["pc", "npc", "side", "gm"].includes(role)) throw new Error("bad role");
      row.role = role;
    }
    if (payload.status !== undefined) row.status = cleanWorldText(payload.status, 60);
    if (payload.player_name !== undefined) row.player_name = cleanWorldText(payload.player_name, 80);
    if (payload.aliases !== undefined) {
      row.aliases = (Array.isArray(payload.aliases) ? payload.aliases : [])
        .map((a) => cleanWorldText(a, 80))
        .filter(Boolean)
        .filter((a, i, arr) => arr.findIndex((x) => x.toLowerCase() === a.toLowerCase()) === i);
    }
    if (payload.story_path !== undefined) row.story_path = normalizeStoryPathInput(payload.story_path);
    if (payload.image_path !== undefined) {
      const img = normalizeCampaignRelPath(payload.image_path || "");
      if (img && !characterImageAbs(img)) throw new Error("image_path not on disk");
      row.image_path = img;
    }
    if (payload.hidden !== undefined) row.hidden = payload.hidden === true;
    if (payload.notes !== undefined) row.notes = cleanWorldText(payload.notes, 20000);
    if (payload.relations !== undefined) row.relations = normalizeWorldRelations(payload.relations, raw);
    row.updated_at = new Date().toISOString();
  }

  const written = writeRegistryFile({
    absPath: REGISTRY_JSON,
    data: raw,
    repoRoot: REPO,
    campaignId: CAMPAIGN,
    baseVersion,
    preserveUnknownIds: true,
    lockHolder: `tableslop-world:${process.pid}`,
    lockNote: "world page character patch",
  });
  return { ok: true, id, version: written.version, updated_at: written.updated_at };
}

/** Bulk soft-patch only (hidden / status / role). Soft-hide only — never wipe registry. */
function bulkWorldCharacters(payload) {
  const ids = Array.isArray(payload.ids) ? payload.ids.map((x) => String(x)).filter(Boolean) : [];
  if (!ids.length) throw new Error("ids required");
  if (ids.length > 200) throw new Error("too many ids");
  const patch = payload.patch && typeof payload.patch === "object" ? payload.patch : {};
  const allowed = {};
  if (patch.hidden !== undefined) allowed.hidden = patch.hidden === true;
  if (patch.status !== undefined) allowed.status = cleanWorldText(patch.status, 60);
  if (patch.role !== undefined) {
    const role = String(patch.role || "").trim();
    if (!["pc", "npc", "side", "gm"].includes(role)) throw new Error("bad role");
    allowed.role = role;
  }
  if (!Object.keys(allowed).length) throw new Error("empty patch");
  const raw = readCharactersRegistryRaw();
  if (raw.error) throw new Error("registry_read_failed: " + raw.error);
  raw.characters = Array.isArray(raw.characters) ? raw.characters : [];
  const idSet = new Set(ids);
  let updated = 0;
  const now = new Date().toISOString();
  for (const row of raw.characters) {
    if (!row || !idSet.has(String(row.id))) continue;
    if (allowed.hidden !== undefined) row.hidden = allowed.hidden;
    if (allowed.status !== undefined) row.status = allowed.status;
    if (allowed.role !== undefined) row.role = allowed.role;
    row.updated_at = now;
    updated += 1;
  }
  if (!updated) throw new Error("no_matching_ids");
  const written = writeRegistryFile({
    absPath: REGISTRY_JSON,
    data: raw,
    repoRoot: REPO,
    campaignId: CAMPAIGN,
    baseVersion: payload.base_version,
    preserveUnknownIds: true,
    lockHolder: `tableslop-world-bulk:${process.pid}`,
    lockNote: "world page character bulk patch",
  });
  return { ok: true, updated, version: written.version, updated_at: written.updated_at };
}

/** Decode portrait data URL (png/jpeg/webp/gif). No URL fetch — client sends bytes. */
function decodeIngestPortraitDataUrl(dataUrl) {
  const raw = String(dataUrl || "");
  if (!raw) return null;
  const m = /^data:(image\/(png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i.exec(raw);
  if (!m) throw new Error("image must be png/jpeg/webp/gif data URL");
  const kind = m[2].toLowerCase();
  const ext = kind === "jpeg" || kind === "jpg" ? "jpg" : kind;
  const buf = Buffer.from(m[3], "base64");
  if (buf.length > WORLD_PORTRAIT_MAX) throw new Error("image too large (max 4MB decoded)");
  if (!buf.length) throw new Error("empty image");
  return { buf, ext };
}

function writeIngestPortraitFile(charId, dataUrl, filenameHint) {
  const decoded = decodeIngestPortraitDataUrl(dataUrl);
  if (!decoded) return "";
  let ext = decoded.ext;
  const hint = String(filenameHint || "").toLowerCase();
  const hintExt = path.extname(hint).replace(/^\./, "");
  if (hintExt && ["png", "jpg", "jpeg", "webp", "gif"].includes(hintExt)) {
    ext = hintExt === "jpeg" ? "jpg" : hintExt;
  }
  const stamp = Date.now();
  const relDir = `characters/portraits/${charId}`;
  const absDir = path.join(CAMPAIGN_DIR, relDir);
  fs.mkdirSync(absDir, { recursive: true });
  const fname = `ingest-${stamp}.${ext}`;
  const abs = path.join(absDir, fname);
  fs.writeFileSync(abs, decoded.buf);
  return `${relDir}/${fname}`.replace(/\\/g, "/");
}

function writeIngestSheetFile(charId, markdown) {
  const md = String(markdown || "");
  if (!md.trim()) return "";
  const primaryRel = `characters/${charId}.md`;
  const primaryAbs = path.join(CAMPAIGN_DIR, primaryRel);
  let rel = primaryRel;
  let abs = primaryAbs;
  if (fs.existsSync(primaryAbs)) {
    rel = `characters/${charId}-quick-create.md`;
    abs = path.join(CAMPAIGN_DIR, rel);
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, md.endsWith("\n") ? md : md + "\n", "utf8");
  return rel.replace(/\\/g, "/");
}

/** Quick-create / attach-portrait — store-only, no LLM. */
function ingestWorldCharacter(payload) {
  const raw = readCharactersRegistryRaw();
  if (raw.error) throw new Error("registry_read_failed: " + raw.error);
  raw.characters = Array.isArray(raw.characters) ? raw.characters : [];
  const baseVersion = payload.base_version;
  const attachOnly = payload.attach_only === true;
  let id = String(payload.id || "").trim();
  let row = null;
  let imagePath = "";
  let storyPath = "";

  if (attachOnly) {
    if (!id) throw new Error("id required");
    row = raw.characters.find((c) => c && String(c.id) === id);
    if (!row) throw new Error("character_not_found");
    if (!payload.image_data_url) throw new Error("image_data_url required");
    imagePath = writeIngestPortraitFile(id, payload.image_data_url, payload.image_filename);
    row.image_path = imagePath;
    row.images = Array.isArray(row.images) ? row.images : [];
    if (!row.images.includes(imagePath)) row.images.push(imagePath);
    row.updated_at = new Date().toISOString();
  } else {
    const name = cleanWorldText(payload.display_name, 120);
    if (!name) throw new Error("display_name required");
    id = slugifyCharacterId(name);
    let n = 2;
    while (raw.characters.some((c) => c && String(c.id) === id)) {
      id = `${slugifyCharacterId(name)}-${n++}`;
    }
    const roleRaw = String(payload.role || "npc").trim();
    const role = ["pc", "npc", "side", "gm"].includes(roleRaw) ? roleRaw : "npc";
    const aliases = (Array.isArray(payload.aliases) ? payload.aliases : [])
      .map((a) => cleanWorldText(a, 80))
      .filter(Boolean)
      .filter((a, i, arr) => arr.findIndex((x) => x.toLowerCase() === a.toLowerCase()) === i);
    row = {
      id,
      display_name: name,
      role,
      status: cleanWorldText(payload.status, 60) || "draft",
      notes: cleanWorldText(payload.notes, 20000),
      player_name: cleanWorldText(payload.player_name, 80),
      aliases,
      relations: [],
      images: [],
      image_path: "",
      hidden: payload.hidden === true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (payload.image_data_url) {
      imagePath = writeIngestPortraitFile(id, payload.image_data_url, payload.image_filename);
      row.image_path = imagePath;
      row.images.push(imagePath);
    }
    if (payload.write_sheet && String(payload.sheet_markdown || "").trim()) {
      storyPath = writeIngestSheetFile(id, payload.sheet_markdown);
      if (storyPath && !row.story_path) row.story_path = storyPath;
    }
    raw.characters.push(row);
  }

  const written = writeRegistryFile({
    absPath: REGISTRY_JSON,
    data: raw,
    repoRoot: REPO,
    campaignId: CAMPAIGN,
    baseVersion,
    preserveUnknownIds: true,
    lockHolder: `tableslop-world-ingest:${process.pid}`,
    lockNote: "world page quick create / portrait attach",
  });
  const out = {
    ok: true,
    id,
    version: written.version,
    attach_only: attachOnly || undefined,
  };
  if (imagePath) out.image_path = imagePath;
  if (storyPath) out.story_path = storyPath;
  else if (row.story_path && !attachOnly) out.story_path = row.story_path;
  return out;
}

function readEntitiesRaw() {
  if (!fs.existsSync(ENTITIES_JSON)) {
    return { version: 0, campaign: CAMPAIGN, setting: "Isla Primavera", updated_at: null, entities: [], missing: true };
  }
  try {
    const data = JSON.parse(fs.readFileSync(ENTITIES_JSON, "utf8"));
    data.entities = Array.isArray(data.entities) ? data.entities : [];
    return data;
  } catch (e) {
    return { version: 0, campaign: CAMPAIGN, entities: [], error: e.message };
  }
}

function cleanWorldStringList(input, max) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(input) ? input : []) {
    const s = cleanWorldText(raw, max || 120);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function writeEntitiesFile(data, baseVersion) {
  const resource = `wiki-entities:${CAMPAIGN}`;
  const holder = `tableslop-world-entities:${process.pid}`;
  acquireStateLock({ repoRoot: REPO, resource, holder, note: "world page entities patch", wait: true });
  try {
    let onDisk = null;
    if (fs.existsSync(ENTITIES_JSON)) {
      try {
        onDisk = JSON.parse(fs.readFileSync(ENTITIES_JSON, "utf8"));
      } catch {
        onDisk = null;
      }
    }
    if (baseVersion !== undefined && baseVersion !== null && baseVersion !== "") {
      const disk = onDisk && Number.isFinite(Number(onDisk.version)) ? Math.floor(Number(onDisk.version)) : 0;
      const base = Math.floor(Number(baseVersion));
      if (base !== disk) {
        throw VersionConflictError("version_conflict", {
          disk_version: disk,
          base_version: base,
          hint: "Reload Places, then retry. Stale multitask write refused.",
        });
      }
    }
    const prevVer = onDisk && Number.isFinite(Number(onDisk.version)) ? Math.floor(Number(onDisk.version)) : 0;
    const version = prevVer + 1;
    if (onDisk) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const revDir = path.join(REPO, "agents", "state", "wiki-entities-revisions", CAMPAIGN);
      fs.mkdirSync(revDir, { recursive: true });
      fs.writeFileSync(path.join(revDir, `v${prevVer}-${ts}.json`), JSON.stringify(onDisk, null, 2) + "\n");
      try {
        fs.writeFileSync(`${ENTITIES_JSON}.bak-${ts}`, JSON.stringify(onDisk, null, 2) + "\n");
      } catch {
        /* ignore */
      }
    }
    data.version = version;
    data.updated_at = new Date().toISOString();
    data.campaign = data.campaign || CAMPAIGN;
    data.entities = Array.isArray(data.entities) ? data.entities : [];
    fs.writeFileSync(ENTITIES_JSON, JSON.stringify(data, null, 2) + "\n");
    return data;
  } finally {
    try {
      releaseStateLock({ repoRoot: REPO, resource, holder });
    } catch {
      /* ignore */
    }
  }
}

function patchWorldEntity(payload) {
  const raw = readEntitiesRaw();
  if (raw.error) throw new Error("entities_read_failed: " + raw.error);
  raw.entities = Array.isArray(raw.entities) ? raw.entities : [];
  let id = String(payload.id || "").trim();
  let row = null;

  if (payload.create === true) {
    const name = cleanWorldText(payload.name, 120);
    if (!name) throw new Error("name required");
    const kind = cleanWorldText(payload.kind, 40) || "place";
    id = slugifyCharacterId(`${kind}-${name}`);
    let n = 2;
    while (raw.entities.some((e) => e && String(e.id) === id)) {
      id = `${slugifyCharacterId(`${kind}-${name}`)}-${n++}`;
    }
    row = {
      id,
      kind,
      name,
      aliases: [],
      location: null,
      region_id: null,
      facts: [],
      when: null,
      related_ids: [],
      created_at: new Date().toISOString(),
    };
    raw.entities.push(row);
  } else {
    if (!id) throw new Error("id required");
    row = raw.entities.find((e) => e && String(e.id) === id);
    if (!row) throw new Error("entity_not_found");
  }

  if (payload.name !== undefined) {
    const name = cleanWorldText(payload.name, 120);
    if (!name) throw new Error("name required");
    row.name = name;
  }
  if (payload.kind !== undefined) {
    const kind = cleanWorldText(payload.kind, 40);
    if (!kind) throw new Error("kind required");
    row.kind = kind;
  }
  if (payload.aliases !== undefined) row.aliases = cleanWorldStringList(payload.aliases, 80);
  if (payload.location !== undefined) row.location = cleanWorldText(payload.location, 200) || null;
  if (payload.region_id !== undefined) row.region_id = cleanWorldText(payload.region_id, 80) || null;
  if (payload.facts !== undefined) row.facts = cleanWorldStringList(payload.facts, 500);
  if (payload.related_ids !== undefined) {
    const known = new Set(raw.entities.map((e) => String(e && e.id)));
    row.related_ids = cleanWorldStringList(payload.related_ids, 120).filter((relId) => known.has(relId));
  }
  row.updated_at = new Date().toISOString();

  const written = writeEntitiesFile(raw, payload.base_version);
  return { ok: true, id, version: written.version, updated_at: written.updated_at };
}

/** Bulk patch kind / region_id only. */
function bulkWorldEntities(payload) {
  const ids = Array.isArray(payload.ids) ? payload.ids.map((x) => String(x)).filter(Boolean) : [];
  if (!ids.length) throw new Error("ids required");
  if (ids.length > 400) throw new Error("too many ids");
  const patch = payload.patch && typeof payload.patch === "object" ? payload.patch : {};
  const allowed = {};
  if (patch.kind !== undefined) {
    const kind = cleanWorldText(patch.kind, 40);
    if (!kind) throw new Error("kind required");
    allowed.kind = kind;
  }
  if (patch.region_id !== undefined) allowed.region_id = cleanWorldText(patch.region_id, 80) || null;
  if (!Object.keys(allowed).length) throw new Error("empty patch");
  const raw = readEntitiesRaw();
  if (raw.error) throw new Error("entities_read_failed: " + raw.error);
  raw.entities = Array.isArray(raw.entities) ? raw.entities : [];
  const idSet = new Set(ids);
  let updated = 0;
  const now = new Date().toISOString();
  for (const row of raw.entities) {
    if (!row || !idSet.has(String(row.id))) continue;
    if (allowed.kind !== undefined) row.kind = allowed.kind;
    if (allowed.region_id !== undefined) row.region_id = allowed.region_id;
    row.updated_at = now;
    updated += 1;
  }
  if (!updated) throw new Error("no_matching_ids");
  const written = writeEntitiesFile(raw, payload.base_version);
  return { ok: true, updated, version: written.version, updated_at: written.updated_at };
}

function sha256Text(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

function worldPageAbs(rel) {
  const s = String(rel || "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!s || s.includes("..") || path.isAbsolute(s) || !s.toLowerCase().endsWith(".md")) {
    throw new Error("bad page path");
  }
  const abs = path.resolve(CAMPAIGN_DIR, s);
  const relToCampaign = path.relative(CAMPAIGN_DIR, abs).replace(/\\/g, "/");
  if (relToCampaign.startsWith("..") || path.isAbsolute(relToCampaign)) {
    throw new Error("bad page path");
  }
  const root = relToCampaign.split("/")[0];
  if (!WORLD_PAGE_ROOTS.includes(root)) {
    throw new Error("page root not editable");
  }
  return { abs, rel: relToCampaign };
}

function listWorldPages() {
  const out = [];
  for (const root of WORLD_PAGE_ROOTS) {
    const rootAbs = path.join(CAMPAIGN_DIR, root);
    if (!fs.existsSync(rootAbs)) continue;
    const stack = [rootAbs];
    while (stack.length && out.length < 800) {
      const dir = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ent of entries) {
        const abs = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name.startsWith(".") || ent.name === "node_modules") continue;
          stack.push(abs);
          continue;
        }
        if (!ent.isFile() || !ent.name.toLowerCase().endsWith(".md")) continue;
        const rel = path.relative(CAMPAIGN_DIR, abs).replace(/\\/g, "/");
        let st = null;
        try {
          st = fs.statSync(abs);
        } catch {
          st = null;
        }
        out.push({ path: rel, bytes: st ? st.size : 0, mtime: st ? st.mtime.toISOString() : null });
        if (out.length >= 800) break;
      }
    }
  }
  out.sort((a, b) => String(a.path).localeCompare(String(b.path)));
  return out;
}

function readWorldPage(rel) {
  const { abs, rel: safeRel } = worldPageAbs(rel);
  if (!fs.existsSync(abs)) throw new Error("page_not_found");
  const raw = fs.readFileSync(abs, "utf8");
  const truncated = raw.length > 400000;
  const content = truncated ? raw.slice(0, 400000) + "\n\n…(truncated)" : raw;
  return {
    path: safeRel,
    content,
    sha256: sha256Text(raw),
    bytes: Buffer.byteLength(raw, "utf8"),
    truncated,
  };
}

function writeWorldPage(rel, content, baseSha256) {
  const { abs, rel: safeRel } = worldPageAbs(rel);
  if (!fs.existsSync(abs)) throw new Error("page_not_found");
  const cur = fs.readFileSync(abs, "utf8");
  const curSha = sha256Text(cur);
  if (baseSha256 && baseSha256 !== curSha) {
    const err = new Error("page_conflict");
    err.code = "page_conflict";
    err.detail = { path: safeRel };
    throw err;
  }
  const next = String(content == null ? "" : content);
  if (Buffer.byteLength(next, "utf8") > 400000) throw new Error("page too large");
  const resource = `world-page:${CAMPAIGN}`;
  const holder = `tableslop-world-page:${process.pid}`;
  acquireStateLock({ repoRoot: REPO, resource, holder, note: `write ${safeRel}`, wait: true });
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    try {
      fs.writeFileSync(`${abs}.bak-${ts}`, cur);
    } catch {
      /* ignore */
    }
    fs.writeFileSync(abs, next);
    return { ok: true, path: safeRel, sha256: sha256Text(next), bytes: Buffer.byteLength(next, "utf8") };
  } finally {
    try {
      releaseStateLock({ repoRoot: REPO, resource, holder });
    } catch {
      /* ignore */
    }
  }
}

function findMyCharacter(discordId, username) {
  const raw = readCharactersRegistryRaw();
  const chars = Array.isArray(raw.characters) ? raw.characters : [];
  const id = String(discordId || "").trim();
  const uname = String(username || "").trim().toLowerCase();
  if (id) {
    const byId = chars.find(
      (c) => c && !c.hidden && String(c.discord_user_id || "").trim() === id
    );
    if (byId) {
      return { id: byId.id, display_name: byId.display_name || byId.id };
    }
  }
  if (uname) {
    // Fallback: Discord username on PC rows (ids often empty until GM fills them).
    const byName = chars.find((c) => {
      if (!c || c.hidden) return false;
      const role = String(c.role || "").toLowerCase();
      if (role !== "pc" && String(c.status || "").toLowerCase() !== "pc") return false;
      return String(c.discord_username || "").trim().toLowerCase() === uname;
    });
    if (byName) {
      return { id: byName.id, display_name: byName.display_name || byName.id };
    }
  }
  return null;
}

function mePayload(req) {
  const session = sessionFromReq(req);
  const loggedIn = Boolean(session && session.id && session.id !== "public");
  const role = loggedIn ? session.role || "user" : null;
  const canEdit = !AUTH_GATING || Boolean(role && EDIT_ROLES.has(role));
  let myCharacter = null;
  if (loggedIn) {
    try {
      myCharacter = findMyCharacter(session.id, session.username);
    } catch (_) {
      myCharacter = null;
    }
  }
  return {
    logged_in: loggedIn,
    id: loggedIn ? session.id : null,
    username: loggedIn ? session.username : null,
    role,
    avatar: loggedIn ? session.avatar || "" : null,
    can_edit: canEdit,
    my_character: myCharacter,
    auth_gating: AUTH_GATING,
    dev_auth: DEV_AUTH,
    discord_auth_required: REQUIRE_AUTH,
    discord_configured: OAUTH_CONFIGURED,
    profile_storage: "client-v1",
    cloud_save: false,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** GM polygon stats — gate empty/stub writes (REGIONS-UI-LOCK.md). */
function countGmPolyStats(ui) {
  const areas = ui && ui.areas ? ui.areas : [];
  let polyCount = 0;
  let totalVerts = 0;
  for (const a of areas) {
    if (!a || a.shape === "ellipse") continue;
    const n = parseAreaPointsServer(String(a.points || "")).length;
    if (n >= 3) {
      polyCount += 1;
      totalVerts += n;
    }
  }
  return { polyCount, totalVerts };
}

/** Write regions-ui.json with autosave bak + refuse GM polygon wipe.
 *  Allows GM to simplify an existing border (fewer verts on the edited id).
 *  Still refuses: wiping all polys, dropping a sibling poly, or shrinking a
 *  sibling that was not part of this write. */
function writeRegionsUiJson(ui, reason) {
  if (fs.existsSync(REGIONS_UI_JSON)) {
    const prev = JSON.parse(fs.readFileSync(REGIONS_UI_JSON, "utf8"));
    const prevStats = countGmPolyStats(prev);
    const nextStats = countGmPolyStats(ui);
    if (prevStats.polyCount > 0 && nextStats.polyCount === 0) {
      throw new Error(
        "refusing regions-ui write (" +
          reason +
          "): would wipe " +
          prevStats.polyCount +
          " GM polygon(s)"
      );
    }
    if (nextStats.polyCount < prevStats.polyCount) {
      throw new Error(
        "refusing regions-ui write (" +
          reason +
          "): polygon count " +
          prevStats.polyCount +
          " → " +
          nextStats.polyCount +
          " (sibling border would disappear)"
      );
    }
    // Per-id sibling shrink guard: any previously-drawn poly that still exists
    // must not lose verts unless this write is saveRegionAreas for that same id
    // (handled below by only comparing ids that are present in both and not the
    // sole changed area). For bulk writers (coords sync), refuse any per-id drop.
    const prevById = new Map();
    for (const a of prev.areas || []) {
      if (!a || !a.id || a.shape === "ellipse") continue;
      const n = parseAreaPointsServer(String(a.points || "")).length;
      if (n >= 3) prevById.set(String(a.id), n);
    }
    const nextById = new Map();
    for (const a of ui.areas || []) {
      if (!a || !a.id || a.shape === "ellipse") continue;
      const n = parseAreaPointsServer(String(a.points || "")).length;
      if (n >= 3) nextById.set(String(a.id), n);
    }
    const editedId =
      reason === "saveRegionAreas" && ui._last_saved_id
        ? String(ui._last_saved_id)
        : null;
    for (const [id, prevN] of prevById) {
      if (editedId && id === editedId) continue; // GM may simplify the active border
      const nextN = nextById.get(id);
      if (nextN == null) {
        throw new Error(
          "refusing regions-ui write (" +
            reason +
            "): would drop sibling border " +
            id +
            " (" +
            prevN +
            " pts)"
        );
      }
      if (nextN < prevN) {
        throw new Error(
          "refusing regions-ui write (" +
            reason +
            "): sibling " +
            id +
            " verts " +
            prevN +
            " → " +
            nextN
        );
      }
    }
  }
  if (ui && ui._last_saved_id) delete ui._last_saved_id;
  if (fs.existsSync(REGIONS_UI_JSON)) {
    try {
      const bak =
        REGIONS_UI_JSON +
        ".bak-autosave-" +
        new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) +
        "Z";
      fs.copyFileSync(REGIONS_UI_JSON, bak);
    } catch (_) {
      /* bak best-effort */
    }
  }
  fs.writeFileSync(REGIONS_UI_JSON, JSON.stringify(ui, null, 2) + "\n");
}

/** Persist one GM-drawn region polygon → regions-ui.json */
function saveRegionAreas(bodyStr) {
  const payload = JSON.parse(bodyStr || "{}");
  const area = payload.area;
  if (!area || typeof area !== "object" || !area.id) {
    throw new Error("area object with id required");
  }
  const nextId = String(area.id);
  const pts = String(area.points || "").trim();
  const ptCount = parseAreaPointsServer(pts).length;
  if (area.shape === "polygon" || area.shape == null) {
    if (ptCount < 3) {
      throw new Error(
        "polygon needs ≥3 finite vertices (got " + ptCount + ") — refusing empty/clear save"
      );
    }
  }

  let ui = {
    version: 1,
    viewBox: "0 0 100 100",
    areas: [],
    enabled: true,
  };
  if (fs.existsSync(REGIONS_UI_JSON)) {
    ui = JSON.parse(fs.readFileSync(REGIONS_UI_JSON, "utf8"));
  }
  ui.areas = ui.areas || [];

  // Hard rule: never zero-out an existing GM polygon (unless explicit allow_clear).
  const prevIx = ui.areas.findIndex((a) => a && a.id === nextId);
  const prev = prevIx >= 0 ? ui.areas[prevIx] : null;
  if (prev && prev.shape === "polygon") {
    const prevCount = parseAreaPointsServer(String(prev.points || "")).length;
    if (prevCount >= 3 && ptCount < 3 && payload.allow_clear !== true) {
      throw new Error(
        "refusing to clear existing border for " + nextId + " (" + prevCount + " pts) — set allow_clear to confirm"
      );
    }
  }

  // Never touch sibling regions — only merge into nextId.
  // Fill/stroke always follow this region's city palette (not a mis-bound sibling color).
  const paint = regionShadePaint(area.region);
  const next = {
    id: nextId,
    region: area.region != null ? area.region : undefined,
    name: String(area.name || area.id),
    shape: area.shape || "polygon",
    points: pts,
    stroke: paint.stroke,
    fill: paint.fill,
    note: area.note || ("GM Draw borders " + new Date().toISOString().slice(0, 10)),
  };
  if (next.region === undefined) delete next.region;

  // Auto-bak before every write (recover from wipe) — handled in writeRegionsUiJson.
  if (prevIx >= 0) ui.areas[prevIx] = { ...ui.areas[prevIx], ...next };
  else ui.areas.push(next);

  if (payload.enabled === true || payload.enabled === false) ui.enabled = payload.enabled;
  else ui.enabled = true;
  ui.version = Number(ui.version || 1) + 1;
  ui.updated_at = new Date().toISOString().slice(0, 10);
  ui._doc =
    "Selectable SVG areas — GM Draw borders owns live polygons. Draft auto geometry: regions-ui.draft.json";
  ui.draft_backup = "map/regions-ui.draft.json";
  ui._last_saved_id = nextId; // writeRegionsUiJson may simplify this id's verts
  writeRegionsUiJson(ui, "saveRegionAreas");
  mapJsonCache = { mapMtimeMs: 0, regionsMtimeMs: 0, data: null };
  return { ok: true, id: next.id, version: ui.version, updated_at: ui.updated_at, points: ptCount };
}

/** Persist dragged pin coords → coords.json, map.json, regions-ui.json */
function saveMapCoords(bodyStr) {
  const payload = JSON.parse(bodyStr);
  const regions = payload.regions;
  if (!regions || typeof regions !== "object") throw new Error("regions object required");

  let coords = { version: 1, regions: {} };
  if (fs.existsSync(COORDS_JSON)) {
    coords = JSON.parse(fs.readFileSync(COORDS_JSON, "utf8"));
  }
  coords.regions = coords.regions || {};
  for (const [id, c] of Object.entries(regions)) {
    if (c.x_pct == null || c.y_pct == null) continue;
    coords.regions[id] = {
      ...(coords.regions[id] || {}),
      x_pct: +Number(c.x_pct).toFixed(2),
      y_pct: +Number(c.y_pct).toFixed(2),
      anchor: "manual-drag",
    };
  }
  coords.updated_at = new Date().toISOString().slice(0, 10);
  coords.method = "manual edit mode";
  fs.writeFileSync(COORDS_JSON, JSON.stringify(coords, null, 2) + "\n");

  const mapData = JSON.parse(fs.readFileSync(MAP_JSON, "utf8"));
  mapData.markers = (mapData.markers || []).map((m) => {
    const c = regions[m.id];
    if (!c || c.x_pct == null || c.y_pct == null) return m;
    // One coord pair: drop duplicate label_* so names cannot drift from pins.
    const next = { ...m, x_pct: +Number(c.x_pct).toFixed(2), y_pct: +Number(c.y_pct).toFixed(2), coord_status: "manual" };
    delete next.label_x_pct;
    delete next.label_y_pct;
    delete next.label_dy_pct;
    return next;
  });
  mapData.updated_at = coords.updated_at;
  fs.writeFileSync(MAP_JSON, JSON.stringify(mapData, null, 2) + "\n");

  if (fs.existsSync(REGIONS_UI_JSON)) {
    const ui = JSON.parse(fs.readFileSync(REGIONS_UI_JSON, "utf8"));
    ui.areas = (ui.areas || []).map((a) => {
      const c = regions[a.id];
      if (!c || c.x_pct == null || c.y_pct == null) return a;
      // Pin drag updates ellipse centers only — never clobber digitized polygons.
      if (a.shape === "polygon") return a;
      return { ...a, cx: +Number(c.x_pct).toFixed(2), cy: +Number(c.y_pct).toFixed(2) };
    });
    writeRegionsUiJson(ui, "saveMapCoords");
  }

  mapJsonCache = { mapMtimeMs: 0, regionsMtimeMs: 0, data: null };
  return { ok: true, saved: Object.keys(regions).length, updated_at: coords.updated_at };
}

/** Paste/screenshot feedback → reports/tableslop-feedback + open user-task (ponytail path). */
function saveMapFeedback(bodyStr) {
  const payload = JSON.parse(bodyStr || "{}");
  const note = String(payload.note || "").trim().slice(0, 800);
  const dataUrl = String(payload.image_data_url || "");
  const highlight = payload.highlight && typeof payload.highlight === "object" ? payload.highlight : null;
  const activeRegion = payload.active_region ? String(payload.active_region).slice(0, 80) : null;
  if (!note && !dataUrl) throw new Error("note or image required");

  fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = `ts-fb-${stamp}`;
  let screenshotRel = "";
  let screenshotAbs = "";

  if (dataUrl) {
    const m = /^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
    if (!m) throw new Error("image must be png/jpeg/webp data URL");
    const ext = m[2].toLowerCase() === "jpeg" || m[2].toLowerCase() === "jpg" ? "jpg" : m[2].toLowerCase();
    const buf = Buffer.from(m[3], "base64");
    if (buf.length > FEEDBACK_MAX_BYTES) throw new Error("image too large (max ~2.5MB)");
    const fname = `${id}.${ext}`;
    screenshotAbs = path.join(FEEDBACK_DIR, fname);
    fs.writeFileSync(screenshotAbs, buf);
    screenshotRel = path.join("reports", "tableslop-feedback", fname).replace(/\\/g, "/");
  }

  const meta = {
    id,
    created_at: new Date().toISOString(),
    note,
    screenshot: screenshotRel || null,
    highlight,
    active_region: activeRegion,
    map_title: String(payload.map_title || "Isla Primavera").slice(0, 120),
  };
  fs.writeFileSync(path.join(FEEDBACK_DIR, `${id}.json`), JSON.stringify(meta, null, 2) + "\n");

  const titleBit = note ? note.slice(0, 72) : "map screenshot feedback";
  const task = {
    id,
    title: `tableslop feedback: ${titleBit}`,
    body:
      `Map feedback from map.tableslop.org.\n\n` +
      `Note: ${note || "(none)"}\n` +
      `Screenshot: ${screenshotRel || "(none)"}\n` +
      `Highlight (viewport %): ${highlight ? JSON.stringify(highlight) : "(none)"}\n` +
      `Active region: ${activeRegion || "(none)"}\n` +
      `Meta: reports/tableslop-feedback/${id}.json`,
    status: "open",
    project_id: "tableslop",
    tags: ["tableslop", "map-feedback"],
    context: {
      campaign: CAMPAIGN,
      story_path: screenshotRel || `reports/tableslop-feedback/${id}.json`,
    },
    created_at: meta.created_at,
    updated_at: meta.created_at,
  };

  if (fs.existsSync(USER_TASKS_JSON)) {
    const raw = JSON.parse(fs.readFileSync(USER_TASKS_JSON, "utf8"));
    if (!Array.isArray(raw.tasks)) raw.tasks = [];
    raw.tasks.unshift(task);
    raw.updated_at = meta.created_at;
    fs.writeFileSync(USER_TASKS_JSON, JSON.stringify(raw, null, 2) + "\n");
  }

  return {
    ok: true,
    task_id: id,
    screenshot_rel: screenshotRel || null,
    meta_rel: `reports/tableslop-feedback/${id}.json`,
  };
}

async function handleRequest(req, res) {
  const url = req.url.split("?")[0];
  const q = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  // Player campaign trackers live on linuxbox :8768 — expose via public map host as /camp/*
  // so players do not need potato MagicDNS. Canonical host remains campaigns.tableslop.org.
  if (url === "/camp" || url === "/camp/" || url.startsWith("/camp/")) {
    const suffix = url === "/camp" || url === "/camp/" ? "/" : url.slice("/camp".length);
    const target = new URL(suffix + (q.search || ""), CAMPAIGNS_ORIGIN);
    try {
      await new Promise((resolve, reject) => {
        const headers = { ...req.headers, host: target.host };
        delete headers["accept-encoding"];
        headers["x-forwarded-prefix"] = "/camp";
        headers["x-forwarded-host"] = req.headers.host || "";
        const preq = http.request(
          {
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port || 80,
            path: target.pathname + target.search,
            method: req.method,
            headers,
          },
          (pres) => {
            const outHeaders = { ...pres.headers };
            // Fix Location redirects back under /camp
            if (outHeaders.location) {
              try {
                const loc = new URL(outHeaders.location, CAMPAIGNS_ORIGIN);
                if (loc.origin === new URL(CAMPAIGNS_ORIGIN).origin) {
                  outHeaders.location = "/camp" + loc.pathname + loc.search;
                }
              } catch {
                /* keep */
              }
            }
            res.writeHead(pres.statusCode || 502, outHeaders);
            pres.pipe(res);
            pres.on("end", resolve);
            pres.on("error", reject);
          }
        );
        preq.on("error", reject);
        req.pipe(preq);
      });
    } catch (err) {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("campaigns origin unreachable on linuxbox :8768");
    }
    return;
  }

  if (url === "/health") {
    sendJson(res, {
      ok: true,
      campaign: CAMPAIGN,
      discord_auth: REQUIRE_AUTH,
      auth_gating: AUTH_GATING,
      auth_db: Boolean(authStore),
      profile_storage: "client-v1",
      cast: true,
      registry: fs.existsSync(REGISTRY_JSON),
    });
    return;
  }

  const session = sessionFromReq(req);

  if (url === "/api/me") {
    // Lazy refresh-token rotation: only calls Discord when the stored access token expired.
    // Never block the who-chip forever if Discord is slow — soft-timeout then serve mePayload.
    if (session && session.id !== "public" && authStore && OAUTH_CONFIGURED) {
      try {
        await Promise.race([
          authStore.ensureFreshTokens(session.id, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET),
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ]);
      } catch (_) {
        /* keep existing tokens / session; client still gets /api/me */
      }
    }
    sendJson(res, mePayload(req), 200, 0);
    return;
  }

  if (url === "/login" || url === "/login/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(loginPageHtml());
    return;
  }

  // Separate full-page World studio. The map stays the map; World is its own dashboard.
  if (url === "/world" || url === "/world/" || url === "/worldeditor" || url === "/worldeditor/") {
    const gate = editGate(session);
    if (gate) {
      if (gate.code === 401) {
        res.writeHead(302, { Location: "/login?next=/world" });
        res.end();
        return;
      }
      res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<!doctype html><title>World locked</title><p>World editor requires owner/admin. <a href=\"/\">Back to map</a></p>");
      return;
    }
    if (url === "/worldeditor" || url === "/worldeditor/") {
      res.writeHead(302, { Location: "/world" });
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(worldPageHtml());
    return;
  }

  if (url === "/auth/discord") {
    if (!OAUTH_CONFIGURED) {
      res.writeHead(302, { Location: "/login?need=oauth" });
      res.end();
      return;
    }
    const state = crypto.randomBytes(16).toString("hex");
    res.setHeader(
      "Set-Cookie",
      `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${cookieSecureFlag()}`
    );
    const authUrl = new URL("https://discord.com/api/oauth2/authorize");
    authUrl.searchParams.set("client_id", OAUTH_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", OAUTH_REDIRECT);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "identify");
    authUrl.searchParams.set("state", state);
    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  if (url === "/auth/discord/callback") {
    if (!OAUTH_CONFIGURED || !authStore) {
      res.writeHead(503);
      res.end("Discord OAuth not configured");
      return;
    }
    const cookies = parseCookies(req.headers.cookie);
    const state = q.searchParams.get("state") || "";
    if (!state || !cookies.oauth_state || state !== cookies.oauth_state) {
      res.writeHead(403);
      res.end("Invalid OAuth state");
      return;
    }
    const code = q.searchParams.get("code");
    if (!code) {
      res.writeHead(400);
      res.end("Missing code");
      return;
    }
    try {
      const tok = await authStore.exchangeCode({
        code,
        clientId: OAUTH_CLIENT_ID,
        clientSecret: OAUTH_CLIENT_SECRET,
        redirectUri: OAUTH_REDIRECT,
      });
      const user = await authStore.fetchDiscordUser(tok.access_token);
      // Guild gate applies only when bot+guild are configured — a half-configured
      // deploy must not lock everyone out.
      if (DISCORD_GUILD_ID && DISCORD_BOT_TOKEN) {
        const ok = await isGuildMember(user.id);
        if (!ok) {
          res.writeHead(403);
          res.end("You must be a member of the campaign Discord server.");
          return;
        }
      }
      const row = authStore.upsertUser({
        discordId: user.id,
        username: user.global_name || user.username,
        avatarHash: user.avatar,
      });
      authStore.saveTokens(row.discord_id, tok);
      const sess = authStore.createSession(row.discord_id, SESSION_DAYS);
      res.setHeader("Set-Cookie", [
        sessionCookieValue(sess.id, sess.expiresAt),
        "oauth_state=; Path=/; HttpOnly; Max-Age=0",
      ]);
      res.writeHead(302, { Location: "/" });
      res.end();
    } catch (e) {
      res.writeHead(502);
      res.end("Discord login failed");
    }
    return;
  }

  // Localhost-only dev stub (TABLESLOP_DEV_AUTH=1): mint a session without Discord.
  if (url === "/auth/dev-login") {
    if (!DEV_AUTH || !authStore) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ip = req.socket.remoteAddress || "";
    if (ip !== "127.0.0.1" && ip !== "::1" && ip !== "::ffff:127.0.0.1") {
      res.writeHead(403);
      res.end("dev-login is localhost only");
      return;
    }
    const as = q.searchParams.get("as") || "user";
    if (as !== "owner" && as !== "admin" && as !== "user") {
      res.writeHead(400);
      res.end("as must be owner|admin|user");
      return;
    }
    const row = authStore.upsertUser({
      discordId: `dev-${as}`,
      username: `dev-${as}`,
      avatarHash: null,
      forceRole: as, // dev stub only — the real OAuth path never force-sets roles
    });
    authStore.saveTokens(row.discord_id, {
      access_token: `dev-access-${crypto.randomBytes(8).toString("hex")}`,
      refresh_token: `dev-refresh-${crypto.randomBytes(8).toString("hex")}`,
      expires_in: 604800,
    });
    const sess = authStore.createSession(row.discord_id, SESSION_DAYS);
    res.setHeader("Set-Cookie", sessionCookieValue(sess.id, sess.expiresAt));
    res.writeHead(302, { Location: "/" });
    res.end();
    return;
  }

  if (url === "/auth/logout") {
    if (session && session.sid && authStore) authStore.deleteSession(session.sid);
    res.setHeader("Set-Cookie", clearSessionCookieValue());
    res.writeHead(302, { Location: "/" });
    res.end();
    return;
  }

  // Owner-only user/role management.
  if (url === "/api/auth/users") {
    if (!authStore) {
      sendJson(res, { error: "auth disabled" }, 404);
      return;
    }
    if (!session || session.role !== "owner") {
      sendJson(res, { error: "owner only" }, session ? 403 : 401);
      return;
    }
    if (req.method === "GET") {
      sendJson(res, { users: authStore.listUsers() }, 200, 0);
      return;
    }
    if (req.method === "POST") {
      try {
        const body = JSON.parse((await readBody(req)) || "{}");
        const id = String(body.id || body.discord_id || "").trim();
        const role = String(body.role || "user").trim();
        const username = String(body.username || body.discord_username || "").trim();
        // Discord snowflakes are 17–20 digits; keep legacy slug ids for tests.
        if (!/^(\d{17,20}|[A-Za-z0-9_-]{3,64})$/.test(id)) throw new Error("invalid user id");
        if (body.create || body.ensure) {
          if (!username) throw new Error("username required when creating");
          if (role === "owner") throw new Error("owner comes from TABLESLOP_OWNER_DISCORD_ID");
          if (!["admin", "user"].includes(role)) throw new Error("role must be admin or user");
          authStore.upsertUser({
            discordId: id,
            username,
            avatarHash: null,
            forceRole: role,
          });
          sendJson(res, { ok: true, created: true, users: authStore.listUsers() });
          return;
        }
        authStore.setUserRole(id, role);
        sendJson(res, { ok: true, users: authStore.listUsers() });
      } catch (err) {
        sendJson(res, { error: err.message || "role update failed" }, 400);
      }
      return;
    }
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  if (url === "/" || url === "/index.html") {
    // Public view — login only gates editing, never viewing.
    // no-store: edge must not keep a stale black-map viewer after deploys.
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(viewerHtml());
    return;
  }
  if (url === "/devlog" || url === "/devlog/" || url === "/dev-calendar" || url === "/dev-calendar/") {
    if (url === "/dev-calendar" || url === "/dev-calendar/") {
      res.writeHead(302, { Location: "/devlog", "Cache-Control": "no-store" });
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(devlogPageHtml());
    return;
  }
  if (url === "/api/map") {
    const data = loadMapJson();
    // Markers with a generated city map get a link (checked per request — new
    // city files appear without waiting out the map.json mtime cache).
    for (const m of data.markers || []) {
      if (m && CITY_ID_RE.test(m.id || "") && fs.existsSync(path.join(CITIES_DIR, `${m.id}.json`))) {
        m.city_map = `/city/${m.id}`;
      }
    }
    sendJson(res, data, 200, 300);
    return;
  }
  // City detail maps (generated proposals; GM edits win) — public read like the island map.
  // /api/cities/<id> is the 3D client's preferred plural form; /api/city/<id> kept for city HTML.
  const cityApiMatch = url.match(/^\/api\/(?:city|cities)\/([a-z0-9-]+)$/);
  if (cityApiMatch) {
    const city = loadCityData(cityApiMatch[1]);
    if (!city) {
      sendJson(res, { error: "not_found" }, 404);
      return;
    }
    sendJson(res, city, 200, 300);
    return;
  }
  // Phone UI imports the engine as /tableslop/phone-responder.js (browser URL, not disk path).
  if (url === "/tableslop/phone-responder.js") {
    serveStaticFile(
      res,
      path.join(REPO, "scripts", "tableslop", "phone-responder.js"),
      300
    );
    return;
  }
  if (tryServeStaticMount(url, res)) return;
  const cityMatch = url.match(/^\/city\/([a-z0-9-]+)$/);
  if (cityMatch) {
    const city = loadCityData(cityMatch[1]);
    if (!city) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("No city map for this region yet");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(cityHtml(city));
    return;
  }
  if (url === "/api/map/coords" && req.method === "POST") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    try {
      const body = await readBody(req);
      const result = saveMapCoords(body);
      sendJson(res, result, 200);
    } catch (err) {
      sendJson(res, { error: err.message || "save failed" }, 400);
    }
    return;
  }
  if (url === "/api/map/regions-ui" && req.method === "POST") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    try {
      const body = await readBody(req);
      const result = saveRegionAreas(body);
      sendJson(res, result, 200);
    } catch (err) {
      sendJson(res, { error: err.message || "save failed" }, 400);
    }
    return;
  }
  if (url === "/api/feedback" && req.method === "POST") {
    // Public map may take feedback without Discord login (screenshot → agent task).
    try {
      const body = await readBody(req);
      if (body.length > FEEDBACK_MAX_BYTES * 1.4) {
        sendJson(res, { error: "payload too large" }, 413);
        return;
      }
      const result = saveMapFeedback(body);
      sendJson(res, result, 200);
    } catch (err) {
      sendJson(res, { error: err.message || "feedback failed" }, 400);
    }
    return;
  }
  if (url === "/api/dev-calendar" && req.method === "GET") {
    sendJson(res, loadDevCalendar(), 200, 30);
    return;
  }
  if (url === "/api/dev-calendar" && req.method === "POST") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    try {
      const body = await readBody(req);
      if (Buffer.byteLength(body, "utf8") > 64 * 1024) throw new Error("payload too large");
      const payload = JSON.parse(body || "{}");
      if (payload.action && payload.action !== "add") {
        throw new Error("only action=add supported");
      }
      const result = saveDevCalendarAdd(payload);
      sendJson(res, result, 200, 0);
    } catch (err) {
      if (err && err.code === "version_conflict") {
        sendJson(res, { error: "version_conflict", ...(err.detail || {}) }, 409);
      } else {
        sendJson(res, { error: (err && err.message) || "save failed" }, 400);
      }
    }
    return;
  }
  if (url === "/api/regions") {
    const board = loadRegionsBoard();
    if (!board) {
      sendJson(res, { error: "regions board missing" }, 404);
      return;
    }
    // Align board titles to map pin labels (vibes SoT) so board UI cannot drift.
    const map = loadMapJson();
    sendJson(res, alignBoardNamesToMarkers(board, map.markers || []), 200, 300);
    return;
  }
  if (url === "/api/world/characters" && req.method === "POST") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    try {
      const body = await readBody(req);
      if (Buffer.byteLength(body, "utf8") > 256 * 1024) throw new Error("payload too large");
      const payload = JSON.parse(body || "{}");
      if (payload.bulk === true) {
        sendJson(res, bulkWorldCharacters(payload), 200, 0);
      } else {
        sendJson(res, patchWorldCharacter(payload), 200, 0);
      }
    } catch (err) {
      if (err && err.code === "version_conflict") {
        sendJson(res, { error: "version_conflict", ...(err.detail || {}) }, 409);
      } else {
        sendJson(res, { error: (err && err.message) || "save_failed" }, 400);
      }
    }
    return;
  }
  if (url === "/api/world/characters/ingest" && req.method === "POST") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    try {
      const body = await readBody(req);
      // ~6MB: base64 portrait + JSON fields (decoded portrait still capped at WORLD_PORTRAIT_MAX)
      if (Buffer.byteLength(body, "utf8") > 6 * 1024 * 1024) throw new Error("payload too large");
      const payload = JSON.parse(body || "{}");
      sendJson(res, ingestWorldCharacter(payload), 200, 0);
    } catch (err) {
      if (err && err.code === "version_conflict") {
        sendJson(res, { error: "version_conflict", ...(err.detail || {}) }, 409);
      } else {
        sendJson(res, { error: (err && err.message) || "ingest_failed" }, 400);
      }
    }
    return;
  }
  if (url === "/api/world/entities" && req.method === "GET") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    const data = readEntitiesRaw();
    if (data.error) {
      sendJson(res, { error: "entities_read_failed" }, 500);
      return;
    }
    sendJson(res, { version: data.version || 0, updated_at: data.updated_at || null, entities: data.entities || [] }, 200, 0);
    return;
  }
  if (url === "/api/world/entities" && req.method === "POST") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    try {
      const body = await readBody(req);
      if (Buffer.byteLength(body, "utf8") > 256 * 1024) throw new Error("payload too large");
      const payload = JSON.parse(body || "{}");
      if (payload.bulk === true) {
        sendJson(res, bulkWorldEntities(payload), 200, 0);
      } else {
        sendJson(res, patchWorldEntity(payload), 200, 0);
      }
    } catch (err) {
      if (err && err.code === "version_conflict") {
        sendJson(res, { error: "version_conflict", ...(err.detail || {}) }, 409);
      } else {
        sendJson(res, { error: (err && err.message) || "save_failed" }, 400);
      }
    }
    return;
  }
  if (url === "/api/world/pages" && req.method === "GET") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    try {
      sendJson(res, { files: listWorldPages(), roots: WORLD_PAGE_ROOTS }, 200, 0);
    } catch (err) {
      sendJson(res, { error: (err && err.message) || "pages_failed" }, 400);
    }
    return;
  }
  if (url === "/api/world/page" && req.method === "GET") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    try {
      sendJson(res, readWorldPage(q.searchParams.get("path") || ""), 200, 0);
    } catch (err) {
      const msg = (err && err.message) || "page_failed";
      sendJson(res, { error: msg }, msg === "page_not_found" ? 404 : 400);
    }
    return;
  }
  if (url === "/api/world/page" && req.method === "POST") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    try {
      const body = await readBody(req);
      if (Buffer.byteLength(body, "utf8") > 512 * 1024) throw new Error("payload too large");
      const payload = JSON.parse(body || "{}");
      sendJson(res, writeWorldPage(payload.path, payload.content, payload.base_sha256), 200, 0);
    } catch (err) {
      if (err && err.code === "page_conflict") {
        sendJson(res, { error: "page_conflict", ...(err.detail || {}) }, 409);
      } else {
        const msg = (err && err.message) || "save_failed";
        sendJson(res, { error: msg }, msg === "page_not_found" ? 404 : 400);
      }
    }
    return;
  }
  if (url === "/api/world/roads") {
    try {
      const regionId = (q.searchParams.get("region_id") || "").trim();
      const all = q.searchParams.get("all") === "1" || regionId === "all";
      if (all) {
        sendJson(res, readRoadsAll(CAMPAIGN_DIR), 200, 0);
      } else if (regionId) {
        sendJson(res, readRoadsRegion(CAMPAIGN_DIR, regionId), 200, 0);
      } else {
        const idx = readRoadsIndex(CAMPAIGN_DIR);
        if (!idx) sendJson(res, { error: "roads_missing" }, 404);
        else sendJson(res, idx, 200, 0);
      }
    } catch (err) {
      sendJson(res, { error: (err && err.message) || "roads_failed" }, 500);
    }
    return;
  }
  if (url === "/api/world/logistics") {
    try {
      sendJson(res, {
        index: readLogisticsIndex(CAMPAIGN_DIR),
        routes: readLogisticsRoutes(CAMPAIGN_DIR),
      }, 200, 0);
    } catch (err) {
      sendJson(res, { error: (err && err.message) || "logistics_failed" }, 500);
    }
    return;
  }
  if (url === "/api/world/board") {
    if (req.method === "GET") {
      try {
        const threadId = (q.searchParams.get("thread_id") || "").trim();
        const index = readBoardIndex(CAMPAIGN_DIR);
        const threads = readBoardThreads(CAMPAIGN_DIR);
        if (threadId) {
          const t = threads.find((x) => x.id === threadId) || null;
          sendJson(res, { index, thread: t }, t ? 200 : 404, 0);
        } else {
          sendJson(res, { index, threads }, 200, 0);
        }
      } catch (err) {
        sendJson(res, { error: (err && err.message) || "board_failed" }, 500);
      }
      return;
    }
    if (req.method === "PATCH" || req.method === "POST") {
      const gate = editGate(session);
      if (gate) {
        sendJson(res, { error: gate.error }, gate.code);
        return;
      }
      try {
        const body = await readBody(req);
        const payload = JSON.parse(body || "{}");
        const out = writeBoardResolve(CAMPAIGN_DIR, payload);
        sendJson(res, out, 200, 0);
      } catch (err) {
        if (err && err.code === "version_conflict") {
          sendJson(res, { error: "version_conflict", version: err.version }, 409);
        } else {
          sendJson(res, { error: (err && err.message) || "board_resolve_failed" }, 400);
        }
      }
      return;
    }
  }
  if (url === "/api/world/weather" && req.method === "GET") {

    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    try {
      const state = ensureWeatherState(CAMPAIGN_DIR, WEATHER_LOCK);
      if (state && state.error) {
        sendJson(res, state, 500);
        return;
      }
      sendJson(res, state, 200, 0);
    } catch (err) {
      sendJson(res, { error: (err && err.message) || "weather_failed" }, 500);
    }
    return;
  }
  if (url === "/api/world/weather" && req.method === "POST") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    try {
      const body = await readBody(req);
      if (Buffer.byteLength(body, "utf8") > 256 * 1024) throw new Error("payload too large");
      const payload = JSON.parse(body || "{}");
      const cur = readWeatherState(CAMPAIGN_DIR);
      if (payload.base_version != null && cur && !cur.error && Number(cur.version) !== Number(payload.base_version)) {
        sendJson(res, { error: "version_conflict", version: cur.version, updated_at: cur.updated_at }, 409);
        return;
      }
      let next;
      const action = String(payload.action || "").trim();
      if (action || payload.generate) {
        next = applyWeatherAction(CAMPAIGN_DIR, cur && !cur.error ? cur : null, payload);
      } else if (payload.cities) {
        next = Object.assign({}, cur && !cur.error ? cur : {}, payload, {
          version: cur && !cur.error ? Number(cur.version || 0) + 1 : 1,
        });
      } else {
        next = applyWeatherAction(CAMPAIGN_DIR, cur && !cur.error ? cur : null, Object.assign({}, payload, { action: "regenerate", generate: true }));
      }
      if (cur && !cur.error && Number(cur.version) > 0) {
        next.version = Number(cur.version) + 1;
      } else if (!next.version) {
        next.version = 1;
      }
      const written = writeWeatherState(CAMPAIGN_DIR, next, WEATHER_LOCK);
      sendJson(res, written, 200, 0);
    } catch (err) {
      sendJson(res, { error: (err && err.message) || "weather_save_failed" }, 400);
    }
    return;
  }
  if (url === "/api/world/sim" && req.method === "GET") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    try {
      let agents = loadAgents(CAMPAIGN_DIR);
      if (!agents.agents || !agents.agents.length) {
        agents = seedFromRegistry(CAMPAIGN_DIR);
        saveAgents(CAMPAIGN_DIR, agents);
      }
      const economy = loadEconomy(CAMPAIGN_DIR);
      sendJson(res, { agents, economy }, 200, 0);
    } catch (err) {
      sendJson(res, { error: (err && err.message) || "sim_failed" }, 500);
    }
    return;
  }
  if (url === "/api/world/sim" && req.method === "POST") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    try {
      const body = await readBody(req);
      if (Buffer.byteLength(body, "utf8") > 256 * 1024) throw new Error("payload too large");
      const payload = JSON.parse(body || "{}");
      const action = String(payload.action || "tick").trim();
      let agents = loadAgents(CAMPAIGN_DIR);
      if (!agents.agents || !agents.agents.length) agents = seedFromRegistry(CAMPAIGN_DIR);
      let economy = loadEconomy(CAMPAIGN_DIR);
      if (action === "tick") {
        const out = tickAgents(agents, economy, {
          campaignDir: CAMPAIGN_DIR,
          days: Math.max(1, Number(payload.days) || 1),
        });
        agents = out.agents;
        economy = out.economy;
        saveAgents(CAMPAIGN_DIR, agents);
        saveEconomy(CAMPAIGN_DIR, economy);
      } else if (action === "reseed") {
        agents = seedFromRegistry(CAMPAIGN_DIR);
        saveAgents(CAMPAIGN_DIR, agents);
      } else {
        throw new Error("bad_action");
      }
      sendJson(res, { agents, economy }, 200, 0);
    } catch (err) {
      sendJson(res, { error: (err && err.message) || "sim_save_failed" }, 400);
    }
    return;
  }
  if (url === "/api/world/economy" && req.method === "GET") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    try {
      const block = readModuleState(CAMPAIGN_DIR, "economy");
      if (block && block.error) {
        sendJson(res, block, block.error === "summary_missing" ? 404 : 500);
        return;
      }
      sendJson(res, block, 200, 0);
    } catch (err) {
      sendJson(res, { error: (err && err.message) || "economy_failed" }, 500);
    }
    return;
  }
  if (url === "/api/world/economy" && req.method === "POST") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    try {
      const body = await readBody(req);
      if (Buffer.byteLength(body, "utf8") > 256 * 1024) throw new Error("payload too large");
      const payload = JSON.parse(body || "{}");
      const cur = loadEconomy(CAMPAIGN_DIR);
      if (payload.base_version != null && Number(cur.version) !== Number(payload.base_version)) {
        sendJson(res, { error: "version_conflict", version: cur.version, updated_at: cur.updated_at }, 409);
        return;
      }
      const action = String(payload.action || "tick").trim();
      let next = cur;
      if (action === "tick") {
        next = tickEconomy(cur, {
          campaignDir: CAMPAIGN_DIR,
          days: Math.max(1, Number(payload.days) || 1),
        });
      } else if (action === "set_date") {
        next = Object.assign({}, cur, {
          diegetic_date: String(payload.diegetic_date || cur.diegetic_date || "2019-06-15"),
          version: Number(cur.version || 0) + 1,
          updated_at: new Date().toISOString(),
        });
      } else {
        throw new Error("bad_action");
      }
      const written = saveEconomy(CAMPAIGN_DIR, next);
      sendJson(res, Object.assign({ module: "economy" }, written), 200, 0);
    } catch (err) {
      sendJson(res, { error: (err && err.message) || "economy_save_failed" }, 400);
    }
    return;
  }
  if (url === "/api/world/summary" && req.method === "GET") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    const mod = String(q.searchParams.get("module") || "").trim();
    if (!["regions", "agriculture", "economy", "transport"].includes(mod)) {
      sendJson(res, { error: "bad_module" }, 400);
      return;
    }
    try {
      const block = readModuleState(CAMPAIGN_DIR, mod);
      if (block && block.error) {
        sendJson(res, block, block.error === "summary_missing" ? 404 : 500);
        return;
      }
      if (mod === "transport") {
        block.highways_layer = readHighwaysLayerStatus(CAMPAIGN_DIR);
      }
      sendJson(res, block, 200, 0);
    } catch (err) {
      sendJson(res, { error: (err && err.message) || "summary_failed" }, 500);
    }
    return;
  }
  if (url === "/api/world/summary" && req.method === "POST") {
    const gate = editGate(session);
    if (gate) {
      sendJson(res, { error: gate.error }, gate.code);
      return;
    }
    try {
      const body = await readBody(req);
      if (Buffer.byteLength(body, "utf8") > 256 * 1024) throw new Error("payload too large");
      const payload = JSON.parse(body || "{}");
      const mod = String(payload.module || "").trim();
      if (!["regions", "agriculture", "economy", "transport"].includes(mod)) throw new Error("bad_module");
      const cur = readModuleState(CAMPAIGN_DIR, mod);
      if (cur && cur.error) throw new Error(cur.error);
      if (payload.base_version != null && Number(cur.version) !== Number(payload.base_version)) {
        sendJson(res, { error: "version_conflict", version: cur.version, updated_at: cur.updated_at }, 409);
        return;
      }
      const next = applyModulePatch(cur, payload);
      const written = writeModuleState(CAMPAIGN_DIR, mod, next, SOT_LOCK);
      if (mod === "transport") written.highways_layer = readHighwaysLayerStatus(CAMPAIGN_DIR);
      if (mod === "economy") {
        try {
          const ov = syncOverlayFromState(written);
          fs.writeFileSync(overlayPath(CAMPAIGN_DIR), JSON.stringify(ov, null, 2) + "\n");
        } catch {
          /* overlay sync best-effort */
        }
      }
      sendJson(res, written, 200, 0);
    } catch (err) {
      sendJson(res, { error: (err && err.message) || "summary_save_failed" }, 400);
    }
    return;
  }
  if (url === "/api/characters") {
    const includeHidden = q.searchParams.get("include_hidden") === "1";
    sendJson(res, loadCastRegistry({ includeHidden }), 200, 0);
    return;
  }
  if (url === "/api/wiki/entities") {
    const campaign = String(q.searchParams.get("campaign") || "tropic-gooner").replace(/[^a-z0-9_-]/gi, "");
    const entPath = path.join(REPO, "campaigns", campaign, "wiki", "entities.json");
    try {
      const data = JSON.parse(fs.readFileSync(entPath, "utf8"));
      sendJson(res, data, 200, 30);
    } catch (e) {
      sendJson(res, { error: e.code === "ENOENT" ? "entities_missing" : "entities_read_failed" }, e.code === "ENOENT" ? 404 : 500);
    }
    return;
  }
  if (url === "/wiki-entity-links.js") {
    const abs = path.join(__dirname, "linuxbox-status", "wiki-entity-links.js");
    serveStaticFile(res, abs, 300);
    return;
  }
  if (url === "/api/characters/sheet") {
    const id = q.searchParams.get("id") || "";
    const sheet = readCastSheetMarkdown(id);
    if (!sheet) {
      sendJson(res, { error: "not_found" }, 404);
      return;
    }
    sendJson(res, sheet, 200, 0);
    return;
  }
  if (url === "/api/characters/image") {
    const id = q.searchParams.get("id") || "";
    const char = findCastCharacter(id);
    if (!char) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const allowed = allowedImagePathsForChar(char);
    let rel = normalizeCampaignRelPath(q.searchParams.get("path") || "");
    if (rel && !allowed.includes(rel)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    if (!rel) {
      rel =
        (normalizeCampaignRelPath(char.image_path) &&
        allowed.includes(normalizeCampaignRelPath(char.image_path))
          ? normalizeCampaignRelPath(char.image_path)
          : null) ||
        allowed.find((p) => characterImageAbs(p)) ||
        "";
    }
    const abs = characterImageAbs(rel);
    if (!abs) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": characterImageContentType(abs),
      "Cache-Control": "public, max-age=3600",
    });
    fs.createReadStream(abs).pipe(res);
    return;
  }
  if (url === "/map-image") {
    // Lightweight path resolve — never run full loadMapJson (regions-ui merge)
    // just to stream a PNG. Preload in <head> hits this before /api/map warms cache.
    const abs = resolveMapImageAbs(q.searchParams.get("res"));
    if (!abs) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    const types = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
    let size = 0;
    try { size = fs.statSync(abs).size; } catch { size = 0; }
    const headers = {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=86400",
    };
    if (size > 0) headers["Content-Length"] = String(size);
    res.writeHead(200, headers);
    fs.createReadStream(abs).pipe(res);
    return;
  }

  if (url === "/map-highways-wireframe") {
    const abs = path.join(CAMPAIGN_DIR, "map", "highways-wireframe.png");
    if (!fs.existsSync(abs)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    let size = 0;
    try { size = fs.statSync(abs).size; } catch { size = 0; }
    const headers = {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    };
    if (size > 0) headers["Content-Length"] = String(size);
    res.writeHead(200, headers);
    fs.createReadStream(abs).pipe(res);
    return;
  }

  // heightmap / roadmask grids (256 legacy, 512 expand, …)
  {
    const hm = url.match(/^\/map-(heightmap|roadmask)-(\d+)\.(json|bin)$/);
    if (hm) {
      const name = `${hm[1]}-${hm[2]}.${hm[3]}`;
      const abs = path.join(CAMPAIGN_DIR, "map", name);
      if (!fs.existsSync(abs)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(abs).toLowerCase();
      let size = 0;
      try { size = fs.statSync(abs).size; } catch { size = 0; }
      const headers = {
        "Content-Type": ext === ".json" ? "application/json; charset=utf-8" : "application/octet-stream",
        "Cache-Control": "public, max-age=120",
      };
      if (size > 0) headers["Content-Length"] = String(size);
      res.writeHead(200, headers);
      fs.createReadStream(abs).pipe(res);
      return;
    }
  }

  const tileMatch = url.match(/^\/map-tiles\/(\d+)\/(\d+)\/(\d+)\.webp$/);
  if (tileMatch) {
    const [, z, y, x] = tileMatch;
    const abs = path.join(CAMPAIGN_DIR, "map", "tiles", z, y, `${x}.webp`);
    if (!fs.existsSync(abs)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=604800, immutable",
    });
    fs.createReadStream(abs).pipe(res);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}

const server = http.createServer(handleRequest);

/** Fail loud if worldPageHtml template-literal escapes break the client boot script (e.g. '\n' → real newline). */
function assertWorldPageJsOk() {
  const html = worldPageHtml();
  const m = html.match(/<script>\s*\(function \(\) \{([\s\S]*?)\}\)\(\);\s*<\/script>/);
  if (!m) throw new Error("worldPageHtml missing inline boot script");
  try {
    // eslint-disable-next-line no-new-func
    new Function(m[1]);
  } catch (e) {
    throw new Error("worldPageHtml inline JS broken (check \\\\n escapes in template): " + e.message);
  }
}

function bindListen() {
  const onListen = (host) => console.log(`tableslop: http://${host}:${PORT}/  campaign=${CAMPAIGN}`);
  server.listen(PORT, HOST, () => onListen(HOST));
  // ponytail: cloudflared uses localhost → [::1]; mirror listener with same handler (not emit — breaks streams)
  if (HOST === "127.0.0.1") {
    http.createServer(handleRequest).listen(PORT, "::1", () => onListen("::1"));
  }
}

async function main() {
  assertWorldPageJsOk();
  if (REQUIRE_AUTH && !OAUTH_CONFIGURED && !DEV_AUTH) {
    console.warn(
      "tableslop: TABLESLOP_REQUIRE_DISCORD_AUTH=1 but OAuth env incomplete " +
        "(need DISCORD_OAUTH_CLIENT_ID/SECRET, DISCORD_OAUTH_REDIRECT_URI, TABLESLOP_SESSION_SECRET) " +
        "— running OPEN so nobody is locked out"
    );
  }
  if (DEV_AUTH) {
    console.warn("tableslop: TABLESLOP_DEV_AUTH=1 — /auth/dev-login stub enabled (localhost only)");
  }
  if (AUTH_GATING || DEV_AUTH) {
    authStore = await new TableslopAuth(AUTH_DB_PATH, OWNER_DISCORD_ID).init();
    authStore.pruneExpiredSessions();
    console.log(
      `tableslop: auth db ${AUTH_DB_PATH}  gating=${AUTH_GATING ? "on" : "off"}` +
        (OWNER_DISCORD_ID ? "  owner=env" : "  owner=(unset — no TABLESLOP_OWNER_DISCORD_ID)")
    );
  }
  bindListen();
}

main().catch((err) => {
  console.error("tableslop: fatal boot error", err);
  process.exit(1);
});
