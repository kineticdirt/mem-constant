/**
 * Multi-machine sync panel — tailnet peers, git bundle state, OPEN CHANNEL ledger.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const REPO = process.env.AGENT_DUMP || path.join(process.env.HOME || "/home/abhinav", "agent-dump");
const REGISTRY_PATH = path.join(REPO, "agents", "machine-registry.json");
const PC_BONSAI_CFG = path.join(REPO, "agents", "pc-bonsai-routing.json");
const GIT_SYNC_STATE = path.join(REPO, "agents", "state", "git-sync.json");
const LEDGER_PATH = path.join(REPO, "AI_GROUPCHAT.md");
const BUNDLE_PENDING = "/tmp/linuxbox-incoming.bundle";

function readRegistry() {
  const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  return raw.machines || [];
}

function readGitSyncState() {
  try {
    return JSON.parse(fs.readFileSync(GIT_SYNC_STATE, "utf8"));
  } catch {
    return null;
  }
}

function findPeer(peers, machine) {
  for (const peer of Object.values(peers || {})) {
    const dns = (peer.DNSName || "").replace(/\.$/, "");
    const host = peer.HostName || "";
    const ips = peer.TailscaleIPs || [];
    if (machine.tailnet_name && (dns.startsWith(machine.tailnet_name) || host === machine.tailnet_name)) {
      return peer;
    }
    if (machine.tailnet_ip && ips.includes(machine.tailnet_ip)) {
      return peer;
    }
  }
  return null;
}

function parseOpenChannel(text) {
  const recentIdx = text.indexOf("## Recent activity");
  const searchText = recentIdx >= 0 ? text.slice(recentIdx) : text;
  const lines = searchText.split("\n");
  let openLine = null;
  let openIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^-\s+\*\*/.test(line)) continue;
    if (!/—\s*\[PC\]/.test(line)) continue;
    if (!line.includes("**OPEN CHANNEL:**")) continue;
    openLine = line.trim();
    openIdx = i;
    break;
  }
  if (!openLine) {
    return { active: false, pc_line: null, laptop_reply: null, awaiting_laptop: false };
  }
  let laptopReply = null;
  for (let j = openIdx + 1; j < Math.min(openIdx + 6, lines.length); j++) {
    if (/^-\s+\*\*/.test(lines[j]) && /—\s*\[LAPTOP\]/.test(lines[j])) {
      laptopReply = lines[j].trim();
      break;
    }
    if (/^-\s+\*\*/.test(lines[j]) && /—\s*\[PC\]/.test(lines[j]) && !lines[j].includes("OPEN CHANNEL")) break;
  }
  return {
    active: true,
    pc_line: openLine.replace(/^-\s*/, ""),
    laptop_reply: laptopReply,
    awaiting_laptop: !laptopReply,
  };
}

async function tailscalePing(ip) {
  if (!ip) return null;
  try {
    const { stdout } = await execFileAsync("tailscale", ["ping", "-c", "1", "-timeout", "2s", ip], {
      timeout: 4000,
    });
    const m = stdout.match(/in\s+([\d.]+)\s*ms/i);
    return m ? Math.round(parseFloat(m[1])) : null;
  } catch {
    return null;
  }
}

function readPcBonsaiRouting() {
  try {
    return JSON.parse(fs.readFileSync(PC_BONSAI_CFG, "utf8"));
  } catch {
    return null;
  }
}

function probeHttpOk(host, port, urlPath, timeoutMs = 3500) {
  return new Promise((resolve) => {
    if (!host || !port) {
      resolve(false);
      return;
    }
    const req = http.get(
      { hostname: host, port, path: urlPath, timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function probeDesktopPcServices(online) {
  const cfg = readPcBonsaiRouting();
  const host = (cfg && cfg.pc_host) || "desktop-igqesd4";
  const inferPort = (cfg && cfg.inference_port) || 8000;
  const pixiPort = 8767;
  if (!online) {
    return {
      host,
      bonsai: { ok: false, url: `http://${host}:${inferPort}/v1/models` },
      pixi: { ok: false, url: `http://${host}:${pixiPort}/` },
    };
  }
  const healthPath = (cfg && cfg.health_path) || "/v1/models";
  const [bonsaiOk, pixiOk] = await Promise.all([
    probeHttpOk(host, inferPort, healthPath),
    probeHttpOk(host, pixiPort, "/"),
  ]);
  return {
    host,
    bonsai: { ok: bonsaiOk, url: `http://${host}:${inferPort}/v1/models` },
    pixi: { ok: pixiOk, url: `http://${host}:${pixiPort}/` },
  };
}

/** Local OpenRouter-only Pixi on potato (:8767) — independent of desktop GPU stack. */
async function probeLocalPixiRp() {
  const port = 8767;
  const ok = await probeHttpOk("127.0.0.1", port, "/api/config", 2500);
  return {
    ok,
    url: `http://127.0.0.1:${port}/`,
    note: "linuxbox-pixi-rp systemd — OpenRouter-only (no GGUF on box)",
  };
}

async function collectMachinesState() {
  const registry = readRegistry();
  let tsJson = null;
  try {
    const { stdout } = await execFileAsync("tailscale", ["status", "--json"], { timeout: 10000 });
    tsJson = JSON.parse(stdout);
  } catch {
    tsJson = null;
  }
  const peers = tsJson?.Peer || {};

  const machines = [];
  let desktopPcServices = null;
  for (const m of registry) {
    let online = false;
    let lastSeen = null;
    let activeText = null;
    if (m.id === "linuxbox") {
      online = tsJson?.BackendState === "Running";
      activeText = "self";
    } else {
      const peer = findPeer(peers, m);
      if (peer) {
        online = peer.Online === true;
        lastSeen = peer.LastSeen && !peer.LastSeen.startsWith("0001") ? peer.LastSeen : null;
        activeText = peer.CurAddr || peer.Relay || null;
      }
    }
    let pingMs = null;
    if (online && m.tailnet_ip && m.id !== "linuxbox") {
      pingMs = await tailscalePing(m.tailnet_ip);
    }
    const row = {
      id: m.id,
      label: m.label,
      subtitle: m.subtitle || m.role,
      role: m.role,
      tailnet_ip: m.tailnet_ip,
      tailnet_name: m.tailnet_name,
      ssh_alias: m.ssh_alias || null,
      workspace: m.workspace,
      os: m.os,
      online,
      last_seen: lastSeen,
      ping_ms: pingMs,
      active_hint: activeText,
      note: m.note || null,
    };
    if (m.id === "desktop") {
      if (!desktopPcServices) {
        desktopPcServices = await probeDesktopPcServices(online);
      }
      row.pc_services = desktopPcServices;
    }
    machines.push(row);
  }

  let gitHead = null;
  try {
    const { stdout } = await execFileAsync("git", ["-C", REPO, "rev-parse", "--short", "HEAD"], { timeout: 5000 });
    gitHead = stdout.trim();
  } catch {
    gitHead = null;
  }

  const gitSync = readGitSyncState();
  let openChannel = { active: false, pc_line: null, laptop_reply: null, awaiting_laptop: false };
  try {
    openChannel = parseOpenChannel(fs.readFileSync(LEDGER_PATH, "utf8"));
  } catch {
    /* ledger optional on partial clone */
  }

  const localPixi = await probeLocalPixiRp();

  return {
    updated_at: new Date().toISOString(),
    machines,
    local_pixi: localPixi,
    pc_pixi: desktopPcServices
      ? {
          url: desktopPcServices.pixi.url,
          ok: desktopPcServices.pixi.ok,
          bonsai_ok: desktopPcServices.bonsai.ok,
          note: "Desktop Pixi/Bonsai (optional). Canonical always-on RP is local_pixi on potato :8767.",
        }
      : null,
    git: {
      head: gitHead,
      last_apply_at: gitSync?.applied_at || null,
      last_from: gitSync?.from_rev ? String(gitSync.from_rev).slice(0, 8) : null,
      last_to: gitSync?.to_rev ? String(gitSync.to_rev).slice(0, 8) : null,
      bundle_pending: fs.existsSync(BUNDLE_PENDING),
    },
    open_channel: openChannel,
    laptop_steps: [
      "git pull origin master (or apply USB kit)",
      "ssh potato  (or ssh -i ~/.ssh/id_rsa_potato abhinav@100.122.108.94)",
      "Cursor: Remote SSH → potato → ~/agent-dump",
      "Append one [LAPTOP] line under OPEN CHANNEL in AI_GROUPCHAT.md",
    ],
    docs: {
      handshake: "docs/LAPTOP_CURSOR_HANDSHAKE.md",
      workspace: "scripts/laptop-usb-kit/LAPTOP-LINUXBOX-WORKSPACE.txt",
    },
  };
}

module.exports = {
  collectMachinesState,
  REGISTRY_PATH,
};
