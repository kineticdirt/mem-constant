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

const {
  collectSystemsState,
  runSystemControl,
  getSystemDetail,
  readHostMetrics,
  readHostResourcesLight,
} = require("./linuxbox-systems");
const { collectMachinesState } = require("./linuxbox-machines");
const {
  buildOffloadTaskBody,
  buildOffloadLedgerLine,
  appendGroupchatRecentActivity,
  threadRelPath,
} = require("./chat-offload-handoff");
const docsWiki = require("./linuxbox-docs-wiki");
const charsRegistryReadCache = require("./chars-registry-read-cache");

const LISTEN_HOST = "127.0.0.1";
const LISTEN_PORT = 8790;
// Deploy-pair marker: MUST equal <meta name="dash-build"> in linuxbox-status/index.html.
// Bump BOTH together whenever the HTML↔API shape changes (docs/runtime-state-protection.md);
// verify-runtime-state.sh fails the deploy when they differ.
const DASH_BUILD = "db_20260805-hub-status-colors-r1";
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
const CURSOR_AGENT_BIN = path.join(process.env.HOME || "/home/abhinav", ".local/bin/agent");
const CURSOR_AGENT_SCRIPT = path.join(__dirname, "cursor-agent-run.sh");
const CURSOR_LANE_STATUS_SCRIPT = path.join(__dirname, "cursor-lane-status.sh");
const FREE_MODELS_HEALTH_SCRIPT = path.join(__dirname, "free-models-health.sh");
const FREE_MODELS_HEALTH_CACHE = path.join(REPO, "agents", "state", "free-models-health.json");
const AGENT_GOAL_CONTROL_FILE = path.join(REPO, "agents", "state", "agent-goal-control.json");
const CURSOR_AGENT_ENV = path.join(process.env.HOME || "/home/abhinav", ".cursor-agent.env");
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
    archived: true,
    progress: "campaigns/spacequest/reports/progress.md",
    reportsDir: "campaigns/spacequest/reports",
    storyDirs: ["story", "lore", "characters"],
  },
  "nyc-mafia-dnd": {
    label: "NYC Mafia × D&D",
    progress: "campaigns/nyc-mafia-dnd/reports/progress.md",
    reportsDir: "campaigns/nyc-mafia-dnd/reports",
    // characters/ + worldbuilding/ + root SETTING-*/LOCKS*.md for Docs tree
    storyDirs: ["story", "characters", "worldbuilding"],
    campaignRootMd: true,
  },
  "tropic-gooner": {
    label: "Tropic Gooner (Hunter: The Reckoning)",
    progress: "campaigns/tropic-gooner/reports/progress.md",
    reportsDir: "campaigns/tropic-gooner/reports",
    // Include story/ so CAMPAIGN_WRITE short-form story/*.md is indexed (was invisible).
    storyDirs: ["story", "Things and Places of Note", "Organizations", "Plot Lines", "characters", "places"],
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
  "offload",
  "laptop",
];

const CHAT_MODES_FILE = path.join(REPO, "agents", "chat-modes.json");
const CHAT_CATALOG_FILE = path.join(REPO, "agents", "model-budget", "chat-catalog.json");
let CHAT_MODES_DATA = null;
let CHAT_CATALOG_DATA = null;
let CHAT_CATALOG_MTIME = 0;

const USER_PROJECT_KINDS = [
  { id: "research-dev", label: "Research & development" },
  { id: "product", label: "Product" },
  { id: "ops", label: "Ops / infra" },
  { id: "personal", label: "Personal" },
];

const VALID_PROFILES = new Set(["fast", "think", "chat", "meta", "code", "default"]);
/** Dashboard Chat always uses OpenRouter — never Bonsai-patched think lane. */
const CHAT_HERMES_PROFILE = "chat";
const HERMES_MODEL_REGISTRY = path.join(REPO, "agents/hermes-model-registry.json");
/** Cheap paid head for Chat — DeepSeek is the only paid head (policy 2026-07-24). */
const CHAT_DEEPSEEK_MINOR = "deepseek/deepseek-v4-flash";
/** Paid backup behind DeepSeek. Step 3.7 removed — burned ~$14/day thrashing the think lane. */
const CHAT_PAID_MID = "z-ai/glm-5.2";
const CHAT_PAID_MODEL_FALLBACK = [
  CHAT_DEEPSEEK_MINOR,
  CHAT_PAID_MID,
  "nousresearch/hermes-4-70b",
];
/** Last resort for moderation-heavy RP worldbuilding — Venice uncensored via OpenRouter (paid). */
const CHAT_VENICE_LAST_RESORT = "cognitivecomputations/dolphin-mistral-24b-venice-edition";
/**
 * Free-first heads (probe-verified 2026-07-24). Do NOT re-add tencent/hy3:free (sunset),
 * qwen/...:free (delisted — paid variant only) or zenmux kimi-k3-free (404, never existed):
 * a dead id here silently burns a retry hop and drops Chat through to paid on every turn.
 */
const CHAT_FREE_LAST_RESORT = [
  "poolside/laguna-xs-2.1:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "inclusionai/ling-3.0-flash:free",
];
/**
 * Hard-blocked model ids — filtered out of every Chat/Hermes failover chain.
 * A dead or demoted id left in a chain silently burns a retry hop (and, for paid
 * demotions like Step, real money). Re-probe before removing anything from here.
 */
const CHAT_SUNSET_MODELS = new Set([
  "tencent/hy3:free", // OpenRouter sunset 2026-07-21
  "qwen/qwen3-next-80b-a3b-instruct:free", // delisted 2026-07-24 — paid variant only
  "zenmux:moonshotai/kimi-k3-free", // 404 invalid_model, never existed
  "moonshotai/kimi-k3-free", // same phantom without prefix
  "stepfun/step-3.7-flash", // demoted 2026-07-24 — burned ~$14–16/day thrashing think
]);
const CHAT_FREE_FALLBACK_LABELS = {
  "poolside/laguna-xs-2.1:free": "Laguna XS 2.1 free",
  "nvidia/nemotron-3-super-120b-a12b:free": "Nemotron 3 Super 120B free",
  "inclusionai/ling-3.0-flash:free": "Ling 3.0 Flash free",
};
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

function invalidateModelBudgetConfigCache() {
  MODEL_BUDGET_CONFIG_DATA = null;
}

function getModelBudgetRoutingForUi() {
  const cfg = loadModelBudgetConfig();
  const r = cfg.routing || {};
  return {
    prefer_free: r.prefer_free !== false,
    free_models: Array.isArray(r.free_models) ? r.free_models.slice(0, 8) : [...CHAT_FREE_LAST_RESORT],
    paid_minor: String(r.paid_minor || "deepseek/deepseek-v4-flash"),
    paid_mid: String(r.paid_mid || "z-ai/glm-5.2"),
    paid_models_ops: Array.isArray(r.paid_models_ops)
      ? r.paid_models_ops.filter((m) => m && !CHAT_SUNSET_MODELS.has(String(m))).slice(0, 12)
      : [],
    config_path: "agents/model-budget/config.json",
  };
}

/** Cursor CLI lane — paid, explicit pick only; never in free-first failover chains. */
function isCursorChatModelId(id) {
  return /^cursor:/i.test(String(id || "").trim());
}

/** OpenRouter uses `:free`; ZenMux free slugs use a `-free` suffix (e.g. kimi-k3-free). */
function isChatFreeModelId(id) {
  const s = String(id || "").trim();
  if (!s || CHAT_SUNSET_MODELS.has(s) || isCursorChatModelId(s)) return false;
  if (s.includes(":free")) return true;
  const afterProvider = s.includes(":") ? s.slice(s.indexOf(":") + 1) : s;
  const leaf = afterProvider.split("/").pop() || "";
  return /-free$/i.test(leaf);
}

function saveModelBudgetRouting(patch = {}) {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(MODEL_BUDGET_CONFIG, "utf8"));
  } catch (err) {
    throw new Error(`model_budget_read_failed:${err.message || err}`);
  }
  if (!cfg.routing || typeof cfg.routing !== "object") cfg.routing = {};
  const allowed = allowedChatModelIds();
  if (typeof patch.prefer_free === "boolean") {
    cfg.routing.prefer_free = patch.prefer_free;
  }
  if (Array.isArray(patch.free_models)) {
    const next = [];
    for (const raw of patch.free_models) {
      const id = String(raw || "").trim();
      if (!id || CHAT_SUNSET_MODELS.has(id) || !isChatFreeModelId(id)) continue;
      if (!allowed.has(id) && !CHAT_FREE_LAST_RESORT.includes(id)) continue;
      if (!next.includes(id)) next.push(id);
      if (next.length >= 6) break;
    }
    if (!next.length) throw new Error("free_models_empty");
    cfg.routing.free_models = next;
  }
  if (patch.paid_minor != null) {
    const id = String(patch.paid_minor || "").trim();
    if (!id || isChatFreeModelId(id) || CHAT_SUNSET_MODELS.has(id) || !allowed.has(id)) {
      throw new Error("bad_paid_minor");
    }
    cfg.routing.paid_minor = id;
  }
  if (patch.paid_mid != null) {
    const id = String(patch.paid_mid || "").trim();
    if (!id || isChatFreeModelId(id) || CHAT_SUNSET_MODELS.has(id) || !allowed.has(id)) {
      throw new Error("bad_paid_mid");
    }
    cfg.routing.paid_mid = id;
  }
  const bak = `${MODEL_BUDGET_CONFIG}.bak.${Date.now()}`;
  try {
    fs.copyFileSync(MODEL_BUDGET_CONFIG, bak);
  } catch {
    /* non-fatal */
  }
  fs.writeFileSync(MODEL_BUDGET_CONFIG, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
  invalidateModelBudgetConfigCache();
  loadModelBudgetConfig();
  return getModelBudgetRoutingForUi();
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

/** Paid ops models only — never free (OpenRouter :free or ZenMux -free); free chain is separate / free-first. */
function getChatPaidModelChain(preferredProfile = "think") {
  const reg = loadHermesModelRegistry();
  const models = [];
  const add = (m) => {
    const id = String(m || "").trim();
    if (!id || isChatFreeModelId(id) || CHAT_SUNSET_MODELS.has(id) || models.includes(id)) return;
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

/** Keep preferred order; park rate-limited / all-fail models at the end for the day. */
function orderChatChainPreferConfig(models, isFree) {
  const usage = readChatModelUsage();
  const soft = [];
  const hot = [];
  for (const id of models) {
    if (!id || CHAT_SUNSET_MODELS.has(id)) continue;
    const r = usage.models[id] || {};
    const hotToday =
      (r.rate_limit || 0) > 0 ||
      (r.daily_limit || 0) > 0 ||
      ((r.fail || 0) + (r.moderation || 0) > 0 && (r.ok || 0) === 0);
    (hotToday ? hot : soft).push(id);
  }
  return [...soft, ...sortChatModelsByUsage(hot, isFree)];
}

/**
 * Paid cascade after free fails.
 * Paid order (2026-07-24): DeepSeek head, then GLM 5.2 as DeepSeek's backup, then quality.
 * Step 3.7 Flash is in CHAT_SUNSET_MODELS — never selected.
 */
function getChatPaidFailoverChain(preferredProfile = "think", responseMode = "brief") {
  const budget = loadModelBudgetConfig();
  const reg = loadHermesModelRegistry();
  const minorId =
    reg.chat_paid_minor || budget.routing?.paid_minor || CHAT_DEEPSEEK_MINOR;
  const midId = reg.chat_paid_mid || budget.routing?.paid_mid || CHAT_PAID_MID;
  const models = [];
  const add = (m) => {
    const id = String(m || "").trim();
    if (!id || isChatFreeModelId(id) || CHAT_SUNSET_MODELS.has(id) || models.includes(id)) return;
    models.push(id);
  };
  const minor = responseMode !== "workshop";
  if (minor) {
    add(minorId);
    add(midId);
  } else {
    add(midId);
    add(minorId);
  }
  for (const m of budget.routing?.paid_models_quality || []) add(m);
  const prof = VALID_PROFILES.has(preferredProfile) ? preferredProfile : "think";
  for (const m of reg.profiles?.[prof]?.chain || []) add(m);
  for (const m of CHAT_PAID_MODEL_FALLBACK) add(m);
  for (const p of CHAT_PROFILE_CHAIN) {
    for (const m of reg.profiles?.[p]?.chain || []) add(m);
  }
  add(CHAT_VENICE_LAST_RESORT);
  const fallback = [minorId, midId, ...CHAT_PAID_MODEL_FALLBACK, CHAT_VENICE_LAST_RESORT];
  return orderChatChainPreferConfig(models.length ? models : fallback, false);
}

/** @deprecated name — paid failover; use getChatPaidFailoverChain */
function getChatRefusalFailoverChain(preferredProfile = "think", responseMode = "brief") {
  return getChatPaidFailoverChain(preferredProfile, responseMode);
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

function recordChatModelUsage(modelId, outcome, meta = null) {
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
      last_work: null,
      last_mode: null,
    };
  }
  const row = data.models[id];
  row.attempts = (row.attempts || 0) + 1;
  row.last_used = Date.now();
  if (meta && typeof meta === "object") {
    if (meta.work) row.last_work = String(meta.work).trim().slice(0, 160);
    if (meta.mode) row.last_mode = String(meta.mode).trim().slice(0, 40);
  }
  if (outcome === "ok") row.ok = (row.ok || 0) + 1;
  else if (outcome === "daily_limit") row.daily_limit = (row.daily_limit || 0) + 1;
  else if (outcome === "moderation") row.moderation = (row.moderation || 0) + 1;
  else if (outcome === "rate_limit") row.rate_limit = (row.rate_limit || 0) + 1;
  else row.fail = (row.fail || 0) + 1;
  // Keep a short recent trail for Hub insight (what was attempted).
  if (!Array.isArray(data.recent)) data.recent = [];
  data.recent.unshift({
    at: new Date().toISOString(),
    model: id,
    outcome: String(outcome || "fail"),
    work: row.last_work || null,
    mode: row.last_mode || null,
  });
  data.recent = data.recent.slice(0, 24);
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
      const lane = isChatFreeModelId(id) ? "free_ok" : "paid_ok";
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

/** Free models only — free-first head (or last resort if prefer_free is false). */
function getChatFreeFailoverChain() {
  const budget = loadModelBudgetConfig();
  const reg = loadHermesModelRegistry();
  const models = [];
  const add = (m) => {
    const id = String(m || "").trim();
    if (!id || !isChatFreeModelId(id) || models.includes(id)) return;
    models.push(id);
  };
  for (const m of budget.routing?.free_models || []) add(m);
  for (const m of reg.chat_free_models || []) add(m);
  for (const m of reg.chat_free_last_resort || []) add(m);
  for (const m of reg.profiles?.fast?.chain || []) add(m);
  for (const m of CHAT_FREE_LAST_RESORT) add(m);
  return orderChatChainPreferConfig(
    models.length ? models : [...CHAT_FREE_LAST_RESORT],
    true
  );
}

function chatModelUsageSummary() {
  const data = readChatModelUsage();
  const rows = Object.entries(data.models || {}).map(([id, row]) => ({
    id,
    attempts: row.attempts || 0,
    ok: row.ok || 0,
    fail: row.fail || 0,
    rate_limit: row.rate_limit || 0,
    daily_limit: row.daily_limit || 0,
    moderation: row.moderation || 0,
    last_used: row.last_used || 0,
    last_work: row.last_work || null,
    last_mode: row.last_mode || null,
    free: isChatFreeModelId(id),
    cursor: isCursorChatModelId(id),
  }));
  rows.sort((a, b) => b.attempts - a.attempts);
  return {
    day: data.day,
    models: rows.slice(0, 16),
    recent: Array.isArray(data.recent) ? data.recent.slice(0, 12) : [],
  };
}

function loadChatModes() {
  if (CHAT_MODES_DATA) return CHAT_MODES_DATA;
  try {
    CHAT_MODES_DATA = JSON.parse(fs.readFileSync(CHAT_MODES_FILE, "utf8"));
  } catch {
    CHAT_MODES_DATA = {
      default_mode: "brief-rp",
      modes: [
        {
          id: "brief-rp",
          label: "Brief RP",
          profile: "chat",
          response_mode: "brief",
          show_model_picker: true,
          routing: "free_first",
        },
        {
          id: "workshop",
          label: "Workshop",
          profile: "chat",
          response_mode: "workshop",
          show_model_picker: true,
          routing: "free_first",
        },
        {
          id: "meta-ops",
          label: "Meta ops",
          profile: "meta",
          response_mode: "brief",
          show_model_picker: true,
          routing: "free_first",
        },
        {
          id: "agent-coding",
          label: "Agent coding",
          profile: "code",
          response_mode: "workshop",
          show_model_picker: true,
          routing: "cursor_default",
          default_model: "cursor:auto",
          cursor_on_free_fail: true,
        },
      ],
    };
  }
  return CHAT_MODES_DATA;
}

function getChatMode(modeId) {
  const data = loadChatModes();
  const modes = Array.isArray(data.modes) ? data.modes : [];
  const id = String(modeId || data.default_mode || "brief-rp").trim();
  return modes.find((m) => m && m.id === id) || modes[0] || null;
}

function resolveChatModeSettings(modeId, body = {}) {
  const mode = getChatMode(modeId);
  const profile = resolveChatProfile(
    body.context || null,
    body.profile || (mode && mode.profile) || "think"
  );
  const responseMode =
    body.response_mode === "workshop" || body.response_mode === "brief"
      ? body.response_mode
      : mode && mode.response_mode === "workshop"
        ? "workshop"
        : "brief";
  return {
    mode,
    chatModeId: mode ? mode.id : "brief-rp",
    profile,
    responseMode,
    showModelPicker: !!(mode && mode.show_model_picker),
  };
}

function loadChatCatalog() {
  // Reload when file mtime changes — catalog is often scp'd without a full restart.
  try {
    const st = fs.statSync(CHAT_CATALOG_FILE);
    if (CHAT_CATALOG_DATA && st.mtimeMs === CHAT_CATALOG_MTIME) return CHAT_CATALOG_DATA;
    CHAT_CATALOG_DATA = JSON.parse(fs.readFileSync(CHAT_CATALOG_FILE, "utf8"));
    CHAT_CATALOG_MTIME = st.mtimeMs;
  } catch {
    CHAT_CATALOG_DATA = { estimated: true, models: [] };
    CHAT_CATALOG_MTIME = 0;
  }
  return CHAT_CATALOG_DATA;
}

/** Merge curated catalog with today's usage — skip offline; mark degraded on hard fails. */
function getChatCatalogForUi() {
  const catalog = loadChatCatalog();
  const usage = readChatModelUsage();
  const models = [];
  const seen = new Set();
  for (const row of catalog.models || []) {
    if (!row || !row.id) continue;
    if (row.status === "offline") continue;
    if (CHAT_SUNSET_MODELS.has(String(row.id))) continue;
    const u = usage.models && usage.models[row.id];
    let status = row.status || "online";
    if (u) {
      const fails = (u.fail || 0) + (u.daily_limit || 0) + (u.rate_limit || 0);
      const oks = u.ok || 0;
      if (fails >= 3 && oks === 0) status = "degraded";
      else if ((u.daily_limit || 0) >= 1 && oks === 0) status = "degraded";
    }
    seen.add(row.id);
    models.push({
      id: row.id,
      label: row.label || row.id,
      tier: row.tier || (isChatFreeModelId(row.id) ? "free" : "paid"),
      relative_cost_in: row.relative_cost_in,
      relative_cost_out: row.relative_cost_out,
      tokens_per_sec_est: row.tokens_per_sec_est,
      status,
      note: row.note || "",
      estimated: true,
    });
  }
  // Stale/clobbered chat-catalog.json often only has sunset free ids → 0 free rows → empty Hub Free dropdowns.
  // Inject live free-first heads from routing + last-resort so Free head/fallback never render blank.
  const freeCount = models.filter((m) => m.tier === "free").length;
  if (freeCount === 0) {
    const cfg = loadModelBudgetConfig();
    const fromRouting = Array.isArray(cfg.routing?.free_models) ? cfg.routing.free_models : [];
    for (const id of [...fromRouting, ...CHAT_FREE_LAST_RESORT]) {
      const mid = String(id || "").trim();
      if (!mid || seen.has(mid) || CHAT_SUNSET_MODELS.has(mid) || !isChatFreeModelId(mid)) continue;
      seen.add(mid);
      models.unshift({
        id: mid,
        label: CHAT_FREE_FALLBACK_LABELS[mid] || mid,
        tier: "free",
        relative_cost_in: 0,
        relative_cost_out: 0,
        tokens_per_sec_est: null,
        status: "online",
        note: "injected — catalog missing live free rows",
        estimated: true,
      });
    }
  }
  return {
    estimated: true,
    relative_cost_unit: catalog.relative_cost_unit || "relative vs DeepSeek flash = 1.0",
    models,
    modes: loadChatModes(),
  };
}

function allowedChatModelIds() {
  const ids = new Set();
  for (const m of getChatCatalogForUi().models || []) {
    if (m.status !== "offline") ids.add(m.id);
  }
  for (const m of CHAT_FREE_LAST_RESORT) ids.add(m);
  for (const m of CHAT_PAID_MODEL_FALLBACK) ids.add(m);
  ids.add(CHAT_VENICE_LAST_RESORT);
  return ids;
}

function resolvePreferredChatModel(raw) {
  const id = String(raw || "").trim();
  if (!id || id === "auto") return null;
  if (!allowedChatModelIds().has(id)) return null;
  return id;
}

function createChatOffloadTask(payload = {}) {
  const message = String(payload.message || "").trim().slice(0, 4000);
  if (!message) throw new Error("empty_message");
  const threadId = String(payload.thread_id || "").trim() || null;
  const thread = threadId ? readChatThread(threadId) : null;
  const mode = getChatMode(payload.chat_mode || thread?.chat_mode);
  const ctx = {
    ...(thread?.context || {}),
    ...(payload.context && typeof payload.context === "object" ? payload.context : {}),
  };
  const campaign =
    (ctx.campaign && CAMPAIGNS[ctx.campaign] ? ctx.campaign : null) ||
    (payload.context?.campaign && CAMPAIGNS[payload.context.campaign]
      ? payload.context.campaign
      : null);
  const layer = ctx.layer || null;
  const threadTitle = thread?.title || null;
  const modeLabel = (mode && mode.label) || payload.chat_mode || thread?.chat_mode || "n/a";
  const excerpt = thread ? chatThreadExcerpt(thread, 6) : "";
  const titleBase = message.replace(/[\r\n]+/g, " ").slice(0, 80);
  const title = `[ops]/load] ${titleBase}`.slice(0, 300);
  const body = buildOffloadTaskBody({
    message,
    modeLabel,
    chatModeId: mode?.id || payload.chat_mode || null,
    threadId: thread ? threadId : null,
    threadTitle,
    campaign,
    layer,
    excerpt,
  });
  const result = createUserTask({
    title,
    body,
    tags: ["offload", "laptop", "dashboard"],
    project_id: "linuxbox",
    context: {
      campaign,
      chat_thread_id: thread ? threadId : null,
    },
  });
  const ledgerLine = buildOffloadLedgerLine({
    taskId: result.task?.id,
    threadId: thread ? threadId : null,
    threadTitle,
    messagePreview: titleBase,
    modeLabel,
    campaign,
    layer,
  });
  const ledger = appendGroupchatRecentActivity(REPO, ledgerLine);
  return {
    ...result,
    ledger: {
      ok: !!ledger.ok,
      error: ledger.error || null,
      line: ledgerLine,
      thread_file: threadRelPath(thread ? threadId : null),
    },
  };
}

function resolveChatProfile(context, requested) {
  const req = VALID_PROFILES.has(requested) ? requested : CHAT_HERMES_PROFILE;
  if (req === "fast") return CHAT_HERMES_PROFILE;
  // Legacy threads/modes stored profile=think — route to chat so OpenRouter failover works when think→Bonsai.
  if (req === "think") return CHAT_HERMES_PROFILE;
  if (context?.campaign && CAMPAIGNS[context.campaign]) return CHAT_HERMES_PROFILE;
  return req;
}

const SECURITY_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function readBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) {
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

/** Canonical { open, answered } — Hermes/agents sometimes write array or legacy shapes. */
function normalizeHumanInboxShape(parsed) {
  if (!parsed) return { open: [], answered: [] };
  if (Array.isArray(parsed)) {
    const open = [];
    const answered = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const ans = item.answer ?? item.decision ?? (item.reason && item.status === "answered" ? item.reason : null);
      const isAnswered = Boolean(item.answered_at || item.status === "answered" || ans);
      if (isAnswered) {
        answered.push({ ...item, answer: String(ans || item.answer || "").trim() || "(answered)" });
      } else {
        open.push(item);
      }
    }
    return { open, answered };
  }
  if (typeof parsed === "object") {
    if (Array.isArray(parsed.open) || Array.isArray(parsed.answered)) {
      return {
        open: Array.isArray(parsed.open) ? parsed.open : [],
        answered: Array.isArray(parsed.answered) ? parsed.answered : [],
      };
    }
    if (Array.isArray(parsed.questions)) {
      const open = [];
      const answered = [];
      for (const q of parsed.questions) {
        if (!q || typeof q !== "object") continue;
        if (q.status === "answered" || q.answer || q.answered_at) answered.push(q);
        else open.push(q);
      }
      return { open, answered };
    }
  }
  return { open: [], answered: [] };
}

function mergeHumanInboxCanon(a, b) {
  const answered = new Map();
  for (const q of [...(a.answered || []), ...(b.answered || [])]) {
    if (q && q.id) answered.set(q.id, q);
  }
  const openIds = new Set();
  const open = [];
  for (const q of [...(a.open || []), ...(b.open || [])]) {
    if (!q || !q.id || answered.has(q.id) || openIds.has(q.id)) continue;
    openIds.add(q.id);
    open.push(q);
  }
  return { open, answered: [...answered.values()] };
}

function ensureHumanInboxSymlink() {
  fs.mkdirSync(path.dirname(HUMAN_INBOX), { recursive: true });
  if (!fs.existsSync(HUMAN_INBOX_LEGACY)) {
    try {
      fs.symlinkSync("state/human-inbox.json", HUMAN_INBOX_LEGACY);
    } catch {
      /* race or perms */
    }
    return;
  }
  try {
    const st = fs.lstatSync(HUMAN_INBOX_LEGACY);
    if (st.isSymbolicLink()) return;
    if (!st.isFile()) return;
    const leg = normalizeHumanInboxShape(JSON.parse(fs.readFileSync(HUMAN_INBOX_LEGACY, "utf8")));
    let canon = { open: [], answered: [] };
    if (fs.existsSync(HUMAN_INBOX)) {
      canon = normalizeHumanInboxShape(JSON.parse(fs.readFileSync(HUMAN_INBOX, "utf8")));
    }
    writeHumanInbox(mergeHumanInboxCanon(canon, leg));
    const bak = `${HUMAN_INBOX_LEGACY}.bak-${Date.now()}`;
    fs.renameSync(HUMAN_INBOX_LEGACY, bak);
    fs.symlinkSync("state/human-inbox.json", HUMAN_INBOX_LEGACY);
  } catch {
    /* best-effort */
  }
}

function ensureHumanInboxMigrated() {
  ensureHumanInboxSymlink();
  fs.mkdirSync(path.dirname(HUMAN_INBOX), { recursive: true });
  if (fs.existsSync(HUMAN_INBOX)) return;
  if (!fs.existsSync(HUMAN_INBOX_LEGACY)) return;
  try {
    const data = normalizeHumanInboxShape(JSON.parse(fs.readFileSync(HUMAN_INBOX_LEGACY, "utf8")));
    const hasData = (data.open || []).length > 0 || (data.answered || []).length > 0;
    if (hasData) writeHumanInbox(data);
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
    const parsed = JSON.parse(fs.readFileSync(HUMAN_INBOX, "utf8"));
    const normalized = normalizeHumanInboxShape(parsed);
    const needsRepair =
      Array.isArray(parsed) ||
      !Array.isArray(parsed.open) ||
      !Array.isArray(parsed.answered);
    if (needsRepair) writeHumanInbox(normalized);
    return reviveContextRequests(normalized);
  } catch {
    return { open: [], answered: [] };
  }
}

function readHumanInbox() {
  return mergeInboxSeeds(readHumanInboxRaw());
}

/** Consumed watermark IDs — survive answered[] truncation (slice cap) so seeds cannot re-open. */
function readInboxConsumedIds() {
  const fp = path.join(REPO, "agents", "state", "inbox-consumed.json");
  if (!fs.existsSync(fp)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    const consumed = data && typeof data.consumed === "object" ? data.consumed : {};
    return new Set(Object.keys(consumed).filter(Boolean));
  } catch {
    return new Set();
  }
}

/** Ponytail: seeds are read-only canon questions — show until answered by id (or same question text). */
function mergeInboxSeeds(data) {
  const answeredIds = new Set((data.answered || []).map((q) => q.id).filter(Boolean));
  for (const id of readInboxConsumedIds()) answeredIds.add(id);
  const seeds = readInboxSeeds();
  const seedIds = new Set(seeds.map((s) => s.id).filter(Boolean));
  const seedQuestions = new Set(seeds.map((s) => inboxNormQuestion(s.question)).filter(Boolean));
  const answeredSeedQuestions = new Set();
  for (const q of data.answered || []) {
    const nq = inboxNormQuestion(q.question);
    if (nq && (seedIds.has(q.id) || seedQuestions.has(nq))) answeredSeedQuestions.add(nq);
  }
  // Seed question text for consumed-only IDs (answered[] may have dropped them).
  for (const seed of seeds) {
    if (seed.id && answeredIds.has(seed.id)) {
      const nq = inboxNormQuestion(seed.question);
      if (nq) answeredSeedQuestions.add(nq);
    }
  }
  const merged = {
    open: dedupeInboxOpen(data.open || []),
    answered: data.answered || [],
  };
  // Drop ad-hoc open copies of already-answered *seed* topics (id drift / pod re-ask).
  // Do not text-collapse distinct incident ids (e.g. runtime-verify-YYYYMMDD).
  merged.open = merged.open.filter((q) => {
    if (q.id && answeredIds.has(q.id)) return false;
    const nq = inboxNormQuestion(q.question);
    if (nq && answeredSeedQuestions.has(nq) && (!q.id || seedIds.has(q.id))) return false;
    return true;
  });
  for (const seed of seeds) {
    if (!seed.id || answeredIds.has(seed.id)) continue;
    if (answeredSeedQuestions.has(inboxNormQuestion(seed.question))) continue;
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
  // Cap bulk history but never drop seed / consumed IDs — truncation was re-opening seeds.
  const seedIds = new Set(readInboxSeeds().map((s) => s.id).filter(Boolean));
  const consumedIds = readInboxConsumedIds();
  const head = raw.answered.slice(0, 50);
  const headIds = new Set(head.map((q) => q && q.id).filter(Boolean));
  for (const q of raw.answered.slice(50)) {
    if (!q || !q.id) continue;
    if ((seedIds.has(q.id) || consumedIds.has(q.id)) && !headIds.has(q.id)) {
      head.push(q);
      headIds.add(q.id);
    }
  }
  raw.answered = head;
  writeHumanInbox(raw);
  return { ok: true, id, answer: clean };
}

function readLaneHeartbeat(filename) {
  const stamp = path.join(REPO, "agents", "state", filename);
  if (!fs.existsSync(stamp)) return null;
  return fs.readFileSync(stamp, "utf8").trim() || null;
}

/** Deterministic sync (inbox/git/swarm) — runs at think-tick start; no LLM. */
function collectSyncLaneStatus(thinkCrontab) {
  const lastRun = readLaneHeartbeat("sync-tick.last");
  const active = !!(thinkCrontab && thinkCrontab.active);
  return { active, lastRun };
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
      .filter((l) => /^\s*[-*]\s*\[\s\]/.test(l)).length;
  } catch {
    return 0;
  }
}

/** Open work without recent think success — Systems/Hub health signal (free-first). */
function buildWorkPipeline() {
  const stallHours = Number(process.env.WORK_PIPELINE_STALL_HOURS || 6);
  const productBoards = [
    "agents/tableslop-progress.md",
    "agents/PIXI_RP_PROGRESS.md",
    "agents/portfolio-progress.md",
  ];
  const campaignBoards = [
    "campaigns/nyc-mafia-dnd/reports/progress.md",
    "campaigns/tropic-gooner/reports/progress.md",
    "campaigns/tropic-gooner/reports/progress-hunter.md",
  ];
  const otherBoards = [
    "agents/LINUXBOX_DASHBOARD_BACKLOG.md",
    "agents/maintenance-progress.md",
    "agents/system-integrity-progress.md",
    "agents/PONYTAIL_CLEANUP_BOARD.md",
    "agents/self-improvement-progress.md",
    "agents/research-studies-progress.md",
    "agents/nousagent-progress.md",
  ];
  const sum = (rels) => rels.reduce((n, r) => n + countUncheckedMd(r), 0);
  const open_product_boxes = sum(productBoards);
  const open_campaign_boxes = sum(campaignBoards);
  const open_other_progress_boxes = sum(otherBoards);
  const open_progress_boxes = open_product_boxes + open_campaign_boxes + open_other_progress_boxes;
  let open_user_tasks = 0;
  try {
    const store = readUserTasksStore();
    open_user_tasks = (store.tasks || []).filter((t) => t && t.status === "open").length;
  } catch {
    open_user_tasks = 0;
  }
  let think_paused = false;
  let think_pause_reason = "";
  try {
    const pp = path.join(REPO, "agents", "state", "think-paused.json");
    if (fs.existsSync(pp)) {
      const raw = JSON.parse(fs.readFileSync(pp, "utf8"));
      think_paused = raw && raw.paused === true;
      think_pause_reason = String(raw?.reason || "").slice(0, 200);
    }
  } catch {
    /* ignore */
  }
  let last_think_attempt_at = null;
  try {
    const lp = path.join(REPO, "agents", "state", "think-llm.last");
    if (fs.existsSync(lp)) {
      const raw = fs.readFileSync(lp, "utf8").trim();
      if (raw) last_think_attempt_at = new Date(raw).toISOString();
    }
  } catch {
    last_think_attempt_at = null;
  }
  let last_think_success_at = null;
  let last_think_status = null;
  try {
    const fp = path.join(REPO, "agents", "state", "think-focus.json");
    if (fs.existsSync(fp)) {
      const focus = JSON.parse(fs.readFileSync(fp, "utf8"));
      last_think_status = String(focus?.status || "") || null;
      const blurb = String(focus?.blurb || "");
      // Paid C8 path embeds free-cap words in the success blurb ("PAID C8 …"); that is
      // not a free-429 failure — do not treat it as fakeDone or Hub stays "stalled" forever.
      const paidC8Ok = /^PAID\s+C8\b/i.test(blurb);
      const fakeDone =
        !paidC8Ok &&
        /HTTP\s*429|free-models-per-day|Rate limit exceeded|API call failed after/i.test(blurb);
      // Hermes often exits 0 on 429 and focus stays status=done — do not count as success.
      if (
        String(focus?.status || "").toLowerCase() === "done" &&
        focus?.updated_at &&
        !fakeDone
      ) {
        last_think_success_at = String(focus.updated_at);
      }
      if (fakeDone && String(focus?.status || "").toLowerCase() === "done") {
        last_think_status = "failed";
      }
    }
  } catch {
    /* ignore */
  }
  let free_429_blocked = false;
  let free_429_exhausted = false;
  let free_429_inbox_id = null;
  let free_429_reset_at = null;
  let paid_last_resort = false;
  let paid_last_resort_model = null;
  try {
    const f429 = path.join(REPO, "agents", "state", "think-free-429.json");
    if (fs.existsSync(f429)) {
      const st = JSON.parse(fs.readFileSync(f429, "utf8"));
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      // Prefer SoT swap list; fall back to legacy 3-id head if file missing.
      let chain = [
        "poolside/laguna-xs-2.1:free",
        "inclusionai/ling-3.0-flash:free",
        "nvidia/nemotron-3-super-120b-a12b:free",
      ];
      try {
        const swapPath = path.join(REPO, "agents", "model-budget", "think-free-swap.json");
        if (fs.existsSync(swapPath)) {
          const swap = JSON.parse(fs.readFileSync(swapPath, "utf8"));
          const ordered = Array.isArray(swap?.ordered) ? swap.ordered.filter((m) => typeof m === "string" && m) : [];
          if (ordered.length) chain = ordered;
        }
      } catch {
        /* keep fallback chain */
      }
      const blocked = Array.isArray(st?.models_429) ? st.models_429 : [];
      free_429_exhausted = st?.day === day && chain.length > 0 && chain.every((m) => blocked.includes(m));
      paid_last_resort = !!(st?.paid_last_resort === true || st?.paid_last_resort === "true");
      paid_last_resort_model =
        (typeof st?.paid_model === "string" && st.paid_model.trim()) ||
        "deepseek/deepseek-v4-flash";
      // Hub "blocked" = Hermes skipped. Paid last-resort means ticks still run — not blocked.
      free_429_blocked = free_429_exhausted && !paid_last_resort;
      free_429_inbox_id = st?.inbox_id || null;
      free_429_reset_at = st?.reset_at || null;
    }
  } catch {
    /* ignore */
  }
  const now = Date.now();
  let last_think_success_age_hours = null;
  if (last_think_success_at) {
    const t = Date.parse(last_think_success_at);
    if (Number.isFinite(t)) last_think_success_age_hours = Math.round(((now - t) / 3600000) * 10) / 10;
  }
  const open_total = open_user_tasks + open_progress_boxes;
  const stalled =
    open_total > 0 &&
    (think_paused ||
      last_think_success_age_hours == null ||
      last_think_success_age_hours >= stallHours);
  return {
    open_user_tasks,
    open_progress_boxes,
    open_product_boxes,
    open_campaign_boxes,
    open_other_progress_boxes,
    last_think_attempt_at,
    last_think_success_at,
    last_think_success_age_hours,
    last_think_status,
    think_paused,
    think_pause_reason: think_paused ? think_pause_reason : "",
    free_429_blocked,
    free_429_exhausted,
    free_429_inbox_id,
    free_429_reset_at,
    paid_last_resort,
    paid_last_resort_model,
    stall_hours: stallHours,
    stalled: stalled || free_429_blocked,
    note: "stalled = open work and (think paused OR free-429 skip/blocked OR no real think success within stall_hours); paid_last_resort does not count as blocked",
  };
}

/** Human labels for pod ids (run-index often only has name=think + summary="pod think"). */
const POD_HUMAN = {
  fast: { label: "Sync · deterministic", kind: "tick", kind_label: "last sync" },
  sync: { label: "Sync · deterministic", kind: "tick", kind_label: "last sync" },
  think: { label: "Think / ops lane", kind: "tick", kind_label: "last think tick" },
  meta: { label: "Dashboard meta", kind: "meta", kind_label: "last meta work" },
  code: { label: "Code lane", kind: "ops", kind_label: "last code work" },
  "ponytail-cleanup": { label: "Ponytail cleanup", kind: "ops", kind_label: "last ponytail work" },
  "hunter-reckoning": { label: "Hunter: The Reckoning", kind: "campaign", kind_label: "last campaign work" },
  spacequest: { label: "SpaceQuest", kind: "campaign", kind_label: "last campaign work" },
  "nyc-mafia-dnd": { label: "NYC Mafia × D&D", kind: "campaign", kind_label: "last campaign work" },
  "tropic-gooner": { label: "Tropic Gooner", kind: "campaign", kind_label: "last campaign work" },
};

function stripMdLite(s) {
  return String(s || "")
    .replace(/\*\*/g, "")
    .replace(/`+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Latest think report blurb (archive or repo LATEST.md). */
function readThinkReportHead() {
  const paths = [
    path.join("/mnt/archive/logs/think-reports", "LATEST.md"),
    path.join(REPO, "reports", "think-ticks", "LATEST.md"),
  ];
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    try {
      const raw = fs.readFileSync(p, "utf8");
      const blurbM = raw.match(/\*\*blurb:\*\*\s*(.+)/i);
      const taskM = raw.match(/\*\*task_id:\*\*\s*`([^`]+)`/i);
      const exitM = raw.match(/\*\*exit:\*\*\s*(\S+)/);
      const blurb = blurbM ? stripMdLite(blurbM[1]) : "";
      const task_id = taskM && taskM[1] !== "—" ? taskM[1].trim() : null;
      if (blurb && blurb !== "—") {
        return {
          blurb: blurb.slice(0, 160),
          task_id,
          exit: exitM ? exitM[1] : null,
        };
      }
      const h1 = raw.match(/^#\s+(.+)/m);
      if (h1) {
        return { blurb: stripMdLite(h1[1]).slice(0, 160), task_id: null, exit: exitM ? exitM[1] : null };
      }
    } catch {
      /* try next path */
    }
  }
  return null;
}

/** Hub-facing last think outcome — think-focus.json then LATEST report. */
function readLastThinkSummary() {
  try {
    const fp = path.join(REPO, "agents", "state", "think-focus.json");
    if (fs.existsSync(fp)) {
      const f = JSON.parse(fs.readFileSync(fp, "utf8"));
      const status = String(f?.status || "");
      const blurbRaw = String(f?.blurb || "");
      const rateLimited = /HTTP\s*429|free-models-per-day|Rate limit exceeded|API call failed after/i.test(
        blurbRaw
      );
      const statusOut = rateLimited && status === "done" ? "failed" : status;
      const blurb = summarizeThinkBlurb(blurbRaw, f?.task_id, statusOut);
      if (blurb && blurb !== "think") {
        return {
          blurb: blurb.slice(0, 160),
          task_id: f?.task_id ? String(f.task_id).slice(0, 80) : null,
          status: statusOut || null,
          at: f?.updated_at || null,
        };
      }
    }
  } catch {
    /* fall through */
  }
  const rep = readThinkReportHead();
  if (rep?.blurb) {
    return {
      blurb: rep.blurb,
      task_id: rep.task_id || null,
      status: rep.exit === "0" ? "done" : rep.exit ? "failed" : null,
      at: null,
    };
  }
  return null;
}

/** Parse one think-shell-access-form markdown report. */
function parseThinkReportFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const endedM = raw.match(/\*\*ended:\*\*\s*(\S+)/i);
    const exitM = raw.match(/\*\*exit:\*\*\s*(\S+)/);
    const blurbM = raw.match(/\*\*blurb:\*\*\s*(.+)/i);
    const taskM = raw.match(/\*\*task_id:\*\*\s*`([^`]+)`/i);
    if (!endedM) return null;
    const endedMs = new Date(endedM[1]).getTime();
    if (!Number.isFinite(endedMs)) return null;
    const blurb = blurbM ? stripMdLite(blurbM[1]) : "";
    const exitRaw = exitM ? exitM[1] : null;
    const exitNum = exitRaw != null && exitRaw !== "—" ? Number(exitRaw) : null;
    return {
      ended: endedM[1],
      ended_ms: endedMs,
      exit: Number.isFinite(exitNum) ? exitNum : exitRaw,
      blurb: blurb.slice(0, 160),
      task_id: taskM && taskM[1] !== "—" ? taskM[1].trim() : null,
      path: filePath,
    };
  } catch {
    return null;
  }
}

/** Recent think reports (archive + repo fallback), newest ended first. */
function loadRecentThinkReports(limit = 48) {
  const roots = [
    path.join("/mnt/archive/logs/think-reports"),
    path.join(REPO, "reports", "think-ticks"),
  ];
  const files = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      const walk = (dir, depth) => {
        if (depth > 4 || files.length > limit * 3) return;
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) walk(full, depth + 1);
          else if (/\.md$/i.test(ent.name) && /form-\d{8}T/i.test(ent.name)) {
            try {
              files.push({ path: full, mtime: fs.statSync(full).mtimeMs });
            } catch {
              /* skip */
            }
          }
        }
      };
      walk(root, 0);
    } catch {
      /* skip root */
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  const out = [];
  const seen = new Set();
  for (const f of files) {
    if (out.length >= limit) break;
    const parsed = parseThinkReportFile(f.path);
    if (!parsed || seen.has(parsed.ended)) continue;
    seen.add(parsed.ended);
    out.push(parsed);
  }
  out.sort((a, b) => b.ended_ms - a.ended_ms);
  return out;
}

function matchByTimestamp(ts, rows, tsKey, maxDeltaMs = 360000) {
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t) || !rows?.length) return null;
  let best = null;
  let bestDelta = Infinity;
  for (const row of rows) {
    const ms = row[tsKey];
    if (!Number.isFinite(ms)) continue;
    const d = Math.abs(ms - t);
    if (d < bestDelta && d <= maxDeltaMs) {
      bestDelta = d;
      best = row;
    }
  }
  return best;
}

function thinkOutcomeLabel(exitVal) {
  if (exitVal === 0 || exitVal === "0") return "ok";
  if (exitVal === 124 || exitVal === -1) return "timeout";
  if (exitVal == null) return null;
  return `exit ${exitVal}`;
}

function formatThinkTickDetail(rep) {
  if (rep?.blurb) {
    const oc = thinkOutcomeLabel(rep.exit);
    return oc ? `${rep.blurb} · ${oc}`.slice(0, 120) : rep.blurb.slice(0, 120);
  }
  return "";
}

function resolveThinkPodDetail(pod, thinkReports, harnessRows, lastThinkSummary) {
  const stored =
    String(pod.detail || pod.blurb || "").trim() ||
    (pod.summary && !/^pod\s+/i.test(pod.summary) && pod.summary !== pod.name
      ? String(pod.summary).trim()
      : "");
  if (stored) return stripMdLite(stored).slice(0, 120);
  const rep = matchByTimestamp(pod.ts, thinkReports, "ended_ms");
  const fromReport = formatThinkTickDetail(rep);
  if (fromReport) return fromReport;
  const mh = matchThinkHarnessRow(pod.ts, harnessRows, 360000);
  if (mh?.blurb) {
    const oc = mh.outcome || thinkOutcomeLabel(mh.exit);
    return oc ? `${mh.blurb} · ${oc}`.slice(0, 120) : String(mh.blurb).slice(0, 120);
  }
  if (lastThinkSummary?.blurb && pod.ts && lastThinkSummary.at) {
    const d = Math.abs(new Date(pod.ts).getTime() - new Date(lastThinkSummary.at).getTime());
    if (d <= 360000) return lastThinkSummary.blurb.slice(0, 120);
  }
  return "";
}

function enrichPodRun(raw, detailHint) {
  const name = String(raw.name || "?").slice(0, 48);
  const meta = POD_HUMAN[name] || {
    label: name,
    kind: "ops",
    kind_label: `last ${name} run`,
  };
  const summary = String(raw.summary || "").slice(0, 140);
  const idle = !!raw.idle || /\bIDLE\b/i.test(summary) || String(raw.outcome || "").toLowerCase() === "idle";
  let outcome = String(raw.outcome || "").toLowerCase();
  if (!outcome) {
    if (idle) outcome = "idle";
    else if (raw.exit === -1 || raw.exit === 124) outcome = "fail";
    else if (raw.exit != null && raw.exit !== 0) outcome = "fail";
    else outcome = "ok";
  }
  const generic = !summary || /^pod\s+/i.test(summary) || summary === name;
  const rowBlurb = stripMdLite(raw.blurb || "").slice(0, 120);
  const detail = rowBlurb || stripMdLite(detailHint || (!generic ? summary : "")).slice(0, 120);
  return {
    name,
    label: meta.label,
    kind: meta.kind,
    kind_label: meta.kind_label,
    category: raw.category || "",
    ts: raw.ts || null,
    exit: raw.exit ?? null,
    summary,
    idle,
    outcome,
    detail,
    blurb: rowBlurb || null,
    task_id: raw.task_id ? String(raw.task_id).slice(0, 80) : null,
    meaningful: meta.kind !== "tick",
  };
}

/** Skip prompt templates like "End with … DONE: / BLOCKED: / IDLE:." (false Hub BLOCKED). */
function isThinkOutcomeTemplateLine(line) {
  const up = String(line || "").toUpperCase();
  return (
    sumCount(up, "DONE:") + sumCount(up, "BLOCKED:") + sumCount(up, "IDLE:") > 1 ||
    /END WITH EXACTLY ONE LINE:\s*DONE:/i.test(line || "")
  );
}

function sumCount(hay, needle) {
  let n = 0;
  let i = 0;
  const h = String(hay || "");
  const ndl = String(needle || "");
  if (!ndl) return 0;
  while ((i = h.indexOf(ndl, i)) !== -1) {
    n += 1;
    i += ndl.length;
  }
  return n;
}

/** Last real DONE:/BLOCKED:/IDLE: in log tail (mirrors think-shell-access-form._infer_outcome). */
function lastThinkOutcomeFromLogTail(tail) {
  const re = /^\s*(?:[*_`#>\-\s]*)?(DONE|BLOCKED|IDLE)\s*:\s*(.*)$/gim;
  let last = null;
  let m;
  while ((m = re.exec(String(tail || ""))) !== null) {
    const line = m[0];
    const rest = String(m[2] || "").trim();
    if (isThinkOutcomeTemplateLine(line)) continue;
    if (!rest || /^[./|\s\-]*$/.test(rest)) continue;
    last = { kind: m[1].toUpperCase(), rest };
  }
  return last;
}

/** Recent meta-harness think runs (newest first) — backfill when run-index lacks blurbs. */
function harnessBlurbFromRun(j) {
  const logPath = j.log_path ? String(j.log_path) : "";
  if (logPath && fs.existsSync(logPath)) {
    try {
      const raw = fs.readFileSync(logPath, "utf8");
      const tail = raw.slice(-12000);
      const outcome = lastThinkOutcomeFromLogTail(tail);
      if (outcome) {
        return stripMdLite(`${outcome.kind}: ${outcome.rest}`).slice(0, 120);
      }
      if (/HTTP\s*429|free-models-per-day/i.test(tail) && !/PAID\s+C8\b/i.test(tail)) {
        return "HTTP 429 free cap";
      }
      if (/PAID C8|PAID last-resort/i.test(tail)) {
        const lane = j.task_id ? String(j.task_id).replace(/^lane:/, "") : "think";
        return `PAID C8 · ${lane}`.slice(0, 120);
      }
    } catch {
      /* ignore */
    }
  }
  let blurb = j.task_id ? String(j.task_id).replace(/^lane:/, "") : "";
  if (j.model) blurb = `${blurb ? `${blurb} · ` : ""}${String(j.model).split("/").pop()}`.slice(0, 120);
  const score = j.score || {};
  if (score.detected_outcome) {
    blurb = `${blurb ? `${blurb} · ` : ""}${score.detected_outcome}`.slice(0, 120);
  }
  const exit = j.exit_code != null ? Number(j.exit_code) : null;
  return blurb || (exit === 0 ? "INTENT_OK" : exit === 124 ? "timeout" : exit != null ? `exit ${exit}` : "think");
}

function readThinkHarnessRecent(limit = 16) {
  const dir = path.join(REPO, "agents", "meta-harness", "runs", "think");
  if (!fs.existsSync(dir)) return [];
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const fp = path.join(dir, f);
        const st = fs.statSync(fp);
        return { fp, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, Math.max(limit, 24));
    const out = [];
    for (const { fp } of files) {
      try {
        const j = JSON.parse(fs.readFileSync(fp, "utf8"));
        const at = j.at || null;
        if (!at) continue;
        const exit = j.exit_code != null ? Number(j.exit_code) : null;
        const blurb = harnessBlurbFromRun(j);
        out.push({
          at,
          ts: at,
          exit,
          task_id: j.task_id ? String(j.task_id).slice(0, 80) : null,
          blurb: blurb || (exit === 0 ? "INTENT_OK" : exit === 124 ? "timeout" : `exit ${exit}`),
          outcome: exit === 0 ? "ok" : exit === 124 ? "timeout" : "fail",
          intent: j.intent || null,
        });
      } catch {
        /* skip bad file */
      }
    }
    return out.slice(0, limit);
  } catch {
    return [];
  }
}

/** Per-pod meta-harness scores for the Hub Meta tab (read-only; trend oldest->newest). */
function readMetaHarnessPods(trendLimit = 5) {
  const root = path.join(REPO, "agents", "meta-harness", "runs");
  if (!fs.existsSync(root)) return [];
  let podDirs = [];
  try {
    podDirs = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
  const pods = [];
  for (const pod of podDirs) {
    const dir = path.join(root, pod);
    let files = [];
    try {
      files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort();
    } catch {
      continue;
    }
    if (!files.length) continue;
    const runs = [];
    for (const f of files.slice(-Math.max(trendLimit, 8))) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        const at = j.at || null;
        if (!at) continue;
        const score = j.score || {};
        runs.push({
          at,
          total: score.total ?? null,
          outcome: score.detected_outcome || null,
          intent: j.intent || null,
          exit: j.exit_code != null ? Number(j.exit_code) : null,
          task_id: j.task_id ? String(j.task_id).slice(0, 80) : null,
          model: j.model ? String(j.model) : null,
        });
      } catch {
        /* skip bad file */
      }
    }
    if (!runs.length) continue;
    runs.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    pods.push({ pod, latest: runs[runs.length - 1], trend: runs.slice(-trendLimit), run_count: files.length });
  }
  return pods;
}

function matchThinkHarnessRow(podTs, harnessRows, windowMs = 300000) {
  if (!podTs || !harnessRows?.length) return null;
  const t = Date.parse(podTs);
  if (!Number.isFinite(t)) return null;
  let best = null;
  let bestDelta = windowMs + 1;
  for (const h of harnessRows) {
    const ht = Date.parse(h.at || h.ts || "");
    if (!Number.isFinite(ht)) continue;
    const delta = Math.abs(ht - t);
    if (delta <= windowMs && delta < bestDelta) {
      best = h;
      bestDelta = delta;
    }
  }
  return best;
}

/** Recent pod/lane ticks from run-index (newest first). */
function readRecentPodRuns(limit = 8) {
  const runIndex = path.join(REPO, "agents", "state", "run-index.jsonl");
  if (!fs.existsSync(runIndex)) return [];
  try {
    const lines = fs.readFileSync(runIndex, "utf8").trim().split("\n").filter(Boolean).slice(-Math.max(limit, 40));
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
          blurb: j.blurb ? String(j.blurb).slice(0, 240) : null,
          detail: j.detail ? String(j.detail).slice(0, 240) : j.blurb ? String(j.blurb).slice(0, 240) : null,
          task_id: j.task_id ? String(j.task_id).slice(0, 80) : null,
          outcome: j.outcome ? String(j.outcome).slice(0, 32) : null,
        });
      } catch {
        /* skip bad line */
      }
    }
    return out.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Hub "Last run": prefer recent meaningful work; else latest tick with clear label.
 * detail hints from CURRENT_TASK / meta backlog / campaign next — run-index summaries are often empty.
 */
function buildLastRun(pods, hints) {
  const h = hints || {};
  const detailFor = (p) => {
    if (!p) return "";
    if (p.name === "think" || p.name === "meta") {
      return h.meta_next || h.task_status || "";
    }
    if (POD_HUMAN[p.name]?.kind === "campaign") {
      return (h.campaign_next && h.campaign_next[p.name]) || "";
    }
    return "";
  };
  const enriched = (pods || []).map((p) => enrichPodRun(p, detailFor(p)));
  const latest = enriched[0] || null;
  const meaningful = enriched.find((p) => p.meaningful) || null;
  const primary =
    meaningful && latest && !latest.meaningful
      ? meaningful
      : latest;
  return {
    primary,
    latest,
    meaningful,
    preferred_meaningful: !!(primary && primary.meaningful && latest && !latest.meaningful),
  };
}

/** Meta tab: backlog + last done + smoke — no parallel log store. */
function readMetaLaneSummary() {
  const backlogPath = "agents/LINUXBOX_DASHBOARD_BACKLOG.md";
  const taskPath = "agents/LINUXBOX_DASHBOARD_TASK.md";
  const smokePath = path.join(REPO, "reports", "dashboard-ui-smoke", "latest.json");
  let open = [];
  let lastDone = null;
  if (fs.existsSync(DASHBOARD_BACKLOG)) {
    try {
      const raw = fs.readFileSync(DASHBOARD_BACKLOG, "utf8");
      open = raw
        .split("\n")
        .filter((l) => /^- \[ \]/.test(l))
        .map((l) => l.replace(/^- \[ \] /, "").trim())
        .filter(Boolean);
      const doneIdx = raw.search(/\n## Done\b/);
      const doneBlock = doneIdx >= 0 ? raw.slice(doneIdx) : raw;
      for (const line of doneBlock.split("\n")) {
        if (!/^- \[x\]/i.test(line)) continue;
        const text = line.replace(/^- \[x\]\s*/i, "").trim();
        const dateM = text.match(/(\d{4}-\d{2}-\d{2})\s*$/);
        lastDone = {
          text: text.replace(/\s*[—–-]\s*\d{4}-\d{2}-\d{2}\s*$/, "").slice(0, 140),
          date: dateM ? dateM[1] : null,
        };
        break;
      }
    } catch {
      /* ignore */
    }
  }

  let smoke = null;
  if (fs.existsSync(smokePath)) {
    try {
      const j = JSON.parse(fs.readFileSync(smokePath, "utf8"));
      smoke = {
        date: j.date || null,
        failed: j.failed ?? null,
        warned: j.warned ?? null,
        passed: j.passed ?? null,
        path: "reports/dashboard-ui-smoke/latest.json",
      };
    } catch {
      smoke = { path: "reports/dashboard-ui-smoke/latest.json" };
    }
  }

  const pods = readRecentPodRuns(24);
  const metaRunRaw =
    pods.find((p) => /meta|dashboard|smoke/i.test(`${p.name} ${p.category} ${p.summary}`)) ||
    null;
  const metaRun = metaRunRaw
    ? enrichPodRun(metaRunRaw, open[0] || lastDone?.text || "")
    : null;
  const lastThink = readLastThinkSummary();
  const lastThinkReport = loadRecentThinkReports(1)[0] || null;
  const lastThinkRun = lastThinkReport
    ? {
        what: lastThinkReport.blurb,
        when: lastThinkReport.ended,
        outcome: thinkOutcomeLabel(lastThinkReport.exit) || "ok",
        task_id: lastThinkReport.task_id || null,
        report_path: lastThinkReport.path,
      }
    : lastThink
      ? {
          what: lastThink.blurb,
          when: lastThink.at,
          outcome: lastThink.status || "ok",
          task_id: lastThink.task_id || null,
        }
      : null;

  return {
    blurb:
      "Dashboard self-improvement lane: think/meta picks one Open backlog item → implement → verify (:8790 / smoke) → mark Done.",
    open_count: open.length,
    next_item: open[0] || null,
    open_preview: open.slice(0, 6),
    last_done: lastDone,
    last_meta_run: metaRun,
    last_think_run: lastThink
      ? {
          what: lastThink.blurb,
          when: lastThink.at,
          outcome: lastThink.status || (lastThink.task_id ? "done" : "ok"),
          task_id: lastThink.task_id || null,
        }
      : null,
    smoke,
    backlog_path: backlogPath,
    task_path: taskPath,
    update_gate: "scripts/linuxbox/safe-update-check.sh (SAFE before upgrades)",
    update_targets: "agents/update-targets.json",
  };
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
    const blurb = cur.blurb != null ? String(cur.blurb).trim().slice(0, 200) : "";
    return {
      name: String(cur.name).slice(0, 48),
      started_at: new Date(startedSec * 1000).toISOString(),
      elapsed_ms: Math.round(ageSec * 1000),
      kind: cur.name === "fast" || cur.name === "think" ? "tick" : "pod",
      blurb: blurb || null,
    };
  } catch {
    return null;
  }
}

/** Last finished pod tick blurb (Concrete step / IDLE) — Hub when nothing in-flight. */
function readLastCompletedPod() {
  const p = path.join(REPO, "agents", "state", "pod-scheduler.json");
  if (!fs.existsSync(p)) return null;
  try {
    const state = JSON.parse(fs.readFileSync(p, "utf8"));
    const lc = state.last_completed;
    if (!lc || typeof lc !== "object" || !lc.name) return null;
    const at = lc.at ? String(lc.at) : null;
    if (at) {
      const ageMs = Date.now() - new Date(at).getTime();
      // Drop after 6h so stale blurbs don't look live
      if (Number.isFinite(ageMs) && ageMs > 6 * 3600 * 1000) return null;
    }
    return {
      name: String(lc.name).slice(0, 48),
      blurb: lc.blurb != null ? String(lc.blurb).trim().slice(0, 200) : null,
      at,
      exit: lc.exit != null ? Number(lc.exit) : null,
      intent_ok: lc.intent_ok !== false,
    };
  } catch {
    return null;
  }
}

/** Tail of think tick stdout for Hub live window (agents/runs/think-last.log). */
function readThinkLiveLog(maxBytes = 28000) {
  const p = path.join(REPO, "agents", "runs", "think-last.log");
  if (!fs.existsSync(p)) return { text: "", mtime: null, bytes: 0 };
  try {
    const st = fs.statSync(p);
    const size = st.size;
    const start = Math.max(0, size - maxBytes);
    const len = size - start;
    const fd = fs.openSync(p, "r");
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    fs.closeSync(fd);
    // Strip ANSI / spinner junk for a readable Hub pane
    const text = buf
      .toString("utf8")
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
      .replace(/\r/g, "");
    return {
      text,
      mtime: st.mtime.toISOString(),
      bytes: size,
    };
  } catch {
    return { text: "", mtime: null, bytes: 0 };
  }
}

/** Crontab think mid-flight from agents/state/think-focus.json (status=running). */
function summarizeThinkBlurb(raw, taskId, status) {
  const tid = taskId ? String(taskId).replace(/^lane:/, "").slice(0, 64) : "";
  const s = String(raw || "")
    .replace(/\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return tid || status || "think";
  if (/HTTP\s*429|free-models-per-day|Rate limit exceeded/i.test(s)) {
    return tid ? `HTTP 429 free cap · ${tid}` : "HTTP 429 free-models-per-day";
  }
  // Truncate traceback / KeyboardInterrupt dumps — Hub Goal must stay brief.
  if (/KeyboardInterrupt|Traceback \(most recent|File "\/|cli\.chat\(/i.test(s) || s.length > 220) {
    const head = s.split(/\n/)[0].slice(0, 100);
    if (/^exit\s+\d/i.test(head) || /timeout|SIGINT|SIGTERM|failed/i.test(head)) {
      return tid ? `${head.slice(0, 40)} · ${tid}` : head.slice(0, 120);
    }
    return tid ? `${status || "failed"} · ${tid}` : (status || head.slice(0, 120));
  }
  return s.slice(0, 160);
}

/** Last think model id for Hub observatory (OpenRouter slug, no provider prefix). */
function readThinkModelHint() {
  try {
    const ep = path.join(REPO, "agents", "state", "think-paid-escalate.json");
    if (fs.existsSync(ep)) {
      const j = JSON.parse(fs.readFileSync(ep, "utf8"));
      const lm = String(j?.last_model || "").trim();
      if (lm) return lm.replace(/^openrouter\//i, "");
    }
  } catch {
    /* ignore */
  }
  try {
    const fp = path.join(REPO, "agents", "state", "think-focus.json");
    if (fs.existsSync(fp)) {
      const blurb = String(JSON.parse(fs.readFileSync(fp, "utf8"))?.blurb || "");
      const paid = blurb.match(
        /PAID\s+C8[^\n]*?\s+([a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?::free)?)/i
      );
      if (paid) return paid[1];
      const on429 = blurb.match(/(?:HTTP\s*429|on)\s+([a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?::free)?)/i);
      if (on429) return on429[1];
    }
  } catch {
    /* ignore */
  }
  try {
    const f429 = path.join(REPO, "agents", "state", "think-free-429.json");
    if (fs.existsSync(f429)) {
      const st = JSON.parse(fs.readFileSync(f429, "utf8"));
      const paid = String(st?.paid_model || "").trim();
      if (paid && (st?.paid_last_resort === true || st?.paid_last_resort === "true")) {
        return paid.replace(/^openrouter\//i, "");
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Cursor Auto lane — delegates to cursor-lane-status.sh --json (single detector). */
function readCursorLaneStatus() {
  const idle = {
    running: false,
    pid: null,
    processes: [],
    job_label: null,
    log_path: null,
    log_mtime: null,
    last_exit: null,
    age_sec: null,
    today_runs: null,
    today_ok: null,
    last_outcome: null,
    schedule: null,
    model_hint: null,
  };
  if (!fs.existsSync(CURSOR_LANE_STATUS_SCRIPT)) return idle;
  try {
    const out = execFileSync("bash", [CURSOR_LANE_STATUS_SCRIPT, "--json"], {
      encoding: "utf8",
      timeout: 4000,
      env: { ...process.env, AGENT_DUMP: REPO },
    });
    const parsed = JSON.parse(String(out || "").trim());
    if (!parsed || typeof parsed !== "object") return idle;
    return { ...idle, ...parsed };
  } catch {
    return idle;
  }
}

/** Cached free-model readiness (~30m TTL inside free-models-health.sh). Prefer cache file. */
function readFreeModelsHealth(opts = {}) {
  const force = !!opts.force;
  const idle = {
    any_up: false,
    cursor_fallback_recommended: true,
    summary: "unprobed",
    cache_hit: false,
    age_sec: null,
    ttl_sec: 1800,
    checked_at: null,
  };
  if (!force && fs.existsSync(FREE_MODELS_HEALTH_CACHE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(FREE_MODELS_HEALTH_CACHE, "utf8"));
      const ttl = Number(cached.ttl_sec || 1800);
      const age = Math.floor(Date.now() / 1000) - Number(cached.checked_epoch || 0);
      if (Number.isFinite(age) && age >= 0 && age <= ttl) {
        return {
          ...idle,
          ...cached,
          any_up: !!cached.any_up,
          cursor_fallback_recommended:
            cached.cursor_fallback_recommended != null
              ? !!cached.cursor_fallback_recommended
              : !cached.any_up,
          cache_hit: true,
          age_sec: age,
          ttl_sec: ttl,
        };
      }
    } catch {
      /* fall through */
    }
  }
  // Also honor think-free-429 full-day blocklist without spawning a probe.
  try {
    const f429 = path.join(REPO, "agents", "state", "think-free-429.json");
    if (fs.existsSync(f429)) {
      const st = JSON.parse(fs.readFileSync(f429, "utf8"));
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      if (st?.day === day) {
        const blocked = Array.isArray(st.models_429) ? st.models_429 : [];
        let chain = [];
        try {
          const swap = JSON.parse(
            fs.readFileSync(path.join(REPO, "agents", "model-budget", "think-free-swap.json"), "utf8")
          );
          chain = Array.isArray(swap.ordered) ? swap.ordered : [];
        } catch {
          chain = [];
        }
        if (chain.length && chain.every((m) => blocked.includes(m))) {
          return {
            ...idle,
            any_up: false,
            cursor_fallback_recommended: true,
            summary: `0/${chain.length} free up (think-free-429 full day blocklist)`,
            blocked_count: blocked.length,
            chain_size: chain.length,
            cache_hit: false,
            checked_at: new Date().toISOString(),
            probe: "think-free-429",
          };
        }
      }
    }
  } catch {
    /* ignore */
  }
  if (!fs.existsSync(FREE_MODELS_HEALTH_SCRIPT)) return idle;
  try {
    const args = [];
    if (force) args.push("--force");
    args.push("--json");
    const out = execFileSync("bash", [FREE_MODELS_HEALTH_SCRIPT, ...args], {
      encoding: "utf8",
      timeout: 90000,
      env: { ...process.env, AGENT_DUMP: REPO },
    });
    const parsed = JSON.parse(String(out || "").trim());
    if (!parsed || typeof parsed !== "object") return idle;
    return {
      ...idle,
      ...parsed,
      any_up: !!parsed.any_up,
      cursor_fallback_recommended:
        parsed.cursor_fallback_recommended != null
          ? !!parsed.cursor_fallback_recommended
          : !parsed.any_up,
    };
  } catch {
    return idle;
  }
}

function defaultAgentGoalControl() {
  return {
    version: 1,
    pause: false,
    pause_reason: "",
    redirect_goal: "",
    human_note: "",
    updated_at: null,
    updated_by: null,
  };
}

function readAgentGoalControl() {
  try {
    if (!fs.existsSync(AGENT_GOAL_CONTROL_FILE)) return defaultAgentGoalControl();
    const raw = JSON.parse(fs.readFileSync(AGENT_GOAL_CONTROL_FILE, "utf8"));
    if (!raw || typeof raw !== "object") return defaultAgentGoalControl();
    return {
      ...defaultAgentGoalControl(),
      ...raw,
      pause: !!raw.pause,
      pause_reason: String(raw.pause_reason || "").slice(0, 300),
      redirect_goal: String(raw.redirect_goal || "").slice(0, 500),
      human_note: String(raw.human_note || "").slice(0, 800),
    };
  } catch {
    return defaultAgentGoalControl();
  }
}

function writeAgentGoalControl(patch = {}, who = "hub") {
  const cur = readAgentGoalControl();
  const next = {
    ...cur,
    pause: typeof patch.pause === "boolean" ? patch.pause : cur.pause,
    pause_reason:
      patch.pause_reason != null
        ? String(patch.pause_reason).trim().slice(0, 300)
        : cur.pause_reason,
    redirect_goal:
      patch.redirect_goal != null
        ? String(patch.redirect_goal).trim().slice(0, 500)
        : cur.redirect_goal,
    human_note:
      patch.human_note != null
        ? String(patch.human_note).trim().slice(0, 800)
        : cur.human_note,
    updated_at: new Date().toISOString(),
    updated_by: String(who || "hub").slice(0, 40),
  };
  if (patch.clear_redirect === true) next.redirect_goal = "";
  fs.mkdirSync(path.dirname(AGENT_GOAL_CONTROL_FILE), { recursive: true });
  fs.writeFileSync(AGENT_GOAL_CONTROL_FILE, JSON.stringify(next, null, 2) + "\n");
  // Mirror pause into think-paused.json so crontab think can honor it without new parsers.
  try {
    const pausePath = path.join(REPO, "agents", "state", "think-paused.json");
    fs.writeFileSync(
      pausePath,
      JSON.stringify(
        {
          paused: !!next.pause,
          reason: next.pause
            ? next.pause_reason || next.redirect_goal || "Paused from Hub Tasks Active now"
            : "",
          updated_at: next.updated_at,
          source: "agent-goal-control",
        },
        null,
        2
      ) + "\n"
    );
  } catch (err) {
    console.warn("think-paused mirror:", err.message || err);
  }
  return next;
}

/** Live goal insight for Hub Tasks — what think/Cursor think they are doing + human override. */
function buildAgentGoalsInsight() {
  const control = readAgentGoalControl();
  const cursor = readCursorLaneStatus();
  const health = readFreeModelsHealth();
  let think = null;
  try {
    const fp = path.join(REPO, "agents", "state", "think-focus.json");
    if (fs.existsSync(fp)) {
      const f = JSON.parse(fs.readFileSync(fp, "utf8"));
      if (f && typeof f === "object") {
        think = {
          status: f.status || null,
          task_id: f.task_id || null,
          blurb: summarizeThinkBlurb(f.blurb, f.task_id, f.status),
          started_at: f.started_at || null,
          updated_at: f.updated_at || null,
        };
      }
    }
  } catch {
    think = null;
  }
  const liveGoal =
    (control.redirect_goal && control.redirect_goal.trim()) ||
    (cursor.running && cursor.job_label) ||
    (think && think.blurb) ||
    "";
  return {
    live_goal: String(liveGoal).slice(0, 240),
    think,
    cursor: {
      running: !!cursor.running,
      job_label: cursor.job_label || null,
      age_sec: cursor.age_sec ?? null,
      last_exit: cursor.last_exit ?? null,
    },
    free_models: {
      any_up: !!health.any_up,
      summary: health.summary || null,
      age_sec: health.age_sec ?? null,
      checked_at: health.checked_at || null,
      cache_hit: !!health.cache_hit,
      ttl_sec: health.ttl_sec || 1800,
      cursor_fallback_recommended: !!health.cursor_fallback_recommended,
    },
    control,
  };
}

function readThinkFocusRun() {
  const p = path.join(REPO, "agents", "state", "think-focus.json");
  if (!fs.existsSync(p)) return null;
  try {
    const cur = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!cur || typeof cur !== "object") return null;
    const status = String(cur.status || "").toLowerCase();
    if (status !== "running") return null;
    const startedIso = cur.started_at || cur.updated_at;
    if (!startedIso) return null;
    const startedMs = new Date(startedIso).getTime();
    if (!Number.isFinite(startedMs)) return null;
    const ageSec = (Date.now() - startedMs) / 1000;
    // Keep visible past 4m timeout so Hub can show hung/stuck (hide after 1h)
    if (ageSec < 0 || ageSec > 3600) return null;
    const hung = ageSec > 300;
    const blurb = cur.blurb != null ? String(cur.blurb).trim().slice(0, 200) : "";
    // Prefer task title over traceback dumps for Hub Goal line.
    const taskId = cur.task_id ? String(cur.task_id).slice(0, 80) : null;
    const goal = summarizeThinkBlurb(blurb, taskId, hung ? "hung" : status);
    return {
      name: "think",
      started_at: new Date(startedMs).toISOString(),
      elapsed_ms: Math.round(ageSec * 1000),
      kind: "tick",
      blurb: String(goal).slice(0, 160),
      task_id: taskId,
      focus_status: hung ? "hung" : status,
      hung,
    };
  } catch {
    return null;
  }
}

/** Today's think-tick counts from run-index — feeds the think lane card's Today row. */
function readThinkTodayStats() {
  const out = { runs: 0, ok: 0, fail: 0, idle: 0 };
  const runIndex = path.join(REPO, "agents", "state", "run-index.jsonl");
  if (!fs.existsSync(runIndex)) return out;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const lines = fs.readFileSync(runIndex, "utf8").trim().split("\n");
    for (const line of lines) {
      if (!line.includes(day)) continue;
      try {
        const j = JSON.parse(line);
        const name = j.name || j.pod || j.lane || "";
        if (name !== "think") continue;
        if (!String(j.ts || "").startsWith(day)) continue;
        out.runs += 1;
        if (/\bIDLE\b/i.test(String(j.summary || ""))) out.idle += 1;
        if (j.exit === 0 || j.outcome === "ok") out.ok += 1;
        if (j.outcome === "fail" || (j.exit != null && j.exit !== 0)) out.fail += 1;
      } catch {
        /* skip bad line */
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

function buildRunningNow() {
  const chat = listChatJobsInFlight();
  const pod = readCurrentPodRun();
  const thinkFocus = readThinkFocusRun();
  const cursorLane = readCursorLaneStatus();
  // Prefer live crontab think focus over stale pod-scheduler current
  const tick = thinkFocus || pod;
  const lastCompleted = readLastCompletedPod();
  const liveLog = readThinkLiveLog();
  let focusLast = null;
  try {
    const fp = path.join(REPO, "agents", "state", "think-focus.json");
    if (fs.existsSync(fp)) {
      const f = JSON.parse(fs.readFileSync(fp, "utf8"));
      if (f && typeof f === "object" && f.status && f.status !== "running") {
        const blurbRaw = String(f.blurb || "");
        const rateLimited = /HTTP\s*429|free-models-per-day|Rate limit exceeded|API call failed after/i.test(
          blurbRaw
        );
        const status = rateLimited && f.status === "done" ? "failed" : String(f.status);
        focusLast = {
          name: "think",
          label: "Think / worker",
          kind: "tick",
          kind_label: `last think (${status})`,
          blurb: summarizeThinkBlurb(f.blurb, f.task_id, status),
          at: f.updated_at || null,
          ts: f.updated_at || null,
          started_at: f.started_at || null,
          task_id: f.task_id ? String(f.task_id).slice(0, 80) : null,
          status,
          exit: status === "failed" ? 1 : 0,
          intent_ok: status !== "failed",
          meaningful: status === "done" || status === "failed",
          outcome: status === "failed" ? "fail" : status === "done" ? "ok" : "idle",
        };
      }
    }
  } catch {
    /* ignore */
  }
  return {
    chat_jobs: chat.jobs,
    chat_thinking: chat.thinking,
    chat_queued: chat.queued,
    pod: tick,
    think_focus: thinkFocus,
    think_lane: {
      provider: "OpenRouter",
      model_hint: readThinkModelHint(),
      today: readThinkTodayStats(),
    },
    cursor_lane: cursorLane,
    live_log: liveLog,
    last_completed: focusLast || lastCompleted,
    anything: chat.jobs.length > 0 || !!tick || !!cursorLane.running,
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
    // Mirror nousagent-health hung check (cheap): D-state MainPID — /proc only, never spawn ps.
    const pid = execFileSync("systemctl", ["--user", "show", "-p", "MainPID", "--value", "hermes-gateway"], {
      encoding: "utf8",
      timeout: 2000,
    }).trim();
    if (pid && pid !== "0") {
      try {
        const st = fs.readFileSync(`/proc/${pid}/status`, "utf8");
        const sm = st.match(/^State:\s+(\S+)/m);
        if (sm && String(sm[1]).startsWith("D")) return 0;
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
  const [health, cronRaw, thinkCrontab] = await Promise.all([
    collectHealth(),
    lite ? Promise.resolve("") : collectCronSummary(),
    collectThinkCrontabStatus(),
  ]);
  const lanes = parseLaneCrons(cronRaw);
  delete lanes["agent-cycle-fast"];
  const syncLane = collectSyncLaneStatus(thinkCrontab);
  const syncLast =
    syncLane.lastRun || lanes["agent-cycle-sync"]?.last_run || readPodSchedulerLaneHints().fast || null;
  const thinkLast =
    thinkCrontab.lastRun || lanes["agent-cycle-think"]?.last_run || readPodSchedulerLaneHints().think || null;
  if (syncLane.active || syncLast) {
    lanes["agent-cycle-sync"] = {
      name: "agent-cycle-sync",
      schedule: syncLane.active ? "1m · deterministic" : lanes["agent-cycle-sync"]?.schedule || "deterministic",
      last_run: syncLast,
      status: syncLast ? "ok" : syncLane.active ? "active" : "pending",
      deterministic: true,
    };
  }
  if (thinkCrontab.active || thinkLast) {
    lanes["agent-cycle-think"] = {
      name: "agent-cycle-think",
      schedule: thinkCrontab.active
        ? "1m · LLM ~8m"
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
      archived: !!cfg.archived,
      map_url: id === "tropic-gooner" ? "https://map.tableslop.org/" : null,
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
  // Wider window so Hub can prefer campaign/meta over a wall of think ticks
  const recentPodsRaw = readRecentPodRuns(24);
  const maintenanceOpen = countUncheckedMd("agents/maintenance-progress.md");
  const runningNow = buildRunningNow();
  const metaLane = readMetaLaneSummary();
  const lastThinkSummary = readLastThinkSummary();
  // Cached 10s in linuxbox-systems — Hub bars + pop-out without a second sampler.
  const hostResources = await readHostMetrics();
  const campaignNext = {};
  for (const [id, c] of Object.entries(campaigns)) {
    if (c?.next_item) campaignNext[id] = stripMdLite(c.next_item).slice(0, 120);
  }
  const lastRun = buildLastRun(recentPodsRaw, {
    task_status: stripMdLite(currentTaskStatus).slice(0, 120),
    meta_next: stripMdLite(metaLane?.next_item || dashboardBacklog[0] || "").slice(0, 120),
    campaign_next: campaignNext,
  });
  const recentPodsEnriched = (() => {
    const thinkReports = loadRecentThinkReports(32);
    const harness = readThinkHarnessRecent(24);
    return recentPodsRaw.slice(0, 8).map((p) => {
      const name = p.name;
      let hint = "";
      if (name === "think" || name === "meta") {
        hint = resolveThinkPodDetail(p, thinkReports, harness, lastThinkSummary);
      } else if (campaignNext[name]) {
        hint = campaignNext[name];
      }
      return enrichPodRun(p, hint);
    });
  })();

  const tableslopErrors = (() => {
    try {
      const p = path.join(REPO, "reports", "tableslop-errors", "LATEST.json");
      if (!fs.existsSync(p)) return null;
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      const errs = (j.findings || []).filter((f) => f.severity === "error");
      const priority = new Set([
        "TS-MAP-GM-BORDERS-MISSING",
        "TS-MAP-CITY-BORDER-MISSING",
      ]);
      errs.sort((a, b) => {
        const ap = priority.has(a.code) ? 0 : 1;
        const bp = priority.has(b.code) ? 0 : 1;
        return ap - bp;
      });
      return {
        ok: !!j.ok,
        collected_at: j.collected_at || null,
        error_count: errs.length,
        warn_count: j.warn_count || 0,
        // Keep Hub glance lean — border corrector codes first
        errors: errs.slice(0, 8).map((f) => ({
          code: f.code,
          detail: String(f.detail || "").slice(0, 160),
        })),
      };
    } catch {
      return null;
    }
  })();

  return {
    updated_at: new Date().toISOString(),
    host: "linuxbox",
    dash_build: DASH_BUILD,
    host_resources: hostResources,
    ...health,
    current_task_status: currentTaskStatus,
    lanes,
    inbox_open_count: inbox.open.length,
    campaigns,
    tableslop_errors: tableslopErrors,
    all_reports: allReports.slice(0, 16),
    dashboard_backlog_open: dashboardBacklog,
    meta_lane: metaLane,
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
    recent_pods: recentPodsEnriched,
    last_run: lastRun,
    last_think_summary: lastThinkSummary,
    maintenance_open: maintenanceOpen,
    running_now: runningNow,
    cursor_lane: runningNow.cursor_lane,
    current_pod: runningNow.pod,
    observability: readObservabilityLinks(),
    chat_model_usage: chatModelUsageSummary(),
    agent_goals: buildAgentGoalsInsight(),
    free_models_health: readFreeModelsHealth(),
    work_pipeline: buildWorkPipeline(),
    model_budget: {
      policy: CHAT_FREE_FIRST ? "free_first" : "paid_first",
      ops_daily_usd_target: OPENROUTER_OPS_DAILY_USD,
      config: "agents/model-budget/config.json",
      routing: getModelBudgetRoutingForUi(),
    },
    chat_modes: loadChatModes(),
    chat_catalog: getChatCatalogForUi(),
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
    const raw = fs.readFileSync(USER_TASKS_FILE, "utf8");
  try {
    // ponytail: think ticks sometimes hand-edit trailing commas into user-tasks.json
    const data = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1"));
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    let projects = Array.isArray(data.projects) ? data.projects : [];
    if (!projects.length && (data.version || 1) < 2) {
      projects = defaultUserProjects();
    }
    return { version: 2, projects, tasks };
  } catch (err) {
    console.error("readUserTasksStore: parse failed:", err.message);
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

function writeMazdaParts(data) {
  const out = { ...data, updated_at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(MAZDA_PARTS_FILE), { recursive: true });
  fs.writeFileSync(MAZDA_PARTS_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
  return out;
}

function formatMazdaBuildMemoryBlock(m) {
  if (!m || m.error) return "";
  const v = m.vehicle || {};
  const decisions = Array.isArray(m.decisions) ? m.decisions.slice(-12) : [];
  const lines = [
    "[Confirmed build memory — authoritative; do NOT re-ask these]",
    `Chassis: ${v.chassis_label || v.chassis || "UNCONFIRMED — ask once if missing"}`,
  ];
  if (v.body) lines.push(`Body: ${v.body}`);
  if (v.notes) lines.push(`Notes: ${String(v.notes).slice(0, 400)}`);
  if (decisions.length) {
    lines.push("Recent decisions:");
    for (const d of decisions) {
      lines.push(`- ${d.at || "?"} · ${d.fact || JSON.stringify(d)}`);
    }
  }
  lines.push(
    "When the human confirms a durable fact (chassis, ordered part, vendor link), emit:",
    '<<<PROJECT_WRITE project="mazda3-sports-build">>>',
    "chassis=mazda3",
    "part.white-wheels.status=ordered",
    "part.white-wheels.name=…",
    "part.white-wheels.url=https://…",
    "<<<END_PROJECT_WRITE>>>",
    "Never claim you updated the tracker unless you emitted PROJECT_WRITE (server applies it)."
  );
  return lines.join("\n").slice(0, 2500);
}

/** Merge vehicle + part patches into parts.json. Returns { ok, changes[] }. */
function patchMazdaBuild(patch = {}) {
  const data = readMazdaParts();
  if (data.error) return { ok: false, changes: [], error: data.error };
  const changes = [];
  data.vehicle = data.vehicle && typeof data.vehicle === "object" ? data.vehicle : {};
  data.decisions = Array.isArray(data.decisions) ? data.decisions : [];

  if (patch.chassis) {
    const chassis = String(patch.chassis).toLowerCase().replace(/\s+/g, "");
    let id = chassis;
    let label = patch.chassis_label || patch.chassis;
    if (/^mazda3|mazda-?3|bp$/.test(chassis) || chassis === "3") {
      id = "mazda3";
      label = patch.chassis_label || "2019+ Mazda 3";
    } else if (/cx-?30/.test(chassis)) {
      id = "cx30";
      label = patch.chassis_label || "2020–2023 CX-30";
    }
    if (data.vehicle.chassis !== id) {
      data.vehicle.chassis = id;
      data.vehicle.chassis_label = label;
      data.vehicle.confirmed_at = new Date().toISOString();
      changes.push(`chassis=${id}`);
      data.decisions.push({
        at: new Date().toISOString(),
        fact: `chassis=${id} (${label})`,
        source: patch.source || "chat",
      });
      if (id === "mazda3") {
        data.fitment_warning =
          "Chassis locked: 2019+ Mazda 3. Drop CX-30-only parts (e.g. H&R CX-30 springs) or replace with Mazda 3 equivalents.";
      } else if (id === "cx30") {
        data.fitment_warning =
          "Chassis locked: CX-30. Drop Mazda 3-only parts (CorkSport strut bar, Bayson R hatch visors/spoiler) or replace with CX-30 equivalents.";
      }
    }
  }

  if (patch.body) {
    data.vehicle.body = String(patch.body).slice(0, 80);
    changes.push(`body=${data.vehicle.body}`);
  }

  if (Array.isArray(patch.parts)) {
    for (const upd of patch.parts) {
      if (!upd || !upd.id) continue;
      const idx = (data.parts || []).findIndex((p) => p.id === upd.id);
      if (idx < 0) continue;
      const part = { ...data.parts[idx] };
      for (const key of ["name", "vendor", "url", "sku", "status", "fitment", "tier"]) {
        if (upd[key] != null && String(upd[key]).trim()) {
          part[key] = typeof upd[key] === "string" ? upd[key].trim().slice(0, 500) : upd[key];
        }
      }
      if (upd.current_price != null && Number.isFinite(Number(upd.current_price))) {
        part.current_price = Number(upd.current_price);
      }
      data.parts[idx] = part;
      changes.push(`part.${upd.id}`);
      data.decisions.push({
        at: new Date().toISOString(),
        fact: `part.${upd.id} → ${part.status || "updated"} ${part.name || ""}`.trim().slice(0, 200),
        source: patch.source || "chat",
      });
    }
  }

  if (!changes.length) return { ok: true, changes: [], data };
  data.decisions = data.decisions.slice(-40);
  writeMazdaParts(data);
  return { ok: true, changes, data };
}

/**
 * Heuristic: pull durable mazda3 facts from a user chat line (don't wait on the model).
 */
function extractMazdaFactsFromUserText(text) {
  const t = String(text || "");
  if (!t.trim()) return null;
  const patch = { source: "user_chat", parts: [] };
  const lower = t.toLowerCase();
  // Chassis: prefer explicit mazda3; ignore if only discussing conflict without confirm.
  if (
    /\b(it'?s|its|is|confirmed|confirm|chassis\s*(is|=)|building\s+(a\s+)?|for\s+(a\s+)?)\s*(a\s+)?(the\s+)?mazda\s*3\b/i.test(
      t
    ) ||
    /\bmazda\s*3\b.*\b(confirmed|confirm|definitive|locked)\b/i.test(t) ||
    /\b(confirmed|confirm).{0,40}mazda\s*3\b/i.test(t)
  ) {
    if (!/\bcx-?30\b/i.test(t) || /\bnot\s+(a\s+)?cx-?30\b/i.test(t) || /\bmazda\s*3\b/i.test(t)) {
      patch.chassis = "mazda3";
    }
  } else if (/\b(it'?s|its|is|confirmed)\s*(a\s+)?cx-?30\b/i.test(t)) {
    patch.chassis = "cx30";
  }
  if (/\bhatch(back)?\b/i.test(t)) patch.body = "hatch";
  if (/\bsedan\b/i.test(t)) patch.body = "sedan";

  const urlMatch = t.match(/https?:\/\/[^\s)]+/i);
  if (urlMatch && /circuitperformance|cp23|wheel|rim/i.test(t + urlMatch[0])) {
    const url = urlMatch[0].replace(/[.,;]+$/, "");
    const part = {
      id: "white-wheels",
      url,
      status: /order(ed|ing)?/i.test(t) ? "ordered" : "chosen",
      name: /cp23/i.test(t + url)
        ? "Circuit Performance CP23 16x7 Gloss White (5x114.3 +35)"
        : undefined,
      vendor: /circuit\s*performance/i.test(t + url) ? "Circuit Performance" : undefined,
      fitment: "5x114.3 · confirm offset vs Mazda 3; from chat order/link",
    };
    patch.parts.push(part);
  } else if (/cp23/i.test(t) && /order(ed|ing)?/i.test(t)) {
    patch.parts.push({
      id: "white-wheels",
      status: "ordered",
      name: "Circuit Performance CP23 (ordered — details in chat)",
      vendor: "Circuit Performance",
    });
  }

  if (!patch.chassis && !patch.body && !patch.parts.length) return null;
  return patch;
}

/**
 * <<<PROJECT_WRITE project="mazda3-sports-build">>>key=value lines<<<END_PROJECT_WRITE>>>
 */
function applyProjectWriteDirectives(replyText, projectId) {
  const raw = String(replyText || "");
  if (projectId !== "mazda3-sports-build" || !/<<<\s*PROJECT_WRITE/i.test(raw)) {
    return { reply: raw, artifacts: [], changes: [] };
  }
  const re =
    /<<<\s*PROJECT_WRITE\s+project=["']([^"']+)["']\s*>>>\s*([\s\S]*?)\s*<<<\s*END_PROJECT_WRITE\s*>>>/gi;
  let out = raw;
  const allChanges = [];
  const artifacts = [];
  let match;
  while ((match = re.exec(raw)) !== null) {
    const pid = match[1].trim();
    if (pid !== "mazda3-sports-build") continue;
    const body = match[2] || "";
    const patch = { source: "project_write", parts: [] };
    const partMap = {};
    for (const line of body.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith("#")) continue;
      const eq = s.indexOf("=");
      if (eq < 0) continue;
      const key = s.slice(0, eq).trim().toLowerCase();
      const val = s.slice(eq + 1).trim();
      if (!val) continue;
      if (key === "chassis") patch.chassis = val;
      else if (key === "chassis_label") patch.chassis_label = val;
      else if (key === "body") patch.body = val;
      else {
        const pm = key.match(/^part\.([a-z0-9_-]+)\.(name|vendor|url|sku|status|fitment|tier)$/);
        if (pm) {
          const id = pm[1];
          const field = pm[2];
          if (!partMap[id]) partMap[id] = { id };
          partMap[id][field] = val;
        }
      }
    }
    patch.parts = Object.values(partMap);
    const applied = patchMazdaBuild(patch);
    if (applied.changes?.length) {
      allChanges.push(...applied.changes);
      artifacts.push({
        type: "project",
        path: "projects/mazda3-sports-build/parts.json",
        label: `build: ${applied.changes.join(", ")}`,
      });
    }
    out = out.replace(
      match[0],
      applied.changes?.length
        ? `\n*[Saved to build tracker: ${applied.changes.join(", ")}]*\n`
        : "\n*[PROJECT_WRITE: nothing new]*\n"
    );
  }
  return { reply: out.trim(), artifacts, changes: allChanges };
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
      registries[id] = getCharactersRegistry(id);
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
    story: "Wiki seed (story/)",
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

const CHAR_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const CHAR_PORTRAIT_UPLOAD_MAX = 4 * 1024 * 1024;
/**
 * Canonical registry id → gitignored `Character Images/<Folder>/` only.
 * Thread twins (ellaine, nelly, red, minerva, …) must NOT share these folders —
 * that caused duplicate faces on the Chars grid.
 */
const CHAR_IMAGE_FOLDER_BY_ID = {
  "ellaine-mishpit": "Ellaine",
  "harper-maupin": "Harper",
  "sister-minerva": "Minerva",
  "nelly-stein": "Nelly",
  "redmond-red-gallagher": "Redmond",
  toga: "Toga",
};

function normalizeCampaignRelPath(imagePath) {
  if (!imagePath || typeof imagePath !== "string") return "";
  const normalized = imagePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || path.isAbsolute(normalized)) return "";
  return normalized;
}

/** True when rel is under this character’s portraits/ or mapped Character Images folder. */
function pathOwnedByCharacter(charId, relPath) {
  const rel = normalizeCampaignRelPath(relPath);
  if (!rel || !charId) return false;
  if (rel.startsWith(`characters/portraits/${charId}/`)) return true;
  const ext = path.extname(rel).toLowerCase();
  if (CHAR_IMAGE_EXTS.has(ext) && rel === `characters/portraits/${charId}${ext}`) return true;
  const folder = CHAR_IMAGE_FOLDER_BY_ID[charId];
  if (folder && rel.startsWith(`Character Images/${folder}/`)) return true;
  return false;
}

/** Another cast member’s portraits/ or Character Images folder — never steal. */
function isCrossCharacterImagePath(charId, relPath) {
  const rel = normalizeCampaignRelPath(relPath);
  if (!rel || !charId) return false;
  const underPortrait = /^characters\/portraits\/([^/]+)\//.exec(rel);
  if (underPortrait && underPortrait[1] !== charId) return true;
  const leafAlone = /^characters\/portraits\/([^/.]+)(\.[a-z0-9]+)$/i.exec(rel);
  if (leafAlone && leafAlone[1] !== charId) return true;
  if (rel.startsWith("Character Images/")) {
    const imgFolder = rel.split("/")[1] || "";
    if (!imgFolder) return false;
    for (const [id, folder] of Object.entries(CHAR_IMAGE_FOLDER_BY_ID)) {
      if (folder === imgFolder && id !== charId) return true;
    }
  }
  return false;
}

function isDiscordExportRel(relPath) {
  const rel = normalizeCampaignRelPath(relPath);
  return Boolean(rel && (rel.startsWith("discord-export/") || /(^|\/)attachments\//.test(rel)));
}

/** Basename hit only inside this character’s owned dirs (never other cast). */
function findOwnedBasenameHit(campaignId, charId, basename) {
  const key = String(basename || "").toLowerCase();
  if (!key || !charId || !CAMPAIGNS[campaignId]) return "";
  const campRoot = path.join(REPO, "campaigns", campaignId);
  const candidates = [];
  const portraitDir = path.join(campRoot, "characters", "portraits", charId);
  if (fs.existsSync(portraitDir) && fs.statSync(portraitDir).isDirectory()) {
    for (const name of fs.readdirSync(portraitDir)) {
      if (name.toLowerCase() === key) candidates.push(`characters/portraits/${charId}/${name}`);
    }
  }
  for (const ext of CHAR_IMAGE_EXTS) {
    const leaf = `characters/portraits/${charId}${ext}`;
    if (path.basename(leaf).toLowerCase() === key) candidates.push(leaf);
  }
  const folder = CHAR_IMAGE_FOLDER_BY_ID[charId];
  if (folder) {
    const folderAbs = path.join(campRoot, "Character Images", folder);
    if (fs.existsSync(folderAbs) && fs.statSync(folderAbs).isDirectory()) {
      for (const name of fs.readdirSync(folderAbs)) {
        if (name.toLowerCase() === key) candidates.push(`Character Images/${folder}/${name}`);
      }
    }
  }
  for (const rel of candidates) {
    if (characterImageAbs(campaignId, rel)) return rel;
  }
  return "";
}

/** Basename hit only under discord-export attachments dirs (local restore source). */
function findExportBasenameHit(campaignId, basename) {
  const key = String(basename || "").toLowerCase();
  if (!key || !CAMPAIGNS[campaignId]) return "";
  const campRoot = path.join(REPO, "campaigns", campaignId);
  for (const absDir of listDiscordExportAttachmentDirs(campRoot)) {
    const relPrefix = discordExportRelFromAbs(campRoot, absDir);
    if (!relPrefix) continue;
    let names;
    try {
      names = fs.readdirSync(absDir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name.toLowerCase() !== key) continue;
      const abs = path.join(absDir, name);
      try {
        if (!fs.statSync(abs).isFile()) continue;
      } catch {
        continue;
      }
      const rel = `${relPrefix}/${name}`.replace(/\\/g, "/");
      if (characterImageAbs(campaignId, rel)) return rel;
    }
  }
  return "";
}

/* List discord-export/.../attachments dirs (binaries live here; sheets only keep paths). */
function listDiscordExportAttachmentDirs(campRoot) {
  const exportRoot = path.join(campRoot, "discord-export");
  const out = [];
  if (!fs.existsSync(exportRoot) || !fs.statSync(exportRoot).isDirectory()) return out;
  function walk(abs) {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const child = path.join(abs, ent.name);
      if (ent.name === "attachments") out.push(child);
      else walk(child);
    }
  }
  walk(exportRoot);
  return out;
}

function discordExportRelFromAbs(campRoot, absFile) {
  const rel = path.relative(campRoot, absFile).replace(/\\/g, "/");
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return "";
  return rel;
}

function characterImageAbs(campaignId, imagePath) {
  if (!campaignId || !CAMPAIGNS[campaignId]) return null;
  const normalized = normalizeCampaignRelPath(imagePath);
  if (!normalized) return null;
  const ext = path.extname(normalized).toLowerCase();
  if (!CHAR_IMAGE_EXTS.has(ext)) return null;
  const abs = path.join(REPO, "campaigns", campaignId, normalized);
  const root = path.join(REPO, "campaigns", campaignId);
  if (!abs.startsWith(root + path.sep) && abs !== root) return null;
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

function characterPortraitDirs(campaignId, charId) {
  const campRoot = path.join(REPO, "campaigns", campaignId);
  const rels = [];
  const portraitDirRel = `characters/portraits/${charId}`;
  rels.push(...listImageFilesInAbsDir(path.join(campRoot, portraitDirRel), portraitDirRel));
  for (const ext of CHAR_IMAGE_EXTS) {
    const leaf = `characters/portraits/${charId}${ext}`;
    if (characterImageAbs(campaignId, leaf)) rels.push(leaf);
  }
  const folder = CHAR_IMAGE_FOLDER_BY_ID[charId];
  if (folder) {
    const folderRel = `Character Images/${folder}`;
    rels.push(...listImageFilesInAbsDir(path.join(campRoot, folderRel), folderRel));
  }
  return [...new Set(rels)];
}

function preferStillPrimary(paths) {
  const still = paths.filter((p) => /\.(jpe?g|png|webp)$/i.test(p));
  return still[0] || paths[0] || "";
}

function storyDocAbs(campaignId, storyPath) {
  if (!storyPath || typeof storyPath !== "string") return null;
  const norm = storyPath.replace(/\\/g, "/");
  const prefix = `campaigns/${campaignId}/`;
  const rel = norm.startsWith(prefix) ? norm.slice(prefix.length) : norm.replace(/^\/+/, "");
  if (!rel || rel.includes("..")) return null;
  const abs = path.join(REPO, "campaigns", campaignId, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return abs;
}

function extractDocAttachmentRefs(campaignId, c) {
  const listed = Array.isArray(c.doc_attachments) ? c.doc_attachments.map(String) : [];
  const fromFiles = [];
  const paths = [c.story_path, ...(Array.isArray(c.duplicate_paths) ? c.duplicate_paths : [])].filter(Boolean);
  for (const sp of paths) {
    const abs = storyDocAbs(campaignId, sp);
    if (!abs) continue;
    let text = "";
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    for (const m of text.matchAll(/Attachment:\s*`([^`]+)`/gi)) fromFiles.push(m[1].trim());
    for (const m of text.matchAll(/^\s*-\s*`?(attachments\/[^`\s]+)`?\s*$/gim)) fromFiles.push(m[1].trim());
    for (const m of text.matchAll(/!\[\[([^\]|#]+\.(?:png|jpe?g|webp|gif))\]\]/gi)) fromFiles.push(m[1].trim());
    for (const m of text.matchAll(/https?:\/\/[^\s)>\]]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s)>\]]*)?/gi)) {
      fromFiles.push(m[0].trim());
    }
  }
  return [...new Set([...listed, ...fromFiles])];
}

/**
 * Resolve sheet Attachment / wikilink refs for one character.
 * Never basename-steals another cast member’s portraits/Character Images.
 * discord-export hits stay unresolved here (Resolve copies into portraits/).
 */
function resolveDocAttachments(campaignId, charId, refs) {
  const resolved = [];
  const unresolved = [];
  for (const ref of refs) {
    if (/^https?:\/\//i.test(ref)) {
      unresolved.push({ ref, reason: "remote_url" });
      continue;
    }
    const norm = normalizeCampaignRelPath(ref);
    if (norm && characterImageAbs(campaignId, norm)) {
      if (isCrossCharacterImagePath(charId, norm)) {
        unresolved.push({ ref, reason: "path_other_character" });
        continue;
      }
      // Owned paths (or non-cast paths) may show; export paths wait for Resolve copy.
      if (pathOwnedByCharacter(charId, norm)) {
        resolved.push(norm);
        continue;
      }
      if (isDiscordExportRel(norm)) {
        unresolved.push({ ref, reason: "in_export_not_copied" });
        continue;
      }
      // Bare attachments/… refs that are not under discord-export yet
      unresolved.push({ ref, reason: "doc_has_attachment_not_resolved" });
      continue;
    }
    const base = path.basename(ref);
    const owned = findOwnedBasenameHit(campaignId, charId, base);
    if (owned) {
      resolved.push(owned);
      continue;
    }
    const exported = findExportBasenameHit(campaignId, base);
    if (exported) {
      unresolved.push({ ref, reason: "in_export_not_copied" });
      continue;
    }
    unresolved.push({ ref, reason: "doc_has_attachment_not_resolved" });
  }
  return { resolved: [...new Set(resolved)], unresolved };
}

function isGalleryIntentionallyEmpty(c) {
  // GM cleared portraits: empty images + empty image_path + empty doc_attachments.
  // Without this, sheet Attachment: lines + disk leftovers re-fill Rosalina with Jinpei/map art.
  return (
    Array.isArray(c.images) &&
    c.images.length === 0 &&
    (c.image_path === "" || c.image_path == null) &&
    Array.isArray(c.doc_attachments) &&
    c.doc_attachments.length === 0
  );
}

function resolveCharacterImages(campaignId, c) {
  if (isGalleryIntentionallyEmpty(c)) {
    return {
      images: [],
      image_path: "",
      doc_attachments: [],
      unresolved_doc_attachments: [],
    };
  }
  const fromRegistry = (Array.isArray(c.images) ? c.images : [])
    .map(normalizeCampaignRelPath)
    .filter(
      (p) =>
        p &&
        characterImageAbs(campaignId, p) &&
        !isCrossCharacterImagePath(c.id, p)
    );
  const docRefs = extractDocAttachmentRefs(campaignId, c);
  const docResolved = resolveDocAttachments(campaignId, c.id, docRefs);
  const fromDisk = c.hidden || c.role === "gm" ? [] : characterPortraitDirs(campaignId, c.id);
  const images = [...new Set([...fromRegistry, ...docResolved.resolved, ...fromDisk])];
  let primary = normalizeCampaignRelPath(c.image_path || "");
  if (primary && !characterImageAbs(campaignId, primary)) primary = "";
  if (primary && isCrossCharacterImagePath(c.id, primary)) primary = "";
  if (!primary) {
    primary =
      fromRegistry.find((p) => characterImageAbs(campaignId, p)) ||
      docResolved.resolved[0] ||
      preferStillPrimary(images);
  }
  return {
    images,
    image_path: primary || "",
    doc_attachments: docRefs,
    unresolved_doc_attachments: docResolved.unresolved,
  };
}

function enrichCharactersRegistry(data, campaignId, opts = {}) {
  const includeHidden = Boolean(opts.includeHidden);
  const chars = (data.characters || [])
    .filter((c) => includeHidden || (!c.hidden && c.role !== "gm"))
    .map((c) => {
      const resolved = resolveCharacterImages(campaignId, c);
      const hasImage = Boolean(resolved.image_path && characterImageAbs(campaignId, resolved.image_path));
      return {
        ...c,
        image_path: resolved.image_path,
        images: resolved.images,
        has_image: hasImage,
        doc_attachments: resolved.doc_attachments,
        unresolved_doc_attachments: resolved.unresolved_doc_attachments,
        image_url: hasImage
          ? `/api/characters-registry/image?campaign=${encodeURIComponent(campaignId)}&id=${encodeURIComponent(c.id)}`
          : null,
        gallery_urls: resolved.images.map(
          (p) =>
            `/api/characters-registry/image?campaign=${encodeURIComponent(campaignId)}&id=${encodeURIComponent(c.id)}&path=${encodeURIComponent(p)}`
        ),
      };
    });
  const gm = (data.characters || []).filter((c) => c.role === "gm");
  const hiddenCount = (data.characters || []).filter((c) => c.hidden || c.role === "gm").length;
  return {
    ...data,
    campaign_id: data.campaign_id || campaignId,
    characters: chars,
    gm_characters: gm.map((c) => ({
      id: c.id,
      display_name: c.display_name,
      role: "gm",
      notes: c.notes || "",
    })),
    hidden_count: hiddenCount,
    include_hidden: includeHidden,
  };
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

function getCharactersRegistry(campaignId, opts = {}) {
  const key = `${campaignId}|${opts.includeHidden ? 1 : 0}`;
  const hit = charsRegistryReadCache.get(key);
  if (hit) return hit;
  return charsRegistryReadCache.set(
    key,
    enrichCharactersRegistry(readCharactersRegistry(campaignId), campaignId, opts)
  );
}

function writeCharactersRegistry(campaignId, data, opts = {}) {
  const abs = charactersRegistryPath(campaignId);
  if (!abs) throw new Error("no_registry");
  const { writeRegistryFile } = require("./chars-registry-persist");
  const result = writeRegistryFile({
    absPath: abs,
    data,
    repoRoot: REPO,
    campaignId,
    baseVersion: opts.baseVersion,
    bump: opts.bump !== false,
    // Always union-keep unknown on-disk ids so SCP/partial multitask writes cannot wipe GM rows.
    preserveUnknownIds: opts.preserveUnknownIds !== false,
  });
  charsRegistryReadCache.invalidate();
  return result;
}

function registryBaseVersionFromBody(body) {
  if (!body || typeof body !== "object") return undefined;
  if (body.base_version !== undefined && body.base_version !== null && body.base_version !== "") {
    return body.base_version;
  }
  if (body.if_match_version !== undefined && body.if_match_version !== null && body.if_match_version !== "") {
    return body.if_match_version;
  }
  return undefined;
}

function sendRegistryWriteError(res, e, publicMode) {
  if (e && (e.code === "version_conflict" || e.message === "version_conflict")) {
    sendJson(
      res,
      409,
      {
        error: "version_conflict",
        message: "Registry changed since your load — hard-refresh Chars and retry.",
        ...(e.detail || {}),
      },
      publicMode
    );
    return;
  }
  sendJson(res, 400, { error: e.message || "registry_error" }, publicMode);
}

function findRegistryForPath(registry, relPath) {
  const chars = registry?.characters || [];
  return chars.find((c) => c.story_path === relPath) || null;
}

const CHAR_STATUS_ALLOWED = new Set(["active", "hiatus", "retired", "npc", "stub", "side"]);
const CHAR_ROLE_ALLOWED = new Set([
  "pc",
  "npc",
  "side",
  "gm",
  "stub",
  "thread-twin",
  "author-stub",
  "ingest-noise",
  "merged",
]);

function slugifyCharacterId(name) {
  const s = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return s || "character";
}

function normalizeRelations(list) {
  if (!Array.isArray(list)) throw new Error("bad_relations");
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const to_id = String(raw.to_id || raw.to || "").trim();
    if (!to_id || /[^a-zA-Z0-9._-]/.test(to_id)) continue;
    const type = String(raw.type || "related").trim().slice(0, 48) || "related";
    const label = String(raw.label || type).trim().slice(0, 80);
    const key = `${to_id.toLowerCase()}::${type.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ to_id, type, label });
  }
  return out;
}

function ensureRelation(row, toId, type, label) {
  const rels = Array.isArray(row.relations) ? row.relations.slice() : [];
  const hit = rels.find(
    (r) =>
      String(r.to_id || "").toLowerCase() === String(toId).toLowerCase() &&
      String(r.type || "").toLowerCase() === String(type).toLowerCase()
  );
  if (hit) {
    if (label) hit.label = label;
    row.relations = rels;
    return;
  }
  rels.push({ to_id: toId, type, label: label || type });
  row.relations = rels;
}

function ensurePortraitDir(campaignId, charId) {
  const absDir = path.join(REPO, "campaigns", campaignId, "characters", "portraits", charId);
  fs.mkdirSync(absDir, { recursive: true });
  return absDir;
}

function patchCharacterRegistry(campaignId, patch) {
  const registry = readCharactersRegistry(campaignId);
  const id = patch.id;
  if (!id) throw new Error("id_required");
  if (/[^a-zA-Z0-9._-]/.test(id)) throw new Error("bad_id");
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
      role: patch.role || "npc",
      hidden: false,
      can_proxy: false,
      notes: "",
      aliases: [],
      relations: [],
      images: [],
      image_path: "",
      doc_attachments: [],
    };
    registry.characters.push(row);
    ensurePortraitDir(campaignId, id);
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
    "image_path",
    "role",
    "hidden",
  ];
  for (const k of allowed) {
    if (patch[k] !== undefined) row[k] = patch[k];
  }
  if (patch.status !== undefined) {
    const st = String(patch.status || "").trim();
    if (!CHAR_STATUS_ALLOWED.has(st)) throw new Error("bad_status");
    row.status = st;
  }
  if (patch.role !== undefined) {
    const role = String(patch.role || "").trim();
    if (role && !CHAR_ROLE_ALLOWED.has(role)) throw new Error("bad_role");
    row.role = role;
  }
  if (patch.hidden !== undefined) row.hidden = Boolean(patch.hidden);
  if (patch.aliases !== undefined) {
    if (!Array.isArray(patch.aliases) && typeof patch.aliases !== "string") {
      throw new Error("bad_aliases");
    }
    const raw = Array.isArray(patch.aliases)
      ? patch.aliases
      : String(patch.aliases)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    row.aliases = [...new Set(raw.map((a) => String(a).trim()).filter(Boolean))];
  }
  if (patch.relations !== undefined) {
    row.relations = normalizeRelations(patch.relations);
  }
  if (patch.doc_attachments !== undefined) {
    if (!Array.isArray(patch.doc_attachments)) throw new Error("bad_doc_attachments");
    row.doc_attachments = patch.doc_attachments.map(String);
  }
  if (patch.images !== undefined) {
    if (!Array.isArray(patch.images)) throw new Error("bad_images");
    row.images = patch.images
      .map(normalizeCampaignRelPath)
      .filter((p) => p && CHAR_IMAGE_EXTS.has(path.extname(p).toLowerCase()));
  }
  if (row.image_path) {
    const normalized = normalizeCampaignRelPath(row.image_path);
    if (!normalized) throw new Error("bad_image_path");
    const ext = path.extname(normalized).toLowerCase();
    if (!CHAR_IMAGE_EXTS.has(ext)) throw new Error("bad_image_ext");
    row.image_path = normalized;
    const imgs = Array.isArray(row.images) ? row.images : [];
    if (!imgs.includes(normalized)) row.images = [...imgs, normalized];
  } else if (patch.image_path === "") {
    row.image_path = "";
  }

  // Optional one-shot link when creating/editing: related_to + relation_type
  const relatedTo = String(patch.related_to || "").trim();
  if (relatedTo) {
    const relType = String(patch.relation_type || patch.relation || "related").trim().slice(0, 48) || "related";
    const relLabel = String(patch.relation_label || relType).trim().slice(0, 80);
    const other = registry.characters.find((c) => c.id === relatedTo);
    if (!other) throw new Error("related_to_not_found");
    ensureRelation(row, relatedTo, relType, relLabel);
    const inverse =
      {
        twin_sister: "twin_sister",
        twin: "twin",
        partner: "partner",
        fwb: "fwb",
        roommate: "roommate",
        sibling: "sibling",
      }[relType] || "related";
    ensureRelation(other, row.id, inverse, relLabel);
  }

  writeCharactersRegistry(campaignId, registry, {
    baseVersion: registryBaseVersionFromBody(patch),
  });
  return getCharactersRegistry(campaignId, { includeHidden: Boolean(patch.include_hidden) });
}

/** GM: bind a Discord snowflake to a cast row + player-character-links.json (same campaign). */
function linkDiscordAccount(campaignId, body) {
  const characterId = String(body.character_id || body.id || "").trim();
  const discordUserId = String(body.discord_user_id || "").trim();
  const discordUsername = String(body.discord_username || "").trim();
  const playerName = String(body.player_name || discordUsername || "").trim();
  if (!characterId) throw new Error("character_id_required");
  if (!/^\d{17,20}$/.test(discordUserId)) throw new Error("bad_discord_user_id");
  const registry = readCharactersRegistry(campaignId);
  const row = registry.characters.find((c) => c && c.id === characterId);
  if (!row) throw new Error("character_not_found");
  row.discord_user_id = discordUserId;
  if (discordUsername) row.discord_username = discordUsername;
  if (playerName) row.player_name = playerName;
  writeCharactersRegistry(campaignId, registry, {
    baseVersion: registryBaseVersionFromBody(body),
  });

  const linksPath = path.join(REPO, "campaigns", campaignId, "player-character-links.json");
  let linksDoc = {
    version: 1,
    campaign_id: campaignId,
    updated_at: null,
    links: [],
    notes: "Manual Discord user id ↔ character registry id. No OAuth.",
  };
  try {
    if (fs.existsSync(linksPath)) {
      linksDoc = JSON.parse(fs.readFileSync(linksPath, "utf8"));
    }
  } catch (_) {
    /* keep default */
  }
  if (!Array.isArray(linksDoc.links)) linksDoc.links = [];
  const now = new Date().toISOString();
  const next = {
    discord_user_id: discordUserId,
    character_id: characterId,
    linked_at: now,
    note: String(body.note || playerName || discordUsername || "").slice(0, 200),
  };
  const ix = linksDoc.links.findIndex(
    (L) => L && String(L.discord_user_id) === discordUserId
  );
  if (ix >= 0) linksDoc.links[ix] = { ...linksDoc.links[ix], ...next };
  else linksDoc.links.push(next);
  linksDoc.updated_at = now;
  linksDoc.campaign_id = campaignId;
  linksDoc.version = Math.max(1, Number(linksDoc.version || 1) + 1);
  fs.writeFileSync(linksPath, JSON.stringify(linksDoc, null, 2) + "\n", "utf8");

  return {
    ok: true,
    character_id: characterId,
    discord_user_id: discordUserId,
    discord_username: row.discord_username,
    player_name: row.player_name,
    link: next,
    registry: getCharactersRegistry(campaignId, { includeHidden: true }),
  };
}

function createCharacterRegistry(campaignId, body) {
  // Soft rule: never hard-delete user-created characters (or overwrite registry wiping them) without explicit GM ask.
  const display = String(body.display_name || body.name || "").trim();
  if (!display) throw new Error("display_name_required");
  let id = String(body.id || "").trim() || slugifyCharacterId(display);
  if (/[^a-zA-Z0-9._-]/.test(id)) throw new Error("bad_id");
  const registry = readCharactersRegistry(campaignId);
  if (registry.characters.some((c) => c.id === id)) {
    if (body.id) throw new Error("id_exists");
    let n = 2;
    while (registry.characters.some((c) => c.id === `${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
  }
  const role = String(body.role || body.type || "npc").trim() || "npc";
  const status = String(body.status || (role === "pc" ? "active" : "npc")).trim();
  return patchCharacterRegistry(campaignId, {
    id,
    display_name: display,
    role,
    status,
    notes: body.notes || "",
    aliases: body.aliases || [],
    player_name: body.player_name || "",
    discord_username: body.discord_username || "",
    related_to: body.related_to || "",
    relation_type: body.relation_type || body.relation || "",
    relation_label: body.relation_label || "",
    images: [],
    image_path: "",
    doc_attachments: [],
    include_hidden: body.include_hidden,
    base_version: body.base_version,
    if_match_version: body.if_match_version,
  });
}

function mergeCharactersRegistry(campaignId, body) {
  const { mergeCharactersOnDisk } = require("./chars-registry-merge");
  const primaryId = String(body.primary_id || body.primary || "").trim();
  const secondaryIds = Array.isArray(body.secondary_ids)
    ? body.secondary_ids
    : String(body.secondary_id || body.secondary || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  if (!primaryId) throw new Error("primary_required");
  if (!secondaryIds.length) throw new Error("secondary_required");
  const registry = readCharactersRegistry(campaignId);
  const campRoot = path.join(REPO, "campaigns", campaignId);
  const plan = mergeCharactersOnDisk(campRoot, registry, primaryId, secondaryIds);
  writeCharactersRegistry(campaignId, plan.registry, {
    baseVersion: registryBaseVersionFromBody(body),
  });
  return {
    ...getCharactersRegistry(campaignId, { includeHidden: Boolean(body.include_hidden) }),
    merge: plan.summary || { primary: primaryId, secondary: secondaryIds },
  };
}

function safePortraitFilename(name) {
  const base = path.basename(String(name || "portrait")).replace(/[^a-zA-Z0-9._-]+/g, "_");
  const ext = path.extname(base).toLowerCase();
  if (!CHAR_IMAGE_EXTS.has(ext)) throw new Error("bad_image_ext");
  const stem = path.basename(base, ext).slice(0, 80) || "portrait";
  return `${stem}${ext}`;
}

function uploadCharacterPortrait(campaignId, charId, filename, dataBase64, body = {}) {
  if (!CAMPAIGNS[campaignId]) throw new Error("bad_campaign");
  if (!charId || /[^a-zA-Z0-9._-]/.test(charId)) throw new Error("bad_id");
  const safeName = safePortraitFilename(filename);
  const raw = String(dataBase64 || "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  const buf = Buffer.from(raw, "base64");
  if (!buf.length) throw new Error("empty_image");
  if (buf.length > CHAR_PORTRAIT_UPLOAD_MAX) throw new Error("image_too_large");
  const relDir = `characters/portraits/${charId}`;
  const absDir = path.join(REPO, "campaigns", campaignId, relDir);
  fs.mkdirSync(absDir, { recursive: true });
  const relPath = `${relDir}/${safeName}`;
  fs.writeFileSync(path.join(REPO, "campaigns", campaignId, relPath), buf);
  const registry = readCharactersRegistry(campaignId);
  let row = registry.characters.find((c) => c.id === charId);
  if (!row) {
    row = {
      id: charId,
      display_name: charId,
      story_path: "",
      discord_user_id: "",
      discord_username: "",
      player_name: "",
      status: "active",
      can_proxy: false,
      notes: "",
      images: [],
      image_path: relPath,
    };
    registry.characters.push(row);
  }
  const imgs = Array.isArray(row.images) ? row.images.slice() : [];
  if (!imgs.includes(relPath)) imgs.push(relPath);
  row.images = imgs;
  if (!row.image_path) row.image_path = relPath;
  writeCharactersRegistry(campaignId, registry, {
    baseVersion: registryBaseVersionFromBody(body),
  });
  return getCharactersRegistry(campaignId);
}

/**
 * Remove one portrait from a character gallery. Does not delete the character.
 * Unlinks registry images[] entry; if it was primary, picks next remaining or clears.
 * Deletes the file only when it lives under characters/portraits/<id>/ (avoids disk re-scan orphans).
 * Never deletes files under another character’s portraits/ dir.
 */
function removeCharacterPortrait(campaignId, charId, imagePath, body = {}) {
  if (!CAMPAIGNS[campaignId]) throw new Error("bad_campaign");
  if (!charId || /[^a-zA-Z0-9._-]/.test(charId)) throw new Error("bad_id");
  const rel = normalizeCampaignRelPath(imagePath);
  if (!rel) throw new Error("bad_image_path");
  // Refuse cross-character portrait paths (do not unlink another cast member’s art as ours).
  const otherPortrait = /^characters\/portraits\/([^/]+)\//.exec(rel);
  if (otherPortrait && otherPortrait[1] !== charId) {
    throw new Error("path_other_character");
  }
  const otherLeaf = /^characters\/portraits\/([^/.]+)(\.[a-z0-9]+)$/i.exec(rel);
  if (otherLeaf && otherLeaf[1] !== charId) {
    throw new Error("path_other_character");
  }
  const registry = readCharactersRegistry(campaignId);
  const row = registry.characters.find((c) => c.id === charId);
  if (!row) throw new Error("character_not_found");
  // Soft rule: never hard-delete characters here — portrait file only.
  const before = resolveCharacterImages(campaignId, row);
  if (!before.images.includes(rel) && normalizeCampaignRelPath(row.image_path || "") !== rel) {
    throw new Error("image_not_in_gallery");
  }
  const nextImgs = before.images.filter((p) => p !== rel);
  row.images = nextImgs;
  const primary = normalizeCampaignRelPath(row.image_path || "");
  if (primary === rel || !nextImgs.includes(primary)) {
    row.image_path = nextImgs[0] || "";
  }
  if (nextImgs.length === 0) {
    row.image_path = "";
    row.doc_attachments = [];
  }
  let deleted_file = false;
  const underDir = rel.startsWith(`characters/portraits/${charId}/`);
  const leafAlone = CHAR_IMAGE_EXTS.has(path.extname(rel).toLowerCase())
    && rel === `characters/portraits/${charId}${path.extname(rel)}`;
  if (underDir || leafAlone) {
    const abs = path.join(REPO, "campaigns", campaignId, rel);
    const campRoot = path.resolve(path.join(REPO, "campaigns", campaignId));
    const resolved = path.resolve(abs);
    if (
      (resolved === campRoot || resolved.startsWith(campRoot + path.sep)) &&
      fs.existsSync(resolved) &&
      fs.statSync(resolved).isFile()
    ) {
      fs.unlinkSync(resolved);
      deleted_file = true;
    }
  }
  writeCharactersRegistry(campaignId, registry, {
    baseVersion: registryBaseVersionFromBody(body),
  });
  return {
    ...getCharactersRegistry(campaignId),
    removed_path: rel,
    deleted_file,
  };
}

const CHAR_IMAGE_CT_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

function isBlockedPortraitFetchHost(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  // Literal IPv4 private / loopback / link-local / cloud metadata
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function assertPortraitFetchUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("bad_url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("url_http_https_only");
  }
  if (parsed.username || parsed.password) throw new Error("url_credentials_forbidden");
  if (isBlockedPortraitFetchHost(parsed.hostname)) throw new Error("url_host_blocked");
  return parsed;
}

function extFromContentType(ct) {
  const base = String(ct || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return CHAR_IMAGE_CT_EXT[base] || "";
}

function portraitFilenameFromUrl(parsedUrl, contentType) {
  let leaf = path.basename(parsedUrl.pathname || "") || "portrait";
  try {
    leaf = decodeURIComponent(leaf);
  } catch {
    /* keep raw */
  }
  leaf = leaf.split("?")[0].replace(/[^a-zA-Z0-9._-]+/g, "_") || "portrait";
  let ext = path.extname(leaf).toLowerCase();
  if (!CHAR_IMAGE_EXTS.has(ext)) {
    ext = extFromContentType(contentType) || ".jpg";
    leaf = `${path.basename(leaf, path.extname(leaf)) || "portrait"}${ext}`;
  }
  return leaf;
}

/** Browser-ish headers so image CDNs that check Referer/UA (hotlink protection) allow the fetch. */
function portraitFetchHeaders(parsedUrl) {
  const origin = `${parsedUrl.protocol}//${parsedUrl.host}/`;
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: origin,
  };
}

function bufferLooksLikeHtml(buf) {
  const sniff = Buffer.isBuffer(buf) ? buf.slice(0, 512).toString("utf8") : String(buf || "").slice(0, 512);
  const s = sniff.trim().toLowerCase();
  return (
    s.startsWith("<!doctype html") ||
    s.startsWith("<html") ||
    s.includes("<html") ||
    s.includes("<head") ||
    (s.startsWith("<?xml") && s.includes("<html"))
  );
}

/**
 * Server-side fetch of a remote image for portrait import (admin).
 * Rejects non-http(s), private hosts, HTML pages, non-images, oversized bodies, timeouts.
 * Sends browser-like User-Agent + Referer (source host) so hotlink-protected CDNs work.
 */
function fetchPortraitImageBuffer(imageUrl, timeoutMs = 15000) {
  const maxRedirects = 5;

  function getOnce(urlStr, redirectsLeft) {
    const parsed = assertPortraitFetchUrl(urlStr);
    return new Promise((resolve, reject) => {
      const lib = parsed.protocol === "https:" ? https : http;
      const req = lib.get(
        parsed,
        {
          headers: portraitFetchHeaders(parsed),
          timeout: timeoutMs,
        },
        (res) => {
          const code = res.statusCode || 0;
          if (code >= 300 && code < 400 && res.headers.location) {
            res.resume();
            if (redirectsLeft <= 0) {
              reject(new Error("too_many_redirects"));
              return;
            }
            let next;
            try {
              next = new URL(res.headers.location, parsed).href;
            } catch {
              reject(new Error("bad_redirect"));
              return;
            }
            getOnce(next, redirectsLeft - 1).then(resolve, reject);
            return;
          }
          if (code === 403) {
            res.resume();
            reject(new Error("fetch_forbidden_403"));
            return;
          }
          if (code === 404) {
            res.resume();
            reject(new Error("fetch_not_found_404"));
            return;
          }
          if (code >= 400) {
            res.resume();
            reject(new Error(`fetch_http_${code}`));
            return;
          }
          const ct = String(res.headers["content-type"] || "");
          const ctBase = ct.split(";")[0].trim().toLowerCase();
          if (ctBase === "text/html" || ctBase === "application/xhtml+xml") {
            res.resume();
            reject(new Error("need_direct_image_url"));
            return;
          }
          if (ctBase && !ctBase.startsWith("image/")) {
            res.resume();
            reject(new Error("not_an_image"));
            return;
          }
          const lenHdr = Number(res.headers["content-length"] || 0);
          if (lenHdr > CHAR_PORTRAIT_UPLOAD_MAX) {
            res.resume();
            reject(new Error("image_too_large"));
            return;
          }
          const chunks = [];
          let total = 0;
          res.on("data", (c) => {
            total += c.length;
            if (total > CHAR_PORTRAIT_UPLOAD_MAX) {
              req.destroy();
              reject(new Error("image_too_large"));
              return;
            }
            chunks.push(c);
          });
          res.on("end", () => {
            const buf = Buffer.concat(chunks);
            if (!buf.length) {
              reject(new Error("empty_image"));
              return;
            }
            if (bufferLooksLikeHtml(buf)) {
              reject(new Error("need_direct_image_url"));
              return;
            }
            const ext = extFromContentType(ct) || path.extname(parsed.pathname).toLowerCase();
            if (ctBase && !ctBase.startsWith("image/") && !CHAR_IMAGE_EXTS.has(ext)) {
              reject(new Error("not_an_image"));
              return;
            }
            // If server omitted Content-Type, require a known image extension in the URL.
            if (!ctBase && !CHAR_IMAGE_EXTS.has(ext)) {
              reject(new Error("not_an_image"));
              return;
            }
            resolve({
              buf,
              filename: portraitFilenameFromUrl(parsed, ct),
              contentType: ctBase || "",
            });
          });
        }
      );
      req.on("error", (e) => reject(new Error(e.message || "fetch_failed")));
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("fetch_timeout"));
      });
    });
  }

  return getOnce(String(imageUrl || "").trim(), maxRedirects);
}

async function importCharacterPortraitFromUrl(campaignId, charId, imageUrl, body = {}) {
  const { buf, filename } = await fetchPortraitImageBuffer(imageUrl);
  return uploadCharacterPortrait(campaignId, charId, filename, buf.toString("base64"), body);
}

/**
 * Copy sheet Attachment: refs from discord-export (or already-resolved paths)
 * into characters/portraits/<id>/ and set primary when missing.
 * Optional Discord re-fetch for basenames still missing after local restore.
 */
async function resolveCharacterDocAttachments(campaignId, opts = {}) {
  if (!CAMPAIGNS[campaignId]) throw new Error("bad_campaign");
  const charId = opts.id ? String(opts.id) : "";
  const fromDiscord = Boolean(opts.from_discord);
  const campRoot = path.join(REPO, "campaigns", campaignId);
  const registry = readCharactersRegistry(campaignId);
  const targets = (registry.characters || []).filter((c) => {
    if (charId) return c.id === charId;
    return !c.hidden && c.role !== "gm";
  });
  if (charId && !targets.length) throw new Error("char_not_found");

  const summary = {
    campaign: campaignId,
    chars: [],
    copied: 0,
    already: 0,
    missing: 0,
    skipped_non_image: 0,
    skipped_other_character: 0,
    discord: null,
  };

  for (const row of targets) {
    const refs = extractDocAttachmentRefs(campaignId, row);
    const charResult = {
      id: row.id,
      refs: refs.length,
      copied: [],
      already: [],
      missing: [],
      skipped_non_image: [],
      skipped_other_character: [],
    };
    const portraitDirRel = `characters/portraits/${row.id}`;
    const portraitDirAbs = path.join(campRoot, portraitDirRel);
    const imgs = (Array.isArray(row.images) ? row.images.map(String) : []).filter(
      (p) => !isCrossCharacterImagePath(row.id, p)
    );

    for (const ref of refs) {
      if (/^https?:\/\//i.test(ref)) {
        charResult.missing.push({ ref, reason: "remote_url" });
        summary.missing += 1;
        continue;
      }
      const base = path.basename(ref);
      const ext = path.extname(base).toLowerCase();
      if (!CHAR_IMAGE_EXTS.has(ext)) {
        charResult.skipped_non_image.push(ref);
        summary.skipped_non_image += 1;
        continue;
      }
      const destRel = `${portraitDirRel}/${base}`;
      const destAbs = path.join(campRoot, destRel);
      if (fs.existsSync(destAbs) && fs.statSync(destAbs).isFile()) {
        charResult.already.push(destRel);
        summary.already += 1;
        if (!imgs.includes(destRel)) imgs.push(destRel);
        continue;
      }
      let srcAbs = null;
      const norm = normalizeCampaignRelPath(ref);
      if (norm) {
        if (isCrossCharacterImagePath(row.id, norm)) {
          charResult.skipped_other_character.push(ref);
          summary.skipped_other_character += 1;
          continue;
        }
        const abs = path.join(campRoot, norm);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) srcAbs = abs;
      }
      // Prefer local discord-export, then this character’s own dirs — never other cast.
      if (!srcAbs) {
        const exported = findExportBasenameHit(campaignId, base);
        if (exported) srcAbs = path.join(campRoot, exported);
      }
      if (!srcAbs) {
        const owned = findOwnedBasenameHit(campaignId, row.id, base);
        if (owned) srcAbs = path.join(campRoot, owned);
      }
      if (!srcAbs) {
        charResult.missing.push({ ref, reason: "not_in_export" });
        summary.missing += 1;
        continue;
      }
      const srcRel = path.relative(campRoot, srcAbs).replace(/\\/g, "/");
      if (isCrossCharacterImagePath(row.id, srcRel)) {
        charResult.skipped_other_character.push(ref);
        summary.skipped_other_character += 1;
        continue;
      }
      fs.mkdirSync(portraitDirAbs, { recursive: true });
      fs.copyFileSync(srcAbs, destAbs);
      charResult.copied.push(destRel);
      summary.copied += 1;
      if (!imgs.includes(destRel)) imgs.push(destRel);
    }

    row.images = imgs;
    if (!row.image_path || !characterImageAbs(campaignId, row.image_path)) {
      const primary = preferStillPrimary(imgs.filter((p) => characterImageAbs(campaignId, p)));
      if (primary) row.image_path = primary;
    }
    if (refs.length) row.doc_attachments = refs;
    summary.chars.push(charResult);
  }

  writeCharactersRegistry(campaignId, registry, {
    baseVersion: registryBaseVersionFromBody(opts),
  });

  if (fromDiscord) {
    summary.discord = await fetchMissingAttachmentsFromDiscord(campaignId, summary);
  }

  const enriched = getCharactersRegistry(campaignId, { includeHidden: Boolean(charId) });
  return { ...summary, registry: enriched };
}

async function fetchMissingAttachmentsFromDiscord(campaignId, summary) {
  const script = path.join(
    REPO,
    "campaigns",
    campaignId,
    "tools",
    "fetch_unresolved_attachments.py"
  );
  if (!fs.existsSync(script)) {
    return {
      ok: false,
      error: "fetch_script_missing",
      fix: `python campaigns/${campaignId}/tools/fetch_unresolved_attachments.py`,
      hint: "Script not on disk; local export restore still ran.",
    };
  }
  const stillMissing = [];
  for (const c of summary.chars || []) {
    for (const m of c.missing || []) {
      if (m?.ref) stillMissing.push({ id: c.id, ref: m.ref });
    }
  }
  if (!stillMissing.length) {
    return { ok: true, skipped: true, reason: "nothing_missing_after_local", copied: 0 };
  }
  const tmp = path.join(REPO, "agents", "state", `attach-fetch-${Date.now()}.json`);
  try {
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({ campaign: campaignId, missing: stillMissing }, null, 2));
    const { stdout, stderr } = await execFileAsync(
      "python3",
      [script, "--job", tmp, "--batch", "4"],
      {
        cwd: path.join(REPO, "campaigns", campaignId),
        timeout: 180000,
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env },
      }
    );
    let parsed = null;
    try {
      parsed = JSON.parse(String(stdout || "").trim().split("\n").filter(Boolean).pop() || "{}");
    } catch {
      parsed = null;
    }
    return {
      ok: Boolean(parsed?.ok),
      copied: parsed?.copied || 0,
      failed: parsed?.failed || [],
      token_ok: parsed?.token_ok,
      message: parsed?.message || String(stderr || "").slice(0, 400),
      fix: parsed?.fix || null,
    };
  } catch (e) {
    const msg = String(e?.stderr || e?.message || e).slice(0, 400);
    return {
      ok: false,
      error: "discord_fetch_failed",
      message: msg,
      fix:
        "Ensure DISCORD_TOKEN/DISCORD_BOT_TOKEN in campaigns/tropic-gooner/.env or ~/.hermes/.env, Message Content Intent on, then: " +
        `python3 campaigns/${campaignId}/tools/fetch_unresolved_attachments.py`,
    };
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
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

/** Visible cast roster for campaign writing (names/roles — not full sheets). */
function buildCampaignRosterExcerpt(campaignId, maxChars = 2800) {
  const cfg = CAMPAIGNS[campaignId];
  if (!cfg?.charactersRegistry) return "";
  let reg;
  try {
    reg = readCharactersRegistry(campaignId);
  } catch {
    return "";
  }
  const chars = (reg.characters || []).filter((c) => c && !c.canonical_id && c.status !== "hidden");
  if (!chars.length) return "";
  const lines = [`[Cast roster — ${cfg.label} · ${chars.length} visible]`];
  for (const c of chars.slice(0, 40)) {
    const role = c.role || c.type || "npc";
    const notes = String(c.notes || "").replace(/\s+/g, " ").trim().slice(0, 80);
    lines.push(
      `- ${c.display_name || c.id} (${role}${c.status ? `, ${c.status}` : ""})${notes ? ` — ${notes}` : ""}`
    );
  }
  lines.push(
    "You may propose new NPCs/PCs and relation edges; use CAMPAIGN_WRITE to save lore notes. Soft-hide/merge only via Chars UI unless the GM asks."
  );
  return lines.join("\n").slice(0, maxChars);
}

/** Resolve how much campaign material to inject. */
function resolveChatContextScope(context) {
  const raw = String(context?.context_scope || "").trim().toLowerCase();
  if (raw === "doc" || raw === "doc-only" || raw === "focus") return "doc";
  if (raw === "campaign" || raw === "entire" || raw === "whole") return "campaign";
  if (raw === "campaign+focus" || raw === "both" || raw === "campaign+doc") return "campaign+focus";
  // Default: if a focus doc is bound, keep campaign canon too (writing/brainstorm).
  const hasFocus =
    !!(context?.path || context?.story_path) &&
    (context?.type === "story" ||
      context?.type === "character" ||
      context?.story_path ||
      context?.path);
  return hasFocus ? "campaign+focus" : "campaign";
}

function listCampaignFocusDocs(campaignId, limit = 80) {
  if (!CAMPAIGNS[campaignId]) return [];
  const catalog = listStoryCatalog();
  const camp = catalog.campaigns?.[campaignId];
  const files = camp?.files || [];
  return files.slice(0, limit).map((f) => ({
    path: f.path,
    name: f.name || path.basename(f.path),
    group: f.group || "",
  }));
}

/**
 * Apply <<<CAMPAIGN_WRITE path="campaigns/<id>/...>>>body<<<END_CAMPAIGN_WRITE>>>
 * Only under the bound campaign tree. Returns { reply, artifacts }.
 */
function applyCampaignWriteDirectives(replyText, campaignId) {
  const raw = String(replyText || "");
  if (!campaignId || !CAMPAIGNS[campaignId] || !/<<<\s*CAMPAIGN_WRITE/i.test(raw)) {
    return { reply: raw, artifacts: [] };
  }
  const artifacts = [];
  const re =
    /<<<\s*CAMPAIGN_WRITE\s+path=["']([^"']+)["']\s*>>>\s*([\s\S]*?)\s*<<<\s*END_CAMPAIGN_WRITE\s*>>>/gi;
  let out = raw;
  let match;
  const writes = [];
  while ((match = re.exec(raw)) !== null) {
    writes.push({ full: match[0], rel: match[1].trim().replace(/\\/g, "/"), body: match[2] });
  }
  for (const w of writes) {
    let rel = w.rel.replace(/^\/+/, "");
    if (!rel.startsWith(`campaigns/${campaignId}/`)) {
      // Allow short form notes/foo.md → campaigns/<id>/notes/foo.md
      if (
        rel.startsWith("notes/") ||
        rel.startsWith("story/") ||
        rel.startsWith("lore/") ||
        rel.startsWith("characters/")
      ) {
        rel = `campaigns/${campaignId}/${rel}`;
      } else {
        continue;
      }
    }
    // .md only under this campaign — never characters-registry.json or escapes
    if (rel.includes("..") || !/\.md$/i.test(rel)) continue;
    if (/characters-registry\.json$/i.test(rel)) continue;
    const abs = path.join(REPO, rel);
    const root = path.join(REPO, "campaigns", campaignId);
    if (!abs.startsWith(root + path.sep) && abs !== root) continue;
    try {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const body = String(w.body || "").trim();
      if (!body) continue;
      fs.writeFileSync(abs, body.endsWith("\n") ? body : `${body}\n`, "utf8");
      const art = normalizeChatArtifact(
        { type: "note", path: rel, label: path.basename(rel) },
        campaignId
      );
      if (art) artifacts.push(art);
      out = out.replace(w.full, `\n*[Saved: ${rel}]*\n`);
    } catch {
      /* skip failed write */
    }
  }
  return { reply: out.trim(), artifacts };
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

function buildChatStylePreamble(responseMode, context, chatOpts = {}) {
  const brief = responseMode !== "workshop";
  const lines = [CHAT_RUNTIME_GUARDRAIL, ""];
  const mode = chatOpts.chatMode || getChatMode(chatOpts.chatModeId);
  if (context?.character_interview) {
    if (mode?.system_extra) {
      lines.push(`[Chat mode — ${mode.label || mode.id}]`, mode.system_extra, "");
    }
    lines.push(
      "[Response style — Character interview]",
      "Reply in first person as the bound character. Stay concise unless the GM asks for depth.",
      "Use only voice, backstory, and facts from the injected character sheet and registry notes.",
      "Do not invent canon beyond those sources — if unknown, stay in character and say you do not know.",
      "The human is the GM (interviewer or scene partner). You are the character, not a scribe or GM."
    );
    return lines.join("\n");
  }
  if (mode?.system_extra) {
    lines.push(`[Chat mode — ${mode.label || mode.id}]`, mode.system_extra, "");
  }
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

    const syncLast = readLaneHeartbeat("sync-tick.last");
    const thinkLast = readLaneHeartbeat("think-tick.last");
    lines.push(`sync last: ${syncLast || "n/a"}`);
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
  const blocks = [
    buildChatStylePreamble(responseMode, context, {
      chatModeId: options.chatModeId,
      chatMode: options.chatMode,
    }),
  ];
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
    const mem = formatMazdaBuildMemoryBlock(m);
    if (mem) blocks.push(mem);
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
    const scope = resolveChatContextScope(context);
    if (scope !== "campaign") {
      try {
        const doc = readStoryDoc(context.campaign, context.path);
        blocks.push(
          `[Focus doc — ${doc.label} / ${doc.file}]\n\n${doc.content.slice(0, 12000)}`
        );
      } catch (err) {
        blocks.push(`[Focus doc — file unavailable: ${context.path} (${err.message || "not_found"})]`);
      }
    }
    if (context.workshop_mode || context.ask_human || scope !== "doc") {
      blocks.push(
        `[Campaign workshop — roles]
The human is the GM. You are scribe/implementer for this chronicle: brainstorm, capture theories, list follow-ups, propose tasks and new notes.
You may save durable lore with:
<<<CAMPAIGN_WRITE path="notes/your-slug.md">>>
markdown body
<<<END_CAMPAIGN_WRITE>>>
(Paths must stay under this campaign. Prefer notes/ for new docs; edit existing focus paths carefully.)
Do not act as GM.`
      );
    }
  }
  if (context.type === "character" && context.campaign) {
    const reg = readCharactersRegistry(context.campaign);
    const row =
      (context.character_id && reg.characters.find((c) => c.id === context.character_id)) ||
      (context.path && findRegistryForPath(reg, context.path)) ||
      (context.story_path && findRegistryForPath(reg, context.story_path));
    const sheetPath = context.path || context.story_path || row?.story_path || "";
    const scope = resolveChatContextScope(context);
    if (context.character_interview) {
      const who = row?.display_name || context.character_id || "this character";
      blocks.push(
        `[Character interview — ${who}]
You ARE ${who}. Speak in first person as them for the whole reply.
Mirror speech patterns and attitude from the character sheet when present.
The human is the GM — they may interview you, probe backstory, or play a short scene. You are not the GM and not a meta narrator.`
      );
    } else if (context.workshop_mode && !sheetPath) {
      blocks.push(
        `[Campaign workshop — ${context.campaign}]
The human is the GM for this chronicle. You are scribe/implementer: brainstorm, capture theories, list follow-ups, suggest registry/task updates. Do not act as GM.`
      );
    }
    if (row) {
      blocks.push(
        `[Character registry — ${row.display_name}]\nstatus: ${row.status}\nplayer: ${row.player_name || "(unknown)"}\ndiscord: ${row.discord_username || row.discord_user_id || "(unlinked)"}\ncan_proxy (future): ${row.can_proxy}\nnotes: ${row.notes || ""}`.slice(
          0,
          2000
        )
      );
    }
    if (!context.character_interview && (context.workshop_mode || context.ask_human || scope !== "doc")) {
      blocks.push(
        `[Campaign workshop — roles]
The human is the GM (creative authority). You are the scribe/implementer: capture ideas, brainstorm options, note open questions, suggest tasks or registry updates. Do not act as GM or lecture. When they settle on something, offer to record it via CAMPAIGN_WRITE. Ask only when blocked on facts — never invent Discord IDs or player identities.`
      );
    }
    if (sheetPath && scope !== "campaign") {
      try {
        const doc = readStoryDoc(context.campaign, sheetPath);
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
    const scope = resolveChatContextScope(context);
    if (scope !== "campaign") {
      try {
        const doc = readStoryDoc(context.campaign, context.story_path);
        blocks.push(`[Focus doc]\n\n${doc.content.slice(0, 8000)}`);
      } catch {
        /* optional */
      }
    }
  }
  if (context.campaign && CAMPAIGNS[context.campaign]) {
    const campLabel = campaignDisplayLabel(context);
    const scope = resolveChatContextScope(context);
    blocks.push(
      `[BOUND CAMPAIGN — already chosen by the human]
This thread is locked to: ${campLabel} (id: ${context.campaign}${context.layer ? `, layer: ${context.layer}` : ""}).
Context scope: ${scope} (campaign = whole chronicle; campaign+focus = chronicle + one focus doc; doc = focus only).
Do NOT ask which campaign this lives in. Do NOT offer Tropic Gooner / Hunter / SpaceQuest / NYC Mafia as alternatives.
The campaign identity is settled — treat "${campLabel}" as given.
Stay in this campaign only. If a detail is missing, ask about that detail — not the campaign identity.`
    );
    if (scope !== "doc") {
      const canonBudget = scope === "campaign" ? 12000 : 8000;
      const canon = buildCampaignContextExcerpt(context.campaign, canonBudget);
      if (canon) blocks.push(canon);
      const roster = buildCampaignRosterExcerpt(context.campaign);
      if (roster) blocks.push(roster);
      blocks.push(
        `[Campaign writing — ${campLabel}]
Use injected canon + cast roster + any focus doc. Brainstorm factions, places, arcs, and characters from scratch when asked.
Prefer rise/fall phases with nuance. Propose concrete next notes/scenes.
To persist a new or updated markdown note in this campaign, emit CAMPAIGN_WRITE fences (notes/…md). Deliver substance in one reply — no "let me read files" meta.`
      );
    } else {
      blocks.push(
        `[Focus-only mode]
Only the focus document is injected (no full campaign dump). Ask if you need another doc opened, or the GM can switch Context scope to Entire campaign.`
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

// A model id may carry an explicit provider prefix (`zenmux:openai/gpt-5`,
// `openrouter:...`). Provider names are matched only at the start before the first
// `/`, so this never collides with slug bodies or the `:free` suffix. Unprefixed ids
// keep Hermes' default (auto→openrouter) routing — behaviour unchanged without a prefix.
function parseModelProvider(modelId) {
  const m = String(modelId ?? "");
  const cursorMatch = /^cursor:(.+)$/i.exec(m);
  if (cursorMatch) return { provider: "cursor", model: cursorMatch[1] || "auto" };
  const match = /^(zenmux|openrouter):(.+)$/.exec(m);
  if (match) return { provider: match[1], model: match[2] };
  return { provider: null, model: m };
}

async function execCursorChatOnce(prompt, modelId = "cursor:auto", execOpts = {}) {
  const { model: cursorVariant } = parseModelProvider(modelId);
  const timeoutMs = Number(execOpts.timeoutMs) || 300_000;
  const timeoutSec = Math.max(30, Math.round(timeoutMs / 1000));
  if (!fs.existsSync(CURSOR_AGENT_SCRIPT)) {
    return {
      error: "Cursor agent wrapper missing on potato (scripts/linuxbox/cursor-agent-run.sh).",
      model: modelId,
    };
  }
  const env = {
    ...process.env,
    AGENT_DUMP: REPO,
    CURSOR_AGENT_TIMEOUT_SEC: String(timeoutSec),
    PATH: `${path.dirname(CURSOR_AGENT_BIN)}${path.delimiter}${process.env.PATH || ""}`,
  };
  if (fs.existsSync(CURSOR_AGENT_ENV)) {
    try {
      const raw = fs.readFileSync(CURSOR_AGENT_ENV, "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (key && env[key] == null) env[key] = val;
      }
    } catch {
      /* non-fatal — script also sources env file */
    }
  }
  const header = [
    "You are the linuxbox Cursor SDK agent for ~/agent-dump.",
    "Use repo skills (.cursor/skills/), AGENTS.md, ponytail YAGNI.",
    "Smallest correct diff; one concrete verify step.",
    `Lane: cursor:${cursorVariant || "auto"} via Python SDK (paid — explicit pick only).`,
    "",
  ].join("\n");
  const fullPrompt = `${header}${String(prompt ?? "")}`;
  env.CURSOR_VARIANT = "auto";
  env.CURSOR_SDK_MODEL = "auto";
  env.CURSOR_SDK_RUNTIME = process.env.CURSOR_SDK_RUNTIME || "local";
  env.CURSOR_SDK_AUTO_ONLY = "1";
  env.CURSOR_SDK_PYTHON =
    process.env.CURSOR_SDK_PYTHON ||
    path.join(process.env.HOME || "/home/abhinav", "venvs/cursor-sdk/bin/python");
  let stdout = "";
  let stderr = "";
  try {
    const result = await execFileAsync("bash", [CURSOR_AGENT_SCRIPT, fullPrompt], {
      cwd: REPO,
      env,
      timeout: timeoutMs + 15_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    stdout = result.stdout || "";
    stderr = result.stderr || "";
  } catch (err) {
    const out = hermesChatCombinedOutput(err, "") || String(err.message || err);
    if (isHermesExecTimeout(err) || /timed out after/i.test(out)) {
      return {
        error: `Cursor SDK agent timed out (>${Math.round(timeoutMs / 1000)}s).`,
        raw: out,
        model: modelId,
        timed_out: true,
      };
    }
    if (/exit 125|No CURSOR_API_KEY|not logged in|auth failed/i.test(out)) {
      return {
        error: "Cursor SDK not authenticated — set CURSOR_API_KEY in ~/.cursor-agent.env on potato.",
        raw: out,
        model: modelId,
      };
    }
    if (/exit 127|cursor-sdk not installed|not importable|not found/i.test(out)) {
      return {
        error:
          "cursor-sdk missing — use ~/venvs/cursor-sdk (uv Python 3.12) or set CURSOR_SDK_PYTHON.",
        raw: out,
        model: modelId,
      };
    }
    return { error: summarizeHermesFailure(out) || "Cursor SDK agent failed.", raw: out, model: modelId };
  }
  const out = hermesChatCombinedOutput(stdout, stderr);
  const reply = String(out || "").trim();
  if (!reply) {
    return {
      error: "Cursor agent returned empty output.",
      raw: out,
      model: modelId,
    };
  }
  return { reply, raw: out, model: modelId, provider: "cursor" };
}

async function execHermesChatOnce(profile, prompt, modelId = null, execOpts = {}) {
  // argv-only (no bash -lc): campaign canon has many `backticks`; bash would run each
  // as command substitution → flood of `bash: line 1: …: command not found` on stderr.
  const { provider: modelProvider, model: resolvedModel } = parseModelProvider(modelId);
  const args = [];
  if (profile && profile !== "default") args.push("-p", profile);
  args.push("chat", "-Q", "-q", String(prompt ?? ""));
  if (modelProvider) args.push("--provider", modelProvider);
  if (resolvedModel) args.push("-m", String(resolvedModel));
  if (execOpts.maxTurns != null) args.push("--max-turns", String(Number(execOpts.maxTurns)));
  // ponytail: hermes-4-70b has no tool-use endpoints on OpenRouter; default hermes-cli
  // includes terminal/browser. Unknown `-t none` → enabled=["none"] → zero resolved tools.
  if (execOpts.disableTools !== false) args.push("-t", "none");
  const hermesEnv = {
    ...process.env,
    PATH: `${path.dirname(HERMES_BIN)}${path.delimiter}${process.env.PATH || ""}`,
  };
  // Free models are slow on large campaign prompts — shorter cap so failover reaches paid/next free.
  const isFree = isChatFreeModelId(modelId);
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
    "character_interview",
    "context_scope",
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
  if (ctx.context_scope) {
    const s = resolveChatContextScope({ context_scope: ctx.context_scope, ...ctx });
    ctx.context_scope = s;
  }
  if (Array.isArray(raw.tags) && raw.tags.length) ctx.tags = raw.tags.filter(Boolean).slice(0, 12);
  return ctx;
}

function coerceChatMsgAt(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const n = Date.parse(String(raw));
  return Number.isFinite(n) ? n : null;
}

/** Soft-normalize message times on read (no invent). Coerce ts/created_at → at. */
function decorateChatThreadTimes(thread) {
  if (!thread || !Array.isArray(thread.messages)) return thread;
  for (const m of thread.messages) {
    if (!m || typeof m !== "object") continue;
    if (m.at == null) {
      const fromAlias = coerceChatMsgAt(m.ts ?? m.created_at);
      if (fromAlias != null) m.at = fromAlias;
    } else {
      const n = coerceChatMsgAt(m.at);
      if (n != null) m.at = n;
    }
  }
  return thread;
}

function readChatThread(id) {
  if (!id || !/^[a-f0-9]{16}$/.test(id)) return null;
  const file = chatThreadFile(id);
  if (!fs.existsSync(file)) return null;
  try {
    return decorateChatThreadTimes(JSON.parse(fs.readFileSync(file, "utf8")));
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
  const modeSettings = resolveChatModeSettings(body.chat_mode, {
    context,
    profile: body.profile,
    response_mode: body.response_mode,
  });
  const showPicker = !!modeSettings.showModelPicker;
  const preferred = resolvePreferredChatModel(body.preferred_model);
  const thread = {
    id,
    title: String(body.title || "New chat").trim().slice(0, 120) || "New chat",
    context,
    messages: Array.isArray(body.messages) ? body.messages.slice(0, CHAT_MAX_MESSAGES) : [],
    created_at: now,
    updated_at: now,
    parent_id: body.parent_id || null,
    branch_from_index: body.branch_from_index ?? null,
    profile: modeSettings.profile,
    response_mode: modeSettings.responseMode,
    chat_mode: modeSettings.chatModeId,
    preferred_model: preferred,
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
  if (extras.model) msg.model = String(extras.model).trim().slice(0, 160);
  if (extras.paid_retry) msg.paid_retry = true;
  if (extras.free_fallback) msg.free_fallback = true;
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
  if (patch.chat_mode) {
    const mode = getChatMode(patch.chat_mode);
    if (mode) thread.chat_mode = mode.id;
  }
  if (patch.preferred_model != null) {
    const pref = resolvePreferredChatModel(patch.preferred_model);
    thread.preferred_model = pref || null;
  }
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
/** Cursor SDK jobs may run up to ~5m; keep stale-fail slightly above that. */
const CURSOR_CHAT_JOB_TIMEOUT_MS = 6 * 60 * 1000;
/** Hermes OR/ZenMux Hub chat — independent of Cursor SDK lane. */
const CHAT_QUEUE = [];
/** Cursor SDK Auto Hub chat — parallel worker (does not block Hermes think or Hermes Hub chat). */
const CURSOR_CHAT_QUEUE = [];
let chatWorkerBusy = false;
let cursorChatWorkerBusy = false;

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
  const now = Date.now();
  for (const job of CHAT_JOBS.values()) {
    if (job.status !== "pending" && job.status !== "queued") continue;
    const started = job.started_at || job.created_at;
    const limit =
      job.lane === "cursor" || isCursorChatModelId(job.preferred_model)
        ? CURSOR_CHAT_JOB_TIMEOUT_MS
        : CHAT_JOB_TIMEOUT_MS;
    if (started >= now - limit) continue;
    updateChatJob(job, {
      status: "error",
      error:
        job.lane === "cursor"
          ? "Cursor chat timed out (>6m). Retry or run via SSH `cursor-agent-run.sh`."
          : "Chat timed out (>4m). Hermes may be busy — retry with less context or wait a minute.",
      finished_at: now,
    });
  }
}

function hermesChatQueueDepth() {
  return CHAT_QUEUE.length + (chatWorkerBusy ? 1 : 0);
}

function cursorChatQueueDepth() {
  return CURSOR_CHAT_QUEUE.length + (cursorChatWorkerBusy ? 1 : 0);
}

function chatQueueDepth() {
  return hermesChatQueueDepth() + cursorChatQueueDepth();
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
  for (const item of CURSOR_CHAT_QUEUE) {
    if (item.threadId === threadId) return item.job;
  }
  if (chatWorkerBusy || cursorChatWorkerBusy) {
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
  let hermesIdx = chatWorkerBusy ? 1 : 0;
  for (const item of CHAT_QUEUE) {
    updateChatJob(item.job, { status: "queued", queue_depth: hermesIdx, lane: "hermes" });
    hermesIdx += 1;
  }
  let cursorIdx = cursorChatWorkerBusy ? 1 : 0;
  for (const item of CURSOR_CHAT_QUEUE) {
    updateChatJob(item.job, { status: "queued", queue_depth: cursorIdx, lane: "cursor" });
    cursorIdx += 1;
  }
}

function finishChatJobSideEffects(job, threadId, result) {
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
    return;
  }
  updateChatJob(job, { status: "done", finished_at: Date.now(), ...result });
  if (!threadId) return;
  try {
    let replyText = result.reply || "";
    let writeArts = [];
    const campId = (() => {
      try {
        return readChatThread(threadId)?.context?.campaign;
      } catch {
        return null;
      }
    })();
    if (campId && /<<<\s*CAMPAIGN_WRITE/i.test(replyText)) {
      const applied = applyCampaignWriteDirectives(replyText, campId);
      replyText = applied.reply;
      writeArts = applied.artifacts || [];
      if (writeArts.length) {
        result.reply = replyText;
        result.campaign_writes = writeArts;
      }
    }
    const projId = (() => {
      try {
        return readChatThread(threadId)?.context?.project_id;
      } catch {
        return null;
      }
    })();
    if (projId === "mazda3-sports-build" && /<<<\s*PROJECT_WRITE/i.test(replyText)) {
      const applied = applyProjectWriteDirectives(replyText, projId);
      replyText = applied.reply;
      if (applied.artifacts?.length) {
        writeArts = [...writeArts, ...applied.artifacts];
        result.reply = replyText;
        result.project_writes = applied.artifacts;
      }
    }
    if (!shouldSkipDuplicateBotAppend(threadId, replyText)) {
      appendChatThreadMessage(threadId, "bot", replyText, false, {
        model: result.model || undefined,
        paid_retry: !!result.paid_retry,
        free_fallback: !!result.free_fallback,
        artifacts: writeArts.length ? writeArts : undefined,
      });
    }
  } catch {
    /* non-fatal */
  }
}

function drainHermesChatQueue() {
  if (chatWorkerBusy || !CHAT_QUEUE.length) return;
  const next = CHAT_QUEUE.shift();
  if (!next) return;
  chatWorkerBusy = true;
  refreshQueuedJobDepths();
  const { job, message, profile, context, history, responseMode, threadId, preferredModel, chatModeId } =
    next;
  updateChatJob(job, { status: "pending", started_at: Date.now(), queue_depth: 0, lane: "hermes" });
  runHermesChat(message, profile, context, {
    history,
    responseMode,
    preferredModel,
    chatModeId,
  })
    .then((result) => {
      finishChatJobSideEffects(job, threadId, result);
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

function drainCursorChatQueue() {
  if (cursorChatWorkerBusy || !CURSOR_CHAT_QUEUE.length) return;
  const next = CURSOR_CHAT_QUEUE.shift();
  if (!next) return;
  cursorChatWorkerBusy = true;
  refreshQueuedJobDepths();
  const { job, message, profile, context, history, responseMode, threadId, preferredModel, chatModeId } =
    next;
  updateChatJob(job, { status: "pending", started_at: Date.now(), queue_depth: 0, lane: "cursor" });
  runHermesChat(message, profile, context, {
    history,
    responseMode,
    preferredModel,
    chatModeId,
  })
    .then((result) => {
      finishChatJobSideEffects(job, threadId, result);
    })
    .catch((err) => {
      updateChatJob(job, {
        status: "error",
        error: err.message || "chat_failed",
        finished_at: Date.now(),
      });
    })
    .finally(() => {
      cursorChatWorkerBusy = false;
      drainChatQueue();
    });
}

function drainChatQueue() {
  // Parallel lanes: Hermes OR/ZenMux and Cursor SDK Auto do not wait on each other.
  drainHermesChatQueue();
  drainCursorChatQueue();
}

function startChatJob(message, profile, context, chatOpts = {}) {
  pruneChatJobs();
  const threadId = chatOpts.threadId || null;
  // Durable project memory: apply obvious facts from the user line before the model runs.
  try {
    const ctx = context && typeof context === "object" ? context : {};
    const projectId =
      ctx.project_id ||
      (threadId
        ? (() => {
            try {
              return readChatThread(threadId)?.context?.project_id;
            } catch {
              return null;
            }
          })()
        : null);
    if (projectId === "mazda3-sports-build") {
      const extracted = extractMazdaFactsFromUserText(message);
      if (extracted) patchMazdaBuild(extracted);
    }
  } catch {
    /* non-fatal */
  }
  const inFlight = findInFlightChatJobForThread(threadId);
  if (inFlight) {
    return inFlight.job_id;
  }
  const preferredModel = chatOpts.preferredModel || null;
  const useCursorLane = isCursorChatModelId(preferredModel);
  const lane = useCursorLane ? "cursor" : "hermes";
  const ahead = useCursorLane ? cursorChatQueueDepth() : hermesChatQueueDepth();
  const id = crypto.randomBytes(8).toString("hex");
  const job = {
    job_id: id,
    status: ahead ? "queued" : "pending",
    created_at: Date.now(),
    queue_depth: ahead,
    lane,
    preferred_model: preferredModel,
    thread_id: chatOpts.threadId || null,
    message_index:
      Number.isInteger(chatOpts.messageIndex) && chatOpts.messageIndex >= 0
        ? chatOpts.messageIndex
        : null,
  };
  CHAT_JOBS.set(id, job);
  persistChatJobs();
  const item = {
    job,
    message,
    profile,
    context,
    history: chatOpts.history || [],
    responseMode: chatOpts.responseMode || "brief",
    preferredModel,
    chatModeId: chatOpts.chatModeId || null,
    threadId: chatOpts.threadId || null,
    skipUserAppend: !!chatOpts.skipUserAppend,
  };
  if (useCursorLane) CURSOR_CHAT_QUEUE.push(item);
  else CHAT_QUEUE.push(item);
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
        "Chat uses the think lane (free-first, then paid ops). The fast profile is for background ticks only — select think · campaign brainstorm.",
      profile: prof,
      context_used: !!context,
    };
  }
  const chatMode = getChatMode(chatOpts.chatModeId);
  const preferredModel = resolvePreferredChatModel(chatOpts.preferredModel);
  let prompt;
  try {
    prompt = buildChatMessage(message, context, {
      history: chatOpts.history,
      responseMode: chatOpts.responseMode,
      chatModeId: chatOpts.chatModeId,
      chatMode,
    });
  } catch (err) {
    return {
      error: err.message || "bad_context",
      profile: prof,
      context_used: !!context,
    };
  }

  const responseMode = chatOpts.responseMode === "workshop" ? "workshop" : "brief";
  const paidChain = getChatPaidFailoverChain(prof, responseMode);
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
        const result = isCursorChatModelId(modelId)
          ? await execCursorChatOnce(prompt, modelId, {
              timeoutMs: chatOpts.cursorTimeoutMs || 300_000,
            })
          : await execHermesChatOnce(prof, prompt, modelId, execOpts);
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

  // Model routing:
  // - Explicit cursor:auto → Cursor only
  // - Agent coding (cursor_default) + Auto → Cursor first (screenshots + portfolio)
  // - Free pool known-down (~30m free-models-health / day blocklist) → Cursor when allowed
  // - Else free-first / paid-first (Cursor not in free rotate list)
  loadModelBudgetConfig();
  const preferFree = CHAT_FREE_FIRST;
  const routing = String(chatMode?.routing || "free_first");
  const freeHealth = readFreeModelsHealth();
  const freeDown = !!freeHealth.cursor_fallback_recommended && !freeHealth.any_up;
  const wantCursorDefault =
    routing === "cursor_default" ||
    (!preferredModel && chatMode?.default_model && isCursorChatModelId(chatMode.default_model));
  const allowCursorOnFreeFail =
    !!chatMode?.cursor_on_free_fail || routing === "cursor_default" || wantCursorDefault;
  const phases = [];
  if (preferredModel && isCursorChatModelId(preferredModel)) {
    phases.push({ chain: [preferredModel], allowFree: false, pinned: true, cursorOnly: true });
  } else if (wantCursorDefault && !preferredModel) {
    phases.push({ chain: ["cursor:auto"], allowFree: false, cursorOnly: true });
    if (!freeDown) {
      if (preferFree) {
        phases.push({ chain: freeChain.filter((m) => !isCursorChatModelId(m)), allowFree: true });
        phases.push({ chain: paidChain.filter((m) => !isCursorChatModelId(m)), allowFree: false });
      } else {
        phases.push({ chain: paidChain.filter((m) => !isCursorChatModelId(m)), allowFree: false });
        phases.push({ chain: freeChain.filter((m) => !isCursorChatModelId(m)), allowFree: true });
      }
    }
  } else {
    if (preferredModel) {
      const pinnedIsFree = isChatFreeModelId(preferredModel);
      phases.push({ chain: [preferredModel], allowFree: pinnedIsFree, pinned: true });
    }
    if (freeDown && allowCursorOnFreeFail && !preferredModel) {
      phases.push({ chain: ["cursor:auto"], allowFree: false, cursorOnly: true });
    } else if (preferFree) {
      phases.push({
        chain: freeChain.filter((m) => m !== preferredModel && !isCursorChatModelId(m)),
        allowFree: true,
      });
      phases.push({
        chain: paidChain.filter((m) => m !== preferredModel && !isCursorChatModelId(m)),
        allowFree: false,
      });
      if (allowCursorOnFreeFail) {
        phases.push({ chain: ["cursor:auto"], allowFree: false, cursorOnly: true });
      }
    } else {
      phases.push({
        chain: paidChain.filter((m) => m !== preferredModel && !isCursorChatModelId(m)),
        allowFree: false,
      });
      phases.push({
        chain: freeChain.filter((m) => m !== preferredModel && !isCursorChatModelId(m)),
        allowFree: true,
      });
      if (allowCursorOnFreeFail) {
        phases.push({ chain: ["cursor:auto"], allowFree: false, cursorOnly: true });
      }
    }
  }

  for (const phase of phases) {
    if (!phase.chain.length) continue;
    const result = await tryModelChain(phase.chain, { allowFree: phase.allowFree });
    if (result.kind === "ok" || result.kind === "error") {
      if (result.kind === "ok" && preferredModel) {
        result.payload.preferred_model = preferredModel;
      }
      if (result.kind === "ok" && (wantCursorDefault || freeDown)) {
        result.payload.free_models_down = freeDown || undefined;
        result.payload.routing = wantCursorDefault ? "cursor_default" : result.payload.routing;
      }
      return result.payload;
    }
    // daily_limit / exhausted → next phase
  }

  if (hitDailyLimit) {
    const freeTried = triedModels.filter((m) => isChatFreeModelId(m));
    const paidTried = triedModels.filter((m) => !isChatFreeModelId(m) && !isCursorChatModelId(m));
    const cursorTried = triedModels.filter((m) => isCursorChatModelId(m));
    const freeBit = freeTried.length
      ? `Free path failed first (:free models are $0 but still hit OpenRouter/provider RPM·RPD·capacity limits — not the USD cap). Tried: ${freeTried.join(" → ")}.`
      : freeDown
        ? "Free pool marked down (30m free-models-health / day blocklist) — skipped thrash."
        : "Free path was not reached.";
    const paidBit = paidTried.length
      ? `Paid ops path then hit daily USD cap (policy target $${OPENROUTER_OPS_DAILY_USD}). Tried: ${paidTried.join(" → ")}.`
      : `Paid ops path hit daily USD cap (policy target $${OPENROUTER_OPS_DAILY_USD}).`;
    const cursorBit = cursorTried.length ? ` Cursor also tried: ${cursorTried.join(" → ")}.` : "";
    return {
      error: `${freeBit} ${paidBit}${cursorBit} Wait for UTC reset, top up, or raise key limit (set-openrouter-key-limit.sh).`,
      profile: prof,
      context_used: !!context,
      failover_tried: triedModels,
      openrouter_daily_limit: true,
      free_exhausted: freeTried.length > 0 || freeDown || undefined,
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
    free_models_down: freeDown || undefined,
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
  // Cap latency on 2GB box. Prefer world/breaking news feeds when list is long.
  const ranked = [...(feeds || [])].sort((a, b) => {
    const score = (f) => {
      const p = String(f?.platform || "");
      if (p === "aggregator" || p === "news") return 0;
      if (p === "osint" || p === "policy") return 1;
      if (p === "markets") return 2;
      if (p === "reddit" && /world/i.test(String(f?.name || ""))) return 0;
      return 3;
    };
    return score(a) - score(b);
  });
  // ponytail: 40 ≈ world-first mix without multi-minute /api/intel; raise only with cache hits (38 feeds configured 2026-08-05)
  for (const feed of ranked.slice(0, 40)) {
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
//   DASHBOARD_TOKEN          — primary admin password (HTTP Basic user below, or Bearer/cookie)
//   DASHBOARD_ADMIN_USER     — Basic auth username for primary admin (default: admin)
//   DASHBOARD_VIEWER_TOKEN   — primary viewer password (optional; enables read-only role)
//   DASHBOARD_VIEWER_USER    — Basic auth username for primary viewer (default: viewer)
//   DASHBOARD_EXTRA_ACCOUNTS — JSON array of extra named accounts:
//       [{"user":"HeadUser","role":"admin","pass":"..."},{"user":"guest","role":"viewer","pass":"..."}]
//     role must be "admin" or "viewer". Passwords never logged.
//   Temp viewers — admin POST /api/auth/temp-accounts → agents/state/dashboard-temp-accounts.json
//     (≤2 days). Redeem GET /api/auth/temp-redeem?token= sets HttpOnly lbx_token cookie.
//   OBSERVABILITY_KUMA_URL   — Uptime Kuma link in Active now (default MagicDNS :13001)
//   OBSERVABILITY_GRAFANA_URL / GRAFANA_URL — optional Grafana link (off-box recommended)
// Bitwarden: save https://abhinavall.net/Linuxbox/ with each username + password from box .env.
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

/** @type {{ user: string, role: 'admin'|'viewer', pass: string }[]} */
const AUTH_ACCOUNTS = [];
function pushAuthAccount(user, role, pass) {
  const u = String(user || "").trim();
  const p = String(pass || "");
  const r = role === "admin" || role === "viewer" ? role : null;
  if (!u || !p || !r) return;
  // Last write wins for duplicate usernames (extra can override legacy if same name).
  const idx = AUTH_ACCOUNTS.findIndex((a) => a.user === u);
  const row = { user: u, role: r, pass: p };
  if (idx >= 0) AUTH_ACCOUNTS[idx] = row;
  else AUTH_ACCOUNTS.push(row);
}
if (DASHBOARD_TOKEN) pushAuthAccount(DASHBOARD_ADMIN_USER, "admin", DASHBOARD_TOKEN);
if (DASHBOARD_VIEWER_TOKEN) pushAuthAccount(DASHBOARD_VIEWER_USER, "viewer", DASHBOARD_VIEWER_TOKEN);
try {
  const rawExtra = envVal("DASHBOARD_EXTRA_ACCOUNTS");
  if (rawExtra) {
    const parsed = JSON.parse(rawExtra);
    if (Array.isArray(parsed)) {
      for (const row of parsed) {
        if (!row || typeof row !== "object") continue;
        pushAuthAccount(row.user || row.username, row.role, row.pass || row.password || row.token);
      }
    }
  }
} catch (err) {
  console.error("DASHBOARD_EXTRA_ACCOUNTS parse failed:", err && err.message ? err.message : err);
}
const HAS_DASHBOARD_AUTH = AUTH_ACCOUNTS.length > 0;

// Temporary viewer accounts (admin-generated, 2-day hard expiry). Runtime-only;
// never commit. Redeem token → HttpOnly lbx_token cookie (existing token path).
const TEMP_ACCOUNTS_FILE = path.join(REPO, "agents", "state", "dashboard-temp-accounts.json");
const TEMP_VIEWER_TTL_SEC = 2 * 24 * 60 * 60; // 2 days hard max

function isTempAccountLive(row, nowMs = Date.now()) {
  if (!row || row.revoked) return false;
  const exp = Date.parse(row.expires_at || "");
  if (!Number.isFinite(exp) || exp <= nowMs) return false;
  return true;
}

function loadTempAccountsDoc() {
  const empty = { version: 1, accounts: [] };
  try {
    const raw = fs.readFileSync(TEMP_ACCOUNTS_FILE, "utf8");
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== "object") return empty;
    const accounts = Array.isArray(doc.accounts) ? doc.accounts : [];
    const now = Date.now();
    const kept = accounts.filter((a) => {
      if (!a || typeof a !== "object") return false;
      const exp = Date.parse(a.expires_at || "");
      // Drop expired permanently; keep revoked until expiry so list can show them briefly.
      if (!Number.isFinite(exp) || exp <= now) return false;
      return true;
    });
    if (kept.length !== accounts.length) {
      const next = { version: Number(doc.version) || 1, accounts: kept };
      try {
        fs.mkdirSync(path.dirname(TEMP_ACCOUNTS_FILE), { recursive: true });
        fs.writeFileSync(TEMP_ACCOUNTS_FILE, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
      } catch {
        /* best-effort prune */
      }
      return next;
    }
    return { version: Number(doc.version) || 1, accounts: kept };
  } catch (err) {
    if (err && err.code === "ENOENT") return empty;
    console.error("temp accounts load failed:", err && err.message ? err.message : err);
    return empty;
  }
}

function saveTempAccountsDoc(doc) {
  fs.mkdirSync(path.dirname(TEMP_ACCOUNTS_FILE), { recursive: true });
  const out = {
    version: Number(doc.version) || 1,
    accounts: Array.isArray(doc.accounts) ? doc.accounts : [],
  };
  fs.writeFileSync(TEMP_ACCOUNTS_FILE, JSON.stringify(out, null, 2) + "\n", { mode: 0o600 });
  return out;
}

function matchTempAccountByBasic(user, password) {
  const doc = loadTempAccountsDoc();
  for (const a of doc.accounts) {
    if (!isTempAccountLive(a)) continue;
    if (safeEqual(user, a.user) && safeEqual(password, a.pass)) return a;
  }
  return null;
}

function matchTempAccountByPass(tok) {
  if (!tok) return null;
  const doc = loadTempAccountsDoc();
  for (const a of doc.accounts) {
    if (!isTempAccountLive(a)) continue;
    if (safeEqual(tok, a.pass)) return a;
  }
  return null;
}

function findTempByRedeemToken(token) {
  if (!token) return null;
  const doc = loadTempAccountsDoc();
  for (const a of doc.accounts) {
    if (!isTempAccountLive(a)) continue;
    if (safeEqual(token, a.redeem_token)) return a;
  }
  return null;
}

function publicTempAccountRow(a, { includeSecrets = false } = {}) {
  const row = {
    id: a.id,
    user: a.user,
    role: "viewer",
    created_at: a.created_at,
    expires_at: a.expires_at,
    revoked: !!a.revoked,
    live: isTempAccountLive(a),
  };
  if (includeSecrets) {
    row.pass = a.pass;
    row.redeem_token = a.redeem_token;
  }
  return row;
}

function createTempViewerAccount(opts = {}) {
  const ttlSec = Math.min(
    Math.max(Number(opts.ttl_sec) || TEMP_VIEWER_TTL_SEC, 60),
    TEMP_VIEWER_TTL_SEC
  );
  const now = Date.now();
  const id = crypto.randomBytes(8).toString("hex");
  const user = `tmp_${crypto.randomBytes(4).toString("hex")}`;
  const pass = crypto.randomBytes(18).toString("base64url");
  const redeem_token = crypto.randomBytes(24).toString("base64url");
  const row = {
    id,
    user,
    pass,
    redeem_token,
    role: "viewer",
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttlSec * 1000).toISOString(),
    revoked: false,
  };
  const doc = loadTempAccountsDoc();
  doc.accounts.push(row);
  saveTempAccountsDoc(doc);
  return row;
}

function revokeTempViewerAccount(id) {
  const doc = loadTempAccountsDoc();
  const idx = doc.accounts.findIndex((a) => a && a.id === id);
  if (idx < 0) return null;
  doc.accounts[idx].revoked = true;
  saveTempAccountsDoc(doc);
  return doc.accounts[idx];
}

function safeRedeemNextPath(raw) {
  const s = String(raw || "/").trim();
  if (s === "/" || s === "/Linuxbox" || s === "/Linuxbox/") {
    return s === "/Linuxbox" ? "/Linuxbox/" : s;
  }
  return "/";
}

function buildTempRedeemSetCookie(pass, expiresAtIso, req) {
  const expMs = Date.parse(expiresAtIso || "");
  const maxAge = Number.isFinite(expMs)
    ? Math.max(0, Math.floor((expMs - Date.now()) / 1000))
    : TEMP_VIEWER_TTL_SEC;
  const secure =
    String(req.headers["x-forwarded-proto"] || "").toLowerCase() === "https" ||
    String(req.headers["x-forwarded-ssl"] || "").toLowerCase() === "on";
  const parts = [
    `lbx_token=${encodeURIComponent(pass)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

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

/** Mirror tunnel-origin-proxy: bare :8790 requests may still carry /Linuxbox prefix. */
function stripLinuxboxPrefix(pathname) {
  const m = String(pathname || "").match(/^\/Linuxbox(\/.*)?$/i);
  if (!m) return pathname;
  const rest = m[1] || "/";
  return rest.startsWith("/") ? rest : `/${rest}`;
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

function matchAuthAccountByBasic(user, password) {
  for (const a of AUTH_ACCOUNTS) {
    if (safeEqual(user, a.user) && safeEqual(password, a.pass)) return a;
  }
  return null;
}

function matchAuthAccountByToken(tok) {
  if (!tok) return null;
  for (const a of AUTH_ACCOUNTS) {
    if (safeEqual(tok, a.pass)) return a;
  }
  return null;
}

/** @returns {{ role: 'admin'|'viewer'|'local', source: string, user?: string, public?: boolean } | null} */
function resolveAuth(req, publicMode) {
  if (publicMode === "intel") return { role: "viewer", source: "public_intel", public: true };
  if (isTrustedLocal(req)) return { role: "admin", source: "loopback" };
  if (OPEN_ALL) return { role: "admin", source: "open_all" };

  const basic = presentedBasicUserPass(req);
  if (basic) {
    const hit = matchAuthAccountByBasic(basic.user, basic.password);
    if (hit) return { role: hit.role, source: `basic_${hit.role}`, user: hit.user };
    const temp = matchTempAccountByBasic(basic.user, basic.password);
    if (temp) return { role: "viewer", source: "basic_temp_viewer", user: temp.user };
    // Fall through: stale/wrong Basic must not block a valid lbx_token cookie (temp redeem).
  }

  const authHdr = req.headers["authorization"] || "";
  if (authHdr.startsWith("Bearer ")) {
    const tok = authHdr.slice(7).trim();
    const byTok = matchAuthAccountByToken(tok);
    if (byTok) return { role: byTok.role, source: `bearer_${byTok.role}`, user: byTok.user };
    const tempTok = matchTempAccountByPass(tok);
    if (tempTok) return { role: "viewer", source: "bearer_temp_viewer", user: tempTok.user };
  }

  const cookie = req.headers["cookie"] || "";
  const m = cookie.match(/(?:^|;\s*)lbx_token=([^;]+)/);
  if (m) {
    const cookieTok = decodeURIComponent(m[1]);
    const byTok = matchAuthAccountByToken(cookieTok);
    if (byTok) return { role: byTok.role, source: `cookie_${byTok.role}`, user: byTok.user };
    const tempTok = matchTempAccountByPass(cookieTok);
    if (tempTok) return { role: "viewer", source: "cookie_temp_viewer", user: tempTok.user };
  }

  // Legacy: bare password as Bearer/Basic-pass-only via presentedToken (no username).
  if (!basic) {
    const tok = presentedToken(req);
    const byTok = matchAuthAccountByToken(tok);
    if (byTok) return { role: byTok.role, source: `bearer_${byTok.role}`, user: byTok.user };
    const tempTok = matchTempAccountByPass(tok);
    if (tempTok) return { role: "viewer", source: "token_temp_viewer", user: tempTok.user };
  }

  if (OPEN_READ && (req.method === "GET" || req.method === "HEAD")) {
    return { role: "viewer", source: "open_read" };
  }

  return null;
}

function isAuthorized(req, pathname, publicMode) {
  // Temp redeem must work before Basic (sets lbx_token cookie for guests).
  if (
    !isPublicEdge(publicMode) &&
    (req.method === "GET" || req.method === "HEAD") &&
    pathname === "/api/auth/temp-redeem"
  ) {
    return true;
  }
  if (isPublicEdge(publicMode)) {
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    return publicMayGet(publicMode, pathname);
  }
  const auth = resolveAuth(req, false);
  if (!auth) {
    if (!HAS_DASHBOARD_AUTH) return false;
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
  const stream = fs.createReadStream(filePath);
  // Unhandled stream 'error' throws and crashes the whole Hub process — the file can
  // vanish between the route's existsSync gate and stream open (TOCTOU on portraits/icons).
  stream.on("error", () => {
    try {
      res.destroy();
    } catch {
      /* response already gone */
    }
  });
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const split = splitPublicPath(url.pathname);
  const pathname = stripLinuxboxPrefix(split.pathname);
  const publicMode = split.publicMode;

  if (!isAuthorized(req, pathname, publicMode)) {
    send401(res, publicMode);
    return;
  }

  const auth = authForRequest(req, publicMode);

  try {
    // Public redeem: no Basic required. Sets HttpOnly lbx_token cookie → viewer until expiry.
    if ((req.method === "GET" || req.method === "HEAD") && pathname === "/api/auth/temp-redeem") {
      const token = url.searchParams.get("token") || "";
      const row = findTempByRedeemToken(token);
      if (!row) {
        sendJson(res, 401, { error: "temp_token_invalid_or_expired" }, publicMode);
        return;
      }
      const wantJson =
        url.searchParams.get("format") === "json" ||
        String(req.headers.accept || "").includes("application/json");
      const setCookie = buildTempRedeemSetCookie(row.pass, row.expires_at, req);
      if (wantJson) {
        res.writeHead(200, {
          ...responseHeaders(publicMode),
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": setCookie,
          "Cache-Control": "no-store",
        });
        res.end(
          JSON.stringify(
            {
              ok: true,
              user: row.user,
              role: "viewer",
              expires_at: row.expires_at,
              dashboard: safeRedeemNextPath(url.searchParams.get("next")),
            },
            null,
            2
          )
        );
        return;
      }
      const next = safeRedeemNextPath(url.searchParams.get("next"));
      res.writeHead(302, {
        ...responseHeaders(publicMode),
        "Set-Cookie": setCookie,
        Location: next,
        "Cache-Control": "no-store",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && pathname === "/api/session") {
      sendJson(
        res,
        200,
        {
          role: auth?.role || "viewer",
          user: auth?.user || null,
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

    if (req.method === "GET" && pathname === "/api/auth/temp-accounts") {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      const doc = loadTempAccountsDoc();
      sendJson(
        res,
        200,
        {
          ttl_sec_max: TEMP_VIEWER_TTL_SEC,
          accounts: doc.accounts.map((a) => publicTempAccountRow(a)),
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

    // Thin alias — monitoring-service-health-endpoint user-task. Prefer /api/status for full.
    if (req.method === "GET" && (pathname === "/api/health" || pathname === "/health")) {
      const health = await collectHealth();
      const ok = !health.health_error && String(health.gateway || "").toLowerCase() !== "down";
      sendJson(
        res,
        ok ? 200 : 503,
        {
          ok,
          service: "linuxbox-status",
          updated_at: new Date().toISOString(),
          gateway: health.gateway || null,
          mem_avail_mb: health.mem_avail_mb ? Number(health.mem_avail_mb) : null,
          load_1: health.load_1 || health.loadavg_1 || null,
        },
        publicMode
      );
      return;
    }

    if (req.method === "GET" && pathname === "/api/papercuts") {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      const status = String(url.searchParams.get("status") || "open").slice(0, 24);
      const script = path.join(__dirname, "papercuts-list.sh");
      let text = "";
      try {
        text = execFileSync("bash", [script, status], {
          cwd: REPO,
          encoding: "utf8",
          timeout: 8000,
          maxBuffer: 512 * 1024,
        });
      } catch (e) {
        sendJson(res, 500, { error: "papercuts_list_failed", detail: String(e.message || e).slice(0, 200) }, publicMode);
        return;
      }
      const entries = String(text || "")
        .split(/\n(?=## pc-)/)
        .map((b) => b.trim())
        .filter(Boolean)
        .map((block) => {
          const id = (block.match(/^##\s+(pc-[^\s]+)/) || [])[1] || "";
          const st = (block.match(/\*\*Status:\*\*\s*(\S+)/i) || [])[1] || "";
          const first = block.split("\n").slice(0, 6).join("\n");
          return { id, status: st, preview: first.slice(0, 400) };
        });
      sendJson(res, 200, { ok: true, status, count: entries.length, entries }, publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/agent") {
      const lite = auth?.role === "viewer" || shouldUseLiteAgentCollect();
      sendJson(res, 200, await collectAgentStateCached({ lite }), publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/think-live") {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      const rn = buildRunningNow();
      sendJson(
        res,
        200,
        {
          running_now: rn,
          cursor_lane: rn.cursor_lane,
          live_log: readThinkLiveLog(),
          updated_at: new Date().toISOString(),
        },
        publicMode
      );
      return;
    }

    if (req.method === "GET" && pathname === "/api/agent-goals") {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      sendJson(
        res,
        200,
        {
          ...buildAgentGoalsInsight(),
          usage: chatModelUsageSummary(),
          updated_at: new Date().toISOString(),
        },
        publicMode
      );
      return;
    }

    if (req.method === "GET" && pathname === "/api/meta-harness") {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      sendJson(res, 200, { pods: readMetaHarnessPods(5), updated_at: new Date().toISOString() }, publicMode);
      return;
    }

    // Light ~1 Hz Hub bars: /proc only. ?procs=1 adds cached top processes (8s TTL).
    if (req.method === "GET" && pathname === "/api/host-resources") {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      const wantProcs = url.searchParams.get("procs") === "1" || url.searchParams.get("detail") === "1";
      if (wantProcs) {
        sendJson(res, 200, await readHostMetrics({ light: true, procs: true }), publicMode);
      } else {
        sendJson(res, 200, readHostResourcesLight(), publicMode);
      }
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

    if (req.method === "GET" && pathname === "/api/chat/modes") {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      sendJson(res, 200, loadChatModes(), publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/chat/models") {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      sendJson(res, 200, getChatCatalogForUi(), publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/chat/focus-docs") {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      const campaign = String(url.searchParams.get("campaign") || "").trim();
      if (!campaign || !CAMPAIGNS[campaign]) {
        sendJson(res, 400, { error: "bad_campaign" }, publicMode);
        return;
      }
      sendJson(res, 200, { campaign, docs: listCampaignFocusDocs(campaign) }, publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/model-budget") {
      if (auth?.role !== "admin") {
        sendJson(res, 403, { error: "admin_required" }, publicMode);
        return;
      }
      sendJson(
        res,
        200,
        {
          routing: getModelBudgetRoutingForUi(),
          catalog: getChatCatalogForUi(),
          policy: CHAT_FREE_FIRST ? "free_first" : "paid_first",
        },
        publicMode
      );
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

    if (req.method === "GET" && pathname === "/docs-wiki.js") {
      sendFile(res, path.join(STATIC_DIR, "docs-wiki.js"), "application/javascript; charset=utf-8", publicMode);
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

    // Docs wiki (tree / edit / comments / graph) — admin Linuxbox only
    if (req.method === "GET" && pathname === "/api/docs/tree") {
      const campaign = url.searchParams.get("campaign") || null;
      const include_archived =
        url.searchParams.get("include_archived") === "1" ||
        url.searchParams.get("include_archived") === "true" ||
        campaign === "spacequest";
      sendJson(
        res,
        200,
        docsWiki.listDocsTree(REPO, CAMPAIGNS, { campaign, include_archived }),
        publicMode
      );
      return;
    }

    if (req.method === "GET" && pathname === "/api/docs/doc") {
      const relPath = url.searchParams.get("path");
      try {
        sendJson(res, 200, docsWiki.readDocsDoc(REPO, CAMPAIGNS, relPath), publicMode);
      } catch (err) {
        sendJson(res, err.status || 400, { error: err.message || "doc_read_failed" }, publicMode);
      }
      return;
    }

    if (req.method === "GET" && pathname === "/api/docs/comments") {
      const relPath = url.searchParams.get("path");
      if (!relPath) {
        sendJson(res, 400, { error: "path_required" }, publicMode);
        return;
      }
      sendJson(res, 200, docsWiki.listDocComments(REPO, relPath), publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/docs/graph") {
      const campaign = url.searchParams.get("campaign") || null;
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw != null && limitRaw !== "" ? Number(limitRaw) : undefined;
      sendJson(
        res,
        200,
        docsWiki.buildDocsGraph(REPO, CAMPAIGNS, {
          campaign,
          ...(Number.isFinite(limit) ? { limit } : {}),
        }),
        publicMode
      );
      return;
    }

    if (req.method === "GET" && pathname === "/api/docs/resolve") {
      try {
        sendJson(
          res,
          200,
          docsWiki.resolveDocsEntity(REPO, CAMPAIGNS, {
            q: url.searchParams.get("q") || url.searchParams.get("slug") || url.searchParams.get("id"),
            campaign: url.searchParams.get("campaign") || null,
          }),
          publicMode
        );
      } catch (err) {
        sendJson(res, err.status || 400, { error: err.message || "resolve_failed" }, publicMode);
      }
      return;
    }

    if (req.method === "GET" && pathname === "/api/docs/versions") {
      try {
        const relPath = url.searchParams.get("path");
        if (!relPath) {
          sendJson(res, 400, { error: "path_required" }, publicMode);
          return;
        }
        sendJson(res, 200, docsWiki.listDocVersions(REPO, relPath), publicMode);
      } catch (err) {
        sendJson(res, err.status || 400, { error: err.message || "versions_failed" }, publicMode);
      }
      return;
    }

    if (req.method === "GET" && pathname === "/api/docs/version") {
      try {
        const relPath = url.searchParams.get("path");
        const vid = url.searchParams.get("id") || url.searchParams.get("version");
        if (!relPath || !vid) {
          sendJson(res, 400, { error: "path_and_id_required" }, publicMode);
          return;
        }
        sendJson(res, 200, docsWiki.readDocVersion(REPO, relPath, vid), publicMode);
      } catch (err) {
        sendJson(res, err.status || 400, { error: err.message || "version_read_failed" }, publicMode);
      }
      return;
    }

    if (req.method === "GET" && pathname === "/api/characters-registry") {
      const campaignId = url.searchParams.get("campaign") || "tropic-gooner";
      const includeHidden =
        url.searchParams.get("include_hidden") === "1" ||
        url.searchParams.get("include_hidden") === "true";
      sendJson(res, 200, getCharactersRegistry(campaignId, { includeHidden }), publicMode);
      return;
    }

    if (req.method === "GET" && pathname === "/api/characters-registry/image") {
      const campaignId = url.searchParams.get("campaign") || "tropic-gooner";
      const charId = url.searchParams.get("id") || "";
      const pathParam = url.searchParams.get("path") || "";
      const reg = readCharactersRegistry(campaignId);
      const row = (reg.characters || []).find((c) => c.id === charId);
      let rel = normalizeCampaignRelPath(pathParam);
      if (rel) {
        if (isCrossCharacterImagePath(charId, rel)) {
          sendJson(res, 403, { error: "path_other_character" }, publicMode);
          return;
        }
        const allowed = new Set(resolveCharacterImages(campaignId, row || { id: charId, images: [] }).images);
        if (row?.image_path) allowed.add(normalizeCampaignRelPath(row.image_path));
        if (!allowed.has(rel) && !characterPortraitDirs(campaignId, charId).includes(rel)) {
          // still allow any in-campaign image under Character Images/ or portraits/ for this id
          const ok =
            rel.startsWith(`characters/portraits/${charId}`) ||
            (CHAR_IMAGE_FOLDER_BY_ID[charId] &&
              rel.startsWith(`Character Images/${CHAR_IMAGE_FOLDER_BY_ID[charId]}/`));
          if (!ok) {
            sendJson(res, 403, { error: "path_not_allowed" }, publicMode);
            return;
          }
        }
      } else {
        rel = resolveCharacterImages(campaignId, row || { id: charId }).image_path;
      }
      if (!rel) {
        sendJson(res, 404, { error: "no_image" }, publicMode);
        return;
      }
      const abs = characterImageAbs(campaignId, rel);
      if (!abs) {
        sendJson(res, 404, { error: "image_missing" }, publicMode);
        return;
      }
      sendFile(res, abs, characterImageContentType(abs), publicMode);
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

    if (req.method === "PUT" && pathname === "/api/docs/doc") {
      const maxBytes = 600 * 1024;
      let raw;
      try {
        raw = await readBody(req, maxBytes);
      } catch (err) {
        sendJson(res, err.message === "body_too_large" ? 413 : 400, { error: err.message || "bad_body" }, publicMode);
        return;
      }
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { error: "invalid_json" }, publicMode);
        return;
      }
      try {
        const saved = docsWiki.writeDocsDoc(REPO, CAMPAIGNS, body.path, body.content, body.base_hash);
        sendJson(res, 200, { ok: true, ...saved }, publicMode);
      } catch (err) {
        sendJson(res, err.status || 400, { error: err.message || "doc_write_failed" }, publicMode);
      }
      return;
    }

    if (req.method === "POST") {
      const maxBytes =
        pathname === "/api/characters-registry/upload"
          ? Math.ceil(CHAR_PORTRAIT_UPLOAD_MAX * 1.4) + 8 * 1024
          : pathname.startsWith("/api/docs/")
            ? 100 * 1024
            : 64 * 1024;
      const raw = await readBody(req, maxBytes);
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { error: "invalid_json" }, publicMode);
        return;
      }

      if (pathname === "/api/docs/character-sheet") {
        try {
          sendJson(res, 200, docsWiki.createCharacterSheet(REPO, CAMPAIGNS, body), publicMode);
        } catch (err) {
          sendJson(res, err.status || 400, { error: err.message || "create_sheet_failed", path: err.path }, publicMode);
        }
        return;
      }

      if (pathname === "/api/docs/character-beta") {
        try {
          const out = await docsWiki.runCharacterBeta(REPO, CAMPAIGNS, body);
          sendJson(res, 200, out, publicMode);
        } catch (err) {
          sendJson(
            res,
            err.status || 500,
            {
              error: err.message || "beta_failed",
              hint: err.hint || undefined,
              detail: err.detail || undefined,
              model: err.model || undefined,
            },
            publicMode
          );
        }
        return;
      }

      if (pathname === "/api/docs/propose-from-reports") {
        try {
          const out = await docsWiki.proposeFromReports(REPO, CAMPAIGNS, body);
          sendJson(res, 200, out, publicMode);
        } catch (err) {
          sendJson(res, err.status || 400, { error: err.message || "propose_failed" }, publicMode);
        }
        return;
      }

      if (pathname === "/api/docs/restore-version") {
        try {
          const out = docsWiki.restoreDocVersion(REPO, CAMPAIGNS, body.path || body.doc_path, body.id || body.version);
          sendJson(res, 200, out, publicMode);
        } catch (err) {
          sendJson(res, err.status || 400, { error: err.message || "restore_failed" }, publicMode);
        }
        return;
      }

      if (pathname === "/api/docs/comments") {
        try {
          sendJson(res, 200, docsWiki.addDocComment(REPO, CAMPAIGNS, body), publicMode);
        } catch (err) {
          sendJson(res, err.status || 400, { error: err.message || "comment_failed" }, publicMode);
        }
        return;
      }

      if (pathname.startsWith("/api/docs/comments/")) {
        const commentId = pathname.slice("/api/docs/comments/".length);
        try {
          sendJson(res, 200, docsWiki.patchDocComment(REPO, CAMPAIGNS, commentId, body), publicMode);
        } catch (err) {
          sendJson(res, err.status || 400, { error: err.message || "comment_patch_failed" }, publicMode);
        }
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

      if (pathname === "/api/chat/offload") {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        try {
          const result = createChatOffloadTask(body);
          sendJson(res, 201, { ...result, offload: true, note: "Queued for laptop/PC — not running on potato" }, publicMode);
        } catch (err) {
          sendJson(res, 400, { error: err.message || "offload_failed" }, publicMode);
        }
        return;
      }

      if (pathname === "/api/agent-goals") {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        try {
          const next = writeAgentGoalControl(body, "hub");
          sendJson(res, 200, { ok: true, control: next, goals: buildAgentGoalsInsight() }, publicMode);
        } catch (err) {
          sendJson(res, 400, { error: err.message || "goal_update_failed" }, publicMode);
        }
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
        const modeSettings = resolveChatModeSettings(body.chat_mode, {
          context,
          profile: body.profile,
          response_mode: body.response_mode,
        });
        let profile = modeSettings.profile;
        let responseMode = modeSettings.responseMode;
        let chatModeId = modeSettings.chatModeId;
        let preferredModel = resolvePreferredChatModel(body.preferred_model);
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
          const threadMode = resolveChatModeSettings(body.chat_mode || thread.chat_mode, {
            context,
            profile: body.profile || thread.profile,
            response_mode:
              body.response_mode || thread.response_mode,
          });
          profile = threadMode.profile;
          responseMode = threadMode.responseMode;
          chatModeId = threadMode.chatModeId;
          if (body.preferred_model != null) {
            preferredModel = resolvePreferredChatModel(body.preferred_model);
          } else {
            preferredModel = resolvePreferredChatModel(thread.preferred_model);
          }
          history = chatHistoryFromThread(thread);
          try {
            appendChatThreadMessage(threadId, "user", message, false);
            maybeAutoTitleThread(threadId, message);
            updateChatThreadMeta(threadId, {
              profile,
              response_mode: responseMode,
              chat_mode: chatModeId,
              preferred_model: preferredModel || "",
            });
          } catch (err) {
            sendJson(res, 400, { error: err.message || "thread_write_failed" }, publicMode);
            return;
          }
        }

        const jobId = startChatJob(message, profile, context, {
          history,
          responseMode,
          preferredModel,
          chatModeId,
          threadId: threadId || null,
        });
        const job = CHAT_JOBS.get(jobId) || { status: "pending", queue_depth: 0 };
        sendJson(
          res,
          202,
          {
            job_id: jobId,
            status: job.status,
            queue_depth: job.queue_depth || 0,
            thread_id: threadId || null,
            chat_mode: chatModeId,
            preferred_model: preferredModel || null,
          },
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

      // Was an early POST handler that used undeclared `body` → ReferenceError "body is not defined".
      if (pathname === "/api/model-budget") {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        try {
          const routing = saveModelBudgetRouting(body || {});
          agentStateCache = null;
          agentStateCacheAt = 0;
          sendJson(res, 200, { ok: true, routing }, publicMode);
        } catch (err) {
          sendJson(res, 400, { error: err.message || "save_failed" }, publicMode);
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

      if (pathname === "/api/auth/temp-accounts") {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        const created = createTempViewerAccount({ ttl_sec: body.ttl_sec });
        sendJson(
          res,
          200,
          {
            ...publicTempAccountRow(created, { includeSecrets: true }),
            redeem_path: `/api/auth/temp-redeem?token=${encodeURIComponent(created.redeem_token)}`,
            note: "Share redeem_url (sets cookie). Or share user+pass for Basic. Expires in ≤2 days.",
          },
          publicMode
        );
        return;
      }

      if (pathname.startsWith("/api/auth/temp-accounts/") && pathname.endsWith("/revoke")) {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        const id = pathname.slice("/api/auth/temp-accounts/".length, -"/revoke".length);
        const revoked = revokeTempViewerAccount(id);
        if (!revoked) {
          sendJson(res, 404, { error: "not_found" }, publicMode);
          return;
        }
        sendJson(res, 200, { ok: true, account: publicTempAccountRow(revoked) }, publicMode);
        return;
      }

      if (pathname === "/api/characters-registry") {
        const campaignId = body.campaign || "tropic-gooner";
        try {
          sendJson(res, 200, patchCharacterRegistry(campaignId, body), publicMode);
        } catch (e) {
          sendRegistryWriteError(res, e, publicMode);
        }
        return;
      }

      if (pathname === "/api/characters-registry/link-discord") {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        const campaignId = body.campaign || "tropic-gooner";
        try {
          sendJson(res, 200, linkDiscordAccount(campaignId, body), publicMode);
        } catch (e) {
          sendRegistryWriteError(res, e, publicMode);
        }
        return;
      }

      if (pathname === "/api/characters-registry/create") {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        const campaignId = body.campaign || "tropic-gooner";
        try {
          sendJson(res, 200, createCharacterRegistry(campaignId, body), publicMode);
        } catch (e) {
          sendRegistryWriteError(res, e, publicMode);
        }
        return;
      }

      if (pathname === "/api/characters-registry/merge") {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        const campaignId = body.campaign || "tropic-gooner";
        try {
          sendJson(res, 200, mergeCharactersRegistry(campaignId, body), publicMode);
        } catch (e) {
          sendRegistryWriteError(res, e, publicMode);
        }
        return;
      }

      if (pathname === "/api/characters-registry/upload") {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        const campaignId = body.campaign || "tropic-gooner";
        try {
          sendJson(
            res,
            200,
            uploadCharacterPortrait(
              campaignId,
              body.id,
              body.filename,
              body.data_base64 || body.data,
              body
            ),
            publicMode
          );
        } catch (e) {
          sendRegistryWriteError(res, e, publicMode);
        }
        return;
      }

      if (pathname === "/api/characters-registry/remove-image") {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        const campaignId = body.campaign || "tropic-gooner";
        try {
          sendJson(
            res,
            200,
            removeCharacterPortrait(campaignId, body.id, body.path || body.image_path, body),
            publicMode
          );
        } catch (e) {
          if (e && (e.code === "version_conflict" || e.message === "version_conflict")) {
            sendRegistryWriteError(res, e, publicMode);
            return;
          }
          const code = e.message === "character_not_found" ? 404 : 400;
          sendJson(res, code, { error: e.message || "remove_failed" }, publicMode);
        }
        return;
      }

      if (pathname === "/api/characters-registry/import-image-url") {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        const campaignId = body.campaign || "tropic-gooner";
        try {
          sendJson(
            res,
            200,
            await importCharacterPortraitFromUrl(
              campaignId,
              body.id,
              body.url || body.image_url,
              body
            ),
            publicMode
          );
        } catch (e) {
          sendRegistryWriteError(res, e, publicMode);
        }
        return;
      }

      if (pathname === "/api/characters-registry/resolve-attachments") {
        if (auth?.role !== "admin") {
          sendJson(res, 403, { error: "admin_required" }, publicMode);
          return;
        }
        const campaignId = body.campaign || "tropic-gooner";
        try {
          const result = await resolveCharacterDocAttachments(campaignId, {
            id: body.id || "",
            from_discord: body.from_discord !== false,
          });
          sendJson(res, 200, result, publicMode);
        } catch (e) {
          sendJson(res, 400, { error: e.message || "resolve_failed" }, publicMode);
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
  else if (HAS_DASHBOARD_AUTH) {
    const parts = AUTH_ACCOUNTS.map((a) => `${a.role} Basic user=${a.user}`);
    authMode = `${parts.join("; ")}; on-box loopback exempt`;
  } else authMode = `NO tokens configured -> public denied (set tokens in ${TOKEN_ENV_FILE})`;
  console.log(`auth: ${authMode}; public Intel https://abhinavall.net/Intel/`);
  refreshAgentStateBackground(shouldUseLiteAgentCollect());
  setInterval(() => refreshAgentStateBackground(shouldUseLiteAgentCollect()), 60_000);
});

// Exit promptly on stop — never leave long-lived children (ps/nvidia-smi) wedging systemd.
function shutdownDashboard(signal) {
  try {
    console.log(`linuxbox-status shutting down (${signal})`);
  } catch {
    /* ignore */
  }
  try {
    server.close(() => process.exit(0));
  } catch {
    process.exit(0);
  }
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on("SIGTERM", () => shutdownDashboard("SIGTERM"));
process.on("SIGINT", () => shutdownDashboard("SIGINT"));