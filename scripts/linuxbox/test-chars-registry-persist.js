#!/usr/bin/env node
/** Self-check for chars-registry-persist (gobbledygook fixtures). */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  unionRegistriesById,
  writeRegistryFile,
  assertBaseVersion,
  mergeCharacterRows,
} = require("./chars-registry-persist");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert_failed");
}

const potato = {
  version: 3,
  campaign_id: "fixture",
  characters: [
    {
      id: "celine",
      display_name: "celine",
      images: ["characters/portraits/celine/a.png"],
      image_path: "characters/portraits/celine/a.png",
      status: "active",
    },
    { id: "stub-a", display_name: "Stub A", hidden: true, canonical_id: "prime", role: "thread-twin" },
  ],
};
const pc = {
  version: 3,
  campaign_id: "fixture",
  characters: [
    {
      id: "celine",
      display_name: "Celine",
      role: "npc",
      hidden: false,
      notes: "GM npc",
      images: [],
      image_path: "",
    },
    {
      id: "alisa-stein",
      display_name: "Alisa Stein",
      role: "npc",
      hidden: false,
      images: [],
      image_path: "",
    },
  ],
};

const merged = unionRegistriesById(potato, pc);
assert(merged.version === 4, "version bump to max+1");
const celine = merged.characters.find((c) => c.id === "celine");
assert(celine.display_name === "Celine", "prefer PC name when potato used slug");
assert(celine.images.length === 1, "keep potato portraits");
assert(celine.hidden === false, "celine visible");
assert(celine.role === "npc", "celine role from PC");
assert(merged.characters.some((c) => c.id === "alisa-stein"), "PC-only side NPC added");
assert(merged.characters.some((c) => c.id === "stub-a"), "potato-only stub kept");

const row = mergeCharacterRows(
  { id: "x", hidden: true, role: "npc", images: [] },
  { id: "x", hidden: false, role: "npc", images: [] }
);
assert(row.hidden === false, "named NPC prefers visible when either says false");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chars-persist-"));
try {
  const abs = path.join(tmp, "characters-registry.json");
  const first = writeRegistryFile({
    absPath: abs,
    data: { campaign_id: "fixture", characters: [{ id: "a", hidden: false, role: "npc" }] },
    repoRoot: tmp,
    campaignId: "fixture",
    bump: true,
    skipLock: true,
  });
  assert(first.version === 1, "first write v1");

  let threw = false;
  try {
    assertBaseVersion(first, 0);
  } catch (e) {
    threw = e.message === "version_conflict";
  }
  assert(threw, "stale base refused");

  const second = writeRegistryFile({
    absPath: abs,
    data: {
      campaign_id: "fixture",
      characters: [{ id: "a", hidden: false, role: "npc" }],
    },
    repoRoot: tmp,
    campaignId: "fixture",
    baseVersion: 1,
    bump: true,
    skipLock: true,
  });
  assert(second.version === 2, "bump to v2");
  assert(second.characters.some((c) => c.id === "a"), "kept a");

  // preserveUnknownIds: write missing id must keep on-disk GM row
  const third = writeRegistryFile({
    absPath: abs,
    data: {
      campaign_id: "fixture",
      characters: [{ id: "b", hidden: false, role: "npc" }],
    },
    repoRoot: tmp,
    campaignId: "fixture",
    baseVersion: 2,
    bump: true,
    preserveUnknownIds: true,
    skipLock: true,
  });
  assert(third.characters.some((c) => c.id === "a"), "preserveUnknownIds kept a");
  assert(third.characters.some((c) => c.id === "b"), "added b");
  assert(third.version === 3, "v3");

  const revDir = path.join(tmp, "agents/state/chars-registry-revisions/fixture");
  assert(fs.existsSync(revDir), "revision dir created");
  assert(fs.readdirSync(revDir).some((n) => n.endsWith(".json")), "revision backup written");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("chars-registry-persist self-check OK");
