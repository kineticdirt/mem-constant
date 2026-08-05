/**
 * Disk-backed multitask lock for shared state (chars registry, SCP, etc.).
 * Path: agents/state/multitask-locks/<safe-resource>.json
 * Also mirrors active claim into agents/state/multitask-checkin.json
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const DEFAULT_STALE_MS = 5 * 60 * 1000;
const DEFAULT_WAIT_MS = 1500;
const DEFAULT_RETRIES = 8;

function repoRootFrom(here) {
  return path.resolve(here || __dirname, "..", "..");
}

function locksDir(repoRoot) {
  return path.join(repoRoot, "agents", "state", "multitask-locks");
}

function checkinPath(repoRoot) {
  return path.join(repoRoot, "agents", "state", "multitask-checkin.json");
}

function safeResourceName(resource) {
  return String(resource || "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]+/g, "_")
    .replace(/:/g, "__")
    .slice(0, 120) || "unknown";
}

function lockPath(repoRoot, resource) {
  return path.join(locksDir(repoRoot), `${safeResourceName(resource)}.json`);
}

function nowIso() {
  return new Date().toISOString();
}

function sleepSync(ms) {
  const n = Math.max(0, Number(ms) || 0);
  if (n <= 0) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
  } catch {
    const { spawnSync } = require("child_process");
    spawnSync(process.execPath, ["-e", `setTimeout(() => {}, ${n})`], {
      timeout: n + 2000,
      windowsHide: true,
    });
  }
}

function readJson(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, p);
}

function isFresh(lock, staleMs) {
  if (!lock || lock.status !== "claimed") return false;
  const ts = Date.parse(lock.heartbeat_at || lock.started_at || 0);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < (staleMs || DEFAULT_STALE_MS);
}

function readLock(repoRoot, resource) {
  return readJson(lockPath(repoRoot, resource), null);
}

function mirrorCheckin(repoRoot, active, completed) {
  const p = checkinPath(repoRoot);
  const cur = readJson(p, { schema: 1 });
  cur.schema = 1;
  cur.updated_at = nowIso();
  if (active) {
    cur.active_claim = {
      resource: active.resource,
      holder: active.holder,
      started_at: active.started_at,
      heartbeat_at: active.heartbeat_at,
      status: active.status,
      note: active.note || "",
    };
  } else if (active === null) {
    cur.active_claim = null;
  }
  if (completed) {
    cur.last_completed = completed;
  }
  if (!cur.notes) {
    cur.notes =
      "Durable lock: scripts/linuxbox/multitask-lock.sh|js. Acquire before registry/SCP writes.";
  }
  writeJsonAtomic(p, cur);
}

/**
 * Acquire lock. Returns lock object or throws if busy after retries.
 */
function acquire(opts) {
  const repoRoot = opts.repoRoot || repoRootFrom();
  const resource = String(opts.resource || "").trim();
  if (!resource) throw new Error("lock_need_resource");
  const holder = String(opts.holder || `pid-${process.pid}@${os.hostname()}`).trim();
  const note = String(opts.note || "").trim();
  const staleMs = opts.staleMs != null ? Number(opts.staleMs) : DEFAULT_STALE_MS;
  const wait = opts.wait !== false;
  const waitMs = opts.waitMs != null ? Number(opts.waitMs) : DEFAULT_WAIT_MS;
  const retries = opts.retries != null ? Number(opts.retries) : wait ? DEFAULT_RETRIES : 1;
  const force = Boolean(opts.force);

  fs.mkdirSync(locksDir(repoRoot), { recursive: true });
  const lp = lockPath(repoRoot, resource);

  for (let i = 0; i < retries; i++) {
    const existing = readLock(repoRoot, resource);
    if (existing && isFresh(existing, staleMs) && existing.holder !== holder && !force) {
      if (!wait || i === retries - 1) {
        const err = new Error("lock_held");
        err.code = "lock_held";
        err.lock = existing;
        throw err;
      }
      sleepSync(waitMs + Math.floor(Math.random() * 500));
      continue;
    }

    const started = (existing && existing.holder === holder && existing.status === "claimed"
      ? existing.started_at
      : nowIso());
    const lock = {
      resource,
      holder,
      started_at: started,
      heartbeat_at: nowIso(),
      status: "claimed",
      note: note || (existing && existing.note) || "",
      pid: process.pid,
      host: os.hostname(),
    };
    writeJsonAtomic(lp, lock);
    // re-read to detect race (simple CAS): if someone else won, retry
    const verify = readLock(repoRoot, resource);
    if (verify && verify.holder === holder && verify.status === "claimed") {
      mirrorCheckin(repoRoot, lock, null);
      return lock;
    }
    if (!wait || i === retries - 1) {
      const err = new Error("lock_race");
      err.code = "lock_race";
      err.lock = verify;
      throw err;
    }
    sleepSync(waitMs);
  }
  const err = new Error("lock_held");
  err.code = "lock_held";
  throw err;
}

function heartbeat(opts) {
  const repoRoot = opts.repoRoot || repoRootFrom();
  const resource = String(opts.resource || "").trim();
  const holder = String(opts.holder || "").trim();
  const lock = readLock(repoRoot, resource);
  if (!lock || lock.status !== "claimed") throw new Error("lock_not_held");
  if (holder && lock.holder !== holder) throw new Error("lock_not_owner");
  lock.heartbeat_at = nowIso();
  writeJsonAtomic(lockPath(repoRoot, resource), lock);
  mirrorCheckin(repoRoot, lock, null);
  return lock;
}

function release(opts) {
  const repoRoot = opts.repoRoot || repoRootFrom();
  const resource = String(opts.resource || "").trim();
  const holder = String(opts.holder || "").trim();
  const force = Boolean(opts.force);
  const lp = lockPath(repoRoot, resource);
  const lock = readLock(repoRoot, resource);
  if (!lock) {
    mirrorCheckin(repoRoot, null, null);
    return { released: false, reason: "no_lock" };
  }
  if (!force && holder && lock.holder !== holder && lock.status === "claimed" && isFresh(lock)) {
    const err = new Error("lock_not_owner");
    err.code = "lock_not_owner";
    err.lock = lock;
    throw err;
  }
  const done = {
    ...lock,
    status: "done",
    heartbeat_at: nowIso(),
    released_at: nowIso(),
  };
  writeJsonAtomic(lp, done);
  mirrorCheckin(repoRoot, null, {
    agent: done.holder,
    purpose: done.note || done.resource,
    resource: done.resource,
    completed_at: done.released_at,
  });
  return { released: true, lock: done };
}

function status(opts) {
  const repoRoot = opts.repoRoot || repoRootFrom();
  const resource = opts.resource ? String(opts.resource).trim() : "";
  const dir = locksDir(repoRoot);
  if (!fs.existsSync(dir)) return { locks: [], checkin: readJson(checkinPath(repoRoot), null) };
  const files = fs.readdirSync(dir).filter((n) => n.endsWith(".json"));
  const locks = [];
  for (const n of files) {
    const lock = readJson(path.join(dir, n), null);
    if (!lock) continue;
    if (resource && lock.resource !== resource && safeResourceName(lock.resource) !== safeResourceName(resource)) {
      continue;
    }
    locks.push({
      ...lock,
      fresh: isFresh(lock),
      path: path.join(dir, n),
    });
  }
  return { locks, checkin: readJson(checkinPath(repoRoot), null) };
}

/**
 * Run fn while holding the lock. Always release afterward.
 */
async function withLock(opts, fn) {
  const lock = acquire(opts);
  try {
    return await fn(lock);
  } finally {
    try {
      release({ ...opts, holder: opts.holder || lock.holder });
    } catch {
      /* ignore release errors */
    }
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

module.exports = {
  DEFAULT_STALE_MS,
  DEFAULT_WAIT_MS,
  locksDir,
  lockPath,
  safeResourceName,
  acquire,
  release,
  heartbeat,
  status,
  withLock,
  isFresh,
  readLock,
  sleepSync,
  repoRootFrom,
};
