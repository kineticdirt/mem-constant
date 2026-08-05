#!/usr/bin/env node
/**
 * campaigns.tableslop.org — availability probes + per-campaign trackers
 * (PC roster, schedule, availability windows, inventory).
 *
 * Data: campaigns/<id>/tracker.json under AGENT_DUMP (default ~/agent-dump).
 * Writes: POST /api/campaigns/:id requires X-Tracker-Key == CAMPAIGNS_TRACKER_KEY
 *   (or loopback with no key when CAMPAIGNS_TRACKER_KEY unset — local try-it only).
 * No secrets in HTML. Map stays on :8765 / map.tableslop.org.
 */
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const HOST = process.env.CAMPAIGNS_AVAIL_HOST || "0.0.0.0";
const PORT = Number(process.env.CAMPAIGNS_AVAIL_PORT || 8768);
const PROBE_MS = 3500;
const AGENT_DUMP =
  process.env.AGENT_DUMP ||
  process.env.LINUXBOX_AGENT_DUMP ||
  path.join(process.env.HOME || "/home/abhinav", "agent-dump");
const TRACKER_KEY = String(process.env.CAMPAIGNS_TRACKER_KEY || "").trim();

/** Campaigns with tracker.json (and portal cards). Player tables first. */
const TRACKED_IDS = ["eurosluts", "nyc-mafia-dnd", "tropic-gooner"];
/** URL aliases → tracker id */
const TRACKER_ALIASES = { euro: "eurosluts", "euro-campaign": "eurosluts", nyc: "nyc-mafia-dnd" };
const DISCORD_STATUS_PATH = path.join(AGENT_DUMP, "agents", "state", "campaign-discord-status.json");

function resolveCampaignId(raw) {
  const id = String(raw || "").replace(/[^a-z0-9_-]/gi, "");
  if (!id) return null;
  if (TRACKER_ALIASES[id]) return TRACKER_ALIASES[id];
  return id;
}

function discordDeepLink(d) {
  if (!d || !d.guild_id || !d.channel_id) return null;
  return `https://discord.com/channels/${d.guild_id}/${d.channel_id}`;
}

function readDiscordStatus() {
  try {
    return JSON.parse(fs.readFileSync(DISCORD_STATUS_PATH, "utf8"));
  } catch {
    return null;
  }
}

function discordStatusFor(campaignId) {
  const st = readDiscordStatus();
  const rows = (st && st.campaigns) || [];
  return rows.find((r) => r.campaign_id === campaignId) || null;
}

/** Discord snowflake → ISO (when probe omitted last_message_at). */
function snowflakeToIso(id) {
  try {
    const n = BigInt(String(id));
    const ms = Number((n >> 22n) + 1420070400000n);
    if (!Number.isFinite(ms) || ms < 1e12) return null;
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function relativeAgeLabel(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 14) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}

function nextScheduleLabel(t) {
  const rows = (t && t.schedule) || [];
  if (!rows.length) return "No schedule rows";
  const s = rows[0];
  const when = String(s.when || "").trim();
  const title = String(s.title || "").trim();
  if (when && title) return `${when} · ${title}`;
  return when || title || "Scheduled";
}

function availSummaryLabel(t) {
  const rows = (t && t.availability) || [];
  if (!rows.length) return "No availability rows";
  const a = rows[0];
  const person = String(a.person || "Table").trim();
  const windows = String(a.windows || "").trim();
  return windows ? `${person}: ${windows}` : person;
}

/** Player-safe chat summary (no message bodies). */
function buildChatSummary(campaignId, trackerDiscord) {
  const dstat = discordStatusFor(campaignId);
  const fileSt = readDiscordStatus();
  const dlink =
    discordDeepLink(trackerDiscord) || (dstat && dstat.discord_url) || null;
  const lastAt =
    (dstat && dstat.last_message_at) ||
    snowflakeToIso(dstat && dstat.last_message_id) ||
    null;
  let probe_status = "not_probed";
  if (dstat) probe_status = dstat.status || (dstat.ok ? "ok" : "unknown");
  else if (!dlink) probe_status = "needs_ids";
  return {
    linked: !!dlink,
    url: dlink,
    probe_status,
    probe_ok: !!(dstat && dstat.ok),
    probe_detail: (dstat && dstat.detail) || "",
    channel_name: (dstat && dstat.channel_name) || null,
    guild_name: (dstat && dstat.guild_name) || null,
    threads: dstat && dstat.threads != null ? dstat.threads : null,
    last_message_id: (dstat && dstat.last_message_id) || null,
    last_message_at: lastAt,
    last_activity_label: relativeAgeLabel(lastAt),
    probe_updated_at: (fileSt && fileSt.updated_at) || null,
  };
}

function liveCampaignStatus(id, fallback) {
  const d = discordStatusFor(id);
  if (id === "tropic-gooner") return fallback;
  if (!d) return "tracked";
  if (d.status === "ok" || d.status === "partial") return "up";
  if (d.status === "needs_ids") return "tracked";
  return "degraded";
}

function probeUrl(url, timeoutMs = PROBE_MS) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const finish = (code) =>
      resolve({ ok: code >= 200 && code < 400, code: code || 0, ms: Date.now() - t0 });
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
  const args = scope === "user" ? ["--user", "is-active", unit] : ["is-active", unit];
  try {
    const { stdout } = await execFileAsync("systemctl", args, { timeout: 8000 });
    const st = String(stdout || "").trim();
    return st === "active" || st === "activating";
  } catch (e) {
    const out = String((e && e.stdout) || "").trim();
    return out === "active" || out === "activating";
  }
}

function trackerPath(id) {
  const safe = String(id || "").replace(/[^a-z0-9_-]/gi, "");
  if (!safe || safe !== id) return null;
  return path.join(AGENT_DUMP, "campaigns", safe, "tracker.json");
}

function readTracker(id) {
  const fp = trackerPath(id);
  if (!fp) return null;
  try {
    const raw = fs.readFileSync(fp, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    data.id = data.id || id;
    return data;
  } catch {
    return null;
  }
}

function writeTracker(id, data) {
  const fp = trackerPath(id);
  if (!fp) throw new Error("bad_campaign_id");
  const dir = path.dirname(fp);
  fs.mkdirSync(dir, { recursive: true });
  data.id = id;
  data.updated_at = new Date().toISOString();
  const tmp = fp + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, fp);
  return data;
}

/** Sidecar player↔character links (manual paste; no OAuth; avoids registry thrash). */
function linksPath(id) {
  const safe = String(id || "").replace(/[^a-z0-9_-]/gi, "");
  if (!safe || safe !== id) return null;
  return path.join(AGENT_DUMP, "campaigns", safe, "player-character-links.json");
}

function emptyLinksDoc(id) {
  return {
    version: 1,
    campaign_id: id,
    updated_at: null,
    links: [],
    notes: "Manual Discord user id ↔ character registry id. No OAuth.",
  };
}

function readLinks(id) {
  const fp = linksPath(id);
  if (!fp) return null;
  try {
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (!data || typeof data !== "object") return emptyLinksDoc(id);
    data.campaign_id = data.campaign_id || id;
    data.version = Number(data.version) || 1;
    data.links = Array.isArray(data.links) ? data.links : [];
    return data;
  } catch (err) {
    if (err && err.code === "ENOENT") return emptyLinksDoc(id);
    throw err;
  }
}

function writeLinks(id, data) {
  const fp = linksPath(id);
  if (!fp) throw new Error("bad_campaign_id");
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  data.campaign_id = id;
  data.version = Number(data.version) || 1;
  data.updated_at = new Date().toISOString();
  data.links = Array.isArray(data.links) ? data.links : [];
  const tmp = fp + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, fp);
  return data;
}

/** Discord snowflake: 17–20 digits. */
function isDiscordSnowflake(raw) {
  return /^\d{17,20}$/.test(String(raw || "").trim());
}

function isCharacterId(raw) {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(String(raw || "").trim());
}

/**
 * Soft registry check when characters-registry.json exists.
 * Returns { ok:true, found:bool|null, name?:string }.
 */
function lookupRegistryCharacter(campaignId, characterId) {
  const fp = path.join(AGENT_DUMP, "campaigns", campaignId, "characters-registry.json");
  try {
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    const chars = Array.isArray(data.characters) ? data.characters : [];
    const hit = chars.find((c) => c && String(c.id) === characterId);
    if (!hit) return { ok: true, found: false };
    return {
      ok: true,
      found: true,
      name: hit.name || hit.display_name || hit.canonical_name || "",
    };
  } catch (err) {
    if (err && err.code === "ENOENT") return { ok: true, found: null };
    return { ok: false, found: null, error: String((err && err.message) || err).slice(0, 80) };
  }
}

function upsertPlayerCharacterLink(campaignId, body) {
  const discord_user_id = String((body && body.discord_user_id) || "").trim();
  const character_id = String((body && body.character_id) || "").trim();
  const note = String((body && body.note) || "").trim().slice(0, 200);
  if (!isDiscordSnowflake(discord_user_id)) {
    return { ok: false, status: 400, error: "invalid_discord_user_id", detail: "expect 17–20 digit Discord snowflake" };
  }
  if (!isCharacterId(character_id)) {
    return { ok: false, status: 400, error: "invalid_character_id", detail: "expect slug [a-z0-9_-]+" };
  }
  const reg = lookupRegistryCharacter(campaignId, character_id);
  if (!reg.ok) {
    return { ok: false, status: 500, error: "registry_read_failed", detail: reg.error || "" };
  }
  if (reg.found === false) {
    return {
      ok: false,
      status: 400,
      error: "character_not_found",
      detail: `no id=${character_id} in characters-registry.json`,
    };
  }
  const doc = readLinks(campaignId);
  const now = new Date().toISOString();
  const next = {
    discord_user_id,
    character_id,
    linked_at: now,
    note,
  };
  if (reg.found === true && reg.name) next.character_name = reg.name;
  const links = (doc.links || []).filter((L) => String(L.character_id) !== character_id);
  links.push(next);
  links.sort((a, b) => String(a.character_id).localeCompare(String(b.character_id)));
  doc.links = links;
  const saved = writeLinks(campaignId, doc);
  return {
    ok: true,
    status: 200,
    link: next,
    links: saved.links,
    updated_at: saved.updated_at,
    registry_checked: reg.found !== null,
  };
}

function listTrackers() {
  return TRACKED_IDS.map((id) => {
    const t = readTracker(id);
    if (!t) {
      return {
        id,
        title: id,
        status: "missing",
        live_status: "missing",
        href: `/c/${id}`,
        name_pending: false,
        chat: buildChatSummary(id, null),
        glance: {
          availability: "Tracker file missing",
          schedule: "—",
          chat: "—",
        },
      };
    }
    const chat = buildChatSummary(id, t.discord);
    const live =
      id === "tropic-gooner"
        ? t.status || "active"
        : liveCampaignStatus(id, t.status || "active");
    return {
      id: t.id,
      title: t.title || id,
      subtitle: t.subtitle || "",
      status: t.status || "active",
      live_status: live,
      name_pending: !!t.name_pending,
      player_facing: !!t.player_facing,
      map_href: t.map_href || null,
      discord_url: chat.url,
      discord_probe: chat.probe_status !== "not_probed" && chat.probe_status !== "needs_ids"
        ? {
            status: chat.probe_status,
            ok: chat.probe_ok,
            detail: chat.probe_detail,
            channel_name: chat.channel_name,
            last_message_at: chat.last_message_at,
            last_activity_label: chat.last_activity_label,
            updated_at: chat.probe_updated_at,
          }
        : chat.probe_status === "needs_ids"
          ? { status: "needs_ids", ok: false, detail: "guild/channel ids missing", updated_at: chat.probe_updated_at }
          : null,
      chat,
      glance: {
        availability: availSummaryLabel(t),
        schedule: nextScheduleLabel(t),
        chat: chat.linked
          ? `#${chat.channel_name || "channel"} · ${chat.last_activity_label || chat.probe_status}`
          : "Discord IDs needed",
      },
      href: `/c/${id}`,
      pcs: (t.pcs || []).length,
      schedule: (t.schedule || []).length,
      availability_rows: (t.availability || []).length,
      updated_at: t.updated_at || null,
    };
  });
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

  const euroChat = buildChatSummary("eurosluts", (readTracker("eurosluts") || {}).discord);
  const nycChat = buildChatSummary("nyc-mafia-dnd", (readTracker("nyc-mafia-dnd") || {}).discord);
  const tropicChat = buildChatSummary("tropic-gooner", (readTracker("tropic-gooner") || {}).discord);

  const campaigns = [
    {
      id: "tropic-gooner",
      name: "Tropic Gooner · Isla Primavera",
      kind: "campaign",
      status: mapUp ? "up" : "down",
      note: mapUp
        ? mapEdgeUp
          ? `Map origin + public edge OK · chat ${tropicChat.last_activity_label || tropicChat.probe_status}`
          : "Map origin OK; public edge not responding"
        : "Map origin :8765 not healthy",
      links: [
        { label: "Open map", href: "https://map.tableslop.org/" },
        { label: "Tracker", href: "/c/tropic-gooner" },
        ...(tropicChat.url ? [{ label: "Discord chat", href: tropicChat.url }] : []),
      ],
      chat: tropicChat,
      probes: { origin: mapLocal, public: mapPublic, unit_active: tableslopUnit, discord: discordStatusFor("tropic-gooner") },
    },
    {
      id: "hunter-reckoning",
      name: "Hunter: The Reckoning",
      kind: "campaign",
      status: hunterUp ? "up" : "down",
      note: hunterUp
        ? "Discord live bot gateway active (same chronicle as Tropic Gooner)"
        : "Hunter Discord gateway inactive",
      links: [{ label: "Tropic tracker", href: "/c/tropic-gooner" }],
      probes: { unit_active: hunterActive },
    },
    {
      id: "eurosluts",
      name: "Euro Campaign (name pending)",
      kind: "campaign",
      status: liveCampaignStatus("eurosluts", "tracked"),
      note: euroChat.linked
        ? `Discord ${euroChat.probe_status}${euroChat.channel_name ? " · #" + euroChat.channel_name : ""}${euroChat.last_activity_label ? " · last " + euroChat.last_activity_label : ""} · player tracker`
        : "Discord IDs missing — player tracker only",
      links: [
        { label: "Player tracker", href: "/c/euro" },
        ...(euroChat.url ? [{ label: "Open Discord", href: euroChat.url }] : []),
      ],
      chat: euroChat,
      probes: { discord: discordStatusFor("eurosluts") },
    },
    {
      id: "nyc-mafia-dnd",
      name: "NYC Mafia × D&D",
      kind: "campaign",
      status: liveCampaignStatus("nyc-mafia-dnd", "tracked"),
      note: nycChat.linked
        ? `Discord ${nycChat.probe_status}${nycChat.last_activity_label ? " · last " + nycChat.last_activity_label : ""}`
        : "Discord IDs pending — tracker live; paste guild/category/channel via Inbox",
      links: [{ label: "Player tracker", href: "/c/nyc" }],
      chat: nycChat,
      probes: { discord: discordStatusFor("nyc-mafia-dnd") },
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
    trackers: listTrackers(),
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkBase(req) {
  const p = String((req && req.headers && req.headers["x-forwarded-prefix"]) || "").replace(/\/$/, "");
  return p || "";
}

function href(req, path) {
  const base = linkBase(req);
  if (!path.startsWith("/")) path = "/" + path;
  return base + path;
}

/** Prefix absolute internal hrefs in availability JSON when behind /camp proxy. */
function prefixPayloadLinks(payload, req) {
  if (!linkBase(req)) return payload;
  const out = { ...payload };
  out.trackers = (payload.trackers || []).map((t) => ({
    ...t,
    href: href(req, t.href || `/c/${t.id}`),
  }));
  out.campaigns = (payload.campaigns || []).map((c) => ({
    ...c,
    links: (c.links || []).map((l) =>
      l && l.href && String(l.href).startsWith("/") ? { ...l, href: href(req, l.href) } : l
    ),
  }));
  return out;
}

/* Day theme ("clean daylight") — shared toggle plumbing for the three pages below. */
const DAY_THEME_CSS = `
    body.day { --bg:#f7f8fa; --fg:#1c222b; --muted:#5b6672; --line:#d4dae2; }
    body.day a { color:#0b6aa8; }
    .day-toggle { position:fixed; top:0.75rem; right:0.75rem; z-index:50; font:inherit; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; padding:0.3rem 0.7rem; cursor:pointer; color:var(--fg); background:var(--bg); border:1px solid var(--line); }
    .day-toggle:hover { border-color:var(--fg); }
`;
const DAY_THEME_EARLY = `<script>try{if(localStorage.getItem("campaigns-theme")==="day")document.body.classList.add("day");}catch(e){}</script>`;
const DAY_THEME_SNIPPET = `<button type="button" class="day-toggle" id="dayToggle" aria-pressed="false" title="Day / night theme">Day</button>
<script>(function(){var K="campaigns-theme";function apply(m){var d=m==="day";document.body.classList.toggle("day",d);var b=document.getElementById("dayToggle");if(b){b.setAttribute("aria-pressed",d?"true":"false");b.textContent=d?"Night":"Day";}}var s="night";try{s=localStorage.getItem(K)==="day"?"day":"night";}catch(e){}apply(s);var b=document.getElementById("dayToggle");if(b)b.addEventListener("click",function(){var n=document.body.classList.contains("day")?"night":"day";try{localStorage.setItem(K,n);}catch(e){}apply(n);});})();</script>`;

function renderPortal(payload, req) {
  const rows = (payload.campaigns || [])
    .map((c) => {
      const links = (c.links || [])
        .map((l) => {
          const h = l.href && l.href.startsWith("/") ? href(req, l.href) : l.href;
          return `<a href="${escapeHtml(h)}">${escapeHtml(l.label)}</a>`;
        })
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

  const trackerCards = (payload.trackers || [])
    .map((t) => {
      const pending = t.name_pending ? `<span class="tag">name pending</span>` : "";
      const player = t.player_facing ? `<span class="tag">players</span>` : "";
      const map = t.map_href
        ? ` · <a href="${escapeHtml(t.map_href)}">map</a>`
        : "";
      const disc = t.discord_url
        ? ` · <a href="${escapeHtml(t.discord_url)}">Discord</a>`
        : " · <span class=\"tag\">discord ids?</span>";
      const chat = t.chat || {};
      const liveBadge = t.live_status || t.status || "?";
      const glance = t.glance || {};
      return `<li class="card status-${escapeHtml(liveBadge)}">
  <div class="row">
    <strong><a href="${escapeHtml(href(req, t.href))}">${escapeHtml(t.title)}</a></strong>
    <span class="badge">${escapeHtml(liveBadge)}</span>
  </div>
  <p>${escapeHtml(t.subtitle || "")} ${pending} ${player}</p>
  <dl class="glance">
    <div><dt>Availability</dt><dd>${escapeHtml(glance.availability || "—")}</dd></div>
    <div><dt>Schedule</dt><dd>${escapeHtml(glance.schedule || "—")}</dd></div>
    <div><dt>Chat</dt><dd>${escapeHtml(glance.chat || "—")}${chat.last_message_at ? ` <span class="meta">(${escapeHtml(String(chat.last_message_at).slice(0, 16).replace("T", " "))}Z)</span>` : ""}</dd></div>
  </dl>
  <p class="links">${(t.pcs || 0)} PCs · ${(t.schedule || 0)} schedule · probe:${escapeHtml(chat.probe_status || "?")}${map}${disc}</p>
</li>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>tableslop · campaigns</title>
  <style>
    :root {
      --bg: #0b0d10; --fg: #e8ecf1; --muted: #9aa3ad; --line: #1f2730;
      --up: #3dba6e; --down: #d4524a; --degraded: #d4a017; --tracked: #5b8def;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif; color: var(--fg);
      background: radial-gradient(900px 420px at 10% -10%, #1a2430 0%, transparent 55%), var(--bg);
    }
    main { max-width: 44rem; margin: 0 auto; padding: 2.5rem 1.25rem 3rem; }
    h1 { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: clamp(1.4rem, 3vw, 1.85rem); margin: 0 0 0.35rem; }
    h2 { font-size: 1rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); margin: 2rem 0 0.75rem; }
    .sub { color: var(--muted); margin: 0 0 1.5rem; line-height: 1.45; }
    ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.85rem; }
    .card { border: 1px solid var(--line); border-left-width: 4px; padding: 0.9rem 1rem; background: rgba(255,255,255,0.02); }
    .status-up { border-left-color: var(--up); }
    .status-down { border-left-color: var(--down); }
    .status-degraded { border-left-color: var(--degraded); }
    .status-tracked, .status-active, .status-missing { border-left-color: var(--tracked); }
    .row { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; }
    .badge { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .status-up .badge { color: var(--up); }
    .status-down .badge { color: var(--down); }
    .status-degraded .badge { color: var(--degraded); }
    p { margin: 0.45rem 0 0; color: var(--muted); font-size: 0.95rem; line-height: 1.4; }
    a { color: #7ec8ff; }
    .tag { display: inline-block; margin-left: 0.35rem; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid var(--line); padding: 0.1rem 0.35rem; color: var(--muted); }
    .glance { display: grid; gap: 0.35rem; margin: 0.65rem 0 0; padding: 0; }
    .glance > div { display: grid; grid-template-columns: 6.5rem 1fr; gap: 0.5rem; font-size: 0.88rem; }
    .glance dt { margin: 0; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.68rem; padding-top: 0.15rem; }
    .glance dd { margin: 0; color: var(--fg); }
    .glance .meta { color: var(--muted); font-size: 0.75rem; }
    footer { margin-top: 1.75rem; color: var(--muted); font-size: 0.8rem; }
    code { font-family: "IBM Plex Mono", ui-monospace, monospace; }
    .cta { margin: 0 0 1.25rem; }
    body.day { background: radial-gradient(900px 420px at 10% -10%, #dfe8f2 0%, transparent 55%), var(--bg); }
    body.day .card { background: #ffffff; }
    ${DAY_THEME_CSS}
  </style>
</head>
<body>
  ${DAY_THEME_EARLY}
  <main>
    <h1>campaigns.tableslop</h1>
    <p class="sub">Player tables (Euro + NYC) are Discord-managed on the <strong>linuxbox</strong>. Canonical host: <code>https://campaigns.tableslop.org</code>. Optional interim: <code>https://map.tableslop.org/camp/</code>. Chat status shows last Discord activity time only (no message text).</p>
    <p class="cta"><a href="${escapeHtml(href(req, "/players"))}">→ Player tables (Euro · NYC)</a></p>
    <h2>Trackers</h2>
    <ul>${trackerCards}</ul>
    <h2>Availability</h2>
    <ul>${rows}</ul>
    <footer>Updated <code>${escapeHtml(payload.updated_at)}</code> · JSON <a href="${escapeHtml(href(req, "/api/availability"))}">/api/availability</a> · <a href="${escapeHtml(href(req, "/api/trackers"))}">/api/trackers</a> · Discord probe <a href="${escapeHtml(href(req, "/api/discord-status"))}">/api/discord-status</a></footer>
  </main>
  ${DAY_THEME_SNIPPET}
</body>
</html>`;
}

function sectionTable(title, headers, rowsHtml) {
  return `<section>
  <h2>${escapeHtml(title)}</h2>
  <table>
    <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
    <tbody>${rowsHtml || `<tr><td colspan="${headers.length}" class="empty">None yet</td></tr>`}</tbody>
  </table>
</section>`;
}

function renderCampaign(t, req) {
  const pending = t.name_pending
    ? `<p class="banner">Working title — <strong>name pending</strong>. Rename when locked.</p>`
    : "";
  const map = t.map_href
    ? `<p class="links"><a href="${escapeHtml(t.map_href)}">Open campaign map</a></p>`
    : "";
  const d = t.discord || {};
  const chat = buildChatSummary(t.id, d);
  const dUrl = chat.url;
  const apiPath = href(req, `/api/campaigns/${t.id}`);
  const glance = `<section class="glance-box">
  <h2>At a glance</h2>
  <dl class="glance">
    <div><dt>Availability</dt><dd>${escapeHtml(availSummaryLabel(t))}</dd></div>
    <div><dt>Schedule</dt><dd>${escapeHtml(nextScheduleLabel(t))}</dd></div>
    <div><dt>Chat</dt><dd>${
      chat.linked
        ? `${chat.channel_name ? "#" + escapeHtml(chat.channel_name) + " · " : ""}probe <code>${escapeHtml(chat.probe_status)}</code>${
            chat.last_activity_label ? " · last " + escapeHtml(chat.last_activity_label) : ""
          }${dUrl ? ` · <a href="${escapeHtml(dUrl)}">open Discord</a>` : ""}`
        : "Discord guild/channel IDs not set"
    }</dd></div>
  </dl>
</section>`;
  const discordBlock = dUrl
    ? `<section class="discord">
  <h2>Discord chat track</h2>
  <p><a class="big" href="${escapeHtml(dUrl)}">Open campaign channel</a></p>
  <p class="meta">server <code>${escapeHtml(String(d.guild_id || chat.guild_name || ""))}</code>
    · category <code>${escapeHtml(String(d.category_id || ""))}</code>
    · channel <code>${escapeHtml(String(d.channel_id || ""))}</code></p>
  <p class="meta">Probe: <code>${escapeHtml(chat.probe_status)}</code>
    ${chat.probe_detail ? " — " + escapeHtml(chat.probe_detail) : ""}
    ${chat.channel_name ? " · #" + escapeHtml(chat.channel_name) : ""}
    ${chat.threads != null ? " · threads≈" + escapeHtml(String(chat.threads)) : ""}</p>
  <p class="meta">Last activity: <code>${escapeHtml(chat.last_activity_label || "unknown")}</code>
    ${chat.last_message_at ? "(" + escapeHtml(chat.last_message_at) + ")" : ""}
    — timestamps only; message text is not shown.</p>
  <p class="sub">${escapeHtml(d.notes || "Schedule and table chatter live in Discord; this page mirrors roster/inventory for the table.")}</p>
</section>`
    : `<section class="discord">
  <h2>Discord</h2>
  <p class="banner">Guild / category / channel IDs not set yet — players cannot deep-link. ${escapeHtml(d.notes || "")}</p>
</section>`;

  const pcRows = (t.pcs || [])
    .map(
      (p) => `<tr>
      <td>${escapeHtml(p.name || "")}</td>
      <td>${escapeHtml(p.player || "")}</td>
      <td>${escapeHtml(p.role || "")}</td>
      <td>${escapeHtml(p.notes || "")}</td>
    </tr>`
    )
    .join("");

  const schedRows = (t.schedule || [])
    .map(
      (s) => `<tr>
      <td>${escapeHtml(s.when || "")}</td>
      <td>${escapeHtml(s.title || "")}</td>
      <td>${escapeHtml(s.location || "")}</td>
      <td>${escapeHtml(s.notes || "")}</td>
    </tr>`
    )
    .join("");

  const availRows = (t.availability || [])
    .map(
      (a) => `<tr>
      <td>${escapeHtml(a.person || "")}</td>
      <td>${escapeHtml(a.windows || "")}</td>
      <td>${escapeHtml(a.notes || "")}</td>
    </tr>`
    )
    .join("");

  const invRows = (t.inventory || [])
    .map(
      (i) => `<tr>
      <td>${escapeHtml(i.item || "")}</td>
      <td>${escapeHtml(i.owner || "")}</td>
      <td>${escapeHtml(String(i.qty ?? ""))}</td>
      <td>${escapeHtml(i.notes || "")}</td>
    </tr>`
    )
    .join("");

  const linksDoc = readLinks(t.id) || emptyLinksDoc(t.id);
  const linksApi = href(req, `/api/campaigns/${t.id}/links`);
  const linkRows = (linksDoc.links || [])
    .map(
      (L) => `<tr>
      <td><code>${escapeHtml(L.discord_user_id || "")}</code></td>
      <td><code>${escapeHtml(L.character_id || "")}</code>${
        L.character_name ? " · " + escapeHtml(L.character_name) : ""
      }</td>
      <td>${escapeHtml(L.note || "")}</td>
      <td class="meta">${escapeHtml(L.linked_at || "")}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(t.title || t.id)} · tracker</title>
  <style>
    :root { --bg:#0b0d10; --fg:#e8ecf1; --muted:#9aa3ad; --line:#1f2730; --accent:#7ec8ff; }
    * { box-sizing: border-box; }
    body { margin:0; font-family:"IBM Plex Sans","Segoe UI",sans-serif; color:var(--fg); background:var(--bg); }
    main { max-width: 52rem; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
    a { color: var(--accent); }
    a.big { font-size:1.1rem; font-weight:600; }
    h1 { font-family:"IBM Plex Mono",monospace; font-size:1.5rem; margin:0 0 0.25rem; }
    .sub, .meta { color: var(--muted); margin: 0 0 1rem; }
    .banner { border:1px solid #5b4a1e; background:#1a1608; color:#e6c35c; padding:0.65rem 0.85rem; margin:0 0 1rem; }
    .discord, .glance-box, .pclinks { border:1px solid var(--line); padding:0.85rem 1rem; margin:0 0 1.25rem; background:rgba(126,200,255,0.04); }
    .glance { display:grid; gap:0.4rem; margin:0; padding:0; }
    .glance > div { display:grid; grid-template-columns:7rem 1fr; gap:0.5rem; font-size:0.92rem; }
    .glance dt { margin:0; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em; font-size:0.68rem; padding-top:0.15rem; }
    .glance dd { margin:0; }
    h2 { font-size:0.85rem; letter-spacing:0.06em; text-transform:uppercase; color:var(--muted); margin:1.75rem 0 0.5rem; }
    .glance-box h2, .discord h2, .pclinks h2 { margin-top:0; }
    table { width:100%; border-collapse:collapse; font-size:0.92rem; }
    th, td { border-bottom:1px solid var(--line); text-align:left; padding:0.45rem 0.4rem; vertical-align:top; }
    th { color:var(--muted); font-weight:600; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em; }
    .empty { color:var(--muted); font-style:italic; }
    nav { margin-bottom:1.25rem; font-size:0.9rem; }
    form { margin-top:2rem; border:1px solid var(--line); padding:1rem; }
    .pclinks form { margin-top:0.75rem; border:0; padding:0; }
    label { display:block; font-size:0.75rem; color:var(--muted); margin:0.5rem 0 0.2rem; }
    textarea { width:100%; min-height:10rem; background:#12151a; color:var(--fg); border:1px solid var(--line); padding:0.5rem; font-family:ui-monospace,monospace; font-size:0.8rem; }
    input[type=password], input[type=text] { width:100%; max-width:20rem; background:#12151a; color:var(--fg); border:1px solid var(--line); padding:0.4rem; }
    button { margin-top:0.75rem; background:#1e3a5f; color:var(--fg); border:1px solid #2a5080; padding:0.45rem 0.9rem; cursor:pointer; }
    .ok { color:#3dba6e; } .err { color:#d4524a; }
    body.day { --accent:#0b6aa8; }
    body.day .banner { border-color:#d9c27a; background:#fdf6e3; color:#7a6210; }
    body.day .discord, body.day .glance-box, body.day .pclinks { background:rgba(11,106,168,0.05); }
    body.day textarea, body.day input[type=password], body.day input[type=text] { background:#ffffff; }
    body.day button { background:#e8eef5; border-color:#b9c8d8; }
    ${DAY_THEME_CSS}
  </style>
</head>
<body>
  ${DAY_THEME_EARLY}
  <main>
    <nav><a href="${escapeHtml(href(req, "/players"))}">← player tables</a> · <a href="${escapeHtml(href(req, "/"))}">portal</a></nav>
    <h1>${escapeHtml(t.title || t.id)}</h1>
    <p class="sub">${escapeHtml(t.subtitle || "")}</p>
    ${pending}
    ${glance}
    ${discordBlock}
    ${map}
    <p class="meta">id <code>${escapeHtml(t.id)}</code> · updated <code>${escapeHtml(t.updated_at || "")}</code> · JSON <a href="${escapeHtml(apiPath)}">${escapeHtml(apiPath)}</a></p>
    ${sectionTable("Player characters", ["Name", "Player", "Role", "Notes"], pcRows)}
    ${sectionTable("Schedule", ["When", "Title", "Where", "Notes"], schedRows)}
    ${sectionTable("Availability", ["Person", "Windows", "Notes"], availRows)}
    ${sectionTable("Inventory", ["Item", "Owner", "Qty", "Notes"], invRows)}
    <section class="pclinks">
      <h2>Player ↔ character links</h2>
      <p class="sub">Manual paste — Discord user id + character registry id. No OAuth. Stored in <code>player-character-links.json</code> (not the cast registry). JSON <a href="${escapeHtml(linksApi)}">${escapeHtml(linksApi)}</a></p>
      ${sectionTable("Current links", ["Discord user id", "Character id", "Note", "Linked"], linkRows)}
      <form id="link-save">
        <label>Discord user id (snowflake)</label>
        <input type="text" id="link-discord" autocomplete="off" placeholder="17–20 digit id" inputmode="numeric" />
        <label>Character registry id</label>
        <input type="text" id="link-char" autocomplete="off" placeholder="e.g. nelly-stein" />
        <label>Note (optional)</label>
        <input type="text" id="link-note" autocomplete="off" placeholder="player display name" />
        <label>X-Tracker-Key</label>
        <input type="password" id="link-key" autocomplete="off" placeholder="CAMPAIGNS_TRACKER_KEY (or loopback)" />
        <button type="submit">Save link</button>
        <p id="link-msg"></p>
      </form>
    </section>
    <form id="save">
      <h2>Edit tracker JSON</h2>
      <p class="sub">Paste full tracker object. Requires tracker key (or loopback when unset).</p>
      <label>X-Tracker-Key</label>
      <input type="password" id="key" autocomplete="off" placeholder="CAMPAIGNS_TRACKER_KEY" />
      <label>Body</label>
      <textarea id="body">${escapeHtml(JSON.stringify(t, null, 2))}</textarea>
      <button type="submit">Save</button>
      <p id="msg"></p>
    </form>
    <script>
      document.getElementById("save").addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = document.getElementById("msg");
        msg.textContent = "Saving…";
        msg.className = "";
        let data;
        try { data = JSON.parse(document.getElementById("body").value); }
        catch (err) { msg.textContent = "Invalid JSON"; msg.className = "err"; return; }
        const headers = { "Content-Type": "application/json" };
        const key = document.getElementById("key").value.trim();
        if (key) headers["X-Tracker-Key"] = key;
        const res = await fetch(${JSON.stringify(apiPath)}, { method: "POST", headers, body: JSON.stringify(data) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { msg.textContent = j.error || ("HTTP " + res.status); msg.className = "err"; return; }
        msg.textContent = "Saved " + (j.updated_at || "");
        msg.className = "ok";
        setTimeout(() => location.reload(), 600);
      });
      document.getElementById("link-save").addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = document.getElementById("link-msg");
        msg.textContent = "Saving…";
        msg.className = "";
        const headers = { "Content-Type": "application/json" };
        const key = document.getElementById("link-key").value.trim();
        if (key) headers["X-Tracker-Key"] = key;
        const body = {
          discord_user_id: document.getElementById("link-discord").value.trim(),
          character_id: document.getElementById("link-char").value.trim(),
          note: document.getElementById("link-note").value.trim(),
        };
        const res = await fetch(${JSON.stringify(linksApi)}, { method: "POST", headers, body: JSON.stringify(body) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          msg.textContent = (j.error || ("HTTP " + res.status)) + (j.detail ? " — " + j.detail : "");
          msg.className = "err";
          return;
        }
        msg.textContent = "Linked " + (j.link && j.link.character_id ? j.link.character_id : "") + " @ " + (j.updated_at || "");
        msg.className = "ok";
        setTimeout(() => location.reload(), 600);
      });
    </script>
  </main>
  ${DAY_THEME_SNIPPET}
</body>
</html>`;
}

function renderPlayers(payload, req) {
  const cards = (payload.trackers || [])
    .filter((t) => t.player_facing)
    .map((t) => {
      const trackerHref = href(req, t.href || `/c/${t.id}`);
      const chat = t.chat || {};
      const glance = t.glance || {};
      const disc = t.discord_url
        ? `<p><a href="${escapeHtml(t.discord_url)}">Open Discord</a> · <a href="${escapeHtml(trackerHref)}">Tracker</a></p>`
        : `<p><a href="${escapeHtml(trackerHref)}">Tracker</a> · <span class="tag">Discord IDs needed</span></p>`;
      return `<li class="card status-${escapeHtml(t.live_status || t.status || "tracked")}">
  <div class="row"><strong>${escapeHtml(t.title)}</strong><span class="badge">${escapeHtml(t.live_status || t.status)}</span></div>
  <p>${escapeHtml(t.subtitle || "")}</p>
  <dl class="glance">
    <div><dt>Availability</dt><dd>${escapeHtml(glance.availability || "—")}</dd></div>
    <div><dt>Schedule</dt><dd>${escapeHtml(glance.schedule || "—")}</dd></div>
    <div><dt>Chat</dt><dd>${escapeHtml(glance.chat || "—")}</dd></div>
  </dl>
  ${disc}
  <p class="meta">Discord probe: <code>${escapeHtml(chat.probe_status || "not probed")}</code>${
    chat.last_activity_label ? " · last " + escapeHtml(chat.last_activity_label) : ""
  }</p>
</li>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Player tables · campaigns.tableslop</title>
  <style>
    :root { --bg:#0b0d10; --fg:#e8ecf1; --muted:#9aa3ad; --line:#1f2730; --tracked:#5b8def; --up:#3dba6e; --down:#d4524a; --degraded:#d4a017; }
    body { margin:0; font-family:"IBM Plex Sans",sans-serif; color:var(--fg); background:var(--bg); }
    main { max-width:40rem; margin:0 auto; padding:2.5rem 1.25rem; }
    h1 { font-family:"IBM Plex Mono",monospace; }
    .sub, .meta { color:var(--muted); }
    ul { list-style:none; padding:0; display:grid; gap:0.85rem; }
    .card { border:1px solid var(--line); border-left:4px solid var(--tracked); padding:0.9rem 1rem; }
    .status-up { border-left-color: var(--up); }
    .status-down { border-left-color: var(--down); }
    .status-degraded { border-left-color: var(--degraded); }
    .row { display:flex; justify-content:space-between; gap:1rem; }
    .badge { font-size:0.75rem; text-transform:uppercase; color:var(--muted); }
    .status-up .badge { color: var(--up); }
    a { color:#7ec8ff; }
    .tag { font-size:0.7rem; border:1px solid var(--line); padding:0.1rem 0.35rem; }
    .glance { display:grid; gap:0.35rem; margin:0.65rem 0; padding:0; }
    .glance > div { display:grid; grid-template-columns:6.5rem 1fr; gap:0.5rem; font-size:0.88rem; }
    .glance dt { margin:0; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em; font-size:0.68rem; }
    .glance dd { margin:0; }
    ${DAY_THEME_CSS}
  </style>
</head>
<body>
  ${DAY_THEME_EARLY}
  <main>
    <p><a href="${escapeHtml(href(req, "/"))}">← portal</a></p>
    <h1>Player tables</h1>
    <p class="sub">Euro + NYC — join via Discord; tracker shows PC / schedule / availability / inventory + chat last-activity (no message text).</p>
    <ul>${cards || "<li class=card>No player-facing campaigns yet</li>"}</ul>
  </main>
  ${DAY_THEME_SNIPPET}
</body>
</html>`;
}

function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.socket.remoteAddress || "";
}

function isLoopback(req) {
  const ip = clientIp(req);
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function allowWrite(req) {
  const key = String(req.headers["x-tracker-key"] || "").trim();
  if (TRACKER_KEY) return key === TRACKER_KEY;
  return isLoopback(req);
}

function readBody(req, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handle(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  const method = req.method || "GET";

  if (url.pathname === "/health") {
    const body = JSON.stringify({ ok: true, service: "campaigns-availability", trackers: true });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    if (method !== "HEAD") res.end(body);
    else res.end();
    return;
  }

  if (url.pathname === "/api/trackers" && (method === "GET" || method === "HEAD")) {
    const trackers = listTrackers().map((t) => ({
      ...t,
      href: href(req, t.href || `/c/${t.id}`),
    }));
    const body = JSON.stringify({ ok: true, trackers });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    if (method !== "HEAD") res.end(body);
    else res.end();
    return;
  }

  if (url.pathname === "/api/discord-status" && (method === "GET" || method === "HEAD")) {
    const st = readDiscordStatus() || { ok: false, error: "not_probed", campaigns: [] };
    const body = JSON.stringify(st);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    if (method !== "HEAD") res.end(body);
    else res.end();
    return;
  }

  if ((url.pathname === "/players" || url.pathname === "/players/") && (method === "GET" || method === "HEAD")) {
    let payload;
    try {
      payload = await collectAvailability();
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(String((err && err.message) || err).slice(0, 200));
      return;
    }
    const html = renderPlayers(payload, req);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    if (method !== "HEAD") res.end(html);
    else res.end();
    return;
  }

  const apiCampLinks = url.pathname.match(/^\/api\/campaigns\/([a-z0-9_-]+)\/links\/?$/i);
  if (apiCampLinks) {
    const id = resolveCampaignId(apiCampLinks[1]);
    if (!id || !TRACKED_IDS.includes(id)) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "unknown_campaign" }));
      return;
    }
    if (method === "GET" || method === "HEAD") {
      const doc = readLinks(id);
      const body = JSON.stringify({
        ok: true,
        campaign_id: id,
        version: doc.version,
        updated_at: doc.updated_at,
        links: doc.links || [],
        path: `campaigns/${id}/player-character-links.json`,
      });
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      if (method !== "HEAD") res.end(body);
      else res.end();
      return;
    }
    if (method === "POST") {
      if (!allowWrite(req)) {
        res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
        return;
      }
      try {
        const raw = await readBody(req, 64 * 1024);
        const data = JSON.parse(raw || "{}");
        const result = upsertPlayerCharacterLink(id, data || {});
        res.writeHead(result.status, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 120) }));
      }
      return;
    }
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("method not allowed");
    return;
  }

  const apiCamp = url.pathname.match(/^\/api\/campaigns\/([a-z0-9_-]+)$/i);
  if (apiCamp) {
    const id = resolveCampaignId(apiCamp[1]);
    if (!id) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "not_found" }));
      return;
    }
    if (method === "GET" || method === "HEAD") {
      const t = readTracker(id);
      if (!t) {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "not_found" }));
        return;
      }
      const body = JSON.stringify({
        ok: true,
        campaign: t,
        discord_probe: discordStatusFor(id),
        discord_url: discordDeepLink(t.discord),
        chat: buildChatSummary(id, t.discord),
        glance: {
          availability: availSummaryLabel(t),
          schedule: nextScheduleLabel(t),
          chat: (() => {
            const c = buildChatSummary(id, t.discord);
            return c.linked
              ? `#${c.channel_name || "channel"} · ${c.last_activity_label || c.probe_status}`
              : "Discord IDs needed";
          })(),
        },
      });
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      if (method !== "HEAD") res.end(body);
      else res.end();
      return;
    }
    if (method === "POST") {
      if (!allowWrite(req)) {
        res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
        return;
      }
      if (!TRACKED_IDS.includes(id)) {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "unknown_campaign" }));
        return;
      }
      try {
        const raw = await readBody(req);
        const data = JSON.parse(raw);
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: "expected_object" }));
          return;
        }
        const saved = writeTracker(id, data);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, updated_at: saved.updated_at, campaign: saved }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 120) }));
      }
      return;
    }
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("method not allowed");
    return;
  }

  const pageCamp = url.pathname.match(/^\/c\/([a-z0-9_-]+)\/?$/i);
  if (pageCamp && (method === "GET" || method === "HEAD")) {
    const id = resolveCampaignId(pageCamp[1]);
    const t = id ? readTracker(id) : null;
    if (!t) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("campaign tracker not found");
      return;
    }
    const html = renderCampaign(t, req);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    if (method !== "HEAD") res.end(html);
    else res.end();
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("method not allowed");
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
    const body = JSON.stringify(prefixPayloadLinks(payload, req));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    if (method !== "HEAD") res.end(body);
    else res.end();
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    const html = renderPortal(payload, req);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    if (method !== "HEAD") res.end(html);
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
    console.log(`campaigns-availability+trackers: http://${HOST}:${PORT}/ (dump=${AGENT_DUMP})`);
  });
}

module.exports = {
  collectAvailability,
  renderPortal,
  renderCampaign,
  renderPlayers,
  escapeHtml,
  href,
  linkBase,
  prefixPayloadLinks,
  readTracker,
  listTrackers,
  TRACKED_IDS,
  resolveCampaignId,
  snowflakeToIso,
  relativeAgeLabel,
  buildChatSummary,
  readLinks,
  writeLinks,
  emptyLinksDoc,
  isDiscordSnowflake,
  isCharacterId,
  upsertPlayerCharacterLink,
  lookupRegistryCharacter,
};
