#!/usr/bin/env node
/** Self-check for chars-registry-merge (gobbledygook fixtures — no live roster). */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  planCharacterMerge,
  mergeCharactersOnDisk,
} = require("./chars-registry-merge");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert_failed");
}

const registry = {
  version: 99,
  campaign_id: "fixture-camp",
  characters: [
    {
      id: "alpha-prime",
      display_name: "Alpha Prime",
      story_path: "characters/discord/alpha-prime.md",
      aliases: ["Alpha"],
      images: ["characters/portraits/alpha-prime/face.png"],
      image_path: "characters/portraits/alpha-prime/face.png",
      hidden: false,
      status: "active",
      duplicate_paths: [],
    },
    {
      id: "alpha-twin",
      display_name: "Alpha Twin",
      story_path: "characters/discord/alpha-twin.md",
      aliases: ["Alphie"],
      images: ["characters/portraits/alpha-twin/other.png"],
      image_path: "characters/portraits/alpha-twin/other.png",
      hidden: false,
      status: "active",
      discord_username: "twin_user",
      duplicate_paths: [],
    },
  ],
};

const planned = planCharacterMerge(registry, "alpha-prime", ["alpha-twin"]);
assert(planned.summary.secondary_ids[0] === "alpha-twin", "secondary id");
const prim = planned.registry.characters.find((c) => c.id === "alpha-prime");
const stub = planned.registry.characters.find((c) => c.id === "alpha-twin");
assert(stub.hidden === true, "stub hidden");
assert(stub.canonical_id === "alpha-prime", "canonical_id");
assert(stub.images.length === 0, "stub images cleared");
assert(prim.aliases.map((a) => a.toLowerCase()).includes("alphie"), "alias folded");
assert(prim.aliases.map((a) => a.toLowerCase()).includes("alpha twin"), "display alias");
assert(prim.duplicate_paths.includes("characters/discord/alpha-twin.md"), "story dup");
assert(prim.discord_username === "twin_user", "discord taken from secondary");
assert(planned.moves.length === 1, "portrait move planned");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chars-merge-"));
try {
  const srcDir = path.join(tmp, "characters", "portraits", "alpha-twin");
  const dstDir = path.join(tmp, "characters", "portraits", "alpha-prime");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(dstDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, "other.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(dstDir, "face.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const onDisk = mergeCharactersOnDisk(tmp, registry, "alpha-prime", ["alpha-twin"]);
  const copied = onDisk.summary.portrait_copied || [];
  assert(copied.length === 1, "one file copied");
  assert(fs.existsSync(path.join(srcDir, "other.png")), "source kept (no delete)");
  assert(fs.existsSync(path.join(tmp, copied[0].toRel)), "dest exists");
  const p2 = onDisk.registry.characters.find((c) => c.id === "alpha-prime");
  assert(p2.images.includes(copied[0].toRel), "primary images updated");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("chars-registry-merge self-check OK");
