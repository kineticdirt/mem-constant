#!/usr/bin/env node
/** CLI for multitask-lock.js — see multitask-lock.sh */
"use strict";

const path = require("path");
const {
  acquire,
  release,
  heartbeat,
  status,
  repoRootFrom,
} = require("./multitask-lock");

function usage() {
  console.log(`Usage:
  multitask-lock acquire RESOURCE --holder ID [--wait|--no-wait] [--note TEXT] [--stale-sec N] [--force]
  multitask-lock release RESOURCE --holder ID [--force]
  multitask-lock heartbeat RESOURCE --holder ID
  multitask-lock status [RESOURCE]`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--holder") out.holder = argv[++i];
    else if (a === "--note") out.note = argv[++i];
    else if (a === "--stale-sec") out.staleSec = Number(argv[++i]);
    else if (a === "--wait") out.wait = true;
    else if (a === "--no-wait") out.wait = false;
    else if (a === "--force") out.force = true;
    else if (a === "--repo") out.repoRoot = argv[++i];
    else if (a.startsWith("-")) {
      console.error("unknown flag", a);
      process.exit(2);
    } else out._.push(a);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const resource = args._[1];
  const repoRoot = args.repoRoot || repoRootFrom(__dirname);
  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") {
    usage();
    process.exit(0);
  }

  try {
    if (cmd === "acquire") {
      if (!resource || !args.holder) {
        usage();
        process.exit(2);
      }
      const lock = acquire({
        repoRoot,
        resource,
        holder: args.holder,
        note: args.note || "",
        wait: args.wait !== false,
        staleMs: args.staleSec != null ? args.staleSec * 1000 : undefined,
        force: Boolean(args.force),
      });
      console.log(JSON.stringify({ ok: true, action: "acquire", lock }, null, 2));
      return;
    }
    if (cmd === "release") {
      if (!resource || !args.holder) {
        usage();
        process.exit(2);
      }
      const r = release({
        repoRoot,
        resource,
        holder: args.holder,
        force: Boolean(args.force),
      });
      console.log(JSON.stringify({ ok: true, action: "release", ...r }, null, 2));
      return;
    }
    if (cmd === "heartbeat") {
      if (!resource || !args.holder) {
        usage();
        process.exit(2);
      }
      const lock = heartbeat({ repoRoot, resource, holder: args.holder });
      console.log(JSON.stringify({ ok: true, action: "heartbeat", lock }, null, 2));
      return;
    }
    if (cmd === "status") {
      const s = status({ repoRoot, resource: resource || "" });
      console.log(JSON.stringify({ ok: true, action: "status", ...s }, null, 2));
      return;
    }
    usage();
    process.exit(2);
  } catch (e) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: e.code || e.message,
          message: e.message,
          lock: e.lock || null,
        },
        null,
        2
      )
    );
    process.exit(e.code === "lock_held" ? 3 : 1);
  }
}

main();
