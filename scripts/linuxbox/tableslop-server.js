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
const REGIONS_BOARD = path.join(REPO, "projects", "tableslop", "regions.json");

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
    background:var(--void); color:var(--text);
    background-image:
      linear-gradient(180deg, rgba(255,113,206,.12) 0%, transparent 35%),
      linear-gradient(0deg, rgba(1,205,254,.08) 0%, transparent 40%),
      repeating-linear-gradient(90deg, rgba(1,205,254,.07) 0 1px, transparent 1px 48px),
      repeating-linear-gradient(0deg, rgba(255,113,206,.05) 0 1px, transparent 1px 48px);
    animation: grid-drift 24s linear infinite;
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
    background:
      radial-gradient(ellipse 70% 40% at 50% 100%, rgba(255,113,206,.18), transparent 60%),
      radial-gradient(ellipse 50% 30% at 80% 20%, rgba(1,205,254,.1), transparent 50%),
      linear-gradient(180deg, #1a0533 0%, #0d0221 100%);
    cursor:grab;
  }
  .map-viewport.is-dragging { cursor:grabbing; }
  .map-viewport .fx-sunset { pointer-events:none; }
  .map-camera {
    position:absolute; inset:0; transform-origin:0 0;
    will-change:transform; overflow:visible;
  }
  .map-stage { position:relative; display:inline-block; line-height:0; z-index:1; }
  .map-tile-layer { position:absolute; inset:0; pointer-events:none; overflow:visible; }
  .map-tile-layer img {
    position:absolute; display:block; image-rendering:auto;
  }
  .map-overlays {
    position:absolute; inset:0; pointer-events:none; z-index:2;
  }
  .map-stage img {
    display:block; width:auto; height:auto; max-width:none; max-height:none;
    border:2px solid transparent;
    border-image:linear-gradient(135deg, var(--pink), var(--cyan)) 1;
    box-shadow:0 0 40px var(--glow-pink), 0 0 80px rgba(1,205,254,.15);
  }
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
    position:absolute; inset:0; pointer-events:none; z-index:3;
  }
  .map-label {
    position:absolute; transform:translate(-50%,-100%);
    font: clamp(11px, 1.35vw, 18px) VT323,monospace;
    color:var(--sun); letter-spacing:.04em;
    text-shadow:0 0 4px #0d0221, 0 0 10px var(--glow-pink), 0 0 18px rgba(1,205,254,.35);
    white-space:nowrap; opacity:.92;
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

  .fx-scanlines {
    position: fixed; inset: 0; pointer-events: none; z-index: 9998;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0,0,0,.12) 2px,
      rgba(0,0,0,.12) 4px
    );
    animation: scanlines .12s linear infinite;
    opacity: .35;
  }
  .fx-sunset {
    position: absolute; left: 50%; bottom: 8%; width: 70%; height: 40%;
    transform: translateX(-50%);
    background: radial-gradient(ellipse, rgba(255,113,206,.25) 0%, rgba(185,103,255,.12) 40%, transparent 70%);
    pointer-events: none; z-index: 0;
    animation: sunset-drift 8s ease-in-out infinite;
  }

  .map-viewport { position: relative; }
  .map-stage img {
    animation: map-frame-glow 4s ease-in-out infinite, map-reveal .7s ease forwards;
  }
  .pin { animation: pin-glow 2.8s ease-in-out infinite; }
  .pin.is-active { animation: pin-glow-active 1.4s ease-in-out infinite; }

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

  .region-journal::after {
    content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 2;
    background: linear-gradient(180deg, transparent 0%, rgba(1,205,254,.03) 50%, transparent 100%);
    background-size: 100% 200%;
    animation: scanlines 6s linear infinite;
    opacity: .5;
  }

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
<div class="fx-scanlines" aria-hidden="true"></div>
<header class="hud">
  <div class="hud-brand">tableslop</div>
  <span class="hud-setting" id="mapTitle">Isla Primavera</span>
  <button type="button" class="hud-res" id="resToggle" hidden>4K</button>
  <button type="button" class="hud-res" id="labelToggle" hidden>Labels</button>
  <div class="hud-auth" id="authSlot"></div>
</header>
<div class="game-shell">
  <section class="map-viewport" id="viewport">
    <div class="fx-sunset" aria-hidden="true"></div>
    <div class="map-camera" id="mapCamera">
      <div class="map-stage" id="mapStage"></div>
    </div>
    <div class="map-hint" id="mapHint">drag to pan · scroll to zoom · legend to focus</div>
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
    <h2>◇ Legend</h2>
    <div class="legend-grid" id="legendGrid" aria-label="Region quick select"></div>
    <div class="region-list" id="list"></div>
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
let meCache = null;
let cameraReady = false;
let cameraSaveTimer = null;
const camera = { x: 0, y: 0, scale: 1 };
let panDrag = null;
let fitScale = 1;
let tilePyramid = null;
let tileUpdateTimer = null;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const tooltip = document.getElementById('tooltip');

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { v: 1, mapRes: '4k', visited: [], notes: {} };
    const p = JSON.parse(raw);
    if (!p || p.v !== 1) return { v: 1, mapRes: '4k', visited: [], notes: {} };
    if (!Array.isArray(p.visited)) p.visited = [];
    if (!p.notes || typeof p.notes !== 'object') p.notes = {};
    return p;
  } catch {
    return { v: 1, mapRes: '4k', visited: [], notes: {} };
  }
}

function saveProfile(patch) {
  const cur = loadProfile();
  const next = { ...cur, ...patch, v: 1, updated_at: new Date().toISOString() };
  if (patch.notes) next.notes = { ...cur.notes, ...patch.notes };
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

function pickTileZoom() {
  if (!tilePyramid) return 0;
  const ratio = camera.scale / (fitScale || 0.001);
  if (ratio <= 1) return tilePyramid.minZoom;
  const z = Math.round(Math.log2(ratio * Math.pow(2, tilePyramid.maxZoom)));
  return Math.max(tilePyramid.minZoom, Math.min(tilePyramid.maxZoom, z));
}

function scheduleTileUpdate() {
  if (!tilePyramid) return;
  window.clearTimeout(tileUpdateTimer);
  tileUpdateTimer = window.setTimeout(updateVisibleTiles, 48);
}

function updateVisibleTiles() {
  const layer = document.getElementById('mapTileLayer');
  if (!layer || !tilePyramid) return;
  const z = pickTileZoom();
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
  const pad = 24;
  const vw = vp.clientWidth - pad * 2;
  const vh = vp.clientHeight - pad * 2;
  const scale = Math.min(vw / size.w, vh / size.h, 1);
  camera.scale = scale;
  camera.x = (vp.clientWidth - size.w * scale) / 2;
  camera.y = (vp.clientHeight - size.h * scale) / 2;
  fitScale = scale;
  applyCamera(animate);
  scheduleCameraSave();
}

function restoreCameraFromProfile(profile, animate) {
  const c = profile && profile.camera;
  if (!c || typeof c.scale !== 'number') {
    fitToView(animate);
    return;
  }
  camera.x = c.x || 0;
  camera.y = c.y || 0;
  camera.scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.scale));
  applyCamera(animate);
  cameraReady = true;
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

function markerById(id) {
  return (mapDataCache && mapDataCache.markers || []).find(function(m) { return m.id === id; });
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

function placeMapLabels(container, markers) {
  if (!labelsUiEnabled() || !container) return;
  markers.forEach(function(m) {
    if (m.show_on_map === false) return;
    if (m.x_pct == null || m.y_pct == null) return;
    const el = document.createElement('div');
    el.className = 'map-label map-label--' + (m.type || 'default');
    el.dataset.id = m.id;
    const lx = m.label_x_pct != null ? m.label_x_pct : m.x_pct;
    const dy = m.label_dy_pct != null ? m.label_dy_pct : -2.8;
    const ly = m.label_y_pct != null ? m.label_y_pct : (m.y_pct + dy);
    el.style.left = lx + '%';
    el.style.top = ly + '%';
    el.textContent = m.label || m.name || m.id;
    if (activeId && m.id !== activeId) el.classList.add('is-dim');
    if (m.id === activeId) el.classList.add('is-active');
    container.appendChild(el);
  });
}

function syncLabelLayerVisibility() {
  const layer = document.getElementById('mapLabelLayer');
  if (layer) layer.classList.toggle('is-hidden', !labelsUiEnabled());
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
  let overlays = stage.querySelector('.map-overlays');
  if (!overlays) {
    overlays = document.createElement('div');
    overlays.className = 'map-overlays';
    overlays.id = 'mapOverlays';
    stage.appendChild(overlays);
  }
  let labelLayer = stage.querySelector('.map-label-layer');
  if (!labelLayer) {
    labelLayer = document.createElement('div');
    labelLayer.className = 'map-label-layer';
    labelLayer.id = 'mapLabelLayer';
    stage.appendChild(labelLayer);
  }
  labelLayer.innerHTML = '';
  stage.querySelectorAll('.pin').forEach(function(p) { p.remove(); });
  placePins(stage, markers);
  placeMapLabels(labelLayer, markers);
  syncLabelLayerVisibility();
  restoreCameraFromProfile(profile || loadProfile(), !prefersReducedMotion);
  cameraReady = true;
  scheduleTileUpdate();
}

function renderMapPyramid(stage, data, profile) {
  const py = data.tile_pyramid;
  tilePyramid = py;
  stage.innerHTML = '';
  stage.style.width = py.width + 'px';
  stage.style.height = py.height + 'px';
  const layer = document.createElement('div');
  layer.id = 'mapTileLayer';
  layer.className = 'map-tile-layer';
  stage.appendChild(layer);
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
    stage.appendChild(img);
  } else {
    stage.innerHTML = '<p class="muted">Base map image missing</p>';
  }
}

function placePins(stage, markers) {
  markers.forEach(m => {
    if (m.x_pct == null || m.y_pct == null) return;
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'pin pin--' + (m.type || 'default');
    pin.dataset.id = m.id;
    const num = m.region != null ? m.region : '';
    pin.innerHTML = '<span class="pin-num">' + num + '</span>';
    pin.style.left = m.x_pct + '%';
    pin.style.top = m.y_pct + '%';
    const label = m.label || m.name || m.id;
    pin.setAttribute('aria-label', label);
    pin.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
    pin.addEventListener('click', function() { selectMarker(m.id, { focus: true }); });
    pin.addEventListener('mouseenter', e => showTooltip(label, e.clientX, e.clientY));
    pin.addEventListener('mousemove', e => showTooltip(label, e.clientX, e.clientY));
    pin.addEventListener('mouseleave', hideTooltip);
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

async function handleRequest(req, res) {
  const url = req.url.split("?")[0];
  const q = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url === "/health") {
    sendJson(res, {
      ok: true,
      campaign: CAMPAIGN,
      discord_auth: REQUIRE_AUTH,
      profile_storage: "client-v1",
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
    sendJson(res, board, 200, 300);
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
