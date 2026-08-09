#!/usr/bin/env node
/**
 * Prevention: worldPageHtml lives inside a template literal. A single '\n' there
 * becomes a real newline in the served page and kills the entire boot script
 * (who-chip stuck on "checking…"). This check parses the emitted inline JS.
 *
 * Usage: node scripts/linuxbox/check-world-page-js.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const srcPath = path.join(__dirname, "tableslop-server.js");
const src = fs.readFileSync(srcPath, "utf8");
const start = src.indexOf("function worldPageHtml()");
if (start < 0) {
  console.error("FAIL: worldPageHtml not found");
  process.exit(1);
}
const ret = src.indexOf("return `", start);
// worldPageHtml may mention "devlogPageHtml" inside its template string — take the LAST
// sibling declaration before viewerHtml, not the first string hit.
const endView = src.indexOf("\nfunction viewerHtml()", start);
if (ret < 0 || endView < 0) {
  console.error("FAIL: could not bound worldPageHtml template");
  process.exit(1);
}
const between = src.slice(start, endView);
const hits = [...between.matchAll(/\nfunction devlogPageHtml\(\)/g)];
const end = hits.length ? start + hits[hits.length - 1].index : endView;
const raw = src.slice(ret + "return `".length, end);
const close = raw.lastIndexOf("`;");
const templateBody = raw.slice(0, close);

// Evaluate as a JS template literal (same escape rules Node uses for worldPageHtml).
const html = new Function("return `" + templateBody + "`;")();
const m = html.match(/<script>\s*\(function \(\) \{([\s\S]*?)\}\)\(\);\s*<\/script>/);
if (!m) {
  console.error("FAIL: no inline boot script in emitted HTML");
  process.exit(1);
}
try {
  new vm.Script("(function(){" + m[1] + "})();", { filename: "world-inline.js" });
} catch (e) {
  console.error("FAIL:", e.message);
  process.exit(1);
}
if (!html.includes("[hidden] { display: none !important; }")) {
  console.error("FAIL: missing [hidden] CSS override (display:grid would defeat hidden)");
  process.exit(1);
}
if (html.includes(".join('\n')") || html.includes(".split('\n')")) {
  // Real newlines already broke strings — caught by vm above. This catches escaped-wrong leftovers.
  console.error("FAIL: emitted HTML still contains broken join/split newline strings");
  process.exit(1);
}
console.log("OK worldPageHtml inline JS parses; [hidden] rule present");
