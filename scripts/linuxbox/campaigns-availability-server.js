#!/usr/bin/env node
/**
 * campaigns.tableslop.org — public campaign availability (not the map).
 * Loopback origin for cloudflared-tableslop hostname campaigns.tableslop.org.
 * No secrets; honest loopback (+ optional public map) probes only.
 */
"use strict";

const http = require("http");
const https = require("https");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const HOST = process.env.CAMPAIGNS_AVAIL_HOST || "127.0.0.1";
const PORT = Number(process.env.CAMPAIGNS_AVAIL_PORT || 8768);
const PROBE_MS = 3500;

function probeUrl(url, timeoutMs = PROBE_MS) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const finish = (code) => resolve({ ok: code >= 200 && code < 400, code: code || 0, ms: Date.now() - t0 });
    const mod = String(url).startsWith("https:") ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      finish(res.statusCode || 0);
    });
    req.on("error", () => finish(0));
    req.on("timeout", () => {
      req.destroy();
      finish(0);
    });
  });
}

async function unitActive(unit, scope) {
  const args =
    scope === "user"
      ? ["--user", "is-active", unit]
      : ["is-active", unit];
  try {
    const { stdout } = await execFileAsync("systemctl", args, { timeout: 8000 });
    const st = String(stdout || "").trim();
    return st === "active" || st === "activating";
  } catch (e) {
    const out = String((e && e.stdout) || "").trim();
    return out === "active" || out === "activating";
  }
}

async function collectAvailability() {
  const [mapLocal, mapPublic, pixiLocal, hunterActive, tableslopUnit, tunnelActive, pixiUnit] =
    await Promise.all([
      probeUrl("http://127.0.0.1:8765/health"),
      probeUrl("https://map.tableslop.org/health"),
      probeUrl("http://127.0.0.1:8767/"),
      unitActive("hermes-gateway-hunter-reckoning.service", "user"),
      unitActive("linuxbox-tableslop.service", "system"),
      unitActive("cloudflared-tableslop.service", "system"),
      unitActive("linuxbox-pixi-rp.service", "user"),
    ]);

  const mapUp = mapLocal.ok;
  const mapEdgeUp = mapPublic.ok;
  const hunterUp = hunterActive;
  const pixiUp = pixiLocal.ok || pixiUnit;

  const campaigns = [
    {
      id: "tropic-gooner",
      name: "Tropic Gooner · Isla Primavera",
      kind: "campaign",
      status: mapUp ? "up" : "down",
      note: mapUp
        ? mapEdgeUp
          ? "Map origin + public edge OK"
          : "Map origin OK; public edge not responding"
        : "Map origin :8765 not healthy",
      links: [{ label: "Open map", href: "https://map.tableslop.org/" }],
      probes: {
        origin: mapLocal,
        public: mapPublic,
        unit_active: tableslopUnit,
      },
    },
    {
      id: "hunter-reckoning",
      name: "Hunter: The Reckoning",
      kind: "campaign",
      status: hunterUp ? "up" : "down",
      note: hunterUp
        ? "Discord live bot gateway active (same chronicle as Tropic Gooner)"
        : "Hunter Discord gateway inactive",
      links: [],
      probes: { unit_active: hunterActive },
    },
    {
      id: "tableslop-map",
      name: "tableslop map edge",
      kind: "service",
      status: tunnelActive && mapEdgeUp ? "up" : tunnelActive || mapUp ? "degraded" : "down",
      note: tunnelActive
        ? mapEdgeUp
          ? "cloudflared-tableslop + map.tableslop.org OK"
          : "Tunnel unit active; public /health failed"
        : "cloudflared-tableslop inactive",
      links: [{ label: "map.tableslop.org", href: "https://map.tableslop.org/" }],
      probes: { tunnel_active: tunnelActive, public: mapPublic },
    },
    {
      id: "pixi-rp",
      name: "Pixi RP",
      kind: "service",
      status: pixiUp ? "up" : "down",
      note: pixiUp
        ? "Up on Tailscale/LAN :8767 (not public abhinavall)"
        : "Pixi :8767 not reachable (LAN/Tailscale only when up)",
      links: [],
      probes: { origin: pixiLocal, unit_active: pixiUnit },
      visibility: "private",
    },
  ];

  return {
    ok: true,
    host: "campaigns.tableslop.org",
    updated_at: new Date().toISOString(),
    campaigns,
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(payload) {
  const rows = (payload.campaigns || [])
    .map((c) => {
      const links = (c.links || [])
        .map((l) => `<a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`)
        .join(" · ");
      const vis = c.visibility === "private" ? `<span class="tag">private</span>` : "";
      return `<li class="card status-${escapeHtml(c.status)}">
  <div class="row">
    <strong>${escapeHtml(c.name)}</strong>
    <span class="badge">${escapeHtml(c.status)}</span>
  </div>
  <p>${escapeHtml(c.note || "")} ${vis}</p>
  ${links ? `<p class="links">${links}</p>` : ""}
</li>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>tableslop · campaign availability</title>
  <style>
    :root {
      --bg: #0b0d10;
      --fg: #e8ecf1;
      --muted: #9aa3ad;
      --line: #1f2730;
      --up: #3dba6e;
      --down: #d4524a;
      --degraded: #d4a017;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: var(--fg);
      background:
        radial-gradient(900px 420px at 10% -10%, #1a2430 0%, transparent 55%),
        radial-gradient(700px 380px at 100% 0%, #142018 0%, transparent 50%),
        var(--bg);
    }
    main { max-width: 42rem; margin: 0 auto; padding: 2.5rem 1.25rem 3rem; }
    h1 {
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: clamp(1.4rem, 3vw, 1.85rem);
      letter-spacing: 0.02em;
      margin: 0 0 0.35rem;
    }
    .sub { color: var(--muted); margin: 0 0 1.75rem; line-height: 1.45; }
    ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.85rem; }
    .card {
      border: 1px solid var(--line);
      border-left-width: 4px;
      padding: 0.9rem 1rem;
      background: rgba(255,255,255,0.02);
    }
    .status-up { border-left-color: var(--up); }
    .status-down { border-left-color: var(--down); }
    .status-degraded { border-left-color: var(--degraded); }
    .row { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; }
    .badge {
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
    .status-up .badge { color: var(--up); }
    .status-down .badge { color: var(--down); }
    .status-degraded .badge { color: var(--degraded); }
    p { margin: 0.45rem 0 0; color: var(--muted); font-size: 0.95rem; line-height: 1.4; }
    a { color: #7ec8ff; }
    .tag {
      display: inline-block;
      margin-left: 0.35rem;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border: 1px solid var(--line);
      padding: 0.1rem 0.35rem;
      color: var(--muted);
    }
    footer { margin-top: 1.75rem; color: var(--muted); font-size: 0.8rem; }
    code { font-family: "IBM Plex Mono", ui-monospace, monospace; }
  </style>
</head>
<body>
  <main>
    <h1>campaigns.tableslop</h1>
    <p class="sub">Public availability for tableslop campaigns and related services. Map lives at <a href="https://map.tableslop.org/">map.tableslop.org</a>.</p>
    <ul>
${rows}
    </ul>
    <footer>Updated <code>${escapeHtml(payload.updated_at)}</code> · JSON <a href="/api/availability">/api/availability</a></footer>
  </main>
</body>
</html>`;
}

async function handle(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("method not allowed");
    return;
  }

  if (url.pathname === "/health") {
    const body = JSON.stringify({ ok: true, service: "campaigns-availability" });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    if (req.method !== "HEAD") res.end(body);
    else res.end();
    return;
  }

  let payload;
  try {
    payload = await collectAvailability();
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 200) }));
    return;
  }

  if (url.pathname === "/api/availability" || url.pathname === "/api.json") {
    const body = JSON.stringify(payload);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    if (req.method !== "HEAD") res.end(body);
    else res.end();
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    const html = renderHtml(payload);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    if (req.method !== "HEAD") res.end(html);
    else res.end();
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
}

if (require.main === module) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(String((err && err.message) || err).slice(0, 200));
    });
  });
  server.listen(PORT, HOST, () => {
    console.log(`campaigns-availability: http://${HOST}:${PORT}/`);
  });
}

module.exports = { collectAvailability, renderHtml, escapeHtml };
