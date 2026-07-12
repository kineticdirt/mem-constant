/**
 * Systems panel — health collection + whitelisted service controls.
 */
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const REGISTRY_PATH = path.join(
  process.env.AGENT_DUMP || path.join(process.env.HOME || "/home/abhinav", "agent-dump"),
  "agents",
  "linuxbox-systems.json"
);
const TELEMETRY_PATH = path.join(
  process.env.AGENT_DUMP || path.join(process.env.HOME || "/home/abhinav", "agent-dump"),
  "agents",
  "state",
  "resource-telemetry.json"
);
const ALERTS_STATE = path.join(
  process.env.AGENT_DUMP || path.join(process.env.HOME || "/home/abhinav", "agent-dump"),
  "agents",
  "state",
  "alert-last.json"
);

/** Short cache so Systems refresh / concurrent probes don't re-sample CPU on a 2GB box. */
const HOST_TTL_MS = 10_000;
let hostMetricsCache = null;
let hostMetricsCacheAt = 0;

const AGENT_DUMP =
  process.env.AGENT_DUMP || path.join(process.env.HOME || "/home/abhinav", "agent-dump");
const POD_SCHEDULER_STATE = path.join(AGENT_DUMP, "agents", "state", "pod-scheduler.json");

/** Plain-language blurbs + ports — keep in sync with agents/linuxbox-systems.json ids. */
const SERVICE_META = {
  "tunnel-abhinavall": {
    about:
      "Cloudflare tunnel for abhinavall.net. Public traffic hits this connector, then the origin proxy (:8780) which splits portfolio (:3000), Hub/Linuxbox (:8790), and public Intel.",
    ports: [8780],
    role: "Public edge for personal site + dashboards",
  },
  "tunnel-tableslop": {
    about:
      "Cloudflare tunnel for map.tableslop.org (Isla Primavera). Forwards public map traffic to the tableslop server on :8765. Local 200 + public 502 usually means the connector or CF edge is down, not the app.",
    ports: [8765],
    role: "Public edge for campaign map",
  },
  portfolio: {
    about:
      "Live abhinavall.net portfolio Node app (personal_portfolio). Serves the site content on loopback :3000; Cloudflare reaches it via the abhinavall tunnel + origin proxy.",
    ports: [3000],
    role: "Site content origin",
  },
  dashboard: {
    about:
      "This Linuxbox Hub dashboard (linuxbox-status) on :8790 — Hub, Systems, Inbox, Chat, Tasks, News. Admin UI behind Cloudflare Access + HTTP Basic.",
    ports: [8790],
    role: "Ops / process-improvement hub",
  },
  "tableslop-app": {
    about:
      "tableslop map HTTP server on :8765 — Isla Primavera HUD, pan/zoom map, region legend. Platform is tableslop; display name is Isla Primavera only.",
    ports: [8765],
    role: "Campaign map app",
  },
  "hermes-ops": {
    about:
      "Hermes agent gateway for ops/think (and related profiles). Powers always-on lanes and Dashboard Chat. User systemd unit — restart here if Chat/Hermes looks hung.",
    ports: [],
    role: "Ops agent gateway",
  },
  "hermes-hunter": {
    about:
      "Separate Hermes gateway for Hunter: The Reckoning Discord live bot (same chronicle folder as Tropic Gooner, different pod/layer).",
    ports: [],
    role: "Hunter Discord gateway",
  },
  "pod-scheduler": {
    about:
      "systemd timer (~30s) that runs agent-pod-scheduler — picks the next due pod (fast/think/campaign) without letting fast starve the others.",
    ports: [],
    role: "Lane / pod rotator",
  },
};

function serviceMetaFor(id) {
  return (
    SERVICE_META[id] || {
      about: "Registered systemd unit — see subtitle and unit name.",
      ports: [],
      role: null,
    }
  );
}

function readRegistry() {
  const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  return raw.systems || [];
}

function readTelemetry() {
  try {
    return JSON.parse(fs.readFileSync(TELEMETRY_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function unitActive(unit, scope) {
  const cmd = scope === "user" ? ["systemctl", "--user", "is-active", unit] : ["systemctl", "is-active", unit];
  try {
    const { stdout } = await execFileAsync(cmd[0], cmd.slice(1), { timeout: 8000 });
    const st = stdout.trim();
    return st === "active" || st === "activating";
  } catch (e) {
    const out = (e.stdout || "").trim();
    if (out === "active" || out === "activating") return true;
    return false;
  }
}

function probeUrl(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const mod = String(url).startsWith("https:") ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on("error", () => resolve(0));
    req.on("timeout", () => {
      req.destroy();
      resolve(0);
    });
  });
}

function meminfoField(raw, key) {
  const m = raw.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
  return m ? parseInt(m[1], 10) : 0;
}

function readMemMetrics() {
  try {
    const raw = fs.readFileSync("/proc/meminfo", "utf8");
    const totalKb = meminfoField(raw, "MemTotal");
    const availKb = meminfoField(raw, "MemAvailable");
    const swapTotal = meminfoField(raw, "SwapTotal");
    const swapFree = meminfoField(raw, "SwapFree");
    const usedKb = Math.max(0, totalKb - availKb);
    const swapUsed = Math.max(0, swapTotal - swapFree);
    return {
      mem_total_mb: Math.round(totalKb / 1024),
      mem_avail_mb: Math.round(availKb / 1024),
      mem_used_mb: Math.round(usedKb / 1024),
      mem_used_pct: totalKb ? Math.round((100 * usedKb) / totalKb) : null,
      swap_total_mb: Math.round(swapTotal / 1024),
      swap_used_mb: Math.round(swapUsed / 1024),
      swap_used_pct: swapTotal ? Math.round((100 * swapUsed) / swapTotal) : 0,
    };
  } catch {
    return {
      mem_total_mb: null,
      mem_avail_mb: null,
      mem_used_mb: null,
      mem_used_pct: null,
      swap_total_mb: null,
      swap_used_mb: null,
      swap_used_pct: null,
    };
  }
}

function readLoadMetrics() {
  try {
    const parts = fs.readFileSync("/proc/loadavg", "utf8").trim().split(/\s+/);
    return {
      load_avg: `${parts[0]} ${parts[1]} ${parts[2]}`,
      load_1: parseFloat(parts[0]),
      load_5: parseFloat(parts[1]),
      load_15: parseFloat(parts[2]),
    };
  } catch {
    return { load_avg: null, load_1: null, load_5: null, load_15: null };
  }
}

function readCpuSnapshot() {
  const line = fs.readFileSync("/proc/stat", "utf8").split("\n")[0];
  const nums = line.split(/\s+/).slice(1).map((n) => parseInt(n, 10) || 0);
  const idle = (nums[3] || 0) + (nums[4] || 0); // idle + iowait
  const total = nums.reduce((a, b) => a + b, 0);
  return { idle, total };
}

async function sampleCpuPct(sampleMs = 150) {
  try {
    const a = readCpuSnapshot();
    await new Promise((r) => setTimeout(r, sampleMs));
    const b = readCpuSnapshot();
    const dTotal = b.total - a.total;
    const dIdle = b.idle - a.idle;
    if (dTotal <= 0) return null;
    return Math.round(100 * (1 - dIdle / dTotal));
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return null;
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return `${n.toFixed(digits)} ${units[i]}`;
}

function classifyStorageMount(source, target) {
  if (target === "/mnt/archive" || target.startsWith("/mnt/archive/")) {
    return { id: "archive", label: "Archive HDD", tier: "archive" };
  }
  if (/PERSONAL/i.test(target) || /PERSONAL/i.test(source)) {
    return { id: "personal", label: "PERSONAL USB", tier: "personal" };
  }
  if (target === "/") {
    return { id: "sd", label: "SD (system)", tier: "sd" };
  }
  if (/mmcblk/i.test(source) && (target === "/" || target.startsWith("/boot"))) {
    return { id: "sd", label: "SD (system)", tier: "sd" };
  }
  return null;
}

async function readStorageTiers() {
  try {
    const { stdout } = await execFileAsync(
      "df",
      ["-B1", "--output=source,target,size,used,avail,pcent"],
      { timeout: 5000 }
    );
    const lines = stdout.trim().split("\n").slice(1);
    const byId = new Map();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) continue;
      const source = parts[0];
      const target = parts[1];
      const size = parseInt(parts[2], 10);
      const used = parseInt(parts[3], 10);
      const avail = parseInt(parts[4], 10);
      const pcentRaw = parts[5].replace("%", "");
      const used_pct = parseInt(pcentRaw, 10);
      const cls = classifyStorageMount(source, target);
      if (!cls) continue;
      // Prefer exact primary mounts over nested (e.g. / over /boot; /mnt/archive over children).
      const existing = byId.get(cls.id);
      const preferExact =
        (cls.id === "sd" && target === "/") ||
        (cls.id === "archive" && target === "/mnt/archive") ||
        (cls.id === "personal" && /PERSONAL$/i.test(target));
      if (existing && !preferExact) continue;
      byId.set(cls.id, {
        id: cls.id,
        label: cls.label,
        tier: cls.tier,
        mount: target,
        device: source,
        size_bytes: Number.isFinite(size) ? size : null,
        used_bytes: Number.isFinite(used) ? used : null,
        avail_bytes: Number.isFinite(avail) ? avail : null,
        used_pct: Number.isFinite(used_pct) ? used_pct : null,
        size_human: formatBytes(size),
        used_human: formatBytes(used),
        avail_human: formatBytes(avail),
        present: true,
      });
    }
    const order = ["sd", "personal", "archive"];
    const labels = {
      sd: "SD (system)",
      personal: "PERSONAL USB",
      archive: "Archive HDD",
    };
    return order.map((id) => {
      if (byId.has(id)) return byId.get(id);
      return {
        id,
        label: labels[id],
        tier: id,
        mount: null,
        device: null,
        size_bytes: null,
        used_bytes: null,
        avail_bytes: null,
        used_pct: null,
        size_human: null,
        used_human: null,
        avail_human: null,
        present: false,
      };
    });
  } catch {
    return [
      { id: "sd", label: "SD (system)", tier: "sd", present: false },
      { id: "personal", label: "PERSONAL USB", tier: "personal", present: false },
      { id: "archive", label: "Archive HDD", tier: "archive", present: false },
    ];
  }
}

async function readTopProcesses(limit = 8) {
  try {
    const { stdout } = await execFileAsync(
      "ps",
      ["-eo", "pid=,user=,pcpu=,pmem=,rss=,comm=", "--no-headers"],
      { timeout: 5000 }
    );
    const procs = [];
    for (const line of stdout.trim().split("\n")) {
      if (!line.trim()) continue;
      const m = line.trim().match(/^(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(.+)$/);
      if (!m) continue;
      procs.push({
        pid: parseInt(m[1], 10),
        user: m[2],
        cpu_pct: parseFloat(m[3]),
        mem_pct: parseFloat(m[4]),
        rss_mb: Math.round(parseInt(m[5], 10) / 1024),
        command: m[6].trim().slice(0, 48),
      });
    }
    const byCpu = [...procs].sort((a, b) => b.cpu_pct - a.cpu_pct).slice(0, limit);
    const byRss = [...procs].sort((a, b) => b.rss_mb - a.rss_mb).slice(0, limit);
    return { by_cpu: byCpu, by_rss: byRss };
  } catch {
    return { by_cpu: [], by_rss: [] };
  }
}

async function readHostMetrics(opts = {}) {
  const force = opts.force === true;
  const now = Date.now();
  if (!force && hostMetricsCache && now - hostMetricsCacheAt < HOST_TTL_MS) {
    return { ...hostMetricsCache, cached: true };
  }

  const mem = readMemMetrics();
  const load = readLoadMetrics();
  const [cpu_pct, storage, top] = await Promise.all([
    sampleCpuPct(150),
    readStorageTiers(),
    readTopProcesses(8),
  ]);

  const result = {
    ...mem,
    ...load,
    cpu_pct,
    storage,
    top_processes: top,
    sampled_at: new Date().toISOString(),
    cached: false,
  };
  hostMetricsCache = result;
  hostMetricsCacheAt = now;
  return result;
}

function localOk(code) {
  return code >= 200 && code < 400;
}

function healthForSystem(sys, active, httpCode, publicCode) {
  if (!active) return "down";

  const localHealthy = sys.health_url ? localOk(httpCode) : true;
  const publicHealthy = sys.public_url ? localOk(publicCode) : true;

  // Tunnels: public reachability is what humans care about.
  if (sys.kind === "tunnel") {
    if (publicHealthy) return "ok";
    if (localHealthy) return "warn";
    return "down";
  }

  if (sys.health_url) {
    if (localHealthy) return "ok";
    if (httpCode === 0) return "warn";
    return "down";
  }

  return active ? "ok" : "down";
}

async function collectSystemsState() {
  const systems = readRegistry();
  const host = await readHostMetrics();
  const telemetry = readTelemetry();
  const out = [];

  for (const sys of systems) {
    const active = await unitActive(sys.unit, sys.scope || "system");
    let httpCode = null;
    let publicCode = null;
    if (sys.health_url) {
      httpCode = await probeUrl(sys.health_url);
    }
    if (sys.public_url) {
      publicCode = await probeUrl(sys.public_url);
    }
    const health = healthForSystem(sys, active, httpCode, publicCode);
    const meta = serviceMetaFor(sys.id);
    out.push({
      ...sys,
      about: meta.about,
      role: meta.role,
      ports: meta.ports,
      active,
      http_code: httpCode,
      public_http_code: publicCode,
      health,
      health_note:
        sys.kind === "tunnel" && localOk(httpCode) && !localOk(publicCode)
          ? "local_ok_public_down"
          : null,
      controls: controlsFor(sys),
    });
  }

  return {
    updated_at: new Date().toISOString(),
    host,
    resource: telemetry,
    systems: out,
    alerts: readAlertStateSummary(),
  };
}

function controlsFor(sys) {
  const isTimer = sys.unit.endsWith(".timer");
  const verbs = isTimer ? ["restart"] : ["restart", "stop", "start"];
  return verbs.map((action) => ({ action, system_id: sys.id }));
}

const ALLOWED_ACTIONS = new Set(["start", "stop", "restart"]);

async function runSystemControl(systemId, action) {
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error("invalid_action");
  }
  const sys = readRegistry().find((s) => s.id === systemId);
  if (!sys) throw new Error("unknown_system");

  const unit = sys.unit;
  const scope = sys.scope || "system";
  const isTimer = unit.endsWith(".timer");
  const systemctl = scope === "user" ? ["systemctl", "--user"] : ["systemctl"];

  let args;
  if (action === "restart" && isTimer) {
    args = [...systemctl, "restart", unit];
  } else if (action === "restart") {
    args = [...systemctl, "restart", unit];
  } else {
    args = [...systemctl, action, unit];
  }

  if (scope === "system") {
    args = ["sudo", "-n", ...args];
  }

  const { stdout, stderr } = await execFileAsync(args[0], args.slice(1), { timeout: 30000 });
  return {
    ok: true,
    system_id: systemId,
    action,
    unit,
    message: (stdout || stderr || "ok").trim().slice(0, 500),
  };
}

function readAlertStateSummary() {
  try {
    const raw = JSON.parse(fs.readFileSync(ALERTS_STATE, "utf8"));
    return { last_sent_at: raw.last_sent_at || null, last_id: raw.last_id || null };
  } catch {
    return { last_sent_at: null, last_id: null };
  }
}

function parseSystemctlShow(stdout) {
  const out = {};
  for (const line of String(stdout || "").split("\n")) {
    const i = line.indexOf("=");
    if (i <= 0) continue;
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

async function readUnitShow(unit, scope) {
  const args =
    scope === "user"
      ? ["--user", "show", unit, "-p", "ActiveState", "-p", "SubState", "-p", "MainPID", "-p", "NRestarts", "-p", "ActiveEnterTimestamp", "-p", "Result", "-p", "FragmentPath"]
      : ["show", unit, "-p", "ActiveState", "-p", "SubState", "-p", "MainPID", "-p", "NRestarts", "-p", "ActiveEnterTimestamp", "-p", "Result", "-p", "FragmentPath"];
  try {
    const { stdout } = await execFileAsync("systemctl", args, { timeout: 5000 });
    const p = parseSystemctlShow(stdout);
    return {
      active_state: p.ActiveState || null,
      sub_state: p.SubState || null,
      main_pid: p.MainPID && p.MainPID !== "0" ? parseInt(p.MainPID, 10) : null,
      n_restarts: p.NRestarts != null ? parseInt(p.NRestarts, 10) : null,
      active_enter: p.ActiveEnterTimestamp || null,
      result: p.Result || null,
      fragment_path: p.FragmentPath || null,
    };
  } catch (e) {
    return {
      active_state: null,
      sub_state: null,
      main_pid: null,
      n_restarts: null,
      active_enter: null,
      result: null,
      fragment_path: null,
      error: (e.stderr || e.message || "systemctl_show_failed").toString().slice(0, 200),
    };
  }
}

async function readUnitJournal(unit, scope, lines = 16) {
  const n = Math.min(Math.max(parseInt(lines, 10) || 16, 1), 40);
  const args =
    scope === "user"
      ? ["--user", "-u", unit, "-n", String(n), "--no-pager", "-o", "short-iso"]
      : ["-u", unit, "-n", String(n), "--no-pager", "-o", "short-iso"];
  try {
    const { stdout } = await execFileAsync("journalctl", args, { timeout: 6000 });
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => l.slice(0, 240));
  } catch (e) {
    const msg = (e.stderr || e.message || "journal_failed").toString().slice(0, 200);
    return [`(journal unavailable: ${msg})`];
  }
}

function readSchedulerNow() {
  try {
    const raw = JSON.parse(fs.readFileSync(POD_SCHEDULER_STATE, "utf8"));
    const cur = raw.current || null;
    return {
      current_pod: cur && cur.name ? cur.name : null,
      started_at: cur && cur.started_at ? cur.started_at : null,
      last_run_at: raw.last_run_at || raw.updated_at || null,
    };
  } catch {
    return { current_pod: null, started_at: null, last_run_at: null };
  }
}

async function getSystemDetail(systemId) {
  const sys = readRegistry().find((s) => s.id === systemId);
  if (!sys) throw new Error("unknown_system");
  const meta = serviceMetaFor(sys.id);
  const scope = sys.scope || "system";
  const [unit, journal] = await Promise.all([
    readUnitShow(sys.unit, scope),
    readUnitJournal(sys.unit, scope, 16),
  ]);

  let httpCode = null;
  let publicCode = null;
  if (sys.health_url) httpCode = await probeUrl(sys.health_url, 4000);
  if (sys.public_url) publicCode = await probeUrl(sys.public_url, 4000);

  const detail = {
    id: sys.id,
    label: sys.label,
    subtitle: sys.subtitle || null,
    kind: sys.kind,
    unit: sys.unit,
    scope,
    about: meta.about,
    role: meta.role,
    ports: meta.ports || [],
    health_url: sys.health_url || null,
    public_url: sys.public_url || null,
    http_code: httpCode,
    public_http_code: publicCode,
    health: healthForSystem(sys, (unit.active_state || "") === "active", httpCode, publicCode),
    unit_status: unit,
    journal,
    doing_now: null,
    sampled_at: new Date().toISOString(),
  };

  if (sys.id === "pod-scheduler") {
    detail.doing_now = readSchedulerNow();
  }

  return detail;
}

module.exports = {
  collectSystemsState,
  runSystemControl,
  getSystemDetail,
  readRegistry,
  readHostMetrics,
  SERVICE_META,
  REGISTRY_PATH,
};
