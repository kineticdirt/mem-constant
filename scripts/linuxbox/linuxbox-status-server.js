#!/usr/bin/env node
/**
 * linuxbox agent control dashboard — localhost :8790
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile, execFileSync } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const { collectSystemsState, runSystemControl, getSystemDetail } = require("./linuxbox-systems");
const { collectMachinesState } = require("./linuxbox-machines");

const LISTEN_HOST = "127.0.0.1";
const LISTEN_PORT = 8790;
const TOKEN_ENV_FILE =
  process.env.DASHBOARD_TOKEN_FILE ||
  path.join(process.env.HOME || "/home/abhinav", ".linuxbox-dashboard", ".env");
const REPO = process.env.AGENT_DUMP || path.join(process.env.HOME || "/home/abhinav", "agent-dump");
const STATIC_DIR = path.join(__dirname, "linuxbox-status");
const HEALTH_SCRIPT = path.join(__dirname, "nousagent-health.sh");
const DASHBOARD_BACKLOG = path.join(REPO, "agents", "LINUXBOX_DASHBOARD_BACKLOG.md");
const HUMAN_INBOX_LEGACY = path.join(REPO, "agents", "human-inbox.json");
const HUMAN_INBOX = path.join(REPO, "agents", "state", "human-inbox.json");
const INBOX_SEEDS = path.join(REPO, "agents", "inbox-seeds.json");
const USER_TASKS_FILE = path.join(REPO, "agents", "user-tasks.json");
const MAZDA_PARTS_FILE = path.join(REPO, "projects", "mazda3-sports-build", "parts.json");
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
  "tropic-gooner": {
    label: "Tropic Gooner (Hunter: The Reckoning)",
    progress: "campaigns/tropic-gooner/reports/progress.md",
    reportsDir: "campaigns/tropic-gooner/reports",
    storyDirs: ["Things and Places of Note", "Organizations", "Plot Lines", "characters", "places"],
    charactersRegistry: "campaigns/tropic-gooner/characters-registry.json",
  },
};

/** Server-injected canon for campaign chat (Hermes has no file-read tools). */
const CAMPAIGN_CHAT_CANON_FILES = {
  "tropic-gooner": [
    "campaigns/tropic-gooner/README.md",
    "campaigns/tropic-gooner/reports/island-vice-and-enforcement.md",
    "campaigns/tropic-gooner/reports/chronicle-history.md",
    "campaigns/tropic-gooner/reports/vice-theory-notes.md",
    "campaigns/tropic-gooner/Things and Places of Note/Regions/PARADISIO COUNTY/Paradisio Overview.md",
  ],
  spacequest: ["campaigns/spacequest/reports/progress.md"],
  "nyc-mafia-dnd": ["campaigns/nyc-mafia-dnd/reports/progress.md"],
};

const CHAT_RUNTIME_GUARDRAIL = `[Runtime — important]
You cannot read, write, or check files on disk during this chat. Canon excerpts and a short system/task status block are injected below when available.
You may reference injected system/task status; you cannot run shell — use injected facts only.
Never say "let me read/check/look on disk" or promise to open files — answer substantively in one message using injected context and conversation history.
If facts are missing, ask 1–2 targeted questions or draft from what you know; the human can use Save to campaign after you produce content.`;

/** Friendly labels for chat campaign binding (UI + prompts). */
const CHAT_CAMPAIGN_LABELS = {
  spacequest: "SpaceQuest",
  "nyc-mafia-dnd": "NYC Mafia × D&D",
  "tropic-gooner": "Tropic Gooner",
};

function campaignDisplayLabel(context) {
  if (!context?.campaign || !CAMPAIGNS[context.campaign]) return null;
  if (context.layer === "hunter" && context.campaign === "tropic-gooner") {
    return "Hunter: The Reckoning (Tropic Gooner chronicle)";
  }
  return CHAT_CAMPAIGN_LABELS[context.campaign] || CAMPAIGNS[context.campaign].label;
}

const CHAT_STATUS_MAX_CHARS = 2800;

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

const VALID_PROFILES = new Set(["fast", "think", "meta", "code", "default"]);
const HERMES_MODEL_REGISTRY = path.join(REPO, "agents/hermes-model-registry.json");
const CHAT_PAID_MODEL_FALLBACK = [
  "nousresearch/hermes-4-70b",
  "z-ai/glm-5.2",
  "deepseek/deepseek-v4-flash",
];
/** Last resort for moderation-heavy RP worldbuilding — Venice uncensored via OpenRouter (paid). */
const CHAT_VENICE_LAST_RESORT = "cognitivecomputations/dolphin-mistral-24b-venice-edition";
/** Free-first for dashboard Chat when possible — cycled by usage tracker. */
const CHAT_FREE_LAST_RESORT = [
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "tencent/hy3:free",
];
const CHAT_MODEL_USAGE_FILE = path.join(REPO, "agents", "state", "chat-model-usage.json");
const MODEL_BUDGET_CONFIG = path.join(REPO, "agents/model-budget/config.json");
const MODEL_BUDGET_STATE = path.join(REPO, "agents/state/model-budget.json");
/** Soft daily caps (attempts) — prefer less-used models; not hard blocks. */
let CHAT_USAGE_SOFT_CAP_PAID = 40;
let CHAT_USAGE_SOFT_CAP_FREE = 80;
/** Free-first policy (agents/model-budget/config.json). */
let CHAT_FREE_FIRST = true;
/** Documented ops spend target (USD/day) — actual OpenRouter key limit set via UI/management API. */
let OPENROUTER_OPS_DAILY_USD = 7;
let CHAT_PROFILE_CHAIN = ["think", "meta", "code"];
let HERMES_MODEL_REGISTRY_DATA = null;
let MODEL_BUDGET_CONFIG_DATA = null;

function loadModelBudgetConfig() {
  if (MODEL_BUDGET_CONFIG_DATA) return MODEL_BUDGET_CONFIG_DATA;
  try {
    MODEL_BUDGET_CONFIG_DATA = JSON.parse(fs.readFileSync(MODEL_BUDGET_CONFIG, "utf8"));
    const soft = MODEL_BUDGET_CONFIG_DATA.soft_caps || {};
    if (soft.paid_attempts_per_day) CHAT_USAGE_SOFT_CAP_PAID = soft.paid_attempts_per_day;
    if (soft.free_attempts_per_day) CHAT_USAGE_SOFT_CAP_FREE = soft.free_attempts_per_day;
    if (typeof MODEL_BUDGET_CONFIG_DATA.routing?.prefer_free === "boolean") {
      CHAT_FREE_FIRST = MODEL_BUDGET_CONFIG_DATA.routing.prefer_free;
    }
    const opsUsd = MODEL_BUDGET_CONFIG_DATA.pools?.ops?.daily_usd_target;
    if (typeof opsUsd === "number" && opsUsd > 0) OPENROUTER_OPS_DAILY_USD = opsUsd;
  } catch {
    MODEL_BUDGET_CONFIG_DATA = {};
  }
  return MODEL_BUDGET_CONFIG_DATA;
}

loadModelBudgetConfig();

function loadHermesModelRegistry() {
  if (HERMES_MODEL_REGISTRY_DATA) return HERMES_MODEL_REGISTRY_DATA;
  try {
    HERMES_MODEL_REGISTRY_DATA = JSON.parse(fs.readFileSync(HERMES_MODEL_REGISTRY, "utf8"));
    if (
      Array.isArray(HERMES_MODEL_REGISTRY_DATA.chat_profile_chain) &&
      HERMES_MODEL_REGISTRY_DATA.chat_profile_chain.length
    ) {
      CHAT_PROFILE_CHAIN = HERMES_MODEL_REGISTRY_DATA.chat_profile_chain.filter((p) => p !== "fast");
    }
  } catch {
    HERMES_MODEL_REGISTRY_DATA = {};
  }
  return HERMES_MODEL_REGISTRY_DATA;
}

loadHermesModelRegistry();

/** Paid ops models only — never :free (those come after daily-limit via getChatFreeFailoverChain). */
function getChatPaidModelChain(preferredProfile = "think") {
  const reg = loadHermesModelRegistry();
  const models = [];
  const add = (m) => {
    const id = String(m || "").trim();
    if (!id || id.includes(":free") || models.includes(id)) return;
    models.push(id);
  };
  const prof = VALID_PROFILES.has(preferredProfile) ? preferredProfile : "think";
  for (const m of reg.profiles?.[prof]?.chain || []) add(m);
  for (const p of CHAT_PROFILE_CHAIN) {
    for (const m of reg.profiles?.[p]?.chain || []) add(m);
  }
  for (const m of CHAT_PAID_MODEL_FALLBACK) add(m);
  return models.length ? models : [...CHAT_PAID_MODEL_FALLBACK];
}

/** Paid chain then Venice — free models are separate (daily-limit / exhaustion last resort). */
function getChatRefusalFailoverChain(preferredProfile = "think") {
  const models = [];
  const add = (m) => {
    const id = String(m || "").trim();
    if (!id || id.includes(":free") || models.includes(id)) return;
    models.push(id);
  };
  for (const m of CHAT_PAID_MODEL_FALLBACK) add(m);
  const prof = VALID_PROFILES.has(preferredProfile) ? preferredProfile : "think";
  const reg = loadHermesModelRegistry();
  for (const m of reg.profiles?.[prof]?.chain || []) add(m);
  for (const p of CHAT_PROFILE_CHAIN) {
    for (const m of reg.profiles?.[p]?.chain || []) add(m);
  }
  add(CHAT_VENICE_LAST_RESORT);
  return sortChatModelsByUsage(models.length ? models : [...CHAT_PAID_MODEL_FALLBACK, CHAT_VENICE_LAST_RESORT], false);
}

function chatUsageUtcDay() {
  return new Date().toISOString().slice(0, 10);
}

function readChatModelUsage() {
  try {
    const raw = JSON.parse(fs.readFileSync(CHAT_MODEL_USAGE_FILE, "utf8"));
    if (raw && typeof raw === "object") {
      if (raw.day !== chatUsageUtcDay()) {
        return { day: chatUsageUtcDay(), models: {} };
      }
      if (!raw.models || typeof raw.models !== "object") raw.models = {};
      return raw;
    }
  } catch {
    /* missing or corrupt */
  }
  return { day: chatUsageUtcDay(), models: {} };
}

function writeChatModelUsage(data) {
  try {
    fs.mkdirSync(path.dirname(CHAT_MODEL_USAGE_FILE), { recursive: true });
    fs.writeFileSync(CHAT_MODEL_USAGE_FILE, JSON.stringify(data, null, 2) + "\n");
  } catch (err) {
    console.warn("chat-model-usage write:", err.message || err);
  }
}

function recordChatModelUsage(modelId, outcome) {
  const id = String(modelId || "").trim();
  if (!id) return;
  const data = readChatModelUsage();
  if (!data.models[id]) {
    data.models[id] = {
      attempts: 0,
      ok: 0,
      fail: 0,
      daily_limit: 0,
      moderation: 0,
      rate_limit: 0,
      last_used: 0,
    };
  }
  const row = data.models[id];
  row.attempts = (row.attempts || 0) + 1;
  row.last_used = Date.now();
  if (outcome === "ok") row.ok = (row.ok || 0) + 1;
  else if (outcome === "daily_limit") row.daily_limit = (row.daily_limit || 0) + 1;
  else if (outcome === "moderation") row.moderation = (row.moderation || 0) + 1;
  else if (outcome === "rate_limit") row.rate_limit = (row.rate_limit || 0) + 1;
  else row.fail = (row.fail || 0) + 1;
  writeChatModelUsage(data);
  // Mirror into shared swarm budget state
  try {
    let budget = { day: chatUsageUtcDay(), models: {}, lanes: { free_ok: 0, paid_ok: 0 } };
    try {
      const raw = JSON.parse(fs.readFileSync(MODEL_BUDGET_STATE, "utf8"));
      if (raw?.day === chatUsageUtcDay()) budget = raw;
    } catch {
      /* fresh day */
    }
    budget.models = budget.models || {};
    budget.lanes = budget.lanes || { free_ok: 0, paid_ok: 0 };
    if (!budget.models[id]) {
      budget.models[id] = {
        attempts: 0,
        ok: 0,
        fail: 0,
        rate_limit: 0,
        moderation: 0,
        daily_limit: 0,
        last_used: 0,
      };
    }
    const b = budget.models[id];
    b.attempts = (b.attempts || 0) + 1;
    b.last_used = Date.now();
    if (outcome === "ok") {
      b.ok = (b.ok || 0) + 1;
      const lane = id.includes(":free") ? "free_ok" : "paid_ok";
      budget.lanes[lane] = (budget.lanes[lane] || 0) + 1;
    } else if (outcome === "rate_limit") b.rate_limit = (b.rate_limit || 0) + 1;
    else if (outcome === "moderation") b.moderation = (b.moderation || 0) + 1;
    else if (outcome === "daily_limit") b.daily_limit = (b.daily_limit || 0) + 1;
    else b.fail = (b.fail || 0) + 1;
    fs.mkdirSync(path.dirname(MODEL_BUDGET_STATE), { recursive: true });
    fs.writeFileSync(MODEL_BUDGET_STATE, JSON.stringify(budget, null, 2) + "\n");
  } catch (err) {
    console.warn("model-budget state:", err.message || err);
  }
}

/** Prefer models with fewer attempts today, then older last_used — soft cycle. */
function sortChatModelsByUsage(models, isFree) {
  const usage = readChatModelUsage();
  const softCap = isFree ? CHAT_USAGE_SOFT_CAP_FREE : CHAT_USAGE_SOFT_CAP_PAID;
  return [...models].sort((a, b) => {
    const ra = usage.models[a] || {};
    const rb = usage.models[b] || {};
    const aa = ra.attempts || 0;
    const ab = rb.attempts || 0;
    // Soft-cap penalty: push over-cap models later without hard-blocking
    const pa = aa >= softCap ? 1000 + aa : aa;
    const pb = ab >= softCap ? 1000 + ab : ab;
    if (pa !== pb) return pa - pb;
    return (ra.last_used || 0) - (rb.last_used || 0);
  });
}

/** Free :free models only — last resort after paid daily-limit / exhaustion. */
function getChatFreeFailoverChain() {
  const reg = loadHermesModelRegistry();
  const models = [];
  const add = (m) => {
    const id = String(m || "").trim();
    if (!id || !id.includes(":free") || models.includes(id)) return;
    models.push(id);
  };
  for (const m of reg.chat_free_last_resort || []) add(m);
  for (const m of reg.profiles?.fast?.chain || []) add(m);
  for (const m of CHAT_FREE_LAST_RESORT) add(m);
  return sortChatModelsByUsage(models.length ? models : [...CHAT_FREE_LAST_RESORT], true);
}

function chatModelUsageSummary() {
  const data = readChatModelUsage();
  const rows = Object.entries(data.models || {}).map(([id, row]) => ({
    id,
    attempts: row.attempts || 0,
    ok: row.ok || 0,
    fail: row.fail || 0,
    daily_limit: row.daily_limit || 0,
    moderation: row.moderation || 0,
    last_used: row.last_used || 0,
    free: id.includes(":free"),
  }));
  rows.sort((a, b) => b.attempts - a.attempts);
  return { day: data.day, models: rows.slice(0, 16) };
}

function resolveChatProfile(context, requested) {
  const req = VALID_PROFILES.has(requested) ? requested : "think";
  if (req === "fast") return "think";
  if (context?.campaign && CAMPAIGNS[context.campaign]) return "think";
  return req;
}

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

function readInboxSeeds() {
  if (!fs.existsSync(INBOX_SEEDS)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(INBOX_SEEDS, "utf8"));
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

function ensureHumanInboxMigrated() {
  fs.mkdirSync(path.dirname(HUMAN_INBOX), { recursive: true });
  if (fs.existsSync(HUMAN_INBOX)) return;
  if (!fs.existsSync(HUMAN_INBOX_LEGACY)) return;
  try {
    const data = JSON.parse(fs.readFileSync(HUMAN_INBOX_LEGACY, "utf8"));
    const hasData = (data.open || []).length > 0 || (data.answered || []).length > 0;
    if (hasData) {
      fs.writeFileSync(HUMAN_INBOX, JSON.stringify(data, null, 2) + "\n", "utf8");
    }
  } catch {
    /* legacy unreadable — start fresh in state path */
  }
}

const INBOX_CONTEXT_REQUEST =
  /need\s+more\s+context|not\s+enough\s+context|don'?t\s+understand|confused|what\s+is\s+this/i;

function inboxNormQuestion(q) {
  return String(q || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Dedupe open[] by id — keep entry with richest context (do not drop answers). */
function dedupeInboxOpen(open) {
  const byId = new Map();
  for (const q of open || []) {
    if (!q || !q.id) continue;
    const prev = byId.get(q.id);
    if (!prev) {
      byId.set(q.id, q);
      continue;
    }
    const prevCtx = String(prev.context || "").length;
    const nextCtx = String(q.context || "").length;
    byId.set(q.id, nextCtx >= prevCtx ? { ...prev, ...q } : { ...q, ...prev });
  }
  return [...byId.values()];
}

/** Re-open answered items where the human asked for more context (not a real taste decision). */
function reviveContextRequests(data) {
  const open = [...(data.open || [])];
  const kept = [];
  const seedsById = new Map(readInboxSeeds().map((s) => [s.id, s]));
  let changed = false;
  for (const q of data.answered || []) {
    const ans = String(q.answer || "");
    if (INBOX_CONTEXT_REQUEST.test(ans)) {
      const seed = seedsById.get(q.id) || {};
      const enriched = {
        ...seed,
        ...q,
        context:
          seed.context ||
          q.context ||
          "GM asked for more context — see campaigns/tropic-gooner/reports/ and option_help; answer when ready.",
        option_help: seed.option_help || q.option_help,
        options: seed.options || q.options,
        question: seed.question || q.question,
        type: seed.type || q.type,
        answer: undefined,
        answered_at: undefined,
        revived_at: new Date().toISOString(),
        from: q.from || seed.from || "seed",
      };
      delete enriched.answer;
      delete enriched.answered_at;
      const idx = open.findIndex((o) => o.id === q.id);
      if (idx >= 0) open[idx] = { ...open[idx], ...enriched, context: enriched.context };
      else open.push(enriched);
      changed = true;
      continue;
    }
    kept.push(q);
  }
  if (!changed) return data;
  const next = { open: dedupeInboxOpen(open), answered: kept };
  writeHumanInbox(next);
  return next;
}

function readHumanInboxRaw() {
  ensureHumanInboxMigrated();
  if (!fs.existsSync(HUMAN_INBOX)) return { open: [], answered: [] };
  try {
    const data = JSON.parse(fs.readFileSync(HUMAN_INBOX, "utf8"));
    return reviveContextRequests({ open: data.open || [], answered: data.answered || [] });
  } catch {
    return { open: [], answered: [] };
  }
}

function readHumanInbox() {
  return mergeInboxSeeds(readHumanInboxRaw());
}

/** Ponytail: seeds are read-only canon questions — show until answered by id (or same question text). */
function mergeInboxSeeds(data) {
  const answeredIds = new Set((data.answered || []).map((q) => q.id).filter(Boolean));
  const answeredQuestions = new Set(
    (data.answered || []).map((q) => inboxNormQuestion(q.question)).filter(Boolean)
  );
  const merged = {
    open: dedupeInboxOpen(data.open || []),
    answered: data.answered || [],
  };
  // Drop ad-hoc open copies of already-answered seed topics (id drift / pod re-ask).
  merged.open = merged.open.filter((q) => {
    if (q.id && answeredIds.has(q.id)) return false;
    const nq = inboxNormQuestion(q.question);
    if (nq && answeredQuestions.has(nq)) return false;
    return true;
  });
  for (const seed of readInboxSeeds()) {
    if (!seed.id || answeredIds.has(seed.id)) continue;
    if (answeredQuestions.has(inboxNormQuestion(seed.question))) continue;
    const idx = merged.open.findIndex((q) => q.id === seed.id);
    if (idx >= 0) {
      const existing = merged.open[idx];
      merged.open[idx] = {
        ...seed,
        ...existing,
        // Prefer seed context when present — potato stubs often had empty context.
        context: seed.context || existing.context,
        option_help: seed.option_help || existing.option_help,
        options: seed.options || existing.options,
        question: seed.question || existing.question,
        type: seed.type || existing.type,
        at: existing.at || seed.at || seed.created_at || new Date().toISOString(),
        from: existing.from || seed.from || "seed",
        seeded: true,
      };
      continue;
    }
    // Skip merging a seed if an open ad-hoc item already asks the same question.
    const dupQ = merged.open.findIndex(
      (q) => inboxNormQuestion(q.question) === inboxNormQuestion(seed.question)
    );
    if (dupQ >= 0) {
      const existing = merged.open[dupQ];
      merged.open[dupQ] = {
        ...seed,
        ...existing,
        id: seed.id,
        context: seed.context || existing.context,
        option_help: seed.option_help || existing.option_help,
        options: seed.options || existing.options,
        seeded: true,
      };
      continue;
    }
    merged.open.push({
      ...seed,
      at: seed.at || seed.created_at || new Date().toISOString(),
      from: seed.from || "seed",
      seeded: true,
    });
  }
  merged.open = dedupeInboxOpen(merged.open);
  return merged;
}

function writeHumanInbox(data) {
  fs.mkdirSync(path.dirname(HUMAN_INBOX), { recursive: true });
  fs.writeFileSync(HUMAN_INBOX, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function replyHumanInbox(id, answer) {
  const clean = String(answer || "").replace(/\s+/g, " ").trim().slice(0, 4000);
  if (!clean) throw new Error("empty_answer");
  const raw = readHumanInboxRaw();
  const merged = mergeInboxSeeds(raw);
  const idx = merged.open.findIndex((q) => q.id === id);
  if (idx < 0) throw new Error("question_not_found");
  const item = { ...merged.open[idx] };
  if (item.type === "choice" && Array.isArray(item.options)) {
    const ok =
      item.options.includes(clean) ||
      (item.allow_other && (clean === "Other" || clean.startsWith("Other:")));
    if (!ok) throw new Error("invalid_choice");
  }
  item.answer = clean;
  item.answered_at = new Date().toISOString();
  raw.open = raw.open.filter((q) => q.id !== id);
  raw.answered.unshift(item);
  raw.answered = raw.answered.slice(0, 50);
  writeHumanInbox(raw);
  return { ok: true, id, answer: clean };
}

function readLaneHeartbeat(filename) {
  const stamp = path.join(REPO, "agents", "state", filename);
  if (!fs.existsSync(stamp)) return null;
  return fs.readFileSync(stamp, "utf8").trim() || null;
}

async function collectFastCrontabStatus() {
  try {
    const { stdout } = await execFileAsync("bash", ["-lc", "crontab -l 2>/dev/null | grep -c agent-cycle-fast-tick || echo 0"], {
      timeout: 5000,
      maxBuffer: 4096,
    });
    const active = parseInt(stdout.trim(), 10) >= 2;
    return { active, lastRun: readLaneHeartbeat("fast-tick.last") };
  } catch {
    return { active: false, lastRun: null };
  }
}

async function collectThinkCrontabStatus() {
  try {
    const { stdout } = await execFileAsync("bash", ["-lc", "crontab -l 2>/dev/null | grep -c agent-cycle-think-tick || echo 0"], {
      timeout: 5000,
      maxBuffer: 4096,
    });
    const active = parseInt(stdout.trim(), 10) >= 1;
    return { active, lastRun: readLaneHeartbeat("think-tick.last") };
  } catch {
    return { active: false, lastRun: null };
  }
}
async function collectHealth() {
  try {
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
  } catch (err) {
    // Never throw: background refresh + Hub poll must not take down :8790 (CF 502).
    return {
      gateway: "unknown",
      health_error: String((err && err.message) || "health_failed").slice(0, 200),
    };
  }
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

function readPodSchedulerLaneHints() {
  // Cheap file read — used when Hermes cron list is skipped (lite) or empty.
  const p = path.join(REPO, "agents", "state", "pod-scheduler.json");
  if (!fs.existsSync(p)) return {};
  try {
    const state = JSON.parse(fs.readFileSync(p, "utf8"));
    const last = state.last_run || {};
    const out = {};
    if (last.fast) {
      out.fast = new Date(Number(last.fast) * 1000).toISOString();
    }
    if (last.think) {
      out.think = new Date(Number(last.think) * 1000).toISOString();
    }
    return out;
  } catch {
    return {};
  }
}

function countUncheckedMd(relPath) {
  const p = path.join(REPO, relPath);
  if (!fs.existsSync(p)) return 0;
  try {
    return fs
      .readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => /^- \[ \]/.test(l)).length;
  } catch {
    return 0;
  }
}

/** Recent pod/lane ticks from run-index (newest first). */
function readRecentPodRuns(limit = 8) {
  const runIndex = path.join(REPO, "agents", "state", "run-index.jsonl");
  if (!fs.existsSync(runIndex)) return [];
  try {
    const lines = fs.readFileSync(runIndex, "utf8").trim().split("\n").filter(Boolean).slice(-limit);
    const out = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const j = JSON.parse(lines[i]);
        const name = j.name || j.pod || j.lane || "?";
        const summary = String(j.summary || "").slice(0, 140);
        const idle = /\bIDLE\b/i.test(summary);
        out.push({
          name: String(name).slice(0, 48),
          category: j.category || "",
          ts: j.ts || null,
          exit: j.exit ?? null,
          summary,
          idle,
        });
      } catch {
        /* skip bad line */
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Chat job UI status: pending+started = thinking; queued = waiting. */
function chatJobUiStatus(job) {
  if (!job || typeof job !== "object") return null;
  if (job.status === "queued") return "queued";
  if (job.status === "running") return "thinking";
  if (job.status === "pending") return job.started_at ? "thinking" : "queued";
  return null;
}

function iterChatJobsRaw() {
  const out = [];
  try {
    if (typeof CHAT_JOBS !== "undefined" && CHAT_JOBS && typeof CHAT_JOBS.values === "function") {
      for (const job of CHAT_JOBS.values()) out.push(job);
      return out;
    }
  } catch {
    /* fall through to file */
  }
  try {
    const jobsFile = path.join(REPO, "agents", "state", "chat-jobs.json");
    if (fs.existsSync(jobsFile)) {
      const data = JSON.parse(fs.readFileSync(jobsFile, "utf8"));
      for (const job of Object.values(data.jobs || {})) {
        if (job && typeof job === "object") out.push(job);
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

function threadTitleForJob(threadId) {
  if (!threadId) return null;
  try {
    const idx = readChatThreadsIndex();
    const meta = (idx.threads || []).find((t) => t.id === threadId);
    if (meta?.title) return String(meta.title).slice(0, 80);
  } catch {
    /* index may not exist yet at boot */
  }
  return null;
}

function listChatJobsInFlight() {
  const now = Date.now();
  const jobs = [];
  let thinking = 0;
  let queued = 0;
  for (const job of iterChatJobsRaw()) {
    const ui = chatJobUiStatus(job);
    if (!ui) continue;
    if (ui === "thinking") thinking += 1;
    else queued += 1;
    const started = job.started_at || job.created_at || now;
    jobs.push({
      job_id: job.job_id || null,
      thread_id: job.thread_id || null,
      title: threadTitleForJob(job.thread_id) || (job.thread_id ? `thread ${String(job.thread_id).slice(0, 8)}` : "Chat"),
      status: ui,
      started_at: started,
      elapsed_ms: Math.max(0, now - (Number(started) || 0)),
      queue_depth: job.queue_depth || 0,
    });
  }
  jobs.sort((a, b) => {
    if (a.status !== b.status) return a.status === "thinking" ? -1 : 1;
    return (b.started_at || 0) - (a.started_at || 0);
  });
  return {
    running: thinking,
    pending: queued,
    thinking,
    queued,
    jobs: jobs.slice(0, 8),
  };
}

function countChatJobsInFlight() {
  const d = listChatJobsInFlight();
  return { running: d.running, pending: d.pending };
}

/** Pod mid-tick from scheduler state.current (written while flock held). */
function readCurrentPodRun() {
  const p = path.join(REPO, "agents", "state", "pod-scheduler.json");
  if (!fs.existsSync(p)) return null;
  try {
    const state = JSON.parse(fs.readFileSync(p, "utf8"));
    const cur = state.current;
    if (!cur || typeof cur !== "object" || !cur.name) return null;
    const startedSec = Number(cur.started_at);
    if (!Number.isFinite(startedSec) || startedSec <= 0) return null;
    // Stale guard: pods timeout at 600s; drop if older than 12m
    const ageSec = Date.now() / 1000 - startedSec;
    if (ageSec < 0 || ageSec > 720) return null;
    return {
      name: String(cur.name).slice(0, 48),
      started_at: new Date(startedSec * 1000).toISOString(),
      elapsed_ms: Math.round(ageSec * 1000),
      kind: cur.name === "fast" || cur.name === "think" ? "tick" : "pod",
    };
  } catch {
    return null;
  }
}

function buildRunningNow() {
  const chat = listChatJobsInFlight();
  const pod = readCurrentPodRun();
  return {
    chat_jobs: chat.jobs,
    chat_thinking: chat.thinking,
    chat_queued: chat.queued,
    pod,
    anything: chat.jobs.length > 0 || !!pod,
  };
}

/** Optional out-links (Grafana off-box; Kuma already on :13001). */
function readObservabilityLinks() {
  const kuma =
    envVal("OBSERVABILITY_KUMA_URL") ||
    envVal("UPTIME_KUMA_URL") ||
    "http://raspbian-bullseye-aml-s905x-cc:13001";
  const grafana = envVal("OBSERVABILITY_GRAFANA_URL") || envVal("GRAFANA_URL") || "";
  return {
    kuma_url: kuma || null,
    grafana_url: grafana || null,
    metrics_path: "/metrics",
  };
}

function promEscapeLabel(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
}

function hermesGatewayUp() {
  try {
    const out = execFileSync("systemctl", ["--user", "is-active", "hermes-gateway"], {
      encoding: "utf8",
      timeout: 3000,
    }).trim();
    if (out !== "active") return 0;
    // Mirror nousagent-health hung check (cheap): D-state MainPID.
    const pid = execFileSync("systemctl", ["--user", "show", "-p", "MainPID", "--value", "hermes-gateway"], {
      encoding: "utf8",
      timeout: 2000,
    }).trim();
    if (pid && pid !== "0") {
      try {
        const st = execFileSync("ps", ["-o", "state=", "-p", pid], {
          encoding: "utf8",
          timeout: 2000,
        }).trim();
        if (st.startsWith("D")) return 0;
      } catch {
        /* ignore */
      }
    }
    return 1;
  } catch {
    return 0;
  }
}

/**
 * Cheap Prometheus text for off-box Grafana (or curl).
 * File reads + one systemctl — no Hermes cron list, no collectHealth.
 */
function buildPrometheusMetrics() {
  const lines = [];
  const jobs = countChatJobsInFlight();
  const mem = readMemQuick();
  const hints = readPodSchedulerLaneHints();
  const pods = readRecentPodRuns(8);
  const runningNow = buildRunningNow();
  const openTasks = (readUserTasksStore().tasks || []).filter(
    (t) => t.status === "open" || t.status === "in_progress"
  ).length;
  const maint = countUncheckedMd("agents/maintenance-progress.md");
  let backlog = 0;
  if (fs.existsSync(DASHBOARD_BACKLOG)) {
    try {
      backlog = fs
        .readFileSync(DASHBOARD_BACKLOG, "utf8")
        .split("\n")
        .filter((l) => /^- \[ \]/.test(l)).length;
    } catch {
      backlog = 0;
    }
  }

  const emit = (name, help, type, value, labels) => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);
    const lab =
      labels && Object.keys(labels).length
        ? `{${Object.entries(labels)
            .map(([k, v]) => `${k}="${promEscapeLabel(v)}"`)
            .join(",")}}`
        : "";
    lines.push(`${name}${lab} ${value}`);
  };

  emit("linuxbox_up", "linuxbox-status process is up", "gauge", 1);
  emit("linuxbox_hermes_gateway_up", "hermes-gateway user unit active", "gauge", hermesGatewayUp());
  emit("linuxbox_chat_jobs_running", "Dashboard chat jobs thinking/running", "gauge", jobs.running || 0);
  emit("linuxbox_chat_jobs_pending", "Dashboard chat jobs queued/pending", "gauge", jobs.pending || 0);
  emit(
    "linuxbox_pod_tick_in_flight",
    "Pod scheduler currently holding a tick (1=yes)",
    "gauge",
    runningNow.pod ? 1 : 0
  );
  emit("linuxbox_user_tasks_open", "Open or in_progress user tasks", "gauge", openTasks);
  emit("linuxbox_dashboard_backlog_open", "Unchecked Meta backlog items", "gauge", backlog);
  emit("linuxbox_maintenance_open", "Unchecked maintenance-progress items", "gauge", maint);
  emit("linuxbox_mem_available_mb", "MemAvailable from /proc/meminfo", "gauge", Math.round(mem.avail_mb || 0));
  emit("linuxbox_swap_used_pct", "Swap used percent", "gauge", Math.round(mem.swap_used_pct || 0));

  for (const [lane, iso] of Object.entries(hints)) {
    const ts = iso ? Math.floor(new Date(iso).getTime() / 1000) : 0;
    if (ts > 0) {
      emit("linuxbox_lane_last_run_unixtime", "Last pod-scheduler stamp for lane", "gauge", ts, {
        lane,
      });
    }
  }

  let idlePods = 0;
  let workPods = 0;
  for (const p of pods) {
    if (p.idle) idlePods += 1;
    else workPods += 1;
  }
  emit("linuxbox_recent_pod_ticks_idle", "Recent run-index ticks marked IDLE", "gauge", idlePods);
  emit("linuxbox_recent_pod_ticks_work", "Recent run-index ticks with work", "gauge", workPods);

  for (const p of pods.slice(0, 8)) {
    if (!p.ts) continue;
    const ts = Math.floor(new Date(p.ts).getTime() / 1000);
    if (!(ts > 0)) continue;
    emit("linuxbox_pod_last_tick_unixtime", "Recent pod tick timestamp", "gauge", ts, {
      pod: p.name,
      idle: p.idle ? "1" : "0",
    });
  }

  return lines.join("\n") + "\n";
}

async function collectAgentState(lite = false) {
  // lite skips only expensive `hermes cron list` — heartbeats + crontab grep stay
  // (swap pressure was blanking lanes → Hub "no recent run" despite ticks).
  const [health, cronRaw, fastCrontab, thinkCrontab] = await Promise.all([
    collectHealth(),
    lite ? Promise.resolve("") : collectCronSummary(),
    collectFastCrontabStatus(),
    collectThinkCrontabStatus(),
  ]);
  const lanes = parseLaneCrons(cronRaw);
  const podHints = readPodSchedulerLaneHints();
  const fastLast =
    fastCrontab.lastRun || lanes["agent-cycle-fast"]?.last_run || podHints.fast || null;
  const thinkLast =
    thinkCrontab.lastRun || lanes["agent-cycle-think"]?.last_run || podHints.think || null;
  if (fastCrontab.active || fastLast) {
    lanes["agent-cycle-fast"] = {
      name: "agent-cycle-fast",
      schedule: fastCrontab.active ? "~30s (crontab)" : lanes["agent-cycle-fast"]?.schedule || "~30s",
      last_run: fastLast,
      status: fastCrontab.active ? "active" : lanes["agent-cycle-fast"]?.status || "pending",
    };
  }
  if (thinkCrontab.active || thinkLast) {
    lanes["agent-cycle-think"] = {
      name: "agent-cycle-think",
      schedule: thinkCrontab.active
        ? "1m (crontab)"
        : lanes["agent-cycle-think"]?.schedule || "1m",
      last_run: thinkLast,
      status: thinkCrontab.active ? "active" : lanes["agent-cycle-think"]?.status || "pending",
    };
  } else if (lanes["agent-cycle-think"]) {
    lanes["agent-cycle-think"].schedule = lanes["agent-cycle-think"].schedule || "1m (hermes)";
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

  const chatJobs = listChatJobsInFlight();
  const recentPods = readRecentPodRuns(8);
  const maintenanceOpen = countUncheckedMd("agents/maintenance-progress.md");
  const runningNow = buildRunningNow();

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
    machines_sync: await collectMachinesState(),
    // Tasks tab "Active now" / Running now — cheap reads
    chat_jobs: {
      running: chatJobs.running,
      pending: chatJobs.pending,
      thinking: chatJobs.thinking,
      queued: chatJobs.queued,
      jobs: chatJobs.jobs,
    },
    recent_pods: recentPods,
    maintenance_open: maintenanceOpen,
    running_now: runningNow,
    current_pod: runningNow.pod,
    observability: readObservabilityLinks(),
    chat_model_usage: chatModelUsageSummary(),
    model_budget: {
      policy: CHAT_FREE_FIRST ? "free_first" : "paid_first",
      ops_daily_usd_target: OPENROUTER_OPS_DAILY_USD,
      config: "agents/model-budget/config.json",
    },
  };
}

// ponytail: cache agent snapshot — collectAgentState was ~30s on 2GB box under load
let agentStateCache = null;
let agentStateCacheAt = 0;
let agentRefreshInFlight = false;
const AGENT_STATE_TTL_MS = 45_000;
const AGENT_STATE_STALE_MS = 180_000;

function readMemQuick() {
  try {
    const raw = fs.readFileSync("/proc/meminfo", "utf8");
    let availKb = 0;
    let swapTotal = 0;
    let swapFree = 0;
    for (const line of raw.split("\n")) {
      if (line.startsWith("MemAvailable:")) availKb = parseInt(line.split(/\s+/)[1], 10) || 0;
      if (line.startsWith("SwapTotal:")) swapTotal = parseInt(line.split(/\s+/)[1], 10) || 0;
      if (line.startsWith("SwapFree:")) swapFree = parseInt(line.split(/\s+/)[1], 10) || 0;
    }
    const swapPct = swapTotal ? 100 * (1 - swapFree / swapTotal) : 0;
    return { avail_mb: availKb / 1024, swap_used_pct: swapPct };
  } catch {
    return { avail_mb: 999, swap_used_pct: 0 };
  }
}

function shouldUseLiteAgentCollect() {
  return readMemQuick().swap_used_pct >= 35;
}

async function refreshAgentStateBackground(lite = false) {
  if (agentRefreshInFlight) return;
  agentRefreshInFlight = true;
  try {
    agentStateCache = await collectAgentState(lite);
    agentStateCacheAt = Date.now();
  } catch (err) {
    console.error("agent state refresh failed:", (err && err.message) || err);
  } finally {
    agentRefreshInFlight = false;
  }
}

async function collectAgentStateCached(opts = {}) {
  const lite = opts.lite ?? shouldUseLiteAgentCollect();
  const now = Date.now();
  if (agentStateCache && now - agentStateCacheAt < AGENT_STATE_TTL_MS) {
    return { ...agentStateCache, updated_at: new Date().toISOString(), cached: true };
  }
  if (agentStateCache && now - agentStateCacheAt < AGENT_STATE_STALE_MS) {
    refreshAgentStateBackground(lite);
    return { ...agentStateCache, updated_at: new Date().toISOString(), stale: true };
  }
  await refreshAgentStateBackground(lite);
  return agentStateCache;
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

function readMazdaParts() {
  if (!fs.existsSync(MAZDA_PARTS_FILE)) {
    return { project: "mazda3-sports-build", parts: [], error: "parts.json missing" };
  }
  try {
    return JSON.parse(fs.readFileSync(MAZDA_PARTS_FILE, "utf8"));
  } catch (err) {
    return { project: "mazda3-sports-build", parts: [], error: err.message };
  }
}

function readCampaignMap(campaignId) {
  const cfg = CAMPAIGNS[campaignId];
  if (!cfg) return { error: "unknown_campaign" };
  const mapFile = path.join(REPO, "campaigns", campaignId, "map", "map.json");
  if (!fs.existsSync(mapFile)) return { campaign: campaignId, markers: [], error: "map.json missing" };
  try {
    const data = JSON.parse(fs.readFileSync(mapFile, "utf8"));
    const rel = data.base_image;
    if (rel && !rel.includes("..")) {
      const abs = path.join(REPO, "campaigns", campaignId, rel);
      data.base_image_exists = fs.existsSync(abs);
      data.base_image_url = data.base_image_exists
        ? `/api/campaigns/${campaignId}/map-image`
        : null;
    }
    return data;
  } catch (err) {
    return { campaign: campaignId, markers: [], error: err.message };
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
      chat_thread_id: null,
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
  const threadId = String(payload.context?.chat_thread_id || "").trim();
  if (threadId && readChatThread(threadId)) {
    task.context.chat_thread_id = threadId;
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
  const registries = {};
  for (const [id, cfg] of Object.entries(CAMPAIGNS)) {
    const files = [];
    for (const sub of cfg.storyDirs || ["story"]) {
      walkStoryMarkdown(path.join(REPO, "campaigns", id, sub), `campaigns/${id}/${sub}`, files);
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    const groups = groupStoryFiles(files, id);
    campaigns[id] = { label: cfg.label, files, groups };
    if (cfg.charactersRegistry) {
      registries[id] = readCharactersRegistry(id);
    }
  }
  return { updated_at: new Date().toISOString(), campaigns, registries, tags: USER_TASK_TAGS };
}

function groupStoryFiles(files, campaignId) {
  const prefix = `campaigns/${campaignId}/`;
  const buckets = new Map();
  for (const f of files) {
    const rel = f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path;
    const parts = rel.split("/");
    const top = parts.length > 1 ? parts[0] : "(root)";
    const sub = parts.length > 2 ? parts.slice(0, 2).join("/") : top;
    const key = sub;
    if (!buckets.has(key)) {
      buckets.set(key, { id: key, label: humanGroupLabel(key), files: [] });
    }
    buckets.get(key).files.push(f);
  }
  return [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function humanGroupLabel(key) {
  const labels = {
    characters: "Characters",
    "characters/discord": "Discord · character sheets",
    places: "Places",
    Organizations: "Organizations",
    "Plot Lines": "Plot & timeline",
    "Things and Places of Note": "Lore & regions",
    story: "Story",
    lore: "Lore",
    "(root)": "Other",
  };
  return labels[key] || key.replace(/\//g, " · ");
}

function charactersRegistryPath(campaignId) {
  const cfg = CAMPAIGNS[campaignId];
  if (!cfg?.charactersRegistry) return null;
  return path.join(REPO, cfg.charactersRegistry);
}

function readCharactersRegistry(campaignId) {
  const abs = charactersRegistryPath(campaignId);
  if (!abs || !fs.existsSync(abs)) {
    return { version: 1, campaign_id: campaignId, characters: [], updated_at: null };
  }
  try {
    const data = JSON.parse(fs.readFileSync(abs, "utf8"));
    data.characters = Array.isArray(data.characters) ? data.characters : [];
    return data;
  } catch {
    return { version: 1, campaign_id: campaignId, characters: [], updated_at: null, error: "parse_failed" };
  }
}

function writeCharactersRegistry(campaignId, data) {
  const abs = charactersRegistryPath(campaignId);
  if (!abs) throw new Error("no_registry");
  data.updated_at = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(abs, JSON.stringify(data, null, 2) + "\n");
  return data;
}

function findRegistryForPath(registry, relPath) {
  const chars = registry?.characters || [];
  return chars.find((c) => c.story_path === relPath) || null;
}

function patchCharacterRegistry(campaignId, patch) {
  const registry = readCharactersRegistry(campaignId);
  const id = patch.id;
  if (!id) throw new Error("id_required");
  let row = registry.characters.find((c) => c.id === id);
  if (!row && patch.story_path) {
    row = registry.characters.find((c) => c.story_path === patch.story_path);
  }
  if (!row) {
    row = {
      id,
      display_name: patch.display_name || id,
      story_path: patch.story_path || "",
      discord_user_id: "",
      discord_username: "",
      player_name: "",
      status: "active",
      can_proxy: false,
      notes: "",
    };
    registry.characters.push(row);
  }
  const allowed = [
    "display_name",
    "story_path",
    "discord_user_id",
    "discord_username",
    "player_name",
    "status",
    "can_proxy",
    "notes",
  ];
  for (const k of allowed) {
    if (patch[k] !== undefined) row[k] = patch[k];
  }
  return writeCharactersRegistry(campaignId, registry);
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

function listRecentCampaignNotes(campaignId, max = 3) {
  const notesDir = path.join(REPO, "campaigns", campaignId, "notes");
  if (!fs.existsSync(notesDir)) return [];
  try {
    return fs
      .readdirSync(notesDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const abs = path.join(notesDir, f);
        return { rel: `campaigns/${campaignId}/notes/${f}`, mtime: fs.statSync(abs).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, max)
      .map((x) => x.rel);
  } catch {
    return [];
  }
}

function buildCampaignContextExcerpt(campaignId, maxChars = 8000) {
  const cfg = CAMPAIGNS[campaignId];
  if (!cfg) return "";
  const paths = [
    ...(CAMPAIGN_CHAT_CANON_FILES[campaignId] || []),
    cfg.progress,
    ...listRecentCampaignNotes(campaignId, 3),
  ].filter(Boolean);
  const seen = new Set();
  const sections = [];
  let budget = maxChars;
  for (const rel of paths) {
    if (seen.has(rel) || budget < 400) break;
    seen.add(rel);
    const abs = path.join(REPO, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const content = fs.readFileSync(abs, "utf8").trim();
      if (!content) continue;
      const slice = Math.min(2800, budget - 80);
      if (slice < 80) break;
      const excerpt = content.slice(0, slice);
      sections.push(`### ${path.basename(rel)}\n${excerpt}`);
      budget -= excerpt.length + 60;
    } catch {
      /* skip unreadable */
    }
  }
  if (!sections.length) return "";
  return `[Campaign canon — ${cfg.label}]\n${sections.join("\n\n")}`.slice(0, maxChars);
}

function isModelModerationRefusal(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 500) return false;
  const patterns = [
    /无法给出|无法给到|无法绘制|无法提供|不能提供|我无法|抱歉.*无法/i,
    /\bI(?:'m| am) sorry,? I can(?:'t| not)\b/i,
    /\bcannot provide (?:relevant )?content\b/i,
    /\bI can'?t (?:help|assist|provide|fulfill)\b/i,
    /\bcontent (?:policy|filter|moderation)\b/i,
    /\bas an ai\b.*\b(cannot|can't|unable)\b/i,
  ];
  return patterns.some((re) => re.test(t)) && t.length < 320;
}

const CAMPAIGN_CHAT_MODEL = "nousresearch/hermes-4-70b";
const MODERATION_REFUSAL_USER_MSG =
  "All paid models refused (content filter). Try Workshop mode or rephrase — dashboard chat already retried Hermes → GLM → DeepSeek.";

function formatAllModelsRefusedError(triedModels) {
  const list = (triedModels || []).join(", ") || "none";
  return `All models refused (content filter). Tried: ${list}. Try Workshop mode or shorten explicit phrasing.`;
}

function isCampaignChatContext(context) {
  return !!(context?.campaign && CAMPAIGNS[context.campaign]);
}

function isQwenFallbackInRaw(raw) {
  const s = String(raw || "");
  return (
    /switching to fallback:.*(?:qwen|hy3)/i.test(s) ||
    /qwen\/qwen3-next-80b-a3b-instruct:free/i.test(s) ||
    /tencent\/hy3:free/i.test(s) ||
    (/Primary model failed/i.test(s) && /(?:qwen|hy3:free)/i.test(s))
  );
}

function isIntentOnlyChatReply(text) {
  const t = String(text || "").trim();
  if (!t || t.length >= 200) return false;
  if (isModelModerationRefusal(t)) return false;
  const intentRe =
    /\blet me (read|check|write|look|see|pull|open|fetch|grab|verify|confirm|build|save)\b/i;
  const futureRe =
    /\bi(?:'ll| will) (read|check|write|look|see|pull|open|fetch|grab|verify|confirm|save)\b/i;
  const hasIntent =
    intentRe.test(t) ||
    futureRe.test(t) ||
    /^(one moment|give me a (?:second|moment)|hang on)\b/i.test(t);
  if (!hasIntent) return false;
  const hasSubstance =
    (t.match(/\n/g) || []).length >= 2 ||
    /^[-*•]\s/m.test(t) ||
    /^#{1,3}\s/m.test(t) ||
    t.split(/[.!?]\s+/).filter(Boolean).length >= 4;
  return !hasSubstance;
}

function buildChatStylePreamble(responseMode, context) {
  const brief = responseMode !== "workshop";
  const lines = [CHAT_RUNTIME_GUARDRAIL, ""];
  const boundCamp = campaignDisplayLabel(context);
  if (boundCamp) {
    lines.push(
      `[BOUND CAMPAIGN — settled]`,
      `This chat is already locked to ${boundCamp}.`,
      `Never ask "which campaign" / "where does this live" / list Tropic Gooner, Hunter, SpaceQuest, or NYC Mafia as choices.`,
      `Ask only about missing lore details inside this campaign.`,
      ""
    );
  }
  const styleLines = brief
    ? [
        "[Response style — Brief]",
        "Be concise: short paragraphs or bullets; no essays unless the user asks for depth.",
        boundCamp
          ? "If a lore detail is missing, ask about that detail — never ask which campaign this thread belongs to (already bound above)."
          : "If the request is ambiguous, vague, or would require inventing canon, ask 1–2 specific clarifying questions before proposing lore or tasks.",
        "For RP/worldbuilding: think in rise/fall phases with nuance — not fill-in templates.",
        "The human is GM (creative authority); you are scribe/implementer — capture, brainstorm, note gaps; do not act as GM.",
      ]
    : [
        "[Response style — Workshop]",
        "Longer form is OK when it helps — still prefer structure (sections/bullets) over walls of text.",
        boundCamp
          ? "When facts are missing, ask about those facts — never ask which campaign (already bound above)."
          : "When facts are missing or the ask is ambiguous, ask 1–2 targeted clarifying questions before inventing canon.",
        "For RP/worldbuilding: rise/fall phases with nuance; the human is GM, you are scribe/implementer.",
      ];
  lines.push(...styleLines);
  if (context?.workshop_mode && brief) {
    lines.push(
      "Context is a campaign/story workshop — default to brief scribe notes unless the user asks to expand."
    );
  }
  return lines.join("\n");
}

/** Cheap read-only snapshot for chat prompts — no secrets, capped size. */
function buildChatSystemStatusBlock(context = null) {
  const lines = ["[System / running tasks — injected, read-only]"];
  try {
    try {
      const out = execFileSync("systemctl", ["--user", "is-active", "hermes-gateway"], {
        timeout: 2000,
        encoding: "utf8",
      })
        .trim()
        .slice(0, 40);
      lines.push(`hermes-gateway: ${out || "unknown"}`);
    } catch {
      lines.push("hermes-gateway: unknown");
    }

    const fastLast = readLaneHeartbeat("fast-tick.last");
    const thinkLast = readLaneHeartbeat("think-tick.last");
    lines.push(`fast last tick: ${fastLast || "n/a"}`);
    lines.push(`think last tick: ${thinkLast || "n/a"}`);

    const inbox = readHumanInbox();
    lines.push(`inbox open: ${(inbox.open || []).length}`);

    const store = readUserTasksStore();
    const openTasks = (store.tasks || []).filter((t) => t.status === "open");
    lines.push(`user-tasks open: ${openTasks.length}`);
    for (const t of openTasks.slice(0, 5)) {
      lines.push(`  - ${(t.title || t.id || "?").toString().slice(0, 80)}`);
    }

    let backlogOpen = 0;
    if (fs.existsSync(DASHBOARD_BACKLOG)) {
      backlogOpen = fs
        .readFileSync(DASHBOARD_BACKLOG, "utf8")
        .split("\n")
        .filter((l) => /^- \[ \]/.test(l)).length;
    }
    lines.push(`dashboard backlog open: ${backlogOpen}`);

    const taskPath = path.join(REPO, "agents", "CURRENT_TASK.md");
    if (fs.existsSync(taskPath)) {
      const raw = fs.readFileSync(taskPath, "utf8");
      const m = raw.match(/\*\*Status:\*\*\s*(.+)/);
      if (m) lines.push(`CURRENT_TASK: ${m[1].trim().slice(0, 160)}`);
    }

    let pending = 0;
    let running = 0;
    const jobsFile = path.join(REPO, "agents", "state", "chat-jobs.json");
    try {
      if (typeof CHAT_JOBS !== "undefined" && CHAT_JOBS && typeof CHAT_JOBS.values === "function") {
        for (const job of CHAT_JOBS.values()) {
          if (job.status === "pending" || job.status === "queued") pending += 1;
          if (job.status === "running") running += 1;
        }
      } else if (fs.existsSync(jobsFile)) {
        const data = JSON.parse(fs.readFileSync(jobsFile, "utf8"));
        for (const job of Object.values(data.jobs || {})) {
          if (job.status === "pending" || job.status === "queued") pending += 1;
          if (job.status === "running") running += 1;
        }
      }
    } catch {
      /* ignore */
    }
    lines.push(`chat jobs: running=${running} queued/pending=${pending}`);

    const runIndex = path.join(REPO, "agents", "state", "run-index.jsonl");
    if (fs.existsSync(runIndex)) {
      const tail = fs.readFileSync(runIndex, "utf8").trim().split("\n").slice(-6);
      const pods = [];
      for (const row of tail) {
        try {
          const j = JSON.parse(row);
          const name = j.pod || j.name || j.lane || "?";
          const st = j.status || j.result || j.exit || "";
          pods.push(`${name}${st ? `:${st}` : ""}`.slice(0, 40));
        } catch {
          /* skip */
        }
      }
      if (pods.length) lines.push(`recent pods: ${pods.join(", ")}`);
    }

    // When a thread is bound to a campaign, only report that campaign's queue —
    // listing every campaign invites the model to ask "which campaign?".
    const campIds =
      context?.campaign && CAMPAIGNS[context.campaign]
        ? [context.campaign]
        : Object.keys(CAMPAIGNS);
    for (const id of campIds) {
      const cfg = CAMPAIGNS[id];
      if (!cfg) continue;
      const progPath = path.join(REPO, cfg.progress);
      if (!fs.existsSync(progPath)) continue;
      const progress = parseProgress(fs.readFileSync(progPath, "utf8"));
      const pendingItems = progress.filter((p) => !p.done).length;
      if (pendingItems > 0) {
        const label =
          context?.campaign === id
            ? `bound campaign queue (${CHAT_CAMPAIGN_LABELS[id] || id})`
            : `campaign ${id}`;
        lines.push(`${label}: ${pendingItems} open`);
      }
    }

    const podSched = path.join(REPO, "agents", "state", "pod-scheduler.json");
    if (fs.existsSync(podSched)) {
      try {
        const st = JSON.parse(fs.readFileSync(podSched, "utf8"));
        const last = st.last_run || {};
        const names = Object.keys(last).slice(0, 8);
        if (names.length) {
          lines.push(
            `pod last_run: ${names
              .map((n) => `${n}=${String(last[n]).slice(0, 19)}`)
              .join(", ")}`
          );
        }
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    lines.push(`(status snapshot error: ${(err && err.message) || "unknown"})`);
  }
  return lines.join("\n").slice(0, CHAT_STATUS_MAX_CHARS);
}

function formatChatHistory(history) {
  if (!Array.isArray(history) || !history.length) return "";
  const lines = history
    .slice(-10)
    .map((t) => {
      if (!t || typeof t !== "object") return null;
      const text = String(t.text || "").trim().slice(0, 1500);
      if (!text) return null;
      const who = t.role === "user" ? "Human" : "Assistant";
      return `${who}: ${text}`;
    })
    .filter(Boolean);
  if (!lines.length) return "";
  return `[Conversation so far]\n${lines.join("\n\n")}`;
}

function buildChatMessage(message, context, options = {}) {
  const clean = message.trim().slice(0, 2000);
  if (!clean) throw new Error("empty_message");
  const responseMode = options.responseMode === "workshop" ? "workshop" : "brief";
  const blocks = [buildChatStylePreamble(responseMode, context)];
  const statusBlock = buildChatSystemStatusBlock(context);
  if (statusBlock) blocks.push(statusBlock);
  const hist = formatChatHistory(options.history);
  if (hist) blocks.push(hist);

  if (!context || typeof context !== "object") {
    return `${blocks.join("\n\n---\n\n")}\n\n---\n\nUser message:\n${clean}`;
  }

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
  if (context.project_id === "mazda3-sports-build") {
    const m = readMazdaParts();
    if (Array.isArray(m.parts) && m.parts.length) {
      const lines = m.parts.map((p) => {
        const price = p.current_price == null ? "—" : `$${p.current_price}`;
        return `- ${p.name} | ${p.vendor || "—"} | ${p.tier || ""} | ${price} | ${p.status || ""} | fit: ${p.fitment || "?"}`;
      });
      const lr = (m.monitor && m.monitor.last_run) || "never";
      const iv = (m.monitor && m.monitor.interval_days) || 3;
      blocks.push(
        `[Live build data — projects/mazda3-sports-build/parts.json]\nPrice monitor: every ${iv} days, last run ${lr}.${m.fitment_warning ? `\nFitment warning: ${m.fitment_warning}` : ""}\nParts (live prices):\n${lines.join("\n")}`.slice(0, 4000)
      );
    }
  }
  if (context.type === "story" && context.campaign && context.path) {
    try {
      const doc = readStoryDoc(context.campaign, context.path);
      blocks.push(
        `[Story context — ${doc.label} / ${doc.file}]\n\n${doc.content.slice(0, 12000)}`
      );
    } catch (err) {
      blocks.push(`[Story context — file unavailable: ${context.path} (${err.message || "not_found"})]`);
    }
    if (context.workshop_mode || context.ask_human) {
      blocks.push(
        `[Campaign workshop — roles]
The human is the GM. You are scribe/implementer for this lore doc: riff with them, capture theories, list follow-ups, propose tasks. Do not act as GM.`
      );
    }
  }
  if (context.type === "character" && context.campaign) {
    if (context.workshop_mode && !context.path) {
      blocks.push(
        `[Campaign workshop — ${context.campaign}]
The human is the GM for this chronicle. You are scribe/implementer: brainstorm, capture theories, list follow-ups, suggest registry/task updates. Do not act as GM.`
      );
    }
    const reg = readCharactersRegistry(context.campaign);
    const row =
      (context.character_id && reg.characters.find((c) => c.id === context.character_id)) ||
      (context.path && findRegistryForPath(reg, context.path));
    if (row) {
      blocks.push(
        `[Character registry — ${row.display_name}]\nstatus: ${row.status}\nplayer: ${row.player_name || "(unknown)"}\ndiscord: ${row.discord_username || row.discord_user_id || "(unlinked)"}\ncan_proxy (future): ${row.can_proxy}\nnotes: ${row.notes || ""}`.slice(
          0,
          2000
        )
      );
    }
    if (context.workshop_mode || context.ask_human) {
      blocks.push(
        `[Campaign workshop — roles]
The human is the GM (creative authority). You are the scribe/implementer: capture ideas, brainstorm options, note open questions, suggest tasks or registry updates. Do not act as GM or lecture. When they settle on something, offer to record it. Ask only when blocked on facts — never invent Discord IDs or player identities.`
      );
    }
    if (context.path) {
      try {
        const doc = readStoryDoc(context.campaign, context.path);
        blocks.push(`[Character sheet]\n\n${doc.content.slice(0, 10000)}`);
      } catch {
        /* optional sheet */
      }
    }
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
      const taskCtx = task.context && typeof task.context === "object" ? task.context : {};
      if (taskCtx.campaign && taskCtx.story_path && !context.path) {
        try {
          const doc = readStoryDoc(taskCtx.campaign, taskCtx.story_path);
          blocks.push(
            `[Task-linked story — ${doc.label} / ${doc.file}]\n\n${doc.content.slice(0, 8000)}`
          );
        } catch {
          /* optional story on task */
        }
      }
      blocks.push(
        `[Linked task ${task.id.slice(0, 8)}]\nTitle: ${task.title}\nTags: ${(task.tags || []).join(", ")}\nStatus: ${task.status}\n${task.body || ""}`.slice(
          0,
          3000
        )
      );
      if (taskCtx.chat_thread_id) {
        const linkedThread = readChatThread(taskCtx.chat_thread_id);
        if (linkedThread) {
          const excerpt = chatThreadExcerpt(linkedThread, 10);
          if (excerpt) {
            blocks.push(`[Linked chat thread ${taskCtx.chat_thread_id}]\n${excerpt}`.slice(0, 4000));
          }
        }
      }
    }
  }
  if (context.inbox_id) {
    const inbox = readHumanInbox();
    const all = [...(inbox.open || []), ...(inbox.answered || [])];
    const row = all.find((q) => q.id === context.inbox_id);
    if (row) {
      blocks.push(
        `[Inbox question ${row.id}]\n${row.question || row.title || ""}\n${row.context || ""}`.slice(0, 3000)
      );
    }
  }
  if (context.story_path && context.campaign && context.type !== "story" && context.type !== "character") {
    try {
      const doc = readStoryDoc(context.campaign, context.story_path);
      blocks.push(`[Story path]\n\n${doc.content.slice(0, 8000)}`);
    } catch {
      /* optional */
    }
  }
  if (context.campaign && CAMPAIGNS[context.campaign]) {
    const campLabel = campaignDisplayLabel(context);
    const hasStoryDoc =
      (context.type === "story" && context.path) ||
      (context.type === "character" && context.path) ||
      (context.story_path && context.type !== "story" && context.type !== "character");
    blocks.push(
      `[BOUND CAMPAIGN — already chosen by the human]
This thread is locked to: ${campLabel} (id: ${context.campaign}${context.layer ? `, layer: ${context.layer}` : ""}).
Do NOT ask which campaign this lives in. Do NOT offer Tropic Gooner / Hunter / SpaceQuest / NYC Mafia as alternatives.
The campaign identity is settled — treat "${campLabel}" as given.
Stay in this campaign only. If a detail is missing, ask about that detail — not the campaign identity.`
    );
    if (!hasStoryDoc) {
      const canon = buildCampaignContextExcerpt(context.campaign);
      if (canon) blocks.push(canon);
      blocks.push(
        `[Campaign — ${campLabel}]\nUse injected canon above plus this thread. Deliver substantive worldbuilding in one reply — no "let me read files" meta.`
      );
    }
  }
  if (Array.isArray(context.tags) && context.tags.length) {
    blocks.push(`[Context tags: ${context.tags.join(", ")}]`);
  }
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

function isHermesModelFailure(text) {
  return /HTTP 40[2349]|HTTP 429|rate.?limit|too many requests|unavailable for free|no endpoints found|model not found|RuntimeError|key limit exceeded|daily limit|Provider returned error/i.test(
    String(text || "")
  );
}

function isOpenRouterRateLimit(text) {
  return /HTTP 429|rate.?limit|too many requests|Provider returned error/i.test(String(text || ""));
}

function hermesChatCombinedOutput(errOrStdout, stderr) {
  if (errOrStdout && typeof errOrStdout === "object" && (errOrStdout.stdout != null || errOrStdout.stderr != null)) {
    return `${errOrStdout.stdout || ""}\n${errOrStdout.stderr || ""}`.trim();
  }
  return `${errOrStdout || ""}\n${stderr || ""}`.trim();
}

function isSessionIdOnlyReply(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length > 0 && lines.every((l) => /^session_id:\s*\S+/i.test(l));
}

function isHermesExecTimeout(err) {
  if (!err || typeof err !== "object") return false;
  if (err.killed || err.code === "ETIMEDOUT" || err.signal === "SIGTERM" || err.signal === "SIGKILL") {
    return true;
  }
  return /ETIMEDOUT|timed out|SIGTERM|SIGKILL/i.test(String(err.message || err));
}

function isRetryableChatModelError(text) {
  const s = String(text || "");
  if (!s.trim()) return true;
  return (
    isHermesModelFailure(s) ||
    /timed out|ETIMEDOUT|SIGTERM|SIGKILL|Command failed|Hermes chat failed|Hermes returned no reply|empty response|session_id only|API call failed|Error code:\s*40\d/i.test(
      s
    )
  );
}

async function execHermesChatOnce(profile, prompt, modelId = null, execOpts = {}) {
  // argv-only (no bash -lc): campaign canon has many `backticks`; bash would run each
  // as command substitution → flood of `bash: line 1: …: command not found` on stderr.
  const args = [];
  if (profile && profile !== "default") args.push("-p", profile);
  args.push("chat", "-Q", "-q", String(prompt ?? ""));
  if (modelId) args.push("-m", String(modelId));
  if (execOpts.maxTurns != null) args.push("--max-turns", String(Number(execOpts.maxTurns)));
  // ponytail: hermes-4-70b has no tool-use endpoints on OpenRouter; default hermes-cli
  // includes terminal/browser. Unknown `-t none` → enabled=["none"] → zero resolved tools.
  if (execOpts.disableTools !== false) args.push("-t", "none");
  const hermesEnv = {
    ...process.env,
    PATH: `${path.dirname(HERMES_BIN)}${path.delimiter}${process.env.PATH || ""}`,
  };
  // Free models are slow on large campaign prompts — shorter cap so failover reaches paid/next free.
  const isFree = String(modelId || "").includes(":free");
  const timeoutMs = Number(execOpts.timeoutMs) || (isFree ? 90_000 : 180_000);
  let stdout = "";
  let stderr = "";
  try {
    const result = await execFileAsync(HERMES_BIN, args, {
      cwd: REPO,
      env: hermesEnv,
      timeout: timeoutMs,
      maxBuffer: 512 * 1024,
    });
    stdout = result.stdout || "";
    stderr = result.stderr || "";
  } catch (err) {
    const out = hermesChatCombinedOutput(err, "") || String(err.message || err);
    if (isHermesExecTimeout(err)) {
      return {
        error: `Chat timed out (>${Math.round(timeoutMs / 1000)}s) on ${modelId || "model"} — trying next model.`,
        raw: out,
        model: modelId,
        timed_out: true,
      };
    }
    if (isHermesModelFailure(out) || /API call failed|Error code:/i.test(out)) {
      return { error: summarizeHermesFailure(out), raw: out, model: modelId };
    }
    throw err;
  }
  const out = hermesChatCombinedOutput(stdout, stderr);
  // Hermes often exits 0 even on OpenRouter 403/404 — detect from stdout/stderr before treating as reply.
  if (isHermesModelFailure(out) || /API call failed|Error code:\s*40\d|Key limit exceeded/i.test(out)) {
    return { error: summarizeHermesFailure(out), raw: out, model: modelId };
  }
  if (execOpts.rejectQwenFallback && isQwenFallbackInRaw(out)) {
    return {
      error: `${MODERATION_REFUSAL_USER_MSG} (Hermes fell back to Qwen free — retry or use Workshop mode.)`,
      raw: out,
      model: modelId,
      moderation_refusal: true,
      qwen_fallback: true,
    };
  }
  const reply = extractHermesReply(out);
  if ((!reply || isSessionIdOnlyReply(reply)) && isHermesModelFailure(out)) {
    return { error: summarizeHermesFailure(out), raw: out, model: modelId };
  }
  if (isSessionIdOnlyReply(reply) || !reply) {
    return {
      error: summarizeHermesFailure(out) || "Hermes returned no reply (session_id only).",
      raw: out,
      model: modelId,
    };
  }
  if (reply && isModelModerationRefusal(reply)) {
    return {
      error: MODERATION_REFUSAL_USER_MSG,
      raw: out,
      model: modelId,
      moderation_refusal: true,
    };
  }
  // Don't accept API error text as a successful assistant reply.
  if (/^Error:\s*Error code:/i.test(reply) || /Key limit exceeded/i.test(reply)) {
    return { error: summarizeHermesFailure(out || reply), raw: out, model: modelId };
  }
  return { reply, raw: out, model: modelId };
}

const CHAT_JOBS_FILE = path.join(REPO, "agents", "state", "chat-jobs.json");
const CHAT_THREADS_DIR = path.join(REPO, "agents", "state", "chat-threads");
const CHAT_THREADS_INDEX = path.join(CHAT_THREADS_DIR, "index.json");
const CHAT_MAX_MESSAGES = 160; // raised 2026-07-12: 80 silently dropped early campaign turns
// ponytail: 32k chars (~8k tokens) — enough for Workshop replies; Brief stays short via prompt, not hard chop
const CHAT_MAX_MESSAGE_CHARS = 32_000;

function ensureChatThreadsDir() {
  fs.mkdirSync(CHAT_THREADS_DIR, { recursive: true });
}

function readChatThreadsIndex() {
  ensureChatThreadsDir();
  if (!fs.existsSync(CHAT_THREADS_INDEX)) {
    return { updated_at: new Date().toISOString(), threads: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(CHAT_THREADS_INDEX, "utf8"));
    return { updated_at: data.updated_at || new Date().toISOString(), threads: Array.isArray(data.threads) ? data.threads : [] };
  } catch {
    return { updated_at: new Date().toISOString(), threads: [] };
  }
}

function writeChatThreadsIndex(threads) {
  ensureChatThreadsDir();
  const sorted = [...threads].sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  fs.writeFileSync(
    CHAT_THREADS_INDEX,
    JSON.stringify({ updated_at: new Date().toISOString(), threads: sorted }, null, 2) + "\n",
    "utf8"
  );
}

function chatThreadFile(id) {
  return path.join(CHAT_THREADS_DIR, `${id}.json`);
}

function backupChatThread(thread) {
  if (!thread?.id) return;
  try {
    const bak = `${chatThreadFile(thread.id)}.bak`;
    fs.writeFileSync(bak, JSON.stringify(thread, null, 2) + "\n", "utf8");
  } catch {
    /* ponytail: backup failure must not block truncate */
  }
}

function normalizeThreadContext(raw) {
  if (!raw || typeof raw !== "object") return {};
  const ctx = {};
  for (const key of [
    "project_id",
    "task_id",
    "campaign",
    "layer",
    "story_path",
    "type",
    "path",
    "character_id",
    "inbox_id",
    "workshop_mode",
    "ask_human",
  ]) {
    if (raw[key] != null && raw[key] !== "") ctx[key] = raw[key];
  }
  // Hunter is a layer on the Tropic Gooner chronicle — coerce aliases to tropic-gooner + layer.
  if (ctx.campaign === "hunter" || ctx.campaign === "hunter-reckoning") {
    ctx.campaign = "tropic-gooner";
    ctx.layer = "hunter";
  }
  if (ctx.layer === "hunter" && !ctx.campaign) ctx.campaign = "tropic-gooner";
  if (ctx.campaign && !CAMPAIGNS[ctx.campaign]) delete ctx.campaign;
  if (Array.isArray(raw.tags) && raw.tags.length) ctx.tags = raw.tags.filter(Boolean).slice(0, 12);
  return ctx;
}

function readChatThread(id) {
  if (!id || !/^[a-f0-9]{16}$/.test(id)) return null;
  const file = chatThreadFile(id);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeChatThread(thread) {
  ensureChatThreadsDir();
  fs.writeFileSync(chatThreadFile(thread.id), JSON.stringify(thread, null, 2) + "\n", "utf8");
  const idx = readChatThreadsIndex();
  const meta = {
    id: thread.id,
    title: thread.title,
    created_at: thread.created_at,
    updated_at: thread.updated_at,
    context: thread.context || {},
    parent_id: thread.parent_id || null,
    branch_from_index: thread.branch_from_index ?? null,
    message_count: (thread.messages || []).length,
    profile: thread.profile || "think",
    response_mode: thread.response_mode || "brief",
  };
  const i = idx.threads.findIndex((t) => t.id === thread.id);
  if (i === -1) idx.threads.push(meta);
  else idx.threads[i] = meta;
  writeChatThreadsIndex(idx.threads);
  return thread;
}

function threadMatchesFilters(meta, filters) {
  const ctx = meta.context || {};
  if (filters.project_id && ctx.project_id !== filters.project_id) return false;
  if (filters.task_id && ctx.task_id !== filters.task_id) return false;
  if (filters.campaign && ctx.campaign !== filters.campaign) return false;
  if (filters.story_path && ctx.story_path !== filters.story_path && ctx.path !== filters.story_path) return false;
  return true;
}

function listChatThreads(filters = {}) {
  const idx = readChatThreadsIndex();
  let threads = idx.threads;
  if (filters.project_id || filters.task_id || filters.campaign || filters.story_path) {
    threads = threads.filter((t) => threadMatchesFilters(t, filters));
  }
  return { updated_at: idx.updated_at, threads };
}

function createChatThread(body = {}) {
  const id = crypto.randomBytes(8).toString("hex");
  const now = Date.now();
  const context = normalizeThreadContext(body.context);
  const thread = {
    id,
    title: String(body.title || "New chat").trim().slice(0, 120) || "New chat",
    context,
    messages: Array.isArray(body.messages) ? body.messages.slice(0, CHAT_MAX_MESSAGES) : [],
    created_at: now,
    updated_at: now,
    parent_id: body.parent_id || null,
    branch_from_index: body.branch_from_index ?? null,
    profile: VALID_PROFILES.has(body.profile) ? body.profile : "think",
    response_mode: body.response_mode === "workshop" ? "workshop" : "brief",
  };
  return writeChatThread(thread);
}

function chatThreadExcerpt(thread, maxMessages = 6) {
  return (thread.messages || [])
    .slice(-maxMessages)
    .map((m) => {
      const who = m.role === "user" ? "Human" : "Assistant";
      return `${who}: ${String(m.text || "").trim()}`;
    })
    .filter((line) => line.length > 10)
    .join("\n\n");
}

function promoteChatThreadToTask(threadId, payload = {}) {
  const thread = readChatThread(threadId);
  if (!thread) throw new Error("thread_not_found");
  const excerpt = chatThreadExcerpt(thread, 8);
  const ctx = thread.context || {};
  const title =
    String(payload.title || thread.title || "From chat")
      .trim()
      .slice(0, 300) || "From chat";
  let body = String(payload.body || "").trim();
  if (!body) {
    body = `Promoted from chat thread ${threadId}.\n\n--- recent turns ---\n\n${excerpt}`.slice(0, 4000);
  }
  const tags = Array.isArray(payload.tags) ? payload.tags : ctx.campaign ? ["campaign", "general"] : ["general"];
  return createUserTask({
    title,
    body,
    tags,
    project_id: payload.project_id || ctx.project_id || null,
    context: {
      campaign: ctx.campaign || null,
      story_path: ctx.story_path || ctx.path || null,
      chat_thread_id: threadId,
    },
  });
}

function deleteChatThread(id) {
  const thread = readChatThread(id);
  if (!thread) throw new Error("thread_not_found");
  // Keep .bak so accidental ✕ / API delete is recoverable (message-delete already backed up).
  backupChatThread(thread);
  try {
    fs.unlinkSync(chatThreadFile(id));
  } catch {
    /* already gone */
  }
  const idx = readChatThreadsIndex();
  writeChatThreadsIndex(idx.threads.filter((t) => t.id !== id));
  return { ok: true, id, bak: true };
}

/**
 * Delete one message by index. Semantics (match least-surprise vs Edit):
 * - Assistant/error: remove that message only.
 * - User: remove that message + the immediately following bot reply (orphaned pair),
 *   but keep any later turns (unlike Edit/Regen which truncate the rest).
 */
function deleteChatMessage(threadId, msgIdx) {
  const thread = readChatThread(threadId);
  if (!thread) throw new Error("thread_not_found");
  const idx = Number(msgIdx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= (thread.messages || []).length) {
    throw new Error("bad_message_index");
  }
  const target = thread.messages[idx];
  if (!target || (target.role !== "user" && target.role !== "bot")) {
    throw new Error("bad_message_index");
  }
  backupChatThread(thread);
  let removeCount = 1;
  if (target.role === "user") {
    const next = thread.messages[idx + 1];
    if (next && next.role === "bot") removeCount = 2;
  }
  thread.messages.splice(idx, removeCount);
  thread.updated_at = Date.now();
  writeChatThread(thread);
  return {
    ok: true,
    thread_id: threadId,
    deleted_index: idx,
    removed_count: removeCount,
    thread: readChatThread(threadId),
  };
}

function branchChatThread(id, fromIndex) {
  const src = readChatThread(id);
  if (!src) throw new Error("thread_not_found");
  const idx = Number(fromIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= (src.messages || []).length) {
    throw new Error("bad_branch_index");
  }
  const slice = (src.messages || []).slice(0, idx + 1);
  const title = `${src.title} (branch)`.slice(0, 120);
  return createChatThread({
    title,
    context: { ...src.context },
    messages: slice.map((m) => ({ ...m })),
    parent_id: src.id,
    branch_from_index: idx,
    profile: src.profile,
    response_mode: src.response_mode,
  });
}

function appendChatThreadMessage(id, role, text, isError = false, extras = {}) {
  const thread = readChatThread(id);
  if (!thread) throw new Error("thread_not_found");
  const clean = String(text || "").trim().slice(0, CHAT_MAX_MESSAGE_CHARS);
  if (!clean) return thread;
  thread.messages = thread.messages || [];
  const msg = { role, text: clean, error: !!isError, at: Date.now() };
  if (Array.isArray(extras.artifacts) && extras.artifacts.length) {
    msg.artifacts = extras.artifacts;
  }
  if (extras.promoted_task_id) msg.promoted_task_id = extras.promoted_task_id;
  thread.messages.push(msg);
  if (thread.messages.length > CHAT_MAX_MESSAGES) {
    // Snapshot before window slide — oldest turns were previously lost with no bak.
    backupChatThread(thread);
    thread.messages = thread.messages.slice(-CHAT_MAX_MESSAGES);
  }
  thread.updated_at = Date.now();
  return writeChatThread(thread);
}

function normalizeChatArtifact(raw, campaignId) {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type || "file").slice(0, 32);
  const relPath = String(raw.path || "").replace(/\\/g, "/");
  if (!relPath || relPath.includes("..")) return null;
  const label = String(raw.label || path.basename(relPath)).slice(0, 200);
  let url = raw.url ? String(raw.url) : null;
  if (!url && type === "note" && relPath.startsWith(`campaigns/${campaignId}/`)) {
    url = `/api/stories/doc?campaign=${encodeURIComponent(campaignId)}&path=${encodeURIComponent(relPath)}`;
  }
  return { type, path: relPath, label, url };
}

function patchChatMessage(threadId, msgIdx, patch = {}) {
  const thread = readChatThread(threadId);
  if (!thread) throw new Error("thread_not_found");
  const idx = Number(msgIdx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= (thread.messages || []).length) {
    throw new Error("bad_message_index");
  }
  const msg = thread.messages[idx];
  if (patch.artifacts) {
    msg.artifacts = Array.isArray(msg.artifacts) ? msg.artifacts : [];
    for (const a of patch.artifacts) {
      const norm = normalizeChatArtifact(a, thread.context?.campaign || "tropic-gooner");
      if (norm) msg.artifacts.push(norm);
    }
  }
  if (patch.promoted_task_id) msg.promoted_task_id = String(patch.promoted_task_id);
  thread.messages[idx] = msg;
  thread.updated_at = Date.now();
  return writeChatThread(thread);
}

function prepareChatRegenerate(threadId, msgIdx) {
  const thread = readChatThread(threadId);
  if (!thread) throw new Error("thread_not_found");
  const idx = Number(msgIdx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= (thread.messages || []).length) {
    throw new Error("bad_message_index");
  }
  const target = thread.messages[idx];
  if (!target || target.role !== "bot") throw new Error("bad_message_index");
  let userIdx = idx - 1;
  while (userIdx >= 0 && thread.messages[userIdx].role !== "user") userIdx -= 1;
  if (userIdx < 0) throw new Error("no_prior_user_message");
  const userText = String(thread.messages[userIdx].text || "").trim();
  if (!userText) throw new Error("empty_user_message");
  backupChatThread(thread);
  thread.messages = thread.messages.slice(0, userIdx + 1);
  thread.updated_at = Date.now();
  writeChatThread(thread);
  const history = chatHistoryFromThread(thread).slice(0, -1);
  return { thread: readChatThread(threadId), userText, history };
}

function prepareChatEditAndRegen(threadId, msgIdx, newText) {
  const thread = readChatThread(threadId);
  if (!thread) throw new Error("thread_not_found");
  const idx = Number(msgIdx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= (thread.messages || []).length) {
    throw new Error("bad_message_index");
  }
  const target = thread.messages[idx];
  if (!target || target.role !== "user") throw new Error("bad_message_index");
  const userText = String(newText || "").trim().slice(0, CHAT_MAX_MESSAGE_CHARS);
  if (!userText) throw new Error("empty_user_message");
  backupChatThread(thread);
  thread.messages[idx] = { ...target, text: userText, at: Date.now() };
  thread.messages = thread.messages.slice(0, idx + 1);
  thread.updated_at = Date.now();
  writeChatThread(thread);
  const history = chatHistoryFromThread(thread).slice(0, -1);
  return { thread: readChatThread(threadId), userText, history, message_index: idx };
}

function resolveThreadCampaign(thread, bodyCampaign) {
  const fromThread = thread?.context?.campaign;
  if (fromThread && CAMPAIGNS[fromThread]) return fromThread;
  const fromBody = String(bodyCampaign || "").trim();
  if (fromBody && CAMPAIGNS[fromBody]) return fromBody;
  return null;
}

function saveChatMessageNote(threadId, msgIdx) {
  const thread = readChatThread(threadId);
  if (!thread) throw new Error("thread_not_found");
  const idx = Number(msgIdx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= (thread.messages || []).length) {
    throw new Error("bad_message_index");
  }
  const msg = thread.messages[idx];
  if (!msg || msg.role !== "bot" || msg.error) throw new Error("bad_message_index");
  const campaign = thread.context?.campaign;
  if (!campaign || !CAMPAIGNS[campaign]) throw new Error("no_campaign_context");
  const notesDir = path.join(REPO, "campaigns", campaign, "notes");
  fs.mkdirSync(notesDir, { recursive: true });
  const ts = Date.now();
  const filename = `chat-${threadId.slice(0, 8)}-${ts}.md`;
  const relPath = `campaigns/${campaign}/notes/${filename}`;
  const prior = (thread.messages || []).slice(Math.max(0, idx - 4), idx);
  const lines = [
    "# Chat note",
    "",
    `- Thread: \`${threadId}\``,
    `- Saved: ${new Date(ts).toISOString()}`,
    thread.title ? `- Title: ${thread.title}` : null,
    "",
    "## Context (recent turns)",
    "",
  ].filter(Boolean);
  for (const m of prior) {
    const who = m.role === "user" ? "Human" : "Assistant";
    lines.push(`### ${who}`, "", String(m.text || "").trim(), "");
  }
  lines.push("## Assistant message", "", String(msg.text || "").trim(), "");
  fs.writeFileSync(path.join(REPO, relPath), lines.join("\n"), "utf8");
  const artifact = normalizeChatArtifact(
    { type: "note", path: relPath, label: filename },
    campaign
  );
  const updated = patchChatMessage(threadId, idx, { artifacts: [artifact] });
  return { ok: true, artifact, message_index: idx, thread: updated };
}

function saveChatThreadNote(threadId, body = {}) {
  let thread = readChatThread(threadId);
  if (!thread) throw new Error("thread_not_found");
  const campaign = resolveThreadCampaign(thread, body.campaign);
  if (!campaign) throw new Error("no_campaign_context");
  if (!thread.context?.campaign || thread.context.campaign !== campaign) {
    thread = updateChatThreadMeta(threadId, { context: { campaign } });
  }
  const msgs = thread.messages || [];
  if (!msgs.length) throw new Error("empty_thread");
  const notesDir = path.join(REPO, "campaigns", campaign, "notes");
  fs.mkdirSync(notesDir, { recursive: true });
  const ts = Date.now();
  const filename = `chat-${threadId.slice(0, 8)}-full-${ts}.md`;
  const relPath = `campaigns/${campaign}/notes/${filename}`;
  const lines = [
    "# Chat transcript",
    "",
    `- Thread: \`${threadId}\``,
    `- Saved: ${new Date(ts).toISOString()}`,
    thread.title ? `- Title: ${thread.title}` : null,
    `- Turns: ${msgs.length}`,
    "",
    "## Transcript",
    "",
  ].filter(Boolean);
  for (const m of msgs) {
    const who = m.role === "user" ? "Human" : "Assistant";
    const err = m.error ? " (error)" : "";
    lines.push(`### ${who}${err}`, "", String(m.text || "").trim(), "");
  }
  fs.writeFileSync(path.join(REPO, relPath), lines.join("\n"), "utf8");
  const artifact = normalizeChatArtifact(
    { type: "note", path: relPath, label: filename },
    campaign
  );
  let attachIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "bot" && !msgs[i].error) {
      attachIdx = i;
      break;
    }
  }
  let updated = thread;
  if (attachIdx >= 0) {
    updated = patchChatMessage(threadId, attachIdx, { artifacts: [artifact] });
  }
  return {
    ok: true,
    artifact,
    message_index: attachIdx >= 0 ? attachIdx : null,
    thread: updated,
  };
}

function promoteChatMessageToTask(threadId, msgIdx, payload = {}) {
  const thread = readChatThread(threadId);
  if (!thread) throw new Error("thread_not_found");
  const idx = Number(msgIdx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= (thread.messages || []).length) {
    throw new Error("bad_message_index");
  }
  const msg = thread.messages[idx];
  if (!msg || msg.role !== "bot" || msg.error) throw new Error("bad_message_index");
  const ctx = thread.context || {};
  const excerpt = (thread.messages || [])
    .slice(Math.max(0, idx - 3), idx + 1)
    .map((m) => {
      const who = m.role === "user" ? "Human" : "Assistant";
      return `${who}: ${String(m.text || "").trim()}`;
    })
    .join("\n\n");
  const title =
    String(payload.title || thread.title || "From chat")
      .trim()
      .slice(0, 300) || "From chat";
  let body = String(payload.body || "").trim();
  if (!body) {
    body = `Promoted from chat message #${idx + 1} in thread ${threadId}.\n\n--- context ---\n\n${excerpt}`.slice(
      0,
      4000
    );
  }
  const tags = Array.isArray(payload.tags) ? payload.tags : ctx.campaign ? ["campaign", "general"] : ["general"];
  const { task } = createUserTask({
    title,
    body,
    tags,
    project_id: payload.project_id || ctx.project_id || null,
    context: {
      campaign: ctx.campaign || null,
      story_path: ctx.story_path || ctx.path || null,
      chat_thread_id: threadId,
    },
  });
  const taskArtifact = {
    type: "task",
    path: task.id,
    label: task.title,
    url: null,
  };
  patchChatMessage(threadId, idx, { promoted_task_id: task.id, artifacts: [taskArtifact] });
  return { ok: true, task, message_index: idx, thread: readChatThread(threadId) };
}

function startRegenerateChatJob(threadId, msgIdx) {
  const { thread, userText, history } = prepareChatRegenerate(threadId, msgIdx);
  return startChatJob(userText, thread.profile || "think", thread.context || null, {
    history,
    responseMode: thread.response_mode || "brief",
    threadId,
    skipUserAppend: true,
    messageIndex: Number(msgIdx),
  });
}

function startEditChatJob(threadId, msgIdx, newText) {
  const { thread, userText, history, message_index } = prepareChatEditAndRegen(
    threadId,
    msgIdx,
    newText
  );
  return startChatJob(userText, thread.profile || "think", thread.context || null, {
    history,
    responseMode: thread.response_mode || "brief",
    threadId,
    skipUserAppend: true,
    messageIndex: message_index,
  });
}

function maybeAutoTitleThread(id, message) {
  const thread = readChatThread(id);
  if (!thread) return;
  if (thread.title && thread.title !== "New chat" && !/^Task:/.test(thread.title)) return;
  const t = String(message || "").trim().slice(0, 48);
  if (!t) return;
  thread.title = t + (message.length > 48 ? "…" : "");
  thread.updated_at = Date.now();
  writeChatThread(thread);
}

function updateChatThreadMeta(id, patch = {}) {
  const thread = readChatThread(id);
  if (!thread) throw new Error("thread_not_found");
  if (patch.title) thread.title = String(patch.title).trim().slice(0, 120);
  if (patch.context) {
    // Full replace when context_replace — needed to clear campaign/layer.
    thread.context = patch.context_replace
      ? normalizeThreadContext(patch.context)
      : normalizeThreadContext({ ...thread.context, ...patch.context });
  }
  if (patch.profile && VALID_PROFILES.has(patch.profile)) thread.profile = patch.profile;
  if (patch.response_mode) thread.response_mode = patch.response_mode === "workshop" ? "workshop" : "brief";
  thread.updated_at = Date.now();
  return writeChatThread(thread);
}

function chatHistoryFromThread(thread) {
  return (thread.messages || [])
    .filter((t) => t && (t.role === "user" || t.role === "bot") && String(t.text || "").trim())
    .slice(-20)
    .map((t) => ({ role: t.role, text: String(t.text).trim().slice(0, 1500) }));
}

const CHAT_JOBS = new Map();
const CHAT_JOB_TTL_MS = 15 * 60 * 1000;
const CHAT_JOB_TIMEOUT_MS = 4 * 60 * 1000;
const CHAT_QUEUE = [];
let chatWorkerBusy = false;

function loadChatJobs() {
  if (!fs.existsSync(CHAT_JOBS_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(CHAT_JOBS_FILE, "utf8"));
    const jobs = data.jobs && typeof data.jobs === "object" ? data.jobs : {};
    for (const [id, job] of Object.entries(jobs)) {
      if (!job || typeof job !== "object") continue;
      if (job.status === "pending" || job.status === "queued") {
        job.status = "error";
        job.error =
          "Job lost when dashboard restarted — retry your message.";
        job.finished_at = Date.now();
      }
      CHAT_JOBS.set(id, { job_id: id, ...job });
    }
  } catch {
    /* ponytail: corrupt file — start fresh */
  }
}

function persistChatJobs() {
  try {
    fs.mkdirSync(path.dirname(CHAT_JOBS_FILE), { recursive: true });
    const jobs = {};
    for (const [id, job] of CHAT_JOBS) jobs[id] = job;
    fs.writeFileSync(CHAT_JOBS_FILE, JSON.stringify({ updated_at: new Date().toISOString(), jobs }, null, 2) + "\n", "utf8");
  } catch {
    /* non-fatal */
  }
}

function updateChatJob(job, patch) {
  Object.assign(job, patch);
  persistChatJobs();
}

function pruneChatJobs() {
  const cutoff = Date.now() - CHAT_JOB_TTL_MS;
  let changed = false;
  for (const [id, job] of CHAT_JOBS) {
    if (job.created_at < cutoff) {
      CHAT_JOBS.delete(id);
      changed = true;
    }
  }
  if (changed) persistChatJobs();
}

function failStaleChatJobs() {
  const cutoff = Date.now() - CHAT_JOB_TIMEOUT_MS;
  for (const job of CHAT_JOBS.values()) {
    if (job.status !== "pending" && job.status !== "queued") continue;
    const started = job.started_at || job.created_at;
    if (started >= cutoff) continue;
    updateChatJob(job, {
      status: "error",
      error: "Chat timed out (>4m). Hermes may be busy — retry with less context or wait a minute.",
      finished_at: Date.now(),
    });
  }
}

function chatQueueDepth() {
  return CHAT_QUEUE.length + (chatWorkerBusy ? 1 : 0);
}

function findInFlightChatJobForThread(threadId) {
  if (!threadId) return null;
  for (const job of CHAT_JOBS.values()) {
    if (job.thread_id !== threadId) continue;
    if (job.status === "pending" || job.status === "queued") return job;
  }
  for (const item of CHAT_QUEUE) {
    if (item.threadId === threadId) return item.job;
  }
  if (chatWorkerBusy) {
    const busy = [...CHAT_JOBS.values()].find(
      (j) => j.thread_id === threadId && j.status === "pending" && j.started_at
    );
    if (busy) return busy;
  }
  return null;
}

function shouldSkipDuplicateBotAppend(threadId, text) {
  const thread = readChatThread(threadId);
  if (!thread) return false;
  const last = (thread.messages || []).slice(-1)[0];
  return last?.role === "bot" && String(last.text || "").trim() === String(text || "").trim();
}

function refreshQueuedJobDepths() {
  let idx = 0;
  if (chatWorkerBusy) idx = 1;
  for (const item of CHAT_QUEUE) {
    updateChatJob(item.job, { status: "queued", queue_depth: idx });
    idx += 1;
  }
}

function drainChatQueue() {
  if (chatWorkerBusy || !CHAT_QUEUE.length) return;
  const next = CHAT_QUEUE.shift();
  if (!next) return;
  chatWorkerBusy = true;
  refreshQueuedJobDepths();
  const { job, message, profile, context, history, responseMode, threadId } = next;
  updateChatJob(job, { status: "pending", started_at: Date.now(), queue_depth: 0 });
  runHermesChat(message, profile, context, { history, responseMode })
    .then((result) => {
      if (result.error) {
        updateChatJob(job, { status: "error", error: result.error, finished_at: Date.now(), ...result });
        if (threadId) {
          try {
            if (!shouldSkipDuplicateBotAppend(threadId, result.error)) {
              appendChatThreadMessage(threadId, "bot", result.error, true);
            }
          } catch {
            /* non-fatal */
          }
        }
      } else {
        updateChatJob(job, { status: "done", finished_at: Date.now(), ...result });
        if (threadId) {
          try {
            const replyText = result.reply || "";
            if (!shouldSkipDuplicateBotAppend(threadId, replyText)) {
              appendChatThreadMessage(threadId, "bot", replyText, false);
            }
          } catch {
            /* non-fatal */
          }
        }
      }
    })
    .catch((err) => {
      updateChatJob(job, {
        status: "error",
        error: err.message || "chat_failed",
        finished_at: Date.now(),
      });
    })
    .finally(() => {
      chatWorkerBusy = false;
      drainChatQueue();
    });
}

function startChatJob(message, profile, context, chatOpts = {}) {
  pruneChatJobs();
  const threadId = chatOpts.threadId || null;
  const inFlight = findInFlightChatJobForThread(threadId);
  if (inFlight) {
    return inFlight.job_id;
  }
  const id = crypto.randomBytes(8).toString("hex");
  const ahead = chatQueueDepth();
  const job = {
    job_id: id,
    status: ahead ? "queued" : "pending",
    created_at: Date.now(),
    queue_depth: ahead,
    thread_id: chatOpts.threadId || null,
    message_index:
      Number.isInteger(chatOpts.messageIndex) && chatOpts.messageIndex >= 0
        ? chatOpts.messageIndex
        : null,
  };
  CHAT_JOBS.set(id, job);
  persistChatJobs();
  CHAT_QUEUE.push({
    job,
    message,
    profile,
    context,
    history: chatOpts.history || [],
    responseMode: chatOpts.responseMode || "brief",
    threadId: chatOpts.threadId || null,
    skipUserAppend: !!chatOpts.skipUserAppend,
  });
  drainChatQueue();
  return id;
}

loadChatJobs();
setInterval(failStaleChatJobs, 30_000);

function isOpenRouterDailyLimit(text) {
  return /key limit exceeded|daily limit/i.test(String(text || ""));
}

async function runHermesChat(message, profile = "think", context = null, chatOpts = {}) {
  const prof = resolveChatProfile(context, profile);
  if (profile === "fast") {
    return {
      error:
        "Chat uses the think lane (paid ops pool first). The fast profile is for background ticks only — select think · campaign brainstorm.",
      profile: prof,
      context_used: !!context,
    };
  }
  let prompt;
  try {
    prompt = buildChatMessage(message, context, {
      history: chatOpts.history,
      responseMode: chatOpts.responseMode,
    });
  } catch (err) {
    return {
      error: err.message || "bad_context",
      profile: prof,
      context_used: !!context,
    };
  }

  const paidChain = getChatRefusalFailoverChain(prof);
  const freeChain = getChatFreeFailoverChain();
  const triedModels = [];
  let lastErr = "";
  let lastModerationRefusal = false;
  let hitDailyLimit = false;

  async function tryModelChain(modelChain, { allowFree }) {
    const execOpts = { maxTurns: 1, rejectQwenFallback: !allowFree };
    for (const modelId of modelChain) {
      triedModels.push(modelId);
      try {
        const result = await execHermesChatOnce(prof, prompt, modelId, execOpts);
        if (result.error) {
          lastErr = result.error;
          if (isOpenRouterDailyLimit(result.raw || result.error)) {
            recordChatModelUsage(modelId, "daily_limit");
            hitDailyLimit = true;
            // Same ops key across paid models — skip rest of paid lane.
            if (!allowFree) return { kind: "daily_limit" };
            continue;
          }
          if (result.moderation_refusal) {
            recordChatModelUsage(modelId, "moderation");
            lastModerationRefusal = true;
            continue;
          }
          if (isOpenRouterRateLimit(result.raw || result.error)) {
            recordChatModelUsage(modelId, "rate_limit");
            continue;
          }
          // Timeouts / empty / opaque Hermes failures → next model (do not hard-stop the chain).
          recordChatModelUsage(modelId, "fail");
          if (isRetryableChatModelError(result.raw || result.error)) {
            continue;
          }
          // Only hard-stop on missing binary / spawn failures.
          if (/ENOENT|spawn |hermes: not found|no such file/i.test(result.raw || result.error)) {
            return {
              kind: "error",
              payload: {
                error: result.error,
                profile: prof,
                model: modelId,
                context_used: !!context,
                failover_tried: triedModels,
                openrouter_daily_limit: hitDailyLimit || undefined,
              },
            };
          }
          continue;
        }
        let reply = result.reply;
        if (isModelModerationRefusal(reply)) {
          recordChatModelUsage(modelId, "moderation");
          lastErr = MODERATION_REFUSAL_USER_MSG;
          lastModerationRefusal = true;
          continue;
        }
        if (isIntentOnlyChatReply(reply)) {
          const retryPrompt = `${prompt}\n\n---\n\n[REJECTED: Your reply was intent-only without content ("${String(reply).slice(0, 100)}"). You CANNOT read or write files. Use the canon excerpt in this prompt. Respond NOW with substantive content — no "let me read/check" phrasing.]`;
          const retryResult = await execHermesChatOnce(prof, retryPrompt, modelId, execOpts);
          if (
            retryResult.moderation_refusal ||
            (retryResult.reply && isModelModerationRefusal(retryResult.reply))
          ) {
            recordChatModelUsage(modelId, "moderation");
            lastErr = retryResult.error || MODERATION_REFUSAL_USER_MSG;
            lastModerationRefusal = true;
            continue;
          }
          if (
            retryResult.reply &&
            !isIntentOnlyChatReply(retryResult.reply) &&
            !isModelModerationRefusal(retryResult.reply)
          ) {
            reply = retryResult.reply;
          } else {
            recordChatModelUsage(modelId, "fail");
            return {
              kind: "error",
              payload: {
                error:
                  "Model returned empty intent (promised to read files but cannot). Click Regenerate or switch to Workshop mode.",
                profile: prof,
                model: modelId,
                context_used: !!context,
                intent_only: true,
              },
            };
          }
        }
        recordChatModelUsage(modelId, "ok");
        const retried = modelId !== modelChain[0] || triedModels.length > 1 || allowFree || hitDailyLimit;
        return {
          kind: "ok",
          payload: {
            reply,
            profile: prof,
            model: modelId,
            context_used: !!context,
            paid_retry: retried && !allowFree,
            free_fallback: allowFree || undefined,
            paid_retry_from: retried ? triedModels[0] : undefined,
            failover: retried,
            failover_from: retried ? triedModels[0] : undefined,
            retried_models: triedModels.length > 1 ? triedModels : undefined,
            openrouter_daily_limit: hitDailyLimit || undefined,
          },
        };
      } catch (err) {
        const detail = hermesChatCombinedOutput(err, "") || String(err.message || err);
        lastErr = isHermesExecTimeout(err)
          ? `Chat timed out on ${modelId} — trying next model.`
          : summarizeHermesFailure(detail);
        if (isOpenRouterDailyLimit(detail)) {
          recordChatModelUsage(modelId, "daily_limit");
          hitDailyLimit = true;
          if (!allowFree) return { kind: "daily_limit" };
          continue;
        }
        if (isOpenRouterRateLimit(detail)) {
          recordChatModelUsage(modelId, "rate_limit");
          continue;
        }
        recordChatModelUsage(modelId, "fail");
        if (isRetryableChatModelError(detail) || isHermesExecTimeout(err)) {
          continue;
        }
        if (/ENOENT|spawn |hermes: not found|no such file/i.test(detail)) {
          return {
            kind: "error",
            payload: {
              error: lastErr,
              profile: prof,
              model: modelId,
              context_used: !!context,
              failover_tried: triedModels,
              openrouter_daily_limit: hitDailyLimit || undefined,
            },
          };
        }
        continue;
      }
    }
    return { kind: "exhausted" };
  }

  // Free-first everywhere (incl. campaign threads); paid only after free fails (429/timeout/empty/error).
  loadModelBudgetConfig();
  const preferFree = CHAT_FREE_FIRST;
  const phases = preferFree
    ? [
        { chain: freeChain, allowFree: true },
        { chain: paidChain, allowFree: false },
      ]
    : [
        { chain: paidChain, allowFree: false },
        { chain: freeChain, allowFree: true },
      ];

  for (const phase of phases) {
    if (!phase.chain.length) continue;
    const result = await tryModelChain(phase.chain, { allowFree: phase.allowFree });
    if (result.kind === "ok" || result.kind === "error") {
      return result.payload;
    }
    // daily_limit / exhausted → next phase
  }

  if (hitDailyLimit) {
    return {
      error: `OpenRouter ops daily USD cap reached (policy target $${OPENROUTER_OPS_DAILY_USD}). Free models also exhausted or rate-limited — wait for UTC reset, top up, or raise key limit (set-openrouter-key-limit.sh).`,
      profile: prof,
      context_used: !!context,
      failover_tried: triedModels,
      openrouter_daily_limit: true,
    };
  }

  const triedSuffix = triedModels.length ? ` Tried: ${triedModels.join(" → ")}.` : "";
  const baseErr = lastModerationRefusal
    ? formatAllModelsRefusedError(triedModels)
    : lastErr || formatAllModelsRefusedError(triedModels);
  const withTried =
    triedModels.length && !String(baseErr).includes("Tried:")
      ? `${baseErr}${triedSuffix}`
      : baseErr;
  return {
    error: withTried,
    profile: prof,
    context_used: !!context,
    moderation_refusal: lastModerationRefusal,
    failover_tried: triedModels,
    retried_models: triedModels.length ? triedModels : undefined,
    openrouter_daily_limit: hitDailyLimit || undefined,
  };
}

function summarizeHermesFailure(raw) {
  const s = String(raw).replace(/\x1b\[[0-9;]*m/g, "");
  if (/key limit exceeded|daily limit/i.test(s)) {
    return `OpenRouter daily USD limit on ops key (target $${OPENROUTER_OPS_DAILY_USD}/day). Falling through free models; raise key limit in OpenRouter UI or set-openrouter-key-limit.sh.`;
  }
  if (/HTTP 429|rate.?limit|too many requests|Provider returned error/i.test(s)) {
    return "Rate limited (HTTP 429) — trying next model in free→paid chain (model-budget).";
  }
  const tool404 = s.match(/No endpoints found that support tool use[^\n]*/i);
  if (tool404) {
    return `Model error: ${tool404[0].slice(0, 180)} (dashboard chat disables tools; retry once).`;
  }
  const m =
    s.match(/API call failed[^\n]*/i) ||
    s.match(/Error code:\s*40\d[^\n]*/i) ||
    s.match(/HTTP 40[234][^\n]*/i) ||
    s.match(/unavailable for free[^\n]*/i);
  if (m) return `Model error: ${m[0].slice(0, 200)}. Use think lane; run install-hermes-profiles.sh on linuxbox if persistent.`;
  if (/timed out|ETIMEDOUT|SIGTERM|SIGKILL/i.test(s)) {
    return "Chat timed out — trying next model (or shorten message / use Brief).";
  }
  const line = s
    .split("\n")
    .map((l) => l.trim())
    .find(
      (l) =>
        l &&
        !/^session_id:/i.test(l) &&
        !/^Warning: Unknown toolsets/i.test(l) &&
        !/^bash:\s*line\s+\d+:/i.test(l) &&
        !/^Resume this session/i.test(l) &&
        !/^hermes --resume/i.test(l) &&
        !/^(Session|Duration|Messages):/.test(l)
    );
  return line?.slice(0, 240) || "Hermes chat failed (no usable model output)";
}

function isHermesNoiseLine(line) {
  const l = String(line || "").trim();
  if (!l) return false;
  return (
    /^session_id:/i.test(l) ||
    /^Warning: Unknown toolsets/i.test(l) ||
    /^bash:\s*line\s+\d+:/i.test(l) ||
    l.startsWith("Resume this session") ||
    l.startsWith("hermes --resume") ||
    /^(Session|Duration|Messages):/.test(l)
  );
}

function extractHermesReply(raw) {
  // Strip ANSI, then pull the answer out of the Hermes box (╭─ Hermes ─╮ … ╰─╯),
  // dropping the echoed query and the session/resume footer. Fallback: filter footer lines.
  const out = String(raw).replace(/\x1b\[[0-9;]*m/g, "");
  const lines = out.split(/\r?\n/);
  const start = lines.findIndex((l) => l.includes("\u256d") && /Hermes/.test(l));
  if (start !== -1) {
    const end = lines.findIndex((l, i) => i > start && l.trimStart().startsWith("\u2570"));
    if (end !== -1) {
      const body = lines
        .slice(start + 1, end)
        .map((l) => l.replace(/[\u2502]/g, "").trim())
        .filter((l) => !isHermesNoiseLine(l))
        .join("\n")
        .trim();
      if (body) return body;
    }
  }
  return lines.filter((l) => !isHermesNoiseLine(l)).join("\n").trim();
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
  // Allow more social/news streams on Intel Social tab (was 8).
  for (const feed of feeds.slice(0, 12)) {
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
//   OBSERVABILITY_KUMA_URL   — Uptime Kuma link in Active now (default MagicDNS :13001)
//   OBSERVABILITY_GRAFANA_URL / GRAFANA_URL — optional Grafana link (off-box recommended)
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
  "/api/agent",
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
            systems: auth?.role === "admin",
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
      const lite = auth?.role === "viewer" || shouldUseLiteAgentCollect();
      sendJson(res, 200, await collectAgentStateCached({ lite }), publicMode);
      return;
    }

    // Prometheus text — loopback/admin only (server binds 127.0.0.1; scrape via SSH tunnel).
    if (req.method === "GET" && pathname === "/metrics") {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      const body = buildPrometheusMetrics();
      res.writeHead(200, {
        ...responseHeaders(publicMode),
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(body);
      return;
    }

    if (req.method === "GET" && pathname === "/api/inbox") {
      sendJson(res, 200, { updated_at: new Date().toISOString(), ...readHumanInbox() }, publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/systems") {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      sendJson(res, 200, await collectSystemsState(), publicMode);
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/api/systems/") && pathname.endsWith("/detail")) {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      const systemId = decodeURIComponent(
        pathname.slice("/api/systems/".length, pathname.length - "/detail".length)
      );
      try {
        sendJson(res, 200, await getSystemDetail(systemId), publicMode);
      } catch (e) {
        const code = e.message === "unknown_system" ? 404 : 400;
        sendJson(res, code, { error: e.message || "detail_failed" }, publicMode);
      }
      return;
    }

    if (req.method === "GET" && pathname === "/api/machines") {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      sendJson(res, 200, await collectMachinesState(), publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/chat/status") {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      const jobId = url.searchParams.get("job_id") || "";
      const job = CHAT_JOBS.get(jobId);
      if (!job) {
        sendJson(res, 404, { error: "job_not_found" }, publicMode);
        return;
      }
      sendJson(res, 200, job, publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/chat/threads") {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      const filters = {
        project_id: url.searchParams.get("project_id") || "",
        task_id: url.searchParams.get("task_id") || "",
        campaign: url.searchParams.get("campaign") || "",
        story_path: url.searchParams.get("story_path") || "",
      };
      sendJson(res, 200, listChatThreads(filters), publicMode);
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/api/chat/threads/")) {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      const threadId = pathname.slice("/api/chat/threads/".length).split("/")[0];
      const thread = readChatThread(threadId);
      if (!thread) {
        sendJson(res, 404, { error: "thread_not_found" }, publicMode);
        return;
      }
      sendJson(res, 200, thread, publicMode);
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/icons/") && pathname.endsWith(".svg")) {
      const name = pathname.slice("/icons/".length);
      if (!/^[a-z0-9-]+\.svg$/.test(name)) {
        sendJson(res, 400, { error: "bad_icon" }, publicMode);
        return;
      }
      const iconPath = path.join(STATIC_DIR, "icons", name);
      if (!fs.existsSync(iconPath)) {
        sendJson(res, 404, { error: "not_found" }, publicMode);
        return;
      }
      sendFile(res, iconPath, "image/svg+xml", publicMode);
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

    if (req.method === "GET" && pathname === "/api/characters-registry") {
      const campaignId = url.searchParams.get("campaign") || "tropic-gooner";
      sendJson(res, 200, readCharactersRegistry(campaignId), publicMode);
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

    if (req.method === "GET" && pathname === "/api/garage") {
      sendJson(res, 200, readMazdaParts(), publicMode);
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/api/campaigns/")) {
      const rest = pathname.slice("/api/campaigns/".length);
      const slash = rest.indexOf("/");
      const campaignId = slash === -1 ? rest : rest.slice(0, slash);
      const sub = slash === -1 ? "" : rest.slice(slash + 1);
      if (sub === "map" && CAMPAIGNS[campaignId]) {
        sendJson(res, 200, readCampaignMap(campaignId), publicMode);
        return;
      }
      if (sub === "map-image" && CAMPAIGNS[campaignId]) {
        const mapData = readCampaignMap(campaignId);
        const rel = mapData.base_image;
        if (!rel || rel.includes("..")) {
          sendJson(res, 404, { error: "no_map_image" }, publicMode);
          return;
        }
        const abs = path.join(REPO, "campaigns", campaignId, rel);
        if (!fs.existsSync(abs)) {
          sendJson(res, 404, { error: "map_image_missing" }, publicMode);
          return;
        }
        sendFile(res, abs, "image/png", publicMode);
        return;
      }
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
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        const message = String(body.message || "").trim();
        if (!message) {
          sendJson(res, 400, { error: "empty_message" }, publicMode);
          return;
        }
        const threadId = String(body.thread_id || "").trim();
        let context = body.context ? normalizeThreadContext(body.context) : null;
        let profile = resolveChatProfile(context, body.profile || "think");
        let responseMode = body.response_mode === "workshop" ? "workshop" : "brief";
        let history = Array.isArray(body.history)
          ? body.history
              .filter((t) => t && (t.role === "user" || t.role === "bot") && String(t.text || "").trim())
              .slice(-20)
              .map((t) => ({
                role: t.role,
                text: String(t.text).trim().slice(0, 1500),
              }))
          : [];

        if (threadId) {
          const inFlight = findInFlightChatJobForThread(threadId);
          if (inFlight) {
            sendJson(
              res,
              202,
              {
                job_id: inFlight.job_id,
                status: inFlight.status,
                queue_depth: inFlight.queue_depth || 0,
                thread_id: threadId,
                deduped: true,
              },
              publicMode
            );
            return;
          }
          const thread = readChatThread(threadId);
          if (!thread) {
            sendJson(res, 404, { error: "thread_not_found" }, publicMode);
            return;
          }
          context = normalizeThreadContext(thread.context || context || {});
          profile = resolveChatProfile(context, body.profile || thread.profile || "think");
          responseMode =
            body.response_mode === "workshop" || body.response_mode === "brief"
              ? body.response_mode
              : thread.response_mode || "brief";
          history = chatHistoryFromThread(thread);
          try {
            appendChatThreadMessage(threadId, "user", message, false);
            maybeAutoTitleThread(threadId, message);
            if (body.profile || body.response_mode) {
              updateChatThreadMeta(threadId, {
                profile: body.profile,
                response_mode: body.response_mode,
              });
            }
          } catch (err) {
            sendJson(res, 400, { error: err.message || "thread_write_failed" }, publicMode);
            return;
          }
        }

        const jobId = startChatJob(message, profile, context, {
          history,
          responseMode,
          threadId: threadId || null,
        });
        const job = CHAT_JOBS.get(jobId) || { status: "pending", queue_depth: 0 };
        sendJson(
          res,
          202,
          { job_id: jobId, status: job.status, queue_depth: job.queue_depth || 0, thread_id: threadId || null },
          publicMode
        );
        return;
      }

      if (pathname === "/api/chat/threads") {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        try {
          const thread = createChatThread(body);
          sendJson(res, 201, thread, publicMode);
        } catch (err) {
          sendJson(res, 400, { error: err.message || "thread_create_failed" }, publicMode);
        }
        return;
      }

      if (pathname.startsWith("/api/chat/threads/") && pathname.endsWith("/branch")) {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        const parts = pathname.slice("/api/chat/threads/".length).split("/");
        const srcId = parts[0];
        try {
          const branch = branchChatThread(srcId, body.from_index);
          sendJson(res, 201, branch, publicMode);
        } catch (err) {
          sendJson(res, 400, { error: err.message || "branch_failed" }, publicMode);
        }
        return;
      }

      if (pathname.startsWith("/api/chat/threads/") && pathname.endsWith("/promote-task")) {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        const threadId = pathname.slice("/api/chat/threads/".length).replace(/\/promote-task$/, "");
        try {
          sendJson(res, 201, promoteChatThreadToTask(threadId, body), publicMode);
        } catch (err) {
          sendJson(res, 400, { error: err.message || "promote_failed" }, publicMode);
        }
        return;
      }

      const threadSaveNote = pathname.match(/^\/api\/chat\/threads\/([a-f0-9]{16})\/save-note$/);
      if (threadSaveNote) {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        try {
          sendJson(res, 201, saveChatThreadNote(threadSaveNote[1], body), publicMode);
        } catch (err) {
          sendJson(res, 400, { error: err.message || "save_failed" }, publicMode);
        }
        return;
      }

      const chatMsgRoute = pathname.match(
        /^\/api\/chat\/threads\/([a-f0-9]{16})\/messages\/(\d+)\/(save-note|regenerate|promote-task|edit)$/
      );
      if (chatMsgRoute) {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        const threadId = chatMsgRoute[1];
        const msgIdx = chatMsgRoute[2];
        const action = chatMsgRoute[3];
        try {
          if (action === "save-note") {
            sendJson(res, 201, saveChatMessageNote(threadId, msgIdx), publicMode);
            return;
          }
          if (action === "promote-task") {
            sendJson(res, 201, promoteChatMessageToTask(threadId, msgIdx, body), publicMode);
            return;
          }
          if (action === "edit") {
            const inFlight = findInFlightChatJobForThread(threadId);
            if (inFlight) {
              sendJson(
                res,
                409,
                {
                  error: "chat_job_in_flight",
                  job_id: inFlight.job_id,
                  status: inFlight.status,
                  thread_id: threadId,
                },
                publicMode
              );
              return;
            }
            const jobId = startEditChatJob(threadId, msgIdx, body.text || body.message || "");
            const job = CHAT_JOBS.get(jobId) || { status: "pending", queue_depth: 0 };
            sendJson(
              res,
              202,
              {
                job_id: jobId,
                status: job.status,
                queue_depth: job.queue_depth || 0,
                thread_id: threadId,
                message_index: Number(msgIdx),
              },
              publicMode
            );
            return;
          }
          if (action === "regenerate") {
            const inFlight = findInFlightChatJobForThread(threadId);
            if (inFlight) {
              sendJson(
                res,
                202,
                {
                  job_id: inFlight.job_id,
                  status: inFlight.status,
                  queue_depth: inFlight.queue_depth || 0,
                  thread_id: threadId,
                  message_index: Number(msgIdx),
                  deduped: true,
                },
                publicMode
              );
              return;
            }
            const jobId = startRegenerateChatJob(threadId, msgIdx);
            const job = CHAT_JOBS.get(jobId) || { status: "pending", queue_depth: 0 };
            sendJson(
              res,
              202,
              {
                job_id: jobId,
                status: job.status,
                queue_depth: job.queue_depth || 0,
                thread_id: threadId,
                message_index: Number(msgIdx),
              },
              publicMode
            );
            return;
          }
        } catch (err) {
          sendJson(res, 400, { error: err.message || "message_action_failed" }, publicMode);
          return;
        }
      }

      if (pathname.startsWith("/api/chat/threads/")) {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        const threadId = pathname.slice("/api/chat/threads/".length).split("/")[0];
        try {
          const thread = updateChatThreadMeta(threadId, body);
          sendJson(res, 200, thread, publicMode);
        } catch (err) {
          sendJson(res, 400, { error: err.message || "thread_update_failed" }, publicMode);
        }
        return;
      }

      if (pathname === "/api/dashboard/suggest") {
        sendJson(res, 200, await suggestDashboardImprovement(body.text || ""), publicMode);
        return;
      }

      if (pathname === "/api/inbox/reply") {
        try {
          sendJson(res, 200, replyHumanInbox(body.id, body.answer || ""), publicMode);
        } catch (e) {
          sendJson(res, 400, { error: e.message || "inbox_reply_failed" }, publicMode);
        }
        return;
      }

      if (pathname === "/api/systems/control") {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        try {
          const result = await runSystemControl(body.system_id || "", body.action || "");
          agentStateCache = null;
          sendJson(res, 200, result, publicMode);
        } catch (e) {
          sendJson(res, 400, { error: e.message || "control_failed" }, publicMode);
        }
        return;
      }

      if (pathname === "/api/characters-registry") {
        const campaignId = body.campaign || "tropic-gooner";
        try {
          sendJson(res, 200, patchCharacterRegistry(campaignId, body), publicMode);
        } catch (e) {
          sendJson(res, 400, { error: e.message || "registry_error" }, publicMode);
        }
        return;
      }
    }

    if (req.method === "DELETE") {
      if (pathname.startsWith("/api/chat/threads/") && auth?.role === "admin") {
        const msgDel = pathname.match(/^\/api\/chat\/threads\/([a-f0-9]{16})\/messages\/(\d+)$/);
        if (msgDel) {
          try {
            const inFlight = findInFlightChatJobForThread(msgDel[1]);
            if (inFlight) {
              sendJson(
                res,
                409,
                {
                  error: "chat_job_in_flight",
                  job_id: inFlight.job_id,
                  status: inFlight.status,
                  thread_id: msgDel[1],
                },
                publicMode
              );
              return;
            }
            sendJson(res, 200, deleteChatMessage(msgDel[1], msgDel[2]), publicMode);
          } catch (err) {
            const code = err.message === "thread_not_found" ? 404 : 400;
            sendJson(res, code, { error: err.message || "message_delete_failed" }, publicMode);
          }
          return;
        }
        const threadId = pathname.slice("/api/chat/threads/".length).split("/")[0];
        try {
          sendJson(res, 200, deleteChatThread(threadId), publicMode);
        } catch (err) {
          sendJson(res, 404, { error: err.message || "thread_not_found" }, publicMode);
        }
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
  refreshAgentStateBackground(shouldUseLiteAgentCollect());
  setInterval(() => refreshAgentStateBackground(shouldUseLiteAgentCollect()), 60_000);
});
