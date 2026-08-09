#!/usr/bin/env node
/**
 * Prevention: viewerHtml() embeds a huge inline map script. A SyntaxError there
 * paints HUD chips then dies (black map). Also guards:
 *   - pickTileZoom fit→maxZoom regression (hundreds of opacity-0 tiles)
 *   - DEV LOG must navigate to /devlog (not a map overlay)
 *   - eager /map-image?res=2k preload so underlay fetch starts before JS boots
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

const scripts = [...templateBody.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
if (!scripts.length) {
  console.error("FAIL: no inline scripts in viewerHtml template");
  process.exit(1);
}
for (let i = 0; i < scripts.length; i++) {
  const body = scripts[i][1];
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

if (!templateBody.includes('rel="preload"') || !templateBody.includes("/map-image?res=2k")) {
  console.error("FAIL: missing eager preload for /map-image?res=2k");
  process.exit(1);
}
// Opacity animation on #mapImg + prefers-reduced-motion 0.01ms → permanent black void.
if (/@keyframes map-reveal\s*\{[^}]*opacity\s*:\s*0/s.test(templateBody)) {
  console.error("FAIL: map-reveal must not animate opacity (reduced-motion freeze)");
  process.exit(1);
}
if (!/map-layer--terrain-base img#mapImg[\s\S]*?opacity:\s*1/.test(templateBody)) {
  console.error("FAIL: #mapImg must set opacity:1 in CSS (not animation-only)");
  process.exit(1);
}
if (!/prefers-reduced-motion: reduce[\s\S]*?map-stage img#mapImg[\s\S]*?opacity:\s*1\s*!important/.test(templateBody)) {
  console.error("FAIL: reduced-motion must force #mapImg opacity:1 !important");
  process.exit(1);
}
if (!/location\.assign\(\s*['"]\/devlog['"]\s*\)/.test(templateBody) ||
    !/location\.assign\(\s*['"]\/world['"]\s*\)/.test(templateBody)) {
  console.error("FAIL: WORLD/DEV LOG must location.assign hard-nav");
  process.exit(1);
}
if (!templateBody.includes('id="mapImg"') && !/img\.id\s*=\s*['"]mapImg['"]/.test(templateBody)) {
  console.error("FAIL: mapImg id path missing from viewer");
  process.exit(1);
}
if (!templateBody.includes('id="mapLoadChip"')) {
  console.error("FAIL: missing #mapLoadChip error/status chip");
  process.exit(1);
}

// DEV LOG must be a real navigation target (WORLD pattern), not overlay-only.
if (!/id="devLogToggle"[^>]*href="\/devlog"/.test(templateBody) &&
    !/href="\/devlog"[^>]*id="devLogToggle"/.test(templateBody)) {
  console.error("FAIL: DEV LOG chip must be <a href=\"/devlog\">");
  process.exit(1);
}
if (templateBody.includes('id="dcModal"')) {
  console.error("FAIL: map-page dcModal overlay still present — use /devlog page");
  process.exit(1);
}
if (!src.includes("function devlogPageHtml()") || !src.includes('url === "/devlog"')) {
  console.error("FAIL: /devlog route + devlogPageHtml missing");
  process.exit(1);
}

// Fit-scale sanity: pickTileZoom at scale≈fit (~0.18 for 4k in ~1100px) must not clamp to maxZoom.
{
  const maxZoom = 5;
  const minZoom = 0;
  const scale = 0.18;
  const ideal = Math.floor(maxZoom + Math.log2(scale) + 0.35);
  const z = Math.max(minZoom, Math.min(maxZoom, ideal));
  if (z >= maxZoom) {
    console.error("FAIL: pickTileZoom at fit-like scale still yields maxZoom", z);
    process.exit(1);
  }
  if (z > 3) {
    console.error("FAIL: expected low zoom at fit (got z=" + z + ")");
    process.exit(1);
  }
}

if (/\.join\('\n'\)|\.split\('\n'\)/.test(templateBody)) {
  console.error("FAIL: real-newline join/split in viewerHtml template");
  process.exit(1);
}

console.log(
  "OK viewerHtml inline JS parses (" +
    scripts.length +
    " scripts); pickTileZoom scale-based; preload+mapLoadChip; opacity-safe mapImg; DEV LOG/WORLD → assign"
);
