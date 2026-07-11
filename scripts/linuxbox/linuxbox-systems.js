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

async function readHostMetrics() {
  try {
    const { stdout } = await execFileAsync(
      "bash",
      [
        "-lc",
        "free -m | awk '/^Mem:/{print $7}'; free -m | awk '/^Swap:/{if($2>0) print int(100*$3/$2); else print 0}'; cut -d' ' -f1-3 /proc/loadavg",
      ],
      { timeout: 5000 }
    );
    const lines = stdout.trim().split("\n");
    const memAvail = parseInt(lines[0], 10);
    const swapUsedPct = parseInt(lines[1], 10);
    return {
      mem_avail_mb: Number.isFinite(memAvail) ? memAvail : null,
      swap_used_pct: Number.isFinite(swapUsedPct) ? swapUsedPct : null,
      load_avg: lines[2] || null,
    };
  } catch {
    return { mem_avail_mb: null, swap_used_pct: null, load_avg: null };
  }
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
    out.push({
      ...sys,
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

module.exports = {
  collectSystemsState,
  runSystemControl,
  readRegistry,
  readHostMetrics,
  REGISTRY_PATH,
};
