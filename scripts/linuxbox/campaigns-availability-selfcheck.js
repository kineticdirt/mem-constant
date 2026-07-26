#!/usr/bin/env node
/** Minimal self-check for campaigns-availability-server (no network). */
"use strict";

const { escapeHtml, renderHtml } = require("./campaigns-availability-server.js");

const payload = {
  ok: true,
  host: "campaigns.tableslop.org",
  updated_at: "2026-07-26T00:00:00.000Z",
  campaigns: [
    {
      id: "tropic-gooner",
      name: "Tropic <test>",
      kind: "campaign",
      status: "up",
      note: "ok",
      links: [{ label: "Open map", href: "https://map.tableslop.org/" }],
    },
  ],
};

const html = renderHtml(payload);
if (!html.includes("campaigns.tableslop")) throw new Error("missing brand");
if (html.includes("Tropic <test>")) throw new Error("unescaped HTML");
if (!html.includes("Tropic &lt;test&gt;")) throw new Error("escape failed");
if (escapeHtml(`a&b<"c">`) !== "a&amp;b&lt;&quot;c&quot;&gt;") throw new Error("escapeHtml");
console.log("campaigns-availability selfcheck OK");
