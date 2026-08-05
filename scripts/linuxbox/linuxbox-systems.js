/**
 * Systems panel — health collection + whitelisted service controls.
 */
const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
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

/** Short cache so Systems refresh / concurrent probes don't re-sample heavy bits on a 2GB box. */
const HOST_TTL_MS = 10_000;
const TOP_PROCS_TTL_MS = 8_000;
const GPU_TTL_MS = 30_000;
let hostMetricsCache = null;
let hostMetricsCacheAt = 0;
let topProcsCache = null;
let topProcsCacheAt = 0;
let gpuCache = null;
let gpuCacheAt = 0;
/** Rolling /proc/stat snapshots — no sleep; pair consecutive reads for % deltas. */
let lastCpuSnap = null;
let lastCpuSnapAt = 0;

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
    restart:
      "Restarts the cloudflared connector only. Does not restart Hub (:8790) or the portfolio app — if local is 200 and public is 502, the edge/connector is the problem.",
  },
  "tunnel-tableslop": {
    about:
      "Cloudflare tunnel for map.tableslop.org (Isla Primavera). Forwards public map traffic to the tableslop server on :8765. Local 200 + public 502 usually means the connector or CF edge is down, not the app.",
    ports: [8765],
    role: "Public edge for campaign map",
    restart:
      "Restarts the tableslop cloudflared connector. Local :8765 health staying 200 while public is 502 means the map app is fine — only the public edge is down.",
  },
  portfolio: {
    about:
      "Live abhinavall.net portfolio Node app (personal_portfolio). Serves the site content on loopback :3000; Cloudflare reaches it via the abhinavall tunnel + origin proxy.",
    ports: [3000],
    role: "Site content origin",
    restart: "Restarts the Node site on :3000. Public reachability still depends on the abhinavall tunnel + origin proxy.",
  },
  dashboard: {
    about:
      "This Linuxbox Hub dashboard (linuxbox-status) on :8790 — Hub, Systems, Inbox, Chat, Tasks, News. Admin UI behind Cloudflare Access + HTTP Basic.",
    ports: [8790],
    role: "Ops / process-improvement hub",
    restart:
      "Restarts linuxbox-status (TimeoutStopSec≈10s). Brief public 502 during stop is normal; loopback :8790 coming back to 200 means the app is healthy again.",
  },
  "tableslop-app": {
    about:
      "tableslop map HTTP server on :8765 — Isla Primavera HUD, pan/zoom map, region legend. Platform is tableslop; display name is Isla Primavera only.",
    ports: [8765],
    role: "Campaign map app",
    restart: "Restarts the map HTTP server on :8765. Public map.tableslop.org still needs the tableslop tunnel.",
  },
  pixi: {
    about:
      "Pixi RP chat UI on :8767 (linuxbox-pixi-rp). OpenRouter-only Send; Tailscale/LAN — not on public abhinavall.net. Tree ~/pixi-rp/ObsidianWriterStack.",
    ports: [8767],
    role: "RP chat origin",
    restart:
      "Restarts the user linuxbox-pixi-rp unit. In-flight Send jobs may drop; sessions on disk are preserved.",
  },
  "hermes-ops": {
    about:
      "Hermes agent gateway for ops/think (and related profiles). Powers always-on lanes and Dashboard Chat. User systemd unit — restart here if Chat/Hermes looks hung.",
    ports: [],
    role: "Ops agent gateway",
    restart: "Restarts the user hermes-gateway unit. Clears a hung gateway; in-flight think/chat jobs may drop.",
  },
  "hermes-hunter": {
    about:
      "Separate Hermes gateway for Hunter: The Reckoning Discord live bot (same chronicle folder as Tropic Gooner, different pod/layer).",
    ports: [],
    role: "Hunter Discord gateway",
    restart: "Restarts only the Hunter Discord gateway — does not affect ops Hermes or Hub.",
  },
  "pod-scheduler": {
    about:
      "Legacy systemd timer (~30s) for agent-pod-scheduler. When Hermes owns fast/think ticks (hex-ID jobs), this timer may be inactive on purpose — that is not a failure.",
    ports: [],
    role: "Lane / pod rotator (optional)",
    restart:
      "Restarts the timer unit so the next tick fires soon. Safe no-op if Hermes already schedules fast/think; use only when you still rely on the systemd rotator.",
    idle_ok: true,
  },
};

function serviceMetaFor(id) {
  return (
    SERVICE_META[id] || {
      about: "Registered systemd unit — see subtitle and unit name.",
      ports: [],
      role: null,
      restart: "Runs systemctl start/stop/restart on this unit (sudo for system scope).",
      idle_ok: false,
    }
  );
}

/** Short stable name for humans/agents — prefer registry `ref`, else `id`. */
function systemRef(sys) {
  const r = sys && typeof sys.ref === "string" ? sys.ref.trim() : "";
  return r || (sys && sys.id) || "?";
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

function probeUrlTimed(url, timeoutMs = 3500) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const finish = (code) => resolve({ code: code || 0, ms: Date.now() - t0 });
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

function probeUrl(url, timeoutMs = 3500) {
  return probeUrlTimed(url, timeoutMs).then((r) => r.code);
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

function parseCpuStatLine(line) {
  const parts = line.trim().split(/\s+/);
  if (!parts.length || !/^cpu\d*$/.test(parts[0])) return null;
  const nums = parts.slice(1).map((n) => parseInt(n, 10) || 0);
  const idle = (nums[3] || 0) + (nums[4] || 0); // idle + iowait
  const total = nums.reduce((a, b) => a + b, 0);
  return { name: parts[0], idle, total };
}

/** Aggregate `cpu` + per-core `cpuN` from one /proc/stat read. */
function readCpuSnapshots() {
  const lines = fs.readFileSync("/proc/stat", "utf8").split("\n");
  let aggregate = null;
  const cores = [];
  for (const line of lines) {
    const snap = parseCpuStatLine(line);
    if (!snap) {
      if (aggregate) break; // past cpu* block
      continue;
    }
    if (snap.name === "cpu") {
      aggregate = { idle: snap.idle, total: snap.total };
    } else {
      cores.push({
        id: parseInt(snap.name.slice(3), 10),
        idle: snap.idle,
        total: snap.total,
      });
    }
  }
  cores.sort((a, b) => a.id - b.id);
  return { aggregate, cores };
}

function cpuDeltaPct(a, b) {
  if (!a || !b) return null;
  const dTotal = b.total - a.total;
  const dIdle = b.idle - a.idle;
  // Need a few jiffies — near-simultaneous /proc/stat reads flash 0%/100% on cores.
  if (dTotal < 3) return null;
  return Math.round(100 * (1 - dIdle / dTotal));
}

/**
 * Rolling /proc/stat → aggregate % + per-core bars (no sleep).
 * First call seeds; subsequent calls (≈1 Hz Hub poll) return real deltas.
 * Optional sleep window only when caller has no prior snapshot and needs one-shot %.
 */
function sampleCpuMetricsRolling() {
  try {
    const b = readCpuSnapshots();
    const a = lastCpuSnap;
    const prevAt = lastCpuSnapAt;
    lastCpuSnap = b;
    lastCpuSnapAt = Date.now();
    if (!a || !a.aggregate) {
      return { cpu_pct: null, cpu_cores: [], warmup: true, interval_ms: 0 };
    }
    const interval_ms = Math.max(0, lastCpuSnapAt - prevAt);
    const cpu_pct = cpuDeltaPct(a.aggregate, b.aggregate);
    const byId = new Map(b.cores.map((c) => [c.id, c]));
    const cpu_cores = a.cores
      .map((ca) => {
        const cb = byId.get(ca.id);
        if (!cb) return null;
        const pct = cpuDeltaPct(ca, cb);
        return pct == null ? null : { id: ca.id, pct };
      })
      .filter(Boolean);
    return { cpu_pct, cpu_cores, warmup: false, interval_ms };
  } catch {
    return { cpu_pct: null, cpu_cores: [], warmup: false, interval_ms: 0 };
  }
}

/**
 * One sample window → aggregate % + per-core (same deltas). Used when no rolling seed.
 * Avoid on 1 Hz path — blocks the event loop for sampleMs.
 */
async function sampleCpuMetrics(sampleMs = 150) {
  try {
    const a = readCpuSnapshots();
    await new Promise((r) => setTimeout(r, sampleMs));
    const b = readCpuSnapshots();
    lastCpuSnap = b;
    lastCpuSnapAt = Date.now();
    const cpu_pct = cpuDeltaPct(a.aggregate, b.aggregate);
    const byId = new Map(b.cores.map((c) => [c.id, c]));
    const cpu_cores = a.cores
      .map((ca) => {
        const cb = byId.get(ca.id);
        if (!cb) return null;
        const pct = cpuDeltaPct(ca, cb);
        return pct == null ? null : { id: ca.id, pct };
      })
      .filter(Boolean);
    return { cpu_pct, cpu_cores, warmup: false, interval_ms: sampleMs };
  } catch {
    return { cpu_pct: null, cpu_cores: [], warmup: false, interval_ms: 0 };
  }
}

async function sampleCpuPct(sampleMs = 150) {
  if (lastCpuSnap) {
    return sampleCpuMetricsRolling().cpu_pct;
  }
  const m = await sampleCpuMetrics(sampleMs);
  return m.cpu_pct;
}

/**
 * Cheap Hub tick: /proc/meminfo + /proc/loadavg + rolling /proc/stat.
 * No ps, no df, no GPU — safe at ~1 Hz on a 2GB box.
 */
function readHostResourcesLight() {
  const mem = readMemMetrics();
  const load = readLoadMetrics();
  let hostname = null;
  try {
    hostname = os.hostname() || null;
  } catch {
    hostname = null;
  }
  const cpuSample = sampleCpuMetricsRolling();
  return {
    hostname,
    platform: process.platform || null,
    ...mem,
    ...load,
    cpu_pct: cpuSample.cpu_pct,
    cpu_cores: cpuSample.cpu_cores || [],
    cpu_warmup: cpuSample.warmup === true,
    cpu_interval_ms: cpuSample.interval_ms || 0,
    thermal: readThermalMetrics(),
    net_link: readNetLinkMetrics(),
    sampled_at: new Date().toISOString(),
    light: true,
  };
}

async function readTopProcessesCached(limit = 8, force = false) {
  const now = Date.now();
  if (!force && topProcsCache && now - topProcsCacheAt < TOP_PROCS_TTL_MS) {
    return { ...topProcsCache, cached: true };
  }
  const top = readTopProcesses(limit);
  topProcsCache = top;
  topProcsCacheAt = now;
  return { ...top, cached: false };
}

async function readGpuMetricsCached(force = false) {
  const now = Date.now();
  if (!force && gpuCache && now - gpuCacheAt < GPU_TTL_MS) {
    return { ...gpuCache, cached: true };
  }
  const gpu = await readGpuMetrics();
  gpuCache = gpu;
  gpuCacheAt = now;
  return { ...gpu, cached: false };
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

/**
 * Top processes via /proc only — never spawn `ps`.
 * Spawning `ps` from the dashboard hung systemd restarts (child stayed alive →
 * final-sigterm timeout → :8790 down → tunnel HTTP 502 hub-wide).
 */
function readTopProcesses(limit = 8) {
  const procs = [];
  let memTotalKb = 0;
  try {
    const meminfo = fs.readFileSync("/proc/meminfo", "utf8");
    const mt = meminfo.match(/^MemTotal:\s+(\d+)/m);
    if (mt) memTotalKb = parseInt(mt[1], 10) || 0;
  } catch {
    /* ignore */
  }
  const uidToName = Object.create(null);
  try {
    for (const line of fs.readFileSync("/etc/passwd", "utf8").split("\n")) {
      const p = line.split(":");
      if (p.length >= 3) uidToName[p[2]] = p[0];
    }
  } catch {
    /* ignore */
  }
  let pids = [];
  try {
    pids = fs.readdirSync("/proc").filter((n) => /^\d+$/.test(n));
  } catch {
    return { by_cpu: [], by_rss: [] };
  }
  let uptime = 1;
  let ncpu = 1;
  try {
    uptime = parseFloat(fs.readFileSync("/proc/uptime", "utf8").split(" ")[0]) || 1;
    ncpu = os.cpus()?.length || 1;
  } catch {
    /* ignore */
  }
  const hz = 100;
  for (const pidStr of pids) {
    try {
      const pid = parseInt(pidStr, 10);
      const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
      const nameM = status.match(/^Name:\s+(.+)$/m);
      const uidM = status.match(/^Uid:\s+(\d+)/m);
      const rssM = status.match(/^VmRSS:\s+(\d+)/m);
      const rssKb = rssM ? parseInt(rssM[1], 10) : 0;
      const uid = uidM ? uidM[1] : "?";
      const user = uidToName[uid] || uid;
      let cpuPct = 0;
      try {
        const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
        const rparen = stat.lastIndexOf(")");
        const rest = rparen >= 0 ? stat.slice(rparen + 2).split(" ") : [];
        const utime = parseInt(rest[11], 10) || 0;
        const stime = parseInt(rest[12], 10) || 0;
        const starttime = parseInt(rest[19], 10) || 0;
        const seconds = Math.max(1, uptime - starttime / hz);
        cpuPct = Math.round(((100 * (utime + stime)) / hz / seconds / ncpu) * 10) / 10;
        if (!Number.isFinite(cpuPct) || cpuPct < 0) cpuPct = 0;
      } catch {
        cpuPct = 0;
      }
      const memPct = memTotalKb > 0 ? Math.round((1000 * rssKb) / memTotalKb) / 10 : 0;
      procs.push({
        pid,
        user,
        cpu_pct: cpuPct,
        mem_pct: memPct,
        rss_mb: Math.round(rssKb / 1024),
        command: (nameM ? nameM[1].trim() : "?").slice(0, 48),
      });
    } catch {
      /* process exited mid-scan */
    }
  }
  const byCpu = [...procs].sort((a, b) => b.cpu_pct - a.cpu_pct).slice(0, limit);
  const byRss = [...procs].sort((a, b) => b.rss_mb - a.rss_mb).slice(0, limit);
  return { by_cpu: byCpu, by_rss: byRss };
}

/**
 * Light GPU probe — no profilers. nvidia-smi when present; else detect DRM/Mali
 * presence without a utilization counter (typical on linuxbox ARM SBCs).
 */
async function readGpuMetrics() {
  // Discrete NVIDIA (desktop / rare USB eGPU) — one short query.
  try {
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      ["--query-gpu=name,utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
      { timeout: 2500 }
    );
    const line = (stdout || "").trim().split("\n")[0] || "";
    const parts = line.split(",").map((s) => s.trim());
    if (parts.length >= 2) {
      const used_pct = parseInt(parts[1], 10);
      return {
        available: true,
        name: parts[0] || "NVIDIA",
        used_pct: Number.isFinite(used_pct) ? used_pct : null,
        mem_used_mb: parts[2] != null ? parseInt(parts[2], 10) || null : null,
        mem_total_mb: parts[3] != null ? parseInt(parts[3], 10) || null : null,
        source: "nvidia-smi",
        note: null,
      };
    }
  } catch {
    /* no nvidia-smi */
  }

  // ponytail: ARM Mali / VPU often present with no usable % counter — report honestly.
  let chip = null;
  try {
    if (fs.existsSync("/dev/mali0") || fs.existsSync("/dev/mali")) {
      chip = "Mali";
    } else if (fs.existsSync("/sys/class/misc/mali0")) {
      chip = "Mali";
    } else if (fs.existsSync("/sys/class/drm")) {
      const cards = fs.readdirSync("/sys/class/drm").filter((n) => /^card\d+$/.test(n));
      for (const card of cards) {
        const vendorPath = path.join("/sys/class/drm", card, "device", "vendor");
        const ueventPath = path.join("/sys/class/drm", card, "device", "uevent");
        let hint = "";
        try {
          if (fs.existsSync(ueventPath)) hint = fs.readFileSync(ueventPath, "utf8");
        } catch {
          /* ignore */
        }
        if (/mali|panfrost|lima|v3d|vc4|amdgpu|i915/i.test(hint)) {
          const m = hint.match(/DRIVER=(\S+)/i);
          chip = m ? m[1] : "DRM GPU";
          break;
        }
        try {
          if (fs.existsSync(vendorPath)) {
            chip = "DRM GPU";
            break;
          }
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    chip = null;
  }

  if (chip) {
    return {
      available: false,
      name: chip,
      used_pct: null,
      mem_used_mb: null,
      mem_total_mb: null,
      source: "sysfs",
      note: "Chip present; no utilization counter (N/A)",
    };
  }

  return {
    available: false,
    name: null,
    used_pct: null,
    mem_used_mb: null,
    mem_total_mb: null,
    source: null,
    note: "No GPU / unavailable",
  };
}

async function readHostMetrics(opts = {}) {
  const force = opts.force === true;
  const lightOnly = opts.light === true;
  const wantProcs = opts.procs === true || (!lightOnly && opts.procs !== false);

  if (lightOnly) {
    const light = readHostResourcesLight();
    if (!wantProcs) return light;
    const top = await readTopProcessesCached(8, force);
    return { ...light, top_processes: top, light: true };
  }

  const now = Date.now();
  if (!force && hostMetricsCache && now - hostMetricsCacheAt < HOST_TTL_MS) {
    // Refresh CPU/RAM/load from /proc even on cached heavy payload (cheap).
    const light = readHostResourcesLight();
    return {
      ...hostMetricsCache,
      ...light,
      thermal: readThermalMetrics(),
      net_link: readNetLinkMetrics(),
      storage: hostMetricsCache.storage,
      top_processes: hostMetricsCache.top_processes,
      cached: true,
      light: false,
    };
  }

  const light = readHostResourcesLight();
  // Cold start: no rolling seed yet — one short window so /api/agent isn't "?" forever.
  let cpu_pct = light.cpu_pct;
  let cpu_cores = light.cpu_cores;
  if (light.cpu_warmup) {
    const oneShot = await sampleCpuMetrics(100);
    cpu_pct = oneShot.cpu_pct;
    cpu_cores = oneShot.cpu_cores;
  }

  const [storage, top] = await Promise.all([
    readStorageTiers(),
    wantProcs ? readTopProcessesCached(8, force) : Promise.resolve({ by_cpu: [], by_rss: [], cached: false }),
  ]);

  const thermal = readThermalMetrics();
  const net_link = readNetLinkMetrics();
  const result = {
    ...light,
    cpu_pct,
    cpu_cores,
    cpu_warmup: false,
    thermal,
    net_link,
    storage,
    top_processes: top,
    sampled_at: new Date().toISOString(),
    cached: false,
    light: false,
  };
  hostMetricsCache = result;
  hostMetricsCacheAt = now;
  return result;
}

function localOk(code) {
  return code >= 200 && code < 400;
}

function readSysfsTempMilliC(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    const mc = parseInt(raw, 10);
    if (!Number.isFinite(mc)) return null;
    return mc;
  } catch {
    return null;
  }
}

function milliCToCelsius(mc) {
  return Math.round(mc / 100) / 10;
}

/**
 * SoC / board temps from thermal_zone* and hwmon temp*_input (Le Potato: cpu-thermal + aml_thermal).
 */
function readThermalMetrics() {
  const zones = [];
  try {
    const root = "/sys/class/thermal";
    if (fs.existsSync(root)) {
      for (const name of fs.readdirSync(root).sort()) {
        if (!name.startsWith("thermal_zone")) continue;
        const dir = path.join(root, name);
        let type = name;
        try {
          type = fs.readFileSync(path.join(dir, "type"), "utf8").trim() || type;
        } catch {
          /* ignore */
        }
        const mc = readSysfsTempMilliC(path.join(dir, "temp"));
        if (mc == null) continue;
        zones.push({
          id: name,
          type,
          celsius: milliCToCelsius(mc),
          source: `thermal/${name}/${type}`,
        });
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const hwRoot = "/sys/class/hwmon";
    if (fs.existsSync(hwRoot)) {
      for (const hw of fs.readdirSync(hwRoot)) {
        const dir = path.join(hwRoot, hw);
        let chip = hw;
        try {
          chip = fs.readFileSync(path.join(dir, "name"), "utf8").trim() || hw;
        } catch {
          /* ignore */
        }
        let entries = [];
        try {
          entries = fs.readdirSync(dir);
        } catch {
          continue;
        }
        for (const ent of entries) {
          const m = /^temp(\d+)_input$/.exec(ent);
          if (!m) continue;
          const mc = readSysfsTempMilliC(path.join(dir, ent));
          if (mc == null) continue;
          let label = `${chip} temp${m[1]}`;
          try {
            const lblFile = path.join(dir, `temp${m[1]}_label`);
            if (fs.existsSync(lblFile)) {
              label = fs.readFileSync(lblFile, "utf8").trim() || label;
            }
          } catch {
            /* ignore */
          }
          zones.push({
            id: `${hw}:${ent}`,
            type: label,
            celsius: milliCToCelsius(mc),
            source: `hwmon/${chip}/${ent}`,
          });
        }
      }
    }
  } catch {
    /* ignore */
  }

  const primary =
    zones.find((z) => z.type === "cpu-thermal") ||
    zones.find((z) => /cpu|soc/i.test(z.type)) ||
    zones[0] ||
    null;

  return {
    available: primary != null,
    zones,
    primary: primary
      ? {
          celsius: primary.celsius,
          label: primary.type,
          source: primary.source,
        }
      : null,
    note: primary ? null : "No thermal_zone or hwmon temp sensor",
  };
}

/** Wired/wireless link speed from sysfs (eth0 preferred on linuxbox). */
function readNetLinkMetrics() {
  const ifaces = ["eth0", "wlan0", "end0"];
  for (const iface of ifaces) {
    try {
      const base = `/sys/class/net/${iface}`;
      if (!fs.existsSync(base)) continue;
      let operstate = "unknown";
      try {
        operstate = fs.readFileSync(path.join(base, "operstate"), "utf8").trim();
      } catch {
        /* ignore */
      }
      let speed_mbps = null;
      try {
        const s = parseInt(fs.readFileSync(path.join(base, "speed"), "utf8").trim(), 10);
        if (Number.isFinite(s) && s >= 0) speed_mbps = s;
      } catch {
        /* ignore */
      }
      if (operstate === "down" && !(speed_mbps > 0)) continue;
      return {
        available: operstate === "up" || speed_mbps > 0,
        iface,
        operstate,
        speed_mbps,
        source: `net/${iface}/speed`,
        note:
          speed_mbps != null && speed_mbps > 0
            ? null
            : operstate === "up"
              ? "Link up; speed unknown"
              : `Interface ${operstate}`,
      };
    } catch {
      continue;
    }
  }
  return {
    available: false,
    iface: null,
    operstate: null,
    speed_mbps: null,
    source: null,
    note: "No wired/wireless link sensor",
  };
}

/**
 * Board power draw when the kernel exposes it (RAPL / hwmon / power_supply).
 * Le Potato / many ARM SBCs have no wattage sensor — return honest unavailable.
 */
function readPowerMetrics() {
  const tryUw = (filePath) => {
    try {
      const raw = fs.readFileSync(filePath, "utf8").trim();
      const uw = parseInt(raw, 10);
      if (!Number.isFinite(uw) || uw <= 0) return null;
      return Math.round((uw / 1e6) * 100) / 100;
    } catch {
      return null;
    }
  };

  // Battery / USB PD style (microWatts).
  try {
    const psRoot = "/sys/class/power_supply";
    if (fs.existsSync(psRoot)) {
      for (const name of fs.readdirSync(psRoot)) {
        const watts = tryUw(path.join(psRoot, name, "power_now"));
        if (watts != null) {
          return {
            available: true,
            watts,
            source: `power_supply/${name}`,
            note: null,
          };
        }
      }
    }
  } catch {
    /* ignore */
  }

  // hwmon power*_input (microWatts).
  try {
    const hwRoot = "/sys/class/hwmon";
    if (fs.existsSync(hwRoot)) {
      for (const hw of fs.readdirSync(hwRoot)) {
        const dir = path.join(hwRoot, hw);
        let entries = [];
        try {
          entries = fs.readdirSync(dir);
        } catch {
          continue;
        }
        for (const ent of entries) {
          if (!/^power\d+_input$/.test(ent)) continue;
          const watts = tryUw(path.join(dir, ent));
          if (watts != null) {
            let label = hw;
            try {
              label = fs.readFileSync(path.join(dir, "name"), "utf8").trim() || hw;
            } catch {
              /* ignore */
            }
            return {
              available: true,
              watts,
              source: `hwmon/${label}/${ent}`,
              note: null,
            };
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  // Intel RAPL package (microJoules) — need two samples; skip on cold path (no sleep).
  // ponytail: ceiling = no RAPL delta without sleep; ARM boards usually lack this anyway.
  try {
    const rapl = "/sys/class/powercap/intel-rapl:0/energy_uj";
    if (fs.existsSync(rapl)) {
      return {
        available: false,
        watts: null,
        source: "intel-rapl",
        note: "RAPL present but needs timed samples — not polled (unavailable)",
      };
    }
  } catch {
    /* ignore */
  }

  return {
    available: false,
    watts: null,
    source: null,
    note: "No ACPI/INA/hwmon wattage sensor on this host",
  };
}

function healthForSystem(sys, active, httpCode, publicCode) {
  const meta = serviceMetaFor(sys.id);
  if (!active) {
    // Timers / optional rotators may be off when Hermes owns scheduling.
    if (meta.idle_ok || (sys.unit && String(sys.unit).endsWith(".timer"))) {
      return "idle";
    }
    return "down";
  }

  const localHealthy = sys.health_url ? localOk(httpCode) : true;
  const publicHealthy = sys.public_url ? localOk(publicCode) : true;

  // Tunnels: public reachability is what humans care about — but never call local-ok "down".
  if (sys.kind === "tunnel") {
    if (publicHealthy) return "ok";
    if (localHealthy) return "warn"; // local origin/connector path OK; edge broken
    return "down";
  }

  if (sys.health_url) {
    if (localHealthy) return "ok"; // local wins; public edge issues are note-only
    if (httpCode === 0) return "warn";
    return "down";
  }

  return active ? "ok" : "down";
}

function healthNoteFor(sys, active, httpCode, publicCode, health) {
  const meta = serviceMetaFor(sys.id);
  if (health === "idle") {
    return meta.idle_ok
      ? "inactive_ok_hermes_owns_ticks"
      : "timer_inactive";
  }
  if (sys.kind === "tunnel" && localOk(httpCode) && !localOk(publicCode)) {
    return "local_ok_public_down";
  }
  if (sys.health_url && localOk(httpCode) && sys.public_url && !localOk(publicCode)) {
    return "local_ok_public_down";
  }
  if (!active && health === "down") return "unit_inactive";
  return null;
}

async function collectSystemsState() {
  const systems = readRegistry();
  const host = await readHostMetrics();
  const telemetry = readTelemetry();

  // Parallel probes — sequential 8s public timeouts made Systems tab stick on Loading…
  const out = await Promise.all(
    systems.map(async (sys) => {
      const [active, httpCode, publicCode] = await Promise.all([
        unitActive(sys.unit, sys.scope || "system"),
        sys.health_url ? probeUrl(sys.health_url, 3500) : Promise.resolve(null),
        sys.public_url ? probeUrl(sys.public_url, 3500) : Promise.resolve(null),
      ]);
      const health = healthForSystem(sys, active, httpCode, publicCode);
      const meta = serviceMetaFor(sys.id);
      return {
        ...sys,
        ref: systemRef(sys),
        about: meta.about,
        role: meta.role,
        restart: meta.restart || null,
        ports: meta.ports,
        active,
        http_code: httpCode,
        public_http_code: publicCode,
        health,
        health_note: healthNoteFor(sys, active, httpCode, publicCode, health),
        controls: controlsFor(sys),
      };
    })
  );

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

async function readUnitJournal(unit, scope, lines = 24) {
  const n = Math.min(Math.max(parseInt(lines, 10) || 24, 1), 40);
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

async function readProcessMetrics(pid) {
  const n = parseInt(pid, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  try {
    const status = fs.readFileSync(`/proc/${n}/status`, "utf8");
    const nameM = status.match(/^Name:\s+(.+)$/m);
    const rssM = status.match(/^VmRSS:\s+(\d+)/m);
    const rssKb = rssM ? parseInt(rssM[1], 10) : 0;
    let memTotalKb = 0;
    try {
      const mt = fs.readFileSync("/proc/meminfo", "utf8").match(/^MemTotal:\s+(\d+)/m);
      if (mt) memTotalKb = parseInt(mt[1], 10) || 0;
    } catch {
      /* ignore */
    }
    let cpuPct = 0;
    let etime = "?";
    try {
      const stat = fs.readFileSync(`/proc/${n}/stat`, "utf8");
      const rparen = stat.lastIndexOf(")");
      const rest = rparen >= 0 ? stat.slice(rparen + 2).split(" ") : [];
      const utime = parseInt(rest[11], 10) || 0;
      const stime = parseInt(rest[12], 10) || 0;
      const starttime = parseInt(rest[19], 10) || 0;
      const uptime = parseFloat(fs.readFileSync("/proc/uptime", "utf8").split(" ")[0]) || 1;
      const hz = 100;
      const seconds = Math.max(1, uptime - starttime / hz);
      cpuPct = Math.round((100 * (utime + stime)) / hz / seconds / (os.cpus()?.length || 1) * 10) / 10;
      if (!Number.isFinite(cpuPct) || cpuPct < 0) cpuPct = 0;
      const sec = Math.floor(seconds);
      etime = sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}`;
    } catch {
      /* ignore */
    }
    return {
      pid: n,
      cpu_pct: cpuPct,
      mem_pct: memTotalKb > 0 ? Math.round((1000 * rssKb) / memTotalKb) / 10 : 0,
      rss_mb: Math.round(rssKb / 1024),
      etime,
      command: (nameM ? nameM[1].trim() : "?").slice(0, 48),
    };
  } catch {
    return null;
  }
}

async function getSystemDetail(systemId) {
  const sys = readRegistry().find((s) => s.id === systemId);
  if (!sys) throw new Error("unknown_system");
  const meta = serviceMetaFor(sys.id);
  const scope = sys.scope || "system";
  const [unit, journal] = await Promise.all([
    readUnitShow(sys.unit, scope),
    readUnitJournal(sys.unit, scope, 24),
  ]);

  let httpProbe = null;
  let publicProbe = null;
  if (sys.health_url) httpProbe = await probeUrlTimed(sys.health_url, 4000);
  if (sys.public_url) publicProbe = await probeUrlTimed(sys.public_url, 4000);
  const httpCode = httpProbe ? httpProbe.code : null;
  const publicCode = publicProbe ? publicProbe.code : null;

  const mainProc = unit.main_pid ? await readProcessMetrics(unit.main_pid) : null;

  const unitActiveNow = (unit.active_state || "") === "active";
  const health = healthForSystem(sys, unitActiveNow, httpCode, publicCode);
  const detail = {
    id: sys.id,
    ref: systemRef(sys),
    label: sys.label,
    subtitle: sys.subtitle || null,
    kind: sys.kind,
    unit: sys.unit,
    scope,
    about: meta.about,
    role: meta.role,
    restart: meta.restart || null,
    ports: meta.ports || [],
    health_url: sys.health_url || null,
    public_url: sys.public_url || null,
    http_code: httpCode,
    public_http_code: publicCode,
    http_latency_ms: httpProbe ? httpProbe.ms : null,
    public_latency_ms: publicProbe ? publicProbe.ms : null,
    health,
    health_note: healthNoteFor(sys, unitActiveNow, httpCode, publicCode, health),
    unit_status: unit,
    process: mainProc,
    host_snapshot: null,
    journal,
    doing_now: null,
    sampled_at: new Date().toISOString(),
  };

  if (sys.id === "pod-scheduler") {
    detail.doing_now = readSchedulerNow();
  }

  // Hub service: attach light host snapshot (10s cache — no extra 150ms CPU sample usually).
  if (sys.id === "dashboard") {
    const host = await readHostMetrics();
    detail.host_snapshot = {
      hostname: host.hostname || null,
      cpu_pct: host.cpu_pct,
      cpu_cores: host.cpu_cores || [],
      mem_used_pct: host.mem_used_pct,
      mem_used_mb: host.mem_used_mb,
      mem_total_mb: host.mem_total_mb,
      load_avg: host.load_avg,
      swap_used_pct: host.swap_used_pct,
      sampled_at: host.sampled_at,
      cached: host.cached === true,
    };
  }

  return detail;
}

module.exports = {
  collectSystemsState,
  runSystemControl,
  getSystemDetail,
  readRegistry,
  readHostMetrics,
  readHostResourcesLight,
  SERVICE_META,
  systemRef,
  REGISTRY_PATH,
};
