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

const REPO = path.resolve(__dirname, "../..");
const HOST = process.env.TABLESLOP_HOST || "127.0.0.1";
const PORT = parseInt(process.env.TABLESLOP_PORT || "8765", 10);
const CAMPAIGN = process.env.TABLESLOP_CAMPAIGN || "tropic-gooner";
const REQUIRE_AUTH = process.env.TABLESLOP_REQUIRE_DISCORD_AUTH === "1";
const SESSION_SECRET = process.env.TABLESLOP_SESSION_SECRET || "";
const OAUTH_CLIENT_ID = process.env.DISCORD_OAUTH_CLIENT_ID || "";
const OAUTH_CLIENT_SECRET = process.env.DISCORD_OAUTH_CLIENT_SECRET || "";
const OAUTH_REDIRECT = process.env.DISCORD_OAUTH_REDIRECT_URI || "";
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || "";
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";
const SESSION_COOKIE = "tableslop_session";
const SESSION_DAYS = 7;

const CAMPAIGN_DIR = path.join(REPO, "campaigns", CAMPAIGN);
const MAP_JSON = path.join(CAMPAIGN_DIR, "map", "map.json");
const REGIONS_UI_JSON = path.join(CAMPAIGN_DIR, "map", "regions-ui.json");
const COORDS_JSON = path.join(CAMPAIGN_DIR, "map", "coords.json");
const LAYERS_JSON = path.join(CAMPAIGN_DIR, "map", "layers.json");
const REGIONS_BOARD = path.join(REPO, "projects", "tableslop", "regions.json");
/** Same SoT as dashboard Chars — read-through only (writes stay on :8790). */
const REGISTRY_JSON = path.join(CAMPAIGN_DIR, "characters-registry.json");
const FEEDBACK_DIR = path.join(REPO, "reports", "tableslop-feedback");
const USER_TASKS_JSON = path.join(REPO, "agents", "user-tasks.json");
const FEEDBACK_MAX_BYTES = 2.5 * 1024 * 1024;
const CHAR_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
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

function setSessionCookie(res, user) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const token = signSession({ id: user.id, username: user.username, exp });
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
}

function sessionFromReq(req) {
  if (!REQUIRE_AUTH) return { id: "public", username: "guest" };
  const cookies = parseCookies(req.headers.cookie);
  return verifySession(cookies[SESSION_COOKIE]);
}

async function discordTokenExchange(code) {
  const body = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: OAUTH_REDIRECT,
  });
  const r = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`token exchange ${r.status}`);
  return r.json();
}

async function discordUser(accessToken) {
  const r = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`user fetch ${r.status}`);
  return r.json();
}

async function isGuildMember(userId) {
  if (!DISCORD_GUILD_ID || !DISCORD_BOT_TOKEN) return false;
  const r = await fetch(`https://discord.com/api/guilds/${DISCORD_GUILD_ID}/members/${userId}`, {
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
  });
  return r.status === 200;
}

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>tableslop — login</title>
<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#0a0a0c;color:#e8e6e3;display:flex;min-height:100vh;align-items:center;justify-content:center}
.box{max-width:360px;padding:32px;border:1px solid #333;border-radius:8px;text-align:center}
a.btn{display:inline-block;margin-top:16px;padding:12px 20px;background:#5865F2;color:#fff;text-decoration:none;border-radius:6px;font-weight:600}
p{color:#888;font-size:.9rem}</style></head>
<body><div class="box"><h1>tableslop map</h1><p>Login with Discord to view the campaign map.<br>We only check that you are in the server — no password stored.</p>
<a class="btn" href="/auth/discord">Login with Discord</a></div></body></html>`;

function viewerHtml(_userLabel) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>tableslop — ${CAMPAIGN}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=VT323&family=Share+Tech+Mono&display=swap" rel="stylesheet"/>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
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
  .hud-res:hover { background:rgba(255,113,206,.12); border-color:var(--pink); color:var(--pink); }
  .hud-edit.is-on { border-color:var(--sun); color:var(--sun); box-shadow:0 0 12px rgba(255,251,150,.45); }
  .hud-save { border-color:var(--cyan); color:var(--cyan); }
  .hud-save.is-dirty { border-color:var(--sun); color:var(--sun); animation:lane-breathe 1.2s ease-in-out infinite; }
  .hud-auth { margin-left:auto; display:flex; align-items:center; gap:10px; font-size:.85rem; }
  .hud-auth a { color:var(--cyan); text-decoration:none; }
  .hud-auth a:hover { text-shadow:0 0 8px var(--glow-cyan); }
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
  .game-shell {
    flex:1; min-height:0; overflow:hidden;
    display:grid; grid-template-columns:1fr min(300px,32vw);
  }
  @media (max-width:800px) { .game-shell { grid-template-columns:1fr; grid-template-rows:1fr auto; } }
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
  .map-layer--terrain-base img#mapImg {
    display:block; width:100%; height:100%;
    border:2px solid transparent;
    border-image:linear-gradient(135deg, var(--pink), var(--cyan)) 1;
    box-shadow:0 0 40px var(--glow-pink), 0 0 80px rgba(1,205,254,.15);
  }
  .map-area-svg {
    width:100%; height:100%; display:block; overflow:visible;
  }
  .map-area-zone {
    fill:rgba(255,113,206,.12); stroke:var(--pink); stroke-width:.35;
    vector-effect:non-scaling-stroke; pointer-events:all; cursor:pointer;
    transition:fill .15s, stroke-width .15s, filter .15s;
  }
  .map-area-zone:hover {
    fill:rgba(1,205,254,.22); stroke:var(--cyan); stroke-width:.55;
    filter:drop-shadow(0 0 6px var(--glow-cyan));
  }
  .map-area-zone.is-active {
    fill:rgba(255,251,150,.2); stroke:var(--sun); stroke-width:.65;
    filter:drop-shadow(0 0 10px rgba(255,251,150,.5));
  }
  .map-area-zone.is-dim { opacity:.35; }
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
    background:linear-gradient(135deg, var(--pink), var(--magenta));
    border:2px solid var(--sun);
    box-shadow:0 0 14px var(--glow-pink), 0 0 4px var(--sun);
    cursor:pointer;
    font:1rem VT323,monospace; color:#fff;
    transition:transform .15s, box-shadow .15s;
  }
  .pin:hover, .pin.is-active {
    transform:translate(-50%,-50%) scale(1.2);
    box-shadow:0 0 22px var(--glow-pink), 0 0 16px var(--glow-cyan); z-index:2;
  }
  .pin--capital { background:linear-gradient(135deg, var(--sun), #ff9e00); color:#1a0533; }
  .pin--town { background:linear-gradient(135deg, var(--purple), #6b2d9e); }
  .pin--preserve { background:linear-gradient(135deg, var(--cyan), #0099bb); }
  .pin--region { background:linear-gradient(135deg, #666, #999); }
  .map-label-layer {
    position:absolute; inset:0; pointer-events:none;
  }
  .map-label {
    position:absolute; transform:translate(-50%,-100%);
    font: clamp(11px, 1.35vw, 18px) VT323,monospace;
    color:var(--sun); letter-spacing:.04em;
    text-shadow:0 1px 0 #000, 0 0 4px #0d0221, 0 0 10px var(--glow-pink);
    white-space:nowrap; opacity:.95;
    -webkit-font-smoothing:antialiased;
    transition:opacity .15s, transform .15s;
  }
  .map-label--city { color:var(--pink); }
  .map-label--town { color:var(--purple); }
  .map-label--capital { color:var(--sun); font-size:clamp(12px, 1.5vw, 20px); }
  .map-label--preserve { color:var(--cyan); }
  .map-label--region { color:#ccc; font-size:clamp(10px, 1.2vw, 16px); }
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
  @keyframes map-reveal {
    from { opacity: 0; transform: scale(0.985); }
    to { opacity: 1; transform: scale(1); }
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
    animation: map-reveal .5s ease forwards;
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
    .fx-scanlines { display: none; }
  }
</style>
</head>
<body>
<header class="hud">
  <div class="hud-brand">tableslop</div>
  <span class="hud-setting" id="mapTitle">Isla Primavera</span>
  <button type="button" class="hud-res" id="resToggle" hidden>4K</button>
  <button type="button" class="hud-res" id="areasToggle" hidden>Areas</button>
  <button type="button" class="hud-res" id="labelToggle" hidden>Labels</button>
  <button type="button" class="hud-res" id="citiesToggle" hidden>Cities</button>
  <button type="button" class="hud-res" id="castToggle" aria-pressed="false">Cast</button>
  <button type="button" class="hud-res hud-edit" id="editToggle">Edit</button>
  <button type="button" class="hud-res hud-save" id="saveCoordsBtn" hidden>Save coords</button>
  <button type="button" class="hud-res" id="reportToggle" title="Paste a screenshot + note for agents">Report</button>
  <div class="hud-auth" id="authSlot"></div>
</header>
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
  <section class="map-viewport" id="viewport">
    <div class="map-camera" id="mapCamera">
      <div class="map-stage" id="mapStage"></div>
    </div>
    <div class="map-hint" id="mapHint">drag to pan · scroll to zoom · legend to focus · Cast for roster</div>
    <div class="map-zoom-label" id="zoomLabel">—</div>
    <div class="map-controls" id="mapControls">
      <button type="button" id="zoomIn" aria-label="Zoom in">+</button>
      <button type="button" id="zoomOut" aria-label="Zoom out">−</button>
      <button type="button" id="zoomFit" aria-label="Fit entire map">⌂</button>
    </div>
  </section>
  <aside class="region-journal">
    <div class="pilot-panel" id="pilotPanel">
      <div class="pilot-name" id="pilotName">Local pilot</div>
      <div class="pilot-meta" id="pilotMeta">Progress saves in this browser</div>
      <div class="pilot-stats" id="pilotStats"></div>
      <label class="pilot-note-label" for="regionNote" id="noteLabel" hidden>Region note</label>
      <textarea class="pilot-note" id="regionNote" hidden placeholder="Session notes for this region…"></textarea>
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
  </aside>
</div>
<div class="map-tooltip" id="tooltip" hidden></div>
<script>
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
let editMode = false;
let coordsDirty = false;
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

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setCastMode(on, opts) {
  castMode = Boolean(on);
  const mapSide = document.getElementById('mapSide');
  const castSide = document.getElementById('castSide');
  const btn = document.getElementById('castToggle');
  if (mapSide) mapSide.hidden = castMode;
  if (castSide) castSide.hidden = !castMode;
  if (btn) {
    btn.classList.toggle('is-on', castMode);
    btn.setAttribute('aria-pressed', castMode ? 'true' : 'false');
  }
  if (castMode) {
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
    (c.notes ? '<p class="notes">' + escapeHtml(c.notes) + '</p>' : '') +
    '<div class="cast-sheet" id="castSheet" aria-live="polite"><p class="meta">' +
      (c.story_path ? 'Loading sheet…' : 'No story sheet linked.') + '</p></div>' +
    (rels ? '<ul class="cast-rels">' + rels + '</ul>' : '<p class="meta">No relations linked.</p>') +
    '<p class="cast-admin-hint">Edit / upload / merge on <a href="' + escapeHtml(dashEdit) +
      '" target="_blank" rel="noopener">Linuxbox Chars → ' + escapeHtml(c.display_name) + '</a> (admin).</p>';
  detail.hidden = false;
  detail.querySelectorAll('button[data-to]').forEach((b) => {
    b.onclick = () => selectCast(b.getAttribute('data-to'));
  });
  history.replaceState(null, '', '#cast/' + encodeURIComponent(c.id));
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
  const fit = fitScale > 0 ? fitScale : computeFitScale();
  const ratio = camera.scale / fit;
  // ratio≈1 at fit-to-view → maxZoom; each halving of ratio steps down one pyramid level.
  const ideal = tilePyramid.maxZoom + Math.floor(Math.log2(Math.max(0.125, ratio)));
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
    img.style.opacity = '0';
    img.dataset.epoch = String(epoch);
    img.onload = function() {
      if (img.dataset.epoch !== String(epoch)) return;
      img.style.opacity = '1';
    };
    img.onerror = function() {
      if (img.dataset.epoch !== String(epoch)) return;
      img.remove();
    };
    img.src = '/map-tiles/' + zz + '/' + ty + '/' + tx + '.webp';
    layer.appendChild(img);
  });
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
  return overlapArea >= vpArea * 0.15;
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
  const ov = (profile && profile.coord_overrides) || {};
  return markers.map(function(m) {
    const o = ov[m.id];
    if (!o || o.x_pct == null || o.y_pct == null) return m;
    return { ...m, x_pct: o.x_pct, y_pct: o.y_pct, coord_status: 'manual' };
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

function initEditMode(profile) {
  const btn = document.getElementById('editToggle');
  const saveBtn = document.getElementById('saveCoordsBtn');
  const vp = document.getElementById('viewport');
  if (!btn) return;
  editMode = profile.editMode === true;
  btn.textContent = editMode ? 'Edit ON' : 'Edit';
  btn.classList.toggle('is-on', editMode);
  if (saveBtn) {
    saveBtn.hidden = !editMode;
    saveBtn.classList.toggle('is-dirty', coordsDirty && editMode);
  }
  if (vp) vp.classList.toggle('is-edit-mode', editMode);
  updateEditHint();
  btn.onclick = function() {
    editMode = !editMode;
    saveProfile({ editMode });
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
    panDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, camX: camera.x, camY: camera.y, moved: false };
    vp.classList.add('is-dragging');
    vp.setPointerCapture(e.pointerId);
  });

  vp.addEventListener('pointermove', function(e) {
    if (!panDrag || panDrag.id !== e.pointerId) return;
    const dx = e.clientX - panDrag.x;
    const dy = e.clientY - panDrag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) panDrag.moved = true;
    camera.x = panDrag.camX + dx;
    camera.y = panDrag.camY + dy;
    applyCamera(false);
  });

  vp.addEventListener('pointerup', function(e) {
    if (!panDrag || panDrag.id !== e.pointerId) return;
    vp.classList.remove('is-dragging');
    if (panDrag.moved) scheduleCameraSave();
    panDrag = null;
  });

  vp.addEventListener('pointercancel', function() {
    vp.classList.remove('is-dragging');
    panDrag = null;
  });

  vp.addEventListener('dblclick', function(e) {
    if (e.target.closest('.pin, .map-controls')) return;
    zoomAt(1.35, e.clientX, e.clientY);
  });

  window.addEventListener('keydown', function(e) {
    if (e.target.closest('textarea, input')) return;
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
    chip.dataset.id = m.id;
    chip.title = (m.label || m.name || m.id) + ' — click to focus';
    chip.textContent = m.region != null ? String(m.region) : '?';
    chip.addEventListener('click', function() { selectMarker(m.id, { focus: true }); });
    grid.appendChild(chip);
  });
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
  if (me.logged_in && me.username) {
    slot.innerHTML = '<span class="hud-user">@' + me.username + '</span>' +
      ' <a class="hud-logout" href="/auth/logout">logout</a>';
    const name = document.getElementById('pilotName');
    if (name) name.textContent = me.username;
    const meta = document.getElementById('pilotMeta');
    if (meta) meta.textContent = me.cloud_save ? 'Synced to tableslop' : 'Linked Discord · saves still local until cloud sync';
  } else if (me.discord_configured) {
    slot.innerHTML = '<a href="/auth/discord">Link Discord</a>';
  }
}

function syncNoteField(id) {
  const noteEl = document.getElementById('regionNote');
  const labelEl = document.getElementById('noteLabel');
  if (!noteEl || !labelEl) return;
  if (!id) {
    noteEl.hidden = true;
    labelEl.hidden = true;
    return;
  }
  noteEl.hidden = false;
  labelEl.hidden = false;
  const p = loadProfile();
  noteEl.value = (p.notes && p.notes[id]) || '';
  noteEl.oninput = () => {
    saveProfile({ notes: { [id]: noteEl.value } });
  };
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
    if (a.stroke) shape.style.stroke = a.stroke;
    if (a.fill) shape.style.fill = a.fill;
    if (activeId && a.id !== activeId) shape.classList.add('is-dim');
    if (a.id === activeId) shape.classList.add('is-active');
    shape.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
    shape.addEventListener('click', function() { selectMarker(a.id, { focus: true }); });
    // SoT: pin markers[].label — never show stale regions-ui lore names
    const tip = displayNameForRegionId(a.id, a.name);
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
  const profile = loadProfile();
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
  initEditMode(profile);
  initFeedbackUi();
  coordsDirty = Object.keys(profile.coord_overrides || {}).length > 0;
  const castBtn = document.getElementById('castToggle');
  if (castBtn) {
    castBtn.onclick = () => setCastMode(!castMode);
  }
  window.addEventListener('hashchange', applyCastHash);
  applyCastHash();
  loadCast();
  if (data.error) {
    stage.innerHTML = '<p class="err">' + data.error + '</p>';
    return;
  }
  const markers = data.markers || [];
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
    btn.innerHTML = num + '<strong>' + label + '</strong><span class="meta">' + kind + ' · ' + coord +
      '</span><span class="lane lane--' + lane + '">' + lane + '</span>';
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
  if (labelLayer) {
    labelLayer.classList.add('map-label-layer');
    labelLayer.innerHTML = '';
    placeMapLabels(labelLayer, markers);
  }
  syncAreaLayerVisibility();
  syncCitiesLayerVisibility();
  syncLabelLayerVisibility();
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
  const terrainTiles = layerEl(stack, 'terrain-tiles');
  if (terrainTiles) {
    const tileWrap = document.createElement('div');
    tileWrap.id = 'mapTileLayer';
    tileWrap.className = 'map-tile-layer';
    terrainTiles.appendChild(tileWrap);
  }
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
      pin.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
      pin.addEventListener('click', function() { selectMarker(m.id, { focus: true }); });
      pin.addEventListener('mouseenter', e => showTooltip(label, e.clientX, e.clientY));
      pin.addEventListener('mousemove', e => showTooltip(label, e.clientX, e.clientY));
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

function loadRegionsBoard() {
  if (!fs.existsSync(REGIONS_BOARD)) return null;
  try {
    return JSON.parse(fs.readFileSync(REGIONS_BOARD, "utf8"));
  } catch {
    return null;
  }
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

// ponytail: merge map + board once per mtime — linuxbox serves cached JSON, not disk per hit
let mapJsonCache = { mtimeMs: 0, data: null };

function loadMapJson() {
  if (!fs.existsSync(MAP_JSON)) {
    return { campaign: CAMPAIGN, markers: [], error: "map.json missing" };
  }
  try {
    const st = fs.statSync(MAP_JSON);
    if (mapJsonCache.data && mapJsonCache.mtimeMs === st.mtimeMs) {
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
    mapJsonCache = { mtimeMs: st.mtimeMs, data };
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

function mePayload(req) {
  const session = sessionFromReq(req);
  const loggedIn = Boolean(session && session.id && session.id !== "public");
  return {
    logged_in: loggedIn,
    id: loggedIn ? session.id : null,
    username: loggedIn ? session.username : null,
    discord_auth_required: REQUIRE_AUTH,
    discord_configured: Boolean(OAUTH_CLIENT_ID && OAUTH_REDIRECT),
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
    fs.writeFileSync(REGIONS_UI_JSON, JSON.stringify(ui, null, 2) + "\n");
  }

  mapJsonCache = { mtimeMs: 0, data: null };
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

  if (url === "/health") {
    sendJson(res, {
      ok: true,
      campaign: CAMPAIGN,
      discord_auth: REQUIRE_AUTH,
      profile_storage: "client-v1",
      cast: true,
      registry: fs.existsSync(REGISTRY_JSON),
    });
    return;
  }

  if (url === "/api/me") {
    sendJson(res, mePayload(req), 200, 0);
    return;
  }

  if (url === "/auth/discord") {
    if (!OAUTH_CLIENT_ID || !OAUTH_REDIRECT) {
      res.writeHead(503);
      res.end("Discord OAuth not configured");
      return;
    }
    const state = crypto.randomBytes(16).toString("hex");
    res.setHeader(
      "Set-Cookie",
      `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
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
    const cookies = parseCookies(req.headers.cookie);
    if (q.searchParams.get("state") !== cookies.oauth_state) {
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
      const tok = await discordTokenExchange(code);
      const user = await discordUser(tok.access_token);
      const ok = await isGuildMember(user.id);
      if (!ok) {
        res.writeHead(403);
        res.end("You must be a member of the campaign Discord server.");
        return;
      }
      setSessionCookie(res, { id: user.id, username: user.global_name || user.username });
      res.writeHead(302, { Location: "/" });
      res.end();
    } catch (e) {
      res.writeHead(502);
      res.end("Discord login failed");
    }
    return;
  }

  if (url === "/auth/logout") {
    clearSessionCookie(res);
    res.writeHead(302, { Location: "/" });
    res.end();
    return;
  }

  const session = sessionFromReq(req);

  if (url === "/" || url === "/index.html") {
    if (REQUIRE_AUTH && !session) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(LOGIN_HTML);
      return;
    }
    const label =
      REQUIRE_AUTH && session && session.username ? `@${session.username}` : "";
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(viewerHtml(label));
    return;
  }
  if (url === "/api/map") {
    if (REQUIRE_AUTH && !session) {
      sendJson(res, { error: "login required" }, 401);
      return;
    }
    sendJson(res, loadMapJson(), 200, 300);
    return;
  }
  if (url === "/api/map/coords" && req.method === "POST") {
    if (REQUIRE_AUTH && !session) {
      sendJson(res, { error: "login required" }, 401);
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
  if (url === "/api/regions") {
    if (REQUIRE_AUTH && !session) {
      sendJson(res, { error: "login required" }, 401);
      return;
    }
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
  if (url === "/api/characters") {
    if (REQUIRE_AUTH && !session) {
      sendJson(res, { error: "login required" }, 401);
      return;
    }
    const includeHidden = q.searchParams.get("include_hidden") === "1";
    sendJson(res, loadCastRegistry({ includeHidden }), 200, 0);
    return;
  }
  if (url === "/api/characters/sheet") {
    if (REQUIRE_AUTH && !session) {
      sendJson(res, { error: "login required" }, 401);
      return;
    }
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
    if (REQUIRE_AUTH && !session) {
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }
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
    if (REQUIRE_AUTH && !session) {
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }
    const data = loadMapJson();
    const imgRes = q.searchParams.get("res");
    const rel =
      imgRes === "2k" && data.base_image_2k && !data.base_image_2k.includes("..")
        ? data.base_image_2k
        : data.base_image;
    if (!rel || rel.includes("..")) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const abs = path.join(CAMPAIGN_DIR, rel);
    if (!fs.existsSync(abs)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    const types = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=86400",
    });
    fs.createReadStream(abs).pipe(res);
    return;
  }

  const tileMatch = url.match(/^\/map-tiles\/(\d+)\/(\d+)\/(\d+)\.webp$/);
  if (tileMatch) {
    if (REQUIRE_AUTH && !session) {
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }
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

function bindListen() {
  const onListen = (host) => console.log(`tableslop: http://${host}:${PORT}/  campaign=${CAMPAIGN}`);
  server.listen(PORT, HOST, () => onListen(HOST));
  // ponytail: cloudflared uses localhost → [::1]; mirror listener with same handler (not emit — breaks streams)
  if (HOST === "127.0.0.1") {
    http.createServer(handleRequest).listen(PORT, "::1", () => onListen("::1"));
  }
}

bindListen();
