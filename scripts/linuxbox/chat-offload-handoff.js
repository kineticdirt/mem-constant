/**
 * Dashboard Chat "Offload to laptop" handoff artifacts.
 * Builds enriched user-task body + AI_GROUPCHAT Recent activity one-liner.
 * Side-effect free builders; appendGroupchatRecentActivity writes the ledger.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const THREAD_REL_PREFIX = "agents/state/chat-threads";
const BODY_MAX = 4000;
const MSG_MAX = 1800;
const EXCERPT_MAX = 1600;

function utcLedgerStamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function oneLine(s, max = 80) {
  return String(s || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function threadRelPath(threadId) {
  if (!threadId) return null;
  return `${THREAD_REL_PREFIX}/${threadId}.json`;
}

/**
 * @param {object} opts
 * @param {string} opts.message
 * @param {string|null} [opts.modeLabel]
 * @param {string|null} [opts.chatModeId]
 * @param {string|null} [opts.threadId]
 * @param {string|null} [opts.threadTitle]
 * @param {string|null} [opts.campaign]
 * @param {string|null} [opts.layer]
 * @param {string} [opts.excerpt]
 */
function buildOffloadTaskBody(opts = {}) {
  const message = String(opts.message || "").trim().slice(0, MSG_MAX);
  const modeLabel = opts.modeLabel || opts.chatModeId || "n/a";
  const threadId = opts.threadId || null;
  const threadTitle = opts.threadTitle ? oneLine(opts.threadTitle, 100) : null;
  const campaign = opts.campaign || null;
  const layer = opts.layer || null;
  const rel = threadRelPath(threadId);
  const excerpt = String(opts.excerpt || "").trim().slice(0, EXCERPT_MAX);

  const campaignLine = campaign
    ? `Campaign: ${campaign}${layer ? ` (layer: ${layer})` : ""}`
    : "Campaign: (none / general)";

  const threadLine = threadId
    ? `Thread: ${threadId}${threadTitle ? ` — "${threadTitle}"` : ""}`
    : "Thread: (none)";

  const parts = [
    "## Offload to laptop / PC",
    "Source: Dashboard Chat (potato RAM offload — NOT running on linuxbox)",
    `Mode: ${modeLabel}`,
    campaignLine,
    threadLine,
    rel ? `Thread file: ${rel}` : null,
    "",
    "### Request",
    message || "(empty)",
    "",
  ];

  if (excerpt) {
    parts.push("### Thread excerpt (recent)", excerpt, "");
  }

  parts.push(
    "### Agent instructions",
    "Work on laptop or PC (Tailscale + git / Cursor). Do not assume this is already running remotely.",
    "Read the thread file above when present (gitignored runtime on potato — scp/ssh if needed).",
    "When done: mark task done; optional one ledger line in AI_GROUPCHAT.md."
  );

  return parts.filter((p) => p != null).join("\n").slice(0, BODY_MAX);
}

/**
 * Short Recent activity bullet for laptop/PC pickup.
 * @param {object} opts
 */
function buildOffloadLedgerLine(opts = {}) {
  const stamp = opts.stamp || utcLedgerStamp();
  const taskShort = opts.taskId ? String(opts.taskId).slice(0, 8) : "n/a";
  const threadId = opts.threadId || "none";
  const title = oneLine(opts.threadTitle || opts.messagePreview || "", 48) || "untitled";
  const mode = oneLine(opts.modeLabel || opts.chatModeId || "n/a", 32);
  const camp = opts.campaign
    ? `${opts.campaign}${opts.layer ? `/${opts.layer}` : ""}`
    : "none";
  const rel = threadRelPath(opts.threadId);
  const ptr = rel ? ` · \`${rel}\`` : "";
  return `- **${stamp}** — [LINUX] **Offload:** task \`${taskShort}\` · thread \`${threadId}\` "${title}" · mode ${mode} · campaign ${camp} → laptop/PC${ptr}`;
}

/**
 * Insert a bullet at the top of ## Recent activity (after header + blank lines).
 * @returns {{ ok: boolean, error?: string }}
 */
function appendGroupchatRecentActivity(repoRoot, line) {
  const ledgerPath = path.join(repoRoot, "AI_GROUPCHAT.md");
  if (!fs.existsSync(ledgerPath)) return { ok: false, error: "ledger_missing" };
  let text;
  try {
    text = fs.readFileSync(ledgerPath, "utf8");
  } catch (err) {
    return { ok: false, error: err.message || "ledger_read_failed" };
  }
  const marker = "## Recent activity";
  const idx = text.indexOf(marker);
  if (idx < 0) return { ok: false, error: "section_missing" };
  const afterHeader = text.indexOf("\n", idx);
  if (afterHeader < 0) return { ok: false, error: "section_malformed" };
  let pos = afterHeader + 1;
  while (pos < text.length && text[pos] === "\n") pos += 1;
  const entry = `${String(line || "").replace(/\r?\n/g, " ").trim()}\n\n`;
  if (!entry.startsWith("- ")) return { ok: false, error: "bad_line" };
  try {
    fs.writeFileSync(ledgerPath, text.slice(0, pos) + entry + text.slice(pos), "utf8");
  } catch (err) {
    return { ok: false, error: err.message || "ledger_write_failed" };
  }
  return { ok: true };
}

module.exports = {
  BODY_MAX,
  THREAD_REL_PREFIX,
  utcLedgerStamp,
  threadRelPath,
  buildOffloadTaskBody,
  buildOffloadLedgerLine,
  appendGroupchatRecentActivity,
};
