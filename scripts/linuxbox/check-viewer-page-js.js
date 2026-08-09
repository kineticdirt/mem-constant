#!/usr/bin/env node
/**
 * Prevention: viewerHtml() embeds a huge inline map script. A SyntaxError there
 * paints HUD chips then dies (black map + dead DEV LOG). Also guards the
 * pickTileZoom fit→maxZoom regression (hundreds of opacity-0 tiles → black strip).
 *
 * Usage: node scripts/linuxbox/check-viewer-page-js.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const srcPath = path.join(__dirname, "tableslop-server.js");
const src = fs.readFileSync(srcPath, "utf8");
const start = src.indexOf("function viewerHtml()");
if (start < 0) {
  console.error("FAIL: viewerHtml not found");
  process.exit(1);
}
const ret = src.indexOf("return `", start);
const closeHtml = src.indexOf("</html>`", ret);
if (ret < 0 || closeHtml < 0) {
  console.error("FAIL: could not bound viewerHtml template");
  process.exit(1);
}
const templateBody = src.slice(ret + "return `".length, closeHtml + "</html>".length);

// Do not eval the template (nested backticks / ${} break Function). Parse script
// text as it appears in source — same bytes the browser gets aside from ${CAMPAIGN}.
const scripts = [...templateBody.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
if (!scripts.length) {
  console.error("FAIL: no inline scripts in viewerHtml template");
  process.exit(1);
}
for (let i = 0; i < scripts.length; i++) {
  const body = scripts[i][1];
  // Skip tiny bootstrapping snippets if any; still parse all.
  try {
    new vm.Script(body, { filename: "viewer-inline-" + i + ".js" });
  } catch (e) {
    console.error("FAIL script", i, e.message);
    process.exit(1);
  }
}

const pick = src.slice(src.indexOf("function pickTileZoom()"), src.indexOf("function scheduleTileUpdate()"));
if (/maxZoom\s*\+\s*Math\.floor\(\s*Math\.log2\(\s*Math\.max\(\s*0\.125/.test(pick)) {
  console.error("FAIL: regressive pickTileZoom (fit→maxZoom via ratio) still present");
  process.exit(1);
}
if (!/maxZoom\s*\+\s*Math\.log2\(\s*scale\s*\)/.test(pick)) {
  console.error("FAIL: expected scale-based pickTileZoom formula");
  process.exit(1);
}
if (!templateBody.includes('id="devLogToggle"') || !templateBody.includes('id="dcModal"')) {
  console.error("FAIL: missing DEV LOG HUD markup");
  process.exit(1);
}
// Real newlines inside quoted join/split (same class as world hang).
if (/\.join\('\n'\)|\.split\('\n'\)/.test(templateBody)) {
  console.error("FAIL: real-newline join/split in viewerHtml template");
  process.exit(1);
}

console.log(
  "OK viewerHtml inline JS parses (" + scripts.length + " scripts); pickTileZoom scale-based; DEV LOG markup present"
);
