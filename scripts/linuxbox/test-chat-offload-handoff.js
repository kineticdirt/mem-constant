#!/usr/bin/env node
/** Self-check for chat-offload-handoff (temp ledger — no live AI_GROUPCHAT write). */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildOffloadTaskBody,
  buildOffloadLedgerLine,
  appendGroupchatRecentActivity,
  threadRelPath,
  BODY_MAX,
} = require("./chat-offload-handoff");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert_failed");
}

const body = buildOffloadTaskBody({
  message: "Please implement the laptop worker sketch",
  modeLabel: "Agent coding",
  chatModeId: "agent-coding",
  threadId: "abcdef0123456789",
  threadTitle: "Potato offload test",
  campaign: "tropic-gooner",
  layer: "hunter",
  excerpt: "Human: earlier context\n\nAssistant: prior reply",
});

assert(body.includes("## Offload to laptop / PC"), "header");
assert(body.includes("Mode: Agent coding"), "mode");
assert(body.includes("Campaign: tropic-gooner (layer: hunter)"), "campaign");
assert(body.includes("Thread: abcdef0123456789 — \"Potato offload test\""), "thread");
assert(body.includes(`Thread file: ${threadRelPath("abcdef0123456789")}`), "thread_file");
assert(body.includes("### Request"), "request");
assert(body.includes("Please implement the laptop worker sketch"), "message");
assert(body.includes("### Thread excerpt (recent)"), "excerpt_section");
assert(body.includes("Human: earlier context"), "excerpt");
assert(body.length <= BODY_MAX, "body_max");

const line = buildOffloadLedgerLine({
  stamp: "2026-07-12T19:45Z",
  taskId: "deadbeef-1111-2222-3333-444455556666",
  threadId: "abcdef0123456789",
  threadTitle: "Potato offload test",
  modeLabel: "Agent coding",
  campaign: "tropic-gooner",
  layer: "hunter",
});
assert(line.startsWith("- **2026-07-12T19:45Z** — [LINUX] **Offload:**"), "ledger_prefix");
assert(line.includes("task `deadbeef`"), "task_short");
assert(line.includes('thread `abcdef0123456789` "Potato offload test"'), "thread_meta");
assert(line.includes("mode Agent coding"), "mode_meta");
assert(line.includes("campaign tropic-gooner/hunter"), "camp_meta");
assert(line.includes("`agents/state/chat-threads/abcdef0123456789.json`"), "path_ptr");
assert(!line.includes("\n"), "single_line");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "offload-ledger-"));
const ledgerPath = path.join(tmp, "AI_GROUPCHAT.md");
fs.writeFileSync(
  ledgerPath,
  "# AI_GROUPCHAT\n\n## Recent activity\n\n- **old** — [PC] prior line\n",
  "utf8"
);
const appended = appendGroupchatRecentActivity(tmp, line);
assert(appended.ok, `append_ok: ${appended.error}`);
const after = fs.readFileSync(ledgerPath, "utf8");
assert(after.indexOf(line) < after.indexOf("- **old**"), "inserted_at_top");
assert(after.includes("## Recent activity"), "section_kept");

const missing = appendGroupchatRecentActivity(path.join(tmp, "nope"), line);
assert(!missing.ok && missing.error === "ledger_missing", "missing_ledger");

console.log("OK chat-offload-handoff self-check");
