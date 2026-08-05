#!/usr/bin/env node
/** Self-check for multitask-lock.js */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { acquire, release, status, isFresh } = require("./multitask-lock");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert_failed");
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mt-lock-"));
try {
  const a = acquire({
    repoRoot: tmp,
    resource: "chars-registry:fixture",
    holder: "agent-a",
    note: "test",
    wait: false,
  });
  assert(a.status === "claimed", "claimed");
  assert(isFresh(a), "fresh");

  let held = false;
  try {
    acquire({
      repoRoot: tmp,
      resource: "chars-registry:fixture",
      holder: "agent-b",
      wait: false,
    });
  } catch (e) {
    held = e.code === "lock_held";
  }
  assert(held, "second holder blocked");

  release({ repoRoot: tmp, resource: "chars-registry:fixture", holder: "agent-a" });
  const b = acquire({
    repoRoot: tmp,
    resource: "chars-registry:fixture",
    holder: "agent-b",
    wait: false,
  });
  assert(b.holder === "agent-b", "re-acquired");
  const st = status({ repoRoot: tmp, resource: "chars-registry:fixture" });
  assert(st.locks.length >= 1, "status lists lock");
  release({ repoRoot: tmp, resource: "chars-registry:fixture", holder: "agent-b" });
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log("multitask-lock self-check OK");
