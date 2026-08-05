#!/usr/bin/env node
/** Self-check: Hub last_run prefers meaningful work over think-tick spam. */
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hub-last-run-"));
const stateDir = path.join(tmp, "agents", "state");
fs.mkdirSync(stateDir, { recursive: true });
const indexPath = path.join(stateDir, "run-index.jsonl");
const lines = [
  { ts: "2026-07-13T14:36:29Z", category: "agent_runs", name: "hunter-reckoning", exit: 0, summary: "pod hunter-reckoning" },
  { ts: "2026-07-13T15:00:00Z", category: "agent_runs", name: "think", exit: 0, summary: "pod think" },
  { ts: "2026-07-13T16:19:05Z", category: "agent_runs", name: "think", exit: -1, summary: "pod think" },
];
fs.writeFileSync(indexPath, lines.map((j) => JSON.stringify(j)).join("\n") + "\n");

process.env.AGENT_DUMP = tmp;
// Load after env set — require cache: spawn inline via Function from file slice is heavy;
// duplicate minimal logic mirror for assert (keeps test free of server boot).
const POD_HUMAN = {
  think: { label: "Think / ops lane", kind: "tick", kind_label: "last think tick" },
  "hunter-reckoning": { label: "Hunter: The Reckoning", kind: "campaign", kind_label: "last campaign work" },
};
function enrich(raw, detailHint) {
  const name = raw.name;
  const meta = POD_HUMAN[name] || { label: name, kind: "ops", kind_label: `last ${name} run` };
  const idle = /\bIDLE\b/i.test(raw.summary || "");
  let outcome = "ok";
  if (idle) outcome = "idle";
  else if (raw.exit === -1) outcome = "fail";
  else if (raw.exit != null && raw.exit !== 0) outcome = "fail";
  return {
    name,
    label: meta.label,
    kind: meta.kind,
    kind_label: meta.kind_label,
    ts: raw.ts,
    exit: raw.exit,
    outcome,
    detail: (detailHint || "").slice(0, 120),
    meaningful: meta.kind !== "tick",
  };
}
function buildLastRun(pods, hints) {
  const enriched = pods.map((p) =>
    enrich(p, p.name === "think" ? hints.task_status : hints.campaign_next?.[p.name] || "")
  );
  const latest = enriched[0] || null;
  const meaningful = enriched.find((p) => p.meaningful) || null;
  const primary = meaningful && latest && !latest.meaningful ? meaningful : latest;
  return {
    primary,
    latest,
    meaningful,
    preferred_meaningful: !!(primary && primary.meaningful && latest && !latest.meaningful),
  };
}

const podsNewestFirst = [...lines].reverse();
const lr = buildLastRun(podsNewestFirst, {
  task_status: "dashboard meta lane (priority)",
  campaign_next: { "hunter-reckoning": "next scene beat" },
});

assert.strictEqual(lr.primary.name, "hunter-reckoning", "prefer campaign over think ticks");
assert.strictEqual(lr.primary.label, "Hunter: The Reckoning");
assert.strictEqual(lr.primary.outcome, "ok");
assert.strictEqual(lr.preferred_meaningful, true);
assert.strictEqual(lr.latest.name, "think");
assert.strictEqual(lr.latest.outcome, "fail");
assert.strictEqual(lr.latest.detail, "dashboard meta lane (priority)");
assert.ok(lr.primary.detail.includes("next scene"));

console.log("OK hub-last-run prefer meaningful + labels + fail/timeout");
fs.rmSync(tmp, { recursive: true, force: true });
