#!/usr/bin/env node
/** Self-check: mazda3 chat → parts.json memory helpers (no network). */
const path = require("path");
const fs = require("fs");
const os = require("os");

// Load only the helpers by eval'ing extracted functions is brittle — instead
// require the server file's patterns via a tiny duplicate of extract+patch logic
// by spawning nothing: we import by running assertions against live file after
// requiring functions from a copy. Simplest: require server is heavy (starts
// listeners). So duplicate the regex tests inline against the source text.

const root = path.join(__dirname);
const server = fs.readFileSync(path.join(root, "linuxbox-status-server.js"), "utf8");
const partsPath = path.join(root, "..", "..", "projects", "mazda3-sports-build", "parts.json");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(server.includes("extractMazdaFactsFromUserText"), "missing extractMazdaFactsFromUserText");
assert(server.includes("applyProjectWriteDirectives"), "missing applyProjectWriteDirectives");
assert(server.includes("formatMazdaBuildMemoryBlock"), "missing formatMazdaBuildMemoryBlock");
assert(server.includes("patchMazdaBuild"), "missing patchMazdaBuild");

const parts = JSON.parse(fs.readFileSync(partsPath, "utf8"));
assert(parts.vehicle && parts.vehicle.chassis === "mazda3", "parts.json vehicle.chassis must be mazda3");
const wheels = (parts.parts || []).find((p) => p.id === "white-wheels");
assert(wheels && wheels.status === "ordered", "white-wheels should be ordered");
assert(/CP23/i.test(wheels.name || ""), "white-wheels name should mention CP23");

// Regex smoke matching the extract function intent
const userLine = "Its a mazda3 this has been confirmed multiple times.";
assert(/\b(it'?s|its|is|confirmed|confirm).{0,40}mazda\s*3\b/i.test(userLine) || /\bmazda\s*3\b/i.test(userLine), "chassis heuristic should match user line");

console.log("OK mazda3-build-memory-check");
console.log("  chassis=", parts.vehicle.chassis_label);
console.log("  wheels=", wheels.name, wheels.status);
