#!/usr/bin/env node
/**
 * linuxbox agent control dashboard — localhost :8790
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const LISTEN_HOST = "127.0.0.1";
const LISTEN_PORT = 8790;
const TOKEN_ENV_FILE =
  process.env.DASHBOARD_TOKEN_FILE ||
  path.join(process.env.HOME || "/home/abhinav", ".linuxbox-dashboard", ".env");
const REPO = process.env.AGENT_DUMP || path.join(process.env.HOME || "/home/abhinav", "agent-dump");
const STATIC_DIR = path.join(__dirname, "linuxbox-status");
const HEALTH_SCRIPT = path.join(__dirname, "nousagent-health.sh");
const DASHBOARD_BACKLOG = path.join(REPO, "agents", "LINUXBOX_DASHBOARD_BACKLOG.md");
const HUMAN_INBOX = path.join(REPO, "agents", "human-inbox.json");
const USER_TASKS_FILE = path.join(REPO, "agents", "user-tasks.json");
const HERMES_BIN = path.join(process.env.HOME || "/home/abhinav", ".local/bin/hermes");
const SITUATION_DIR = "reports/situation-monitor";
const CODE_DISCOVERY_DIR = "reports/code-discovery";
const INTEL_CONFIG = path.join(REPO, "agents", "intel-trackers.json");
const RSS_CACHE_DIR = path.join(process.env.HOME || "/home/abhinav", ".linuxbox-dashboard", "rss-cache");
const RSS_CACHE_TTL_MS = 30 * 60 * 1000;
const REDDIT_CACHE_TTL_MS = 90 * 60 * 1000;
const RSS_UA =
  "Mozilla/5.0 (compatible; linuxbox-intel/1.1; +https://abhinavall.net/Intel/) AppleWebKit/537.36";

/** Public report trees (viewer role). Campaign dirs stay admin-only. */
const PUBLIC_REPORT_DIRS = {
  "situation-monitor": { label: "Situation & news", dir: SITUATION_DIR },
  "code-discovery": { label: "Code discovery", dir: CODE_DISCOVERY_DIR },
};

const CAMPAIGNS = {
  spacequest: {
    label: "SpaceQuest",
    progress: "campaigns/spacequest/reports/progress.md",
    reportsDir: "campaigns/spacequest/reports",
    storyDirs: ["story", "lore", "characters"],
  },
  "nyc-mafia-dnd": {
    label: "NYC Mafia × D&D",
    progress: "campaigns/nyc-mafia-dnd/reports/progress.md",
    reportsDir: "campaigns/nyc-mafia-dnd/reports",
    storyDirs: ["story"],
  },
};

const USER_TASK_TAGS = [
  "general",
  "campaign",
  "dnd",
  "dashboard",
  "news",
  "bugfix",
  "feature",
  "maintenance",
];

const USER_PROJECT_KINDS = [
  { id: "research-dev", label: "Research & development" },
  { id: "product", label: "Product" },
  { id: "ops", label: "Ops / infra" },
  { id: "personal", label: "Personal" },
];

const VALID_PROFILES = new Set(["fast", "think", "meta", "default"]);

const SECURITY_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => {
      chunks.push(c);
      if (Buffer.concat(chunks).length > 64 * 1024) {
        reject(new Error("body_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseProgress(content) {
  const items = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^- \[([ xX])\] (.+)$/);
    if (m) items.push({ done: m[1].toLowerCase() === "x", text: m[2].trim() });
  }
  return items;
}

function listReports(dir) {
  const abs = path.join(REPO, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => f.endsWith(".md") && f !== "progress.md" && f !== "README.md")
    .map((f) => {
      const st = fs.statSync(path.join(abs, f));
      return { name: f, mtime: st.mtime.toISOString(), size: st.size };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
}

function readHumanInbox() {
  if (!fs.existsSync(HUMAN_INBOX)) {
    return { open: [], answered: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(HUMAN_INBOX, "utf8"));
    return { open: data.open || [], answered: data.answered || [] };
  } catch {
    return { open: [], answered: [] };
  }
}

function writeHumanInbox(data) {
  fs.mkdirSync(path.dirname(HUMAN_INBOX), { recursive: true });
  fs.writeFileSync(HUMAN_INBOX, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function replyHumanInbox(id, answer) {
  const clean = answer.replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!clean) throw new Error("empty_answer");
  const data = readHumanInbox();
  const idx = data.open.findIndex((q) => q.id === id);
  if (idx < 0) throw new Error("question_not_found");
  const item = data.open.splice(idx, 1)[0];
  item.answer = clean;
  item.answered_at = new Date().toISOString();
  data.answered.unshift(item);
  data.answered = data.answered.slice(0, 50);
  writeHumanInbox(data);
  return { ok: true, id, answer: clean };
}

async function collectFastCrontabStatus() {
  try {
    const { stdout } = await execFileAsync("bash", ["-lc", "crontab -l 2>/dev/null | grep -c agent-cycle-fast-tick || echo 0"], {
      timeout: 5000,
      maxBuffer: 4096,
    });
    return parseInt(stdout.trim(), 10) >= 2;
  } catch {
    return false;
  }
}
async function collectHealth() {
  const { stdout } = await execFileAsync("bash", [HEALTH_SCRIPT], {
    timeout: 15000,
    maxBuffer: 64 * 1024,
  });
  const fields = {};
  for (const line of stdout.trim().split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0) fields[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return fields;
}

async function collectCronSummary() {
  try {
    const { stdout } = await execFileAsync(
      "bash",
      ["-lc", `export PATH="${path.dirname(HERMES_BIN)}:$PATH"; hermes cron list 2>/dev/null`],
      { timeout: 20000, maxBuffer: 256 * 1024 }
    );
    return stdout;
  } catch {
    return "";
  }
}

function parseLaneCrons(raw) {
  const lanes = {};
  const lines = raw.split("\n");
  let currentId = null;
  let currentState = "active";
  let currentBlock = [];
  const flush = () => {
    if (!currentId) return;
    const block = currentBlock.join("\n");
    const nameMatch = block.match(/Name:\s+(\S+)/);
    if (!nameMatch || !nameMatch[1].startsWith("agent-cycle")) return;
    const name = nameMatch[1];
    const lastMatch = block.match(/Last run:\s+(.+?)\s{2,}(ok|error[^\n]*)/i);
    const schedMatch = block.match(/Schedule:\s+(.+)/);
    let status = lastMatch ? lastMatch[2].trim() : "pending";
    if (currentState === "paused") status = "paused";
    lanes[name] = {
      name,
      schedule: schedMatch ? schedMatch[1].trim() : null,
      last_run: lastMatch ? lastMatch[1].trim() : null,
      status,
    };
  };
  for (const line of lines) {
    const idMatch = line.match(/^\s{2}([0-9a-f]{12})\s+\[(active|paused)\]/);
    if (idMatch) {
      flush();
      currentId = idMatch[1];
      currentBlock = [line];
      currentState = idMatch[2];
    } else if (currentId) {
      currentBlock.push(line);
    }
  }
  flush();
  return lanes;
}

async function collectAgentState() {
  const health = await collectHealth();
  const cronRaw = await collectCronSummary();
  const lanes = parseLaneCrons(cronRaw);
  if (await collectFastCrontabStatus()) {
    lanes["agent-cycle-fast"] = {
      name: "agent-cycle-fast",
      schedule: "~30s (crontab)",
      last_run: lanes["agent-cycle-fast"]?.last_run || null,
      status: "active",
    };
  }
  const inbox = readHumanInbox();

  let currentTaskStatus = "";
  const taskPath = path.join(REPO, "agents", "CURRENT_TASK.md");
  if (fs.existsSync(taskPath)) {
    const raw = fs.readFileSync(taskPath, "utf8");
    const m = raw.match(/\*\*Status:\*\*\s*(.+)/);
    currentTaskStatus = m ? m[1].trim() : raw.split("\n").slice(0, 3).join(" ");
  }

  const campaigns = {};
  for (const [id, cfg] of Object.entries(CAMPAIGNS)) {
    const progPath = path.join(REPO, cfg.progress);
    let progress = [];
    if (fs.existsSync(progPath)) {
      progress = parseProgress(fs.readFileSync(progPath, "utf8"));
    }
    const pending = progress.filter((p) => !p.done);
    campaigns[id] = {
      label: cfg.label,
      pending_count: pending.length,
      done_count: progress.filter((p) => p.done).length,
      next_item: pending[0]?.text || null,
      progress,
      latest_reports: listReports(cfg.reportsDir).slice(0, 8),
    };
  }

  const allReports = [];
  for (const [id, cfg] of Object.entries(CAMPAIGNS)) {
    for (const r of listReports(cfg.reportsDir).slice(0, 6)) {
      allReports.push({ campaign: id, label: cfg.label, ...r });
    }
  }
  allReports.sort((a, b) => b.mtime.localeCompare(a.mtime));

  let dashboardBacklog = [];
  if (fs.existsSync(DASHBOARD_BACKLOG)) {
    dashboardBacklog = fs
      .readFileSync(DASHBOARD_BACKLOG, "utf8")
      .split("\n")
      .filter((l) => /^- \[ \]/.test(l))
      .map((l) => l.replace(/^- \[ \] /, ""))
      .slice(0, 8);
  }

  return {
    updated_at: new Date().toISOString(),
    host: "linuxbox",
    ...health,
    current_task_status: currentTaskStatus,
    lanes,
    inbox_open_count: inbox.open.length,
    campaigns,
    all_reports: allReports.slice(0, 16),
    dashboard_backlog_open: dashboardBacklog,
    user_tasks: readUserTasksStore().tasks.slice(0, 100),
    user_projects: summarizeUserProjects(readUserTasksStore()),
    user_task_tags: USER_TASK_TAGS,
    user_project_kinds: USER_PROJECT_KINDS,
  };
}

async function appendTask(campaignId, text) {
  const cfg = CAMPAIGNS[campaignId];
  if (!cfg) throw new Error("unknown_campaign");
  const clean = text.replace(/[\r\n]+/g, " ").trim().slice(0, 500);
  if (!clean) throw new Error("empty_task");
  const progPath = path.join(REPO, cfg.progress);
  const line = `- [ ] **user** ${clean}\n`;
  fs.mkdirSync(path.dirname(progPath), { recursive: true });
  fs.appendFileSync(progPath, line, "utf8");
  return { ok: true, campaign: campaignId, added: clean };
}

function readUserTasksStore() {
  if (!fs.existsSync(USER_TASKS_FILE)) {
    return { version: 2, projects: [], tasks: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(USER_TASKS_FILE, "utf8"));
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    let projects = Array.isArray(data.projects) ? data.projects : [];
    if (!projects.length && (data.version || 1) < 2) {
      projects = defaultUserProjects();
    }
    return { version: 2, projects, tasks };
  } catch {
    return { version: 2, projects: defaultUserProjects(), tasks: [] };
  }
}

function defaultUserProjects() {
  return [
    {
      id: "infranet",
      name: "Infranet",
      kind: "research-dev",
      description:
        "Research & development: survey best practices, architecture spikes, prototypes, and iterative build-out of the Infranet stack.",
      status: "active",
      charter_path: "projects/infranet/README.md",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
}

function slugifyProjectId(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function findUserProject(store, projectId) {
  if (!projectId) return null;
  return (store.projects || []).find((p) => p.id === projectId) || null;
}

function summarizeUserProjects(store) {
  const tasks = store.tasks || [];
  return (store.projects || []).map((p) => {
    const mine = tasks.filter((t) => t.project_id === p.id && t.status !== "cancelled");
    return {
      ...p,
      open_count: mine.filter((t) => t.status === "open" || t.status === "in_progress").length,
      done_count: mine.filter((t) => t.status === "done").length,
      task_count: mine.length,
    };
  });
}

function readProjectCharterExcerpt(charterPath, maxLen = 2500) {
  if (!charterPath || charterPath.includes("..")) return "";
  const abs = path.join(REPO, charterPath);
  if (!fs.existsSync(abs)) return "";
  return fs.readFileSync(abs, "utf8").slice(0, maxLen);
}

function createUserProject(payload) {
  const name = String(payload.name || "").trim().slice(0, 120);
  if (!name) throw new Error("empty_project_name");
  const store = readUserTasksStore();
  const id = slugifyProjectId(payload.id || payload.slug || name);
  if (!id) throw new Error("bad_project_id");
  if (store.projects.some((p) => p.id === id)) throw new Error("project_exists");
  const kind = USER_PROJECT_KINDS.some((k) => k.id === payload.kind) ? payload.kind : "research-dev";
  const project = {
    id,
    name,
    kind,
    description: String(payload.description || "").trim().slice(0, 2000),
    status: "active",
    charter_path: payload.charter_path ? String(payload.charter_path).slice(0, 300) : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.projects.unshift(project);
  store.projects = store.projects.slice(0, 50);
  writeUserTasksStore(store);
  return { ok: true, project };
}

function updateUserProject(projectId, patch) {
  const store = readUserTasksStore();
  const idx = store.projects.findIndex((p) => p.id === projectId);
  if (idx < 0) throw new Error("project_not_found");
  const project = store.projects[idx];
  if (patch.name) project.name = String(patch.name).trim().slice(0, 120);
  if (patch.description != null) project.description = String(patch.description).slice(0, 2000);
  if (patch.kind && USER_PROJECT_KINDS.some((k) => k.id === patch.kind)) project.kind = patch.kind;
  if (patch.status && ["active", "paused", "archived"].includes(patch.status)) project.status = patch.status;
  project.updated_at = new Date().toISOString();
  store.projects[idx] = project;
  writeUserTasksStore(store);
  return { ok: true, project };
}

function writeUserTasksStore(data) {
  fs.mkdirSync(path.dirname(USER_TASKS_FILE), { recursive: true });
  const out = { version: 2, projects: data.projects || [], tasks: data.tasks || [] };
  fs.writeFileSync(USER_TASKS_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
}

function normalizeUserTaskTags(tags) {
  if (!Array.isArray(tags)) return ["general"];
  const clean = tags
    .map((t) => String(t || "").trim().toLowerCase())
    .filter((t) => USER_TASK_TAGS.includes(t));
  return clean.length ? [...new Set(clean)] : ["general"];
}

function createUserTask(payload) {
  const title = String(payload.title || payload.text || "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 300);
  if (!title) throw new Error("empty_task");
  const store = readUserTasksStore();
  let projectId = payload.project_id || payload.project || null;
  if (projectId && !findUserProject(store, projectId)) projectId = null;
  const task = {
    id: crypto.randomUUID(),
    title,
    body: String(payload.body || "").trim().slice(0, 4000),
    status: "open",
    project_id: projectId,
    tags: normalizeUserTaskTags(payload.tags),
    context: {
      campaign: payload.context?.campaign && CAMPAIGNS[payload.context.campaign] ? payload.context.campaign : null,
      story_path: null,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (payload.context?.story_path && task.context.campaign) {
    try {
      readStoryDoc(task.context.campaign, payload.context.story_path);
      task.context.story_path = payload.context.story_path;
    } catch {
      /* ignore invalid story path */
    }
  }
  store.tasks.unshift(task);
  store.tasks = store.tasks.slice(0, 200);
  store.version = 2;
  writeUserTasksStore(store);
  return { ok: true, task };
}

function updateUserTask(taskId, patch) {
  const store = readUserTasksStore();
  const idx = store.tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) throw new Error("task_not_found");
  const task = store.tasks[idx];
  if (patch.status) {
    const allowed = new Set(["open", "in_progress", "done", "cancelled"]);
    if (allowed.has(patch.status)) task.status = patch.status;
  }
  if (patch.body != null) task.body = String(patch.body).slice(0, 4000);
  if (patch.tags) task.tags = normalizeUserTaskTags(patch.tags);
  if (patch.project_id !== undefined) {
    task.project_id = patch.project_id && findUserProject(store, patch.project_id) ? patch.project_id : null;
  }
  task.updated_at = new Date().toISOString();
  store.tasks[idx] = task;
  writeUserTasksStore(store);
  return { ok: true, task };
}

function walkStoryMarkdown(absDir, relPrefix, acc, depth = 0, opts = {}) {
  const skipReadme = opts.skipReadme !== false;
  if (depth > 5 || !fs.existsSync(absDir)) return;
  for (const ent of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const abs = path.join(absDir, ent.name);
    const rel = `${relPrefix}/${ent.name}`.replace(/\\/g, "/");
    if (ent.isDirectory()) walkStoryMarkdown(abs, rel, acc, depth + 1, opts);
    else if (ent.name.endsWith(".md") && (!skipReadme || ent.name.toLowerCase() !== "readme.md")) {
      const st = fs.statSync(abs);
      acc.push({
        path: rel,
        name: ent.name,
        folder: relPrefix.split("/").slice(-1)[0],
        mtime: st.mtime.toISOString(),
        size: st.size,
      });
    }
  }
}

function listStoryCatalog() {
  const campaigns = {};
  for (const [id, cfg] of Object.entries(CAMPAIGNS)) {
    const files = [];
    for (const sub of cfg.storyDirs || ["story"]) {
      walkStoryMarkdown(path.join(REPO, "campaigns", id, sub), `campaigns/${id}/${sub}`, files);
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    campaigns[id] = { label: cfg.label, files };
  }
  return { updated_at: new Date().toISOString(), campaigns, tags: USER_TASK_TAGS };
}

function readStoryDoc(campaignId, relPath) {
  const cfg = CAMPAIGNS[campaignId];
  if (!cfg || !relPath || relPath.includes("..")) throw new Error("bad_request");
  const normalized = relPath.replace(/\\/g, "/");
  if (!normalized.startsWith(`campaigns/${campaignId}/`)) throw new Error("bad_request");
  const abs = path.join(REPO, normalized);
  if (!fs.existsSync(abs) || !abs.endsWith(".md")) throw new Error("not_found");
  return {
    campaign: campaignId,
    label: cfg.label,
    path: normalized,
    file: path.basename(normalized),
    content: fs.readFileSync(abs, "utf8"),
  };
}

function buildChatMessage(message, context) {
  const clean = message.trim().slice(0, 2000);
  if (!clean) throw new Error("empty_message");
  if (!context || typeof context !== "object") return clean;

  const blocks = [];
  const store = readUserTasksStore();
  if (context.project_id) {
    const project = findUserProject(store, context.project_id);
    if (project) {
      const charter = project.charter_path ? readProjectCharterExcerpt(project.charter_path) : "";
      blocks.push(
        `[Project: ${project.name} (${project.kind})]\n${project.description || ""}${charter ? `\n\n--- charter excerpt ---\n${charter}` : ""}`.slice(
          0,
          4000
        )
      );
    }
  }
  if (context.type === "story" && context.campaign && context.path) {
    const doc = readStoryDoc(context.campaign, context.path);
    blocks.push(
      `[Story context — ${doc.label} / ${doc.file}]\n\n${doc.content.slice(0, 12000)}`
    );
  }
  if (context.task_id) {
    const task = store.tasks.find((t) => t.id === context.task_id);
    if (task) {
      if (task.project_id) {
        const project = findUserProject(store, task.project_id);
        if (project) {
          blocks.push(`[Task project: ${project.name}]`);
        }
      }
      blocks.push(
        `[Linked task ${task.id.slice(0, 8)}]\nTitle: ${task.title}\nTags: ${task.tags.join(", ")}\nStatus: ${task.status}\n${task.body || ""}`.slice(
          0,
          3000
        )
      );
    }
  }
  if (Array.isArray(context.tags) && context.tags.length) {
    blocks.push(`[Context tags: ${context.tags.join(", ")}]`);
  }
  if (!blocks.length) return clean;
  return `${blocks.join("\n\n---\n\n")}\n\n---\n\nUser message:\n${clean}`;
}

async function suggestDashboardImprovement(text) {
  const clean = text.replace(/[\r\n]+/g, " ").trim().slice(0, 800);
  if (!clean) throw new Error("empty_suggestion");
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const line = `- [ ] ${stamp} (user) ${clean}\n`;
  fs.mkdirSync(path.dirname(DASHBOARD_BACKLOG), { recursive: true });
  if (!fs.existsSync(DASHBOARD_BACKLOG)) {
    fs.writeFileSync(
      DASHBOARD_BACKLOG,
      "# Linuxbox dashboard backlog\n\nAgent may implement unchecked items via agent-cycle-think (meta lane).\n\n",
      "utf8"
    );
  }
  fs.appendFileSync(DASHBOARD_BACKLOG, line, "utf8");
  return { ok: true, added: clean };
}

async function runHermesChat(message, profile = "think", context = null) {
  const prof = VALID_PROFILES.has(profile) ? profile : "think";
  const prompt = buildChatMessage(message, context);
  const wrapper = prof === "default" ? "hermes" : prof;
  const cmd = `export PATH="${path.dirname(HERMES_BIN)}:$PATH"; cd "${REPO}" && ${wrapper} chat -q ${JSON.stringify(prompt)}`;
  const { stdout, stderr } = await execFileAsync("bash", ["-lc", cmd], {
    timeout: 180000,
    maxBuffer: 512 * 1024,
  });
  const out = (stdout || stderr || "").trim();
  const reply = out.split("\n").filter((l) => !l.startsWith("Resume this session")).join("\n").trim();
  return { reply, profile: prof, context_used: !!context };
}

function situationKind(name) {
  if (name === "LATEST-BRIEF.md") return "latest";
  if (name === "LATEST-STOCK-BRIEF.md") return "stock";
  if (name.startsWith("stock-brief")) return "stock";
  if (name.startsWith("hermes-digest")) return "digest";
  if (name.startsWith("situation-brief")) return "rss";
  return "other";
}

function situationLabel(name) {
  const kind = situationKind(name);
  if (kind === "latest") return "Latest RSS brief";
  if (kind === "stock") return "Stock & markets brief";
  if (kind === "digest") return "Hermes digest";
  if (kind === "rss") return "RSS brief";
  return name.replace(/\.md$/, "");
}

function readIntelConfig() {
  const fallback = {
    stocks: [],
    social_feeds: [],
    tools: [],
  };
  if (!fs.existsSync(INTEL_CONFIG)) return fallback;
  try {
    const raw = JSON.parse(fs.readFileSync(INTEL_CONFIG, "utf8"));
    return {
      stocks: raw.stocks || [],
      social_feeds: raw.social_feeds || [],
      tools: raw.tools || [],
    };
  } catch {
    return fallback;
  }
}

function fetchUrlText(url, timeoutMs = 15000, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(
      url,
      {
        headers: { "User-Agent": RSS_UA, Accept: "application/rss+xml, application/xml, text/xml, */*", ...extraHeaders },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function feedCacheSlug(feed) {
  return (feed.name || feed.platform || "feed")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function readRssCache(slug) {
  const p = path.join(RSS_CACHE_DIR, `${slug}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeRssCache(slug, payload) {
  fs.mkdirSync(RSS_CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(RSS_CACHE_DIR, `${slug}.json`), JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function redditHostAlternate(url) {
  if (/old\.reddit\.com/i.test(url)) {
    return url.replace(/old\.reddit\.com/i, "www.reddit.com");
  }
  if (/www\.reddit\.com/i.test(url)) {
    return url.replace(/www\.reddit\.com/i, "old.reddit.com");
  }
  return null;
}

function feedCandidateUrls(feed) {
  const urls = [];
  const add = (u) => {
    if (u && !urls.includes(u)) urls.push(u);
  };
  add(feed.rss_url);
  if (feed.platform === "reddit") {
    add(redditHostAlternate(feed.rss_url));
  }
  for (const u of feed.fallback_rss_urls || []) add(u);
  return urls;
}

async function fetchRssWithRetry(url, timeoutMs = 12000) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchUrlText(url, timeoutMs);
    } catch (err) {
      lastErr = err;
      const msg = err.message || "";
      if (attempt === 0 && (msg.includes("429") || msg.includes("503"))) {
        await sleep(2500 + attempt * 1500);
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

function decodeXmlText(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .trim();
}

function parseFeedBlock(block) {
  const titleRaw = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const title = decodeXmlText(titleRaw);
  if (!title) return null;
  const linkHref = (block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i) || [])[1];
  const linkRaw = linkHref || (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || "";
  const link = decodeXmlText(linkRaw);
  return { title, link };
}

function parseFeedItems(xml, maxItems = 10) {
  const items = [];
  for (const re of [/<item[\s>]([\s\S]*?)<\/item>/gi, /<entry[\s>]([\s\S]*?)<\/entry>/gi]) {
    let match;
    while ((match = re.exec(xml)) && items.length < maxItems) {
      const parsed = parseFeedBlock(match[1]);
      if (parsed) items.push(parsed);
    }
    if (items.length) break;
  }
  return items;
}

function yahooToStooq(symbol) {
  if (symbol.includes("-")) {
    const parts = symbol.toLowerCase().split("-");
    return `${parts[0]}.${parts[1]}`;
  }
  return `${symbol.toLowerCase()}.us`;
}

function stooqToSymbol(stooqSym) {
  const s = stooqSym.toUpperCase();
  if (s.endsWith(".USD")) return s.replace(".USD", "-USD");
  return s.replace(".US", "");
}

async function fetchStockQuotesStooq(symbols) {
  const clean = symbols.filter(Boolean).slice(0, 12);
  if (!clean.length) return [];
  const stooqList = clean.map(yahooToStooq).join(";");
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqList)}&f=sd2t2ohlcv&h&e=csv`;
  const csv = await fetchUrlText(url, 12000);
  if (csv.trim().startsWith("<!") || csv.toLowerCase().includes("<html")) {
    throw new Error("stooq_blocked");
  }
  const lines = csv.trim().split("\n").slice(1);
  const labelMap = Object.fromEntries(clean.map((s, i) => [stooqToSymbol(yahooToStooq(s)), s]));
  return lines
    .map((line) => {
      const cols = line.split(",");
      if (cols.length < 7) return null;
      const sym = stooqToSymbol(cols[0]);
      const price = parseFloat(cols[6]);
      return {
        symbol: labelMap[sym] || sym,
        label: sym,
        price: Number.isNaN(price) ? null : price,
        change: null,
        changePct: null,
        marketState: cols[2] || null,
        currency: "USD",
        source: "stooq",
      };
    })
    .filter(Boolean);
}

async function fetchStockQuotesSpark(symbols) {
  const clean = symbols.filter(Boolean).slice(0, 12);
  if (!clean.length) return [];
  const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(clean.join(","))}&range=1d&interval=5m`;
  const raw = await fetchUrlText(url, 12000);
  const data = JSON.parse(raw);
  const results = data?.spark?.result || [];
  return results
    .map((r) => {
      const meta = r.response?.[0]?.meta || {};
      const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
      const price = meta.regularMarketPrice ?? null;
      const change = price != null && prev != null ? price - prev : null;
      const changePct = change != null && prev ? (change / prev) * 100 : null;
      return {
        symbol: r.symbol,
        label: meta.shortName || meta.longName || r.symbol,
        price,
        change,
        changePct,
        marketState: meta.exchangeTimezoneName || null,
        currency: meta.currency || "USD",
        source: "yahoo-spark",
      };
    })
    .filter((q) => q.symbol);
}

async function fetchStockQuotes(symbols) {
  const clean = symbols.filter(Boolean).slice(0, 12);
  if (!clean.length) return [];
  try {
    const spark = await fetchStockQuotesSpark(clean);
    if (spark.length) return spark;
  } catch {
    /* fall through */
  }
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(clean.join(","))}`;
    const raw = await fetchUrlText(url, 12000);
    const data = JSON.parse(raw);
    const results = data?.quoteResponse?.result || [];
    if (results.length) {
      return results.map((q) => ({
        symbol: q.symbol,
        label: q.shortName || q.longName || q.symbol,
        price: q.regularMarketPrice ?? null,
        change: q.regularMarketChange ?? null,
        changePct: q.regularMarketChangePercent ?? null,
        marketState: q.marketState || null,
        currency: q.currency || "USD",
        source: "yahoo",
      }));
    }
  } catch {
    /* fall through to stooq */
  }
  return fetchStockQuotesStooq(clean);
}

async function fetchSocialFeeds(feeds) {
  const out = [];
  for (const feed of feeds.slice(0, 8)) {
    const slug = feedCacheSlug(feed);
    const cached = readRssCache(slug);
    const ttlMs = feed.platform === "reddit" ? REDDIT_CACHE_TTL_MS : RSS_CACHE_TTL_MS;
    const cacheFresh =
      cached && cached.fetched_at && Date.now() - Date.parse(cached.fetched_at) < ttlMs;

    if (cacheFresh && cached.items?.length && !cached.error) {
      out.push({
        name: feed.name,
        platform: feed.platform,
        rss_url: cached.rss_url || feed.rss_url,
        items: cached.items,
        error: null,
        cached: true,
      });
      continue;
    }

    if (feed.platform === "reddit") {
      await sleep(2200);
    }

    let lastErr = null;
    let winner = null;
    for (const tryUrl of feedCandidateUrls(feed)) {
      try {
        const xml = await fetchRssWithRetry(tryUrl, 12000);
        const items = parseFeedItems(xml, 10);
        if (!items.length) {
          lastErr = new Error("empty_feed");
          continue;
        }
        winner = { rss_url: tryUrl, items, error: null };
        break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (winner) {
      writeRssCache(slug, {
        fetched_at: new Date().toISOString(),
        rss_url: winner.rss_url,
        items: winner.items,
        error: null,
      });
      out.push({
        name: feed.name,
        platform: feed.platform,
        rss_url: winner.rss_url,
        items: winner.items,
        error: null,
        cached: false,
      });
      continue;
    }

    if (cached?.items?.length) {
      out.push({
        name: feed.name,
        platform: feed.platform,
        rss_url: cached.rss_url || feed.rss_url,
        items: cached.items,
        error: `stale_cache (${lastErr?.message || "fetch_failed"})`,
        cached: true,
      });
      continue;
    }

    out.push({
      name: feed.name,
      platform: feed.platform,
      rss_url: feed.rss_url,
      items: [],
      error: lastErr?.message || "fetch_failed",
      cached: false,
    });
  }
  return out;
}

async function collectIntelState() {
  const news = collectNewsState();
  const config = readIntelConfig();
  let stocks = [];
  let stocksError = null;
  let social = [];
  try {
    stocks = await fetchStockQuotes(config.stocks.map((s) => s.symbol));
  } catch (err) {
    stocksError = err.message || "quote_fetch_failed";
  }
  social = await fetchSocialFeeds(config.social_feeds);
  const stockBrief = news.briefs.find((b) => b.name === "LATEST-STOCK-BRIEF.md") || null;
  return {
    ...news,
    stocks,
    stocksError,
    social,
    tools: config.tools,
    watchlist: config.stocks,
    latest_stock_brief: stockBrief,
  };
}

function listSituationBriefs() {
  const abs = path.join(REPO, SITUATION_DIR);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const st = fs.statSync(path.join(abs, f));
      return {
        name: f,
        kind: situationKind(f),
        label: situationLabel(f),
        mtime: st.mtime.toISOString(),
        size: st.size,
      };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
}

function collectNewsState() {
  const briefs = listSituationBriefs();
  const rss = briefs.filter((b) => b.kind === "rss" || b.kind === "latest");
  const digests = briefs.filter((b) => b.kind === "digest");
  return {
    updated_at: new Date().toISOString(),
    briefs,
    latest_rss: rss.sort((a, b) => b.mtime.localeCompare(a.mtime))[0] || null,
    latest_digest: digests.sort((a, b) => b.mtime.localeCompare(a.mtime))[0] || null,
  };
}

function readSituationBrief(file) {
  if (!file || file.includes("..") || !file.endsWith(".md")) {
    throw new Error("bad_request");
  }
  const abs = path.join(REPO, SITUATION_DIR, file);
  if (!fs.existsSync(abs)) throw new Error("not_found");
  return {
    file,
    kind: situationKind(file),
    label: situationLabel(file),
    content: fs.readFileSync(abs, "utf8"),
  };
}

function readReport(campaignId, file) {
  const pub = PUBLIC_REPORT_DIRS[campaignId];
  if (pub) {
    if (!file || file.includes("..") || !file.endsWith(".md")) throw new Error("bad_request");
    const abs = path.join(REPO, pub.dir, file);
    if (!fs.existsSync(abs)) throw new Error("not_found");
    return { file, campaign: campaignId, label: pub.label, content: fs.readFileSync(abs, "utf8") };
  }
  const cfg = CAMPAIGNS[campaignId];
  if (!cfg || !file || file.includes("..") || !file.endsWith(".md")) {
    throw new Error("bad_request");
  }
  const abs = path.join(REPO, cfg.reportsDir, file);
  if (!fs.existsSync(abs)) throw new Error("not_found");
  return { file, campaign: campaignId, label: cfg.label, content: fs.readFileSync(abs, "utf8") };
}

function listPublicReports() {
  const out = [];
  for (const [id, cfg] of Object.entries(PUBLIC_REPORT_DIRS)) {
    for (const r of listReports(cfg.dir)) {
      out.push({ campaign: id, label: cfg.label, ...r });
    }
  }
  out.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return out;
}

// ---------------------------------------------------------------------------
// App-level auth (backstop independent of Cloudflare Access).
//
// Public traffic reaches us as loopback (Cloudflare -> cloudflared ->
// tunnel-origin-proxy -> 127.0.0.1:8790), so loopback alone is NOT trust.
// We trust loopback ONLY when no edge/forwarding headers are present, i.e. a
// genuine on-box caller (agent cycles, curl health). Everything else must
// present the shared token (HTTP Basic password, Bearer, or lbx_token cookie).
// Token + role credentials live in ~/.linuxbox-dashboard/.env (never committed).
//   DASHBOARD_TOKEN          — admin password (HTTP Basic user below, or Bearer/cookie)
//   DASHBOARD_ADMIN_USER     — Basic auth username for admin (default: admin)
//   DASHBOARD_VIEWER_TOKEN   — viewer password (optional; enables read-only role)
//   DASHBOARD_VIEWER_USER    — Basic auth username for viewer (default: viewer)
// Bitwarden: save https://abhinavall.net/Linuxbox/ with username admin|viewer + password.
// ---------------------------------------------------------------------------
function readEnvFile() {
  const out = {};
  try {
    const raw = fs.readFileSync(TOKEN_ENV_FILE, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    /* file may not exist yet */
  }
  return out;
}

const ENV_FILE = readEnvFile();

function envVal(key) {
  if (process.env[key] && process.env[key].trim()) return process.env[key].trim();
  return ENV_FILE[key] || null;
}

let DASHBOARD_TOKEN = envVal("DASHBOARD_TOKEN");
const DASHBOARD_VIEWER_TOKEN = envVal("DASHBOARD_VIEWER_TOKEN");
const DASHBOARD_ADMIN_USER = envVal("DASHBOARD_ADMIN_USER") || "admin";
const DASHBOARD_VIEWER_USER = envVal("DASHBOARD_VIEWER_USER") || "viewer";

const VIEWER_GET_PREFIXES = [
  "/",
  "/index.html",
  "/api/session",
  "/api/intel",
  "/api/news",
];

function viewerMayGet(pathname) {
  if (VIEWER_GET_PREFIXES.includes(pathname)) return true;
  if (pathname === "/api/news/brief") return true;
  if (pathname === "/api/reports/public") return true;
  if (pathname.startsWith("/api/reports/situation-monitor")) return true;
  if (pathname.startsWith("/api/reports/code-discovery")) return true;
  return false;
}

function publicMayGet(publicMode, pathname) {
  if (publicMode === "intel") return viewerMayGet(pathname);
  return false;
}

function isPublicEdge(publicMode) {
  return publicMode === "intel";
}

/** Map /viewer/* for public tunnel path (Intel POC). */
function splitPublicPath(pathname) {
  if (pathname === "/viewer" || pathname.startsWith("/viewer/")) {
    const inner = pathname.slice("/viewer".length) || "/";
    return { publicMode: "intel", pathname: inner.startsWith("/") ? inner : `/${inner}` };
  }
  return { publicMode: null, pathname };
}

// DASHBOARD_OPEN: temporary public-access toggle (reversible without code changes).
//   "off"/unset -> token required for public (default, secure)
//   "read"      -> public GET/HEAD allowed; mutating methods (POST) still need token
//   "all"/"1"/"on" -> fully open, no auth (use only behind Cloudflare Access)
const OPEN_MODE = (envVal("DASHBOARD_OPEN") || "").toLowerCase();
const OPEN_ALL = ["all", "1", "on", "true", "yes"].includes(OPEN_MODE);
const OPEN_READ = OPEN_MODE === "read";

function isTrustedLocal(req) {
  const ra = req.socket.remoteAddress || "";
  const loopback = ra === "127.0.0.1" || ra === "::1" || ra === "::ffff:127.0.0.1";
  if (!loopback) return false;
  if (req.headers["cf-connecting-ip"] || req.headers["cf-ray"] || req.headers["x-forwarded-for"]) {
    return false;
  }
  return true;
}

function safeEqual(a, b) {
  const ba = Buffer.from(a || "", "utf8");
  const bb = Buffer.from(b || "", "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function presentedBasicUserPass(req) {
  const auth = req.headers["authorization"] || "";
  if (!auth.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(auth.slice(6).trim(), "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx < 0) return { user: decoded, password: "" };
    return { user: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

function presentedToken(req) {
  const auth = req.headers["authorization"] || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const basic = presentedBasicUserPass(req);
  if (basic) return basic.password;
  const cookie = req.headers["cookie"] || "";
  const m = cookie.match(/(?:^|;\s*)lbx_token=([^;]+)/);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

/** @returns {{ role: 'admin'|'viewer'|'local', source: string, public?: boolean } | null} */
function resolveAuth(req, publicMode) {
  if (publicMode === "intel") return { role: "viewer", source: "public_intel", public: true };
  if (isTrustedLocal(req)) return { role: "admin", source: "loopback" };
  if (OPEN_ALL) return { role: "admin", source: "open_all" };

  const basic = presentedBasicUserPass(req);
  if (basic) {
    if (DASHBOARD_TOKEN && safeEqual(basic.user, DASHBOARD_ADMIN_USER) && safeEqual(basic.password, DASHBOARD_TOKEN)) {
      return { role: "admin", source: "basic_admin" };
    }
    if (DASHBOARD_VIEWER_TOKEN && safeEqual(basic.user, DASHBOARD_VIEWER_USER) && safeEqual(basic.password, DASHBOARD_VIEWER_TOKEN)) {
      return { role: "viewer", source: "basic_viewer" };
    }
    return null;
  }

  const tok = presentedToken(req);
  if (tok && DASHBOARD_TOKEN && safeEqual(tok, DASHBOARD_TOKEN)) {
    return { role: "admin", source: "bearer_admin" };
  }
  if (tok && DASHBOARD_VIEWER_TOKEN && safeEqual(tok, DASHBOARD_VIEWER_TOKEN)) {
    return { role: "viewer", source: "bearer_viewer" };
  }

  if (OPEN_READ && (req.method === "GET" || req.method === "HEAD")) {
    return { role: "viewer", source: "open_read" };
  }

  return null;
}

function isAuthorized(req, pathname, publicMode) {
  if (isPublicEdge(publicMode)) {
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    return publicMayGet(publicMode, pathname);
  }
  const auth = resolveAuth(req, false);
  if (!auth) {
    if (!DASHBOARD_TOKEN && !DASHBOARD_VIEWER_TOKEN) return false;
    return false;
  }
  if (auth.role === "admin") return true;
  if (auth.role === "viewer") {
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    return viewerMayGet(pathname);
  }
  return false;
}

function authForRequest(req, publicMode) {
  return resolveAuth(req, publicMode);
}

function responseHeaders(publicMode) {
  if (isPublicEdge(publicMode)) {
    return {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    };
  }
  return SECURITY_HEADERS;
}

function send401(res, publicMode) {
  if (isPublicEdge(publicMode)) {
    res.writeHead(403, { ...responseHeaders(true), "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "forbidden" }));
    return;
  }
  res.writeHead(401, {
    ...SECURITY_HEADERS,
    "WWW-Authenticate": 'Basic realm="linuxbox dashboard", charset="UTF-8"',
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify({ error: "unauthorized" }));
}

function sendJson(res, statusCode, body, publicMode) {
  res.writeHead(statusCode, { ...responseHeaders(publicMode), "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

function sendFile(res, filePath, contentType, publicMode) {
  res.writeHead(200, { ...responseHeaders(publicMode), "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const { publicMode, pathname } = splitPublicPath(url.pathname);

  if (!isAuthorized(req, pathname, publicMode)) {
    send401(res, publicMode);
    return;
  }

  const auth = authForRequest(req, publicMode);

  try {
    if (req.method === "GET" && pathname === "/api/session") {
      sendJson(
        res,
        200,
        {
          role: auth?.role || "viewer",
          viewer: auth?.role === "viewer",
          public: isPublicEdge(publicMode),
          capabilities: {
            news: true,
            intel: true,
            public_reports: true,
            agent_control: auth?.role === "admin",
            chat: auth?.role === "admin",
            inbox: auth?.role === "admin",
          },
        },
        publicMode
      );
      return;
    }

    if (req.method === "GET" && pathname === "/api/status") {
      const health = await collectHealth();
      sendJson(res, 200, { updated_at: new Date().toISOString(), ...health }, publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/agent") {
      sendJson(res, 200, await collectAgentState(), publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/inbox") {
      sendJson(res, 200, { updated_at: new Date().toISOString(), ...readHumanInbox() }, publicMode);
      return;
    }

    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      sendFile(res, path.join(STATIC_DIR, "index.html"), "text/html; charset=utf-8", publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/intel") {
      sendJson(res, 200, await collectIntelState(), publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/news") {
      sendJson(res, 200, collectNewsState(), publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/news/brief") {
      const file = url.searchParams.get("file");
      sendJson(res, 200, readSituationBrief(file), publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/stories") {
      sendJson(res, 200, listStoryCatalog(), publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/stories/doc") {
      const campaignId = url.searchParams.get("campaign");
      const relPath = url.searchParams.get("path");
      sendJson(res, 200, readStoryDoc(campaignId, relPath), publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/user-tasks") {
      const store = readUserTasksStore();
      sendJson(
        res,
        200,
        {
          updated_at: new Date().toISOString(),
          tags: USER_TASK_TAGS,
          project_kinds: USER_PROJECT_KINDS,
          projects: summarizeUserProjects(store),
          tasks: store.tasks,
        },
        publicMode
      );
      return;
    }

    if (req.method === "GET" && pathname === "/api/user-projects") {
      const store = readUserTasksStore();
      sendJson(
        res,
        200,
        {
          updated_at: new Date().toISOString(),
          kinds: USER_PROJECT_KINDS,
          projects: summarizeUserProjects(store),
        },
        publicMode
      );
      return;
    }

    if (req.method === "GET" && pathname === "/api/reports/public") {
      sendJson(res, 200, { updated_at: new Date().toISOString(), all_reports: listPublicReports() }, publicMode);
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/api/reports/")) {
      const campaignId = pathname.slice("/api/reports/".length);
      const file = url.searchParams.get("file");
      sendJson(res, 200, readReport(campaignId, file), publicMode);
      return;
    }

    if (req.method === "POST") {
      const raw = await readBody(req);
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { error: "invalid_json" }, publicMode);
        return;
      }

      if (pathname === "/api/tasks") {
        if (body.mode === "user" || !body.campaign) {
          sendJson(res, 200, createUserTask(body), publicMode);
          return;
        }
        sendJson(res, 200, await appendTask(body.campaign, body.text || body.title || ""), publicMode);
        return;
      }

      if (pathname === "/api/user-projects") {
        sendJson(res, 200, createUserProject(body), publicMode);
        return;
      }

      if (pathname.startsWith("/api/user-projects/") && req.method === "POST") {
        const projectId = pathname.slice("/api/user-projects/".length);
        sendJson(res, 200, updateUserProject(projectId, body), publicMode);
        return;
      }

      if (pathname.startsWith("/api/user-tasks/") && req.method === "POST") {
        const taskId = pathname.slice("/api/user-tasks/".length);
        sendJson(res, 200, updateUserTask(taskId, body), publicMode);
        return;
      }

      if (pathname === "/api/chat") {
        sendJson(res, 200, await runHermesChat(body.message || "", body.profile || "think", body.context || null), publicMode);
        return;
      }

      if (pathname === "/api/dashboard/suggest") {
        sendJson(res, 200, await suggestDashboardImprovement(body.text || ""), publicMode);
        return;
      }

      if (pathname === "/api/inbox/reply") {
        sendJson(res, 200, replyHumanInbox(body.id, body.answer || ""), publicMode);
        return;
      }
    }

    if (req.method === "HEAD") {
      res.writeHead(200, responseHeaders(publicMode));
      res.end();
      return;
    }

    sendJson(res, 404, { error: "not_found" }, publicMode);
  } catch (err) {
    sendJson(res, 500, { error: err.message || "internal_error" }, publicMode);
  }
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`linuxbox control dashboard on http://${LISTEN_HOST}:${LISTEN_PORT}`);
  let authMode;
  if (OPEN_ALL) authMode = "OPEN (no auth) -- public can read AND run POST/chat; use only behind Cloudflare Access";
  else if (OPEN_READ) authMode = "OPEN-READ -- public GET as viewer; POST/mutations require admin token";
  else if (DASHBOARD_TOKEN || DASHBOARD_VIEWER_TOKEN) {
    const parts = [];
    if (DASHBOARD_TOKEN) parts.push(`admin Basic user=${DASHBOARD_ADMIN_USER}`);
    if (DASHBOARD_VIEWER_TOKEN) parts.push(`viewer Basic user=${DASHBOARD_VIEWER_USER}`);
    authMode = `${parts.join("; ")}; on-box loopback exempt`;
  } else authMode = `NO tokens configured -> public denied (set tokens in ${TOKEN_ENV_FILE})`;
  console.log(`auth: ${authMode}; public Intel https://abhinavall.net/Intel/`);
});
