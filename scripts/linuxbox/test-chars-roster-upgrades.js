/** Self-check: gallery-cleared + relations helpers (no live roster thrash). */
"use strict";

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

// Minimal extract of the gallery-cleared rule used by the server.
function isGalleryIntentionallyEmpty(c) {
  return (
    Array.isArray(c.images) &&
    c.images.length === 0 &&
    (c.image_path === "" || c.image_path == null) &&
    Array.isArray(c.doc_attachments) &&
    c.doc_attachments.length === 0
  );
}

function normalizeRelations(list) {
  if (!Array.isArray(list)) throw new Error("bad_relations");
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const to_id = String(raw.to_id || raw.to || "").trim();
    if (!to_id || /[^a-zA-Z0-9._-]/.test(to_id)) continue;
    const type = String(raw.type || "related").trim().slice(0, 48) || "related";
    const label = String(raw.label || type).trim().slice(0, 80);
    const key = `${to_id.toLowerCase()}::${type.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ to_id, type, label });
  }
  return out;
}

assert.strictEqual(
  isGalleryIntentionallyEmpty({ images: [], image_path: "", doc_attachments: [] }),
  true
);
assert.strictEqual(
  isGalleryIntentionallyEmpty({ images: ["a.png"], image_path: "", doc_attachments: [] }),
  false
);
assert.strictEqual(
  isGalleryIntentionallyEmpty({ images: [], image_path: "x.png", doc_attachments: [] }),
  false
);

const rels = normalizeRelations([
  { to_id: "nelly-stein", type: "twin_sister", label: "twin" },
  { to_id: "nelly-stein", type: "twin_sister", label: "dup" },
  { to: "jinpei-mclaren", type: "fwb" },
  { to_id: "../evil", type: "x" },
]);
assert.strictEqual(rels.length, 2);
assert.strictEqual(rels[0].to_id, "nelly-stein");
assert.strictEqual(rels[1].to_id, "jinpei-mclaren");
assert.strictEqual(rels[1].label, "fwb");

// Registry file sanity
const regPath = path.join(
  __dirname,
  "..",
  "..",
  "campaigns",
  "tropic-gooner",
  "characters-registry.json"
);
const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
const by = Object.fromEntries((reg.characters || []).map((c) => [c.id, c]));
assert.strictEqual(by["harper-maupin"].status, "active");
assert.strictEqual(by["rosalina-bonetto"].status, "active");
assert.strictEqual((by["rosalina-bonetto"].images || []).length, 0);
assert.ok(by["alisa-stein"]);
assert.ok((by["nelly-stein"].relations || []).some((r) => r.to_id === "alisa-stein"));
assert.ok((by["jinpei-mclaren"].relations || []).some((r) => r.to_id === "rosalina-bonetto"));

console.log("chars-roster-upgrades self-check OK");
