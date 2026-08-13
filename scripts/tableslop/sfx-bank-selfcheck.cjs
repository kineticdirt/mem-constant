#!/usr/bin/env node
/** Validate sfx-manifest + bank exports. node scripts/tableslop/sfx-bank-selfcheck.cjs */
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..", "..");
const manPath = path.join(root, "scripts/linuxbox/tableslop-static/sfx/sfx-manifest.json");
const bankPath = path.join(root, "scripts/linuxbox/tableslop-static/sfx/sfx-bank.js");
const errors = [];
const man = JSON.parse(fs.readFileSync(manPath, "utf8"));
if (!Array.isArray(man.entries) || man.entries.length < 8) errors.push("entries thin");
const ids = new Set();
for (const e of man.entries) {
  if (!e.id) errors.push("entry missing id");
  if (ids.has(e.id)) errors.push("dup " + e.id);
  ids.add(e.id);
  if (e.ready !== "slot" && !e.proc && !e.file) errors.push(e.id + " no proc/file");
}
for (const need of ["ui.click", "ui.key", "ui.knob", "door.open", "line.static", "line.buzz", "line.ringback"]) {
  if (!ids.has(need)) errors.push("missing " + need);
}
const bank = fs.readFileSync(bankPath, "utf8");
if (!bank.includes("export") || !bank.includes("playProc")) errors.push("sfx-bank incomplete");
if (!fs.existsSync(path.join(root, "campaigns/tropic-gooner/phone/voice-manifest.json"))) {
  errors.push("campaign voice-manifest missing");
}
console.log(errors.length ? "SFX_SELFCHECK_FAIL" : "SFX_SELFCHECK_OK");
for (const e of errors) console.log(" !", e);
console.log(" entries", man.entries.length, "ids", ids.size);
process.exit(errors.length ? 1 : 0);
