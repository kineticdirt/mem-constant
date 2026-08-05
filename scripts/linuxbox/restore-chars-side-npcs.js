#!/usr/bin/env node
/**
 * Restore named side NPCs: union PC∪potato, unhide named sides, soft-hide stubs only.
 * Usage (on potato or PC):
 *   node scripts/linuxbox/restore-chars-side-npcs.js [--potato PATH] [--pc PATH] [--write]
 * Default paths assume repo root = ../.. from this script.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const {
  unionRegistriesById,
  writeRegistryFile,
} = require("./chars-registry-persist");

const MUST_VISIBLE = new Set([
  "alisa-stein",
  "jinpei-mclaren",
  "harper-sister",
  "celine",
  "ellaine-roommate", // Sofia — visible unless canonical_id merges into celine
]);

const FORCE_STUB_HIDE = new Set([
  "twofell",
  "rosa",
  "rosalinda",
  "age",
  "bleep-boop",
  "deleted-user",
  "cassidy",
  "ellaine",
  "minerva",
  "nelly",
  "red",
  "wholesomeest-boi",
]);

function parseArgs(argv) {
  const out = { write: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") out.write = true;
    else if (a === "--potato") out.potato = argv[++i];
    else if (a === "--pc") out.pc = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--holder") out.holder = argv[++i];
  }
  return out;
}

function load(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function applyVisibilityRules(reg) {
  for (const c of reg.characters || []) {
    if (!c || !c.id) continue;
    const id = c.id;
    const canon = String(c.canonical_id || "").trim();

    // Soft-hide merge stubs with canonical_id
    if (canon) {
      c.hidden = true;
      continue;
    }

    // Explicit stub list
    if (FORCE_STUB_HIDE.has(id) || c.role === "gm" || c.role === "author-stub" || c.role === "thread-twin" || c.role === "ingest-noise") {
      c.hidden = true;
      continue;
    }

    // Named sides / PCs must stay visible
    if (MUST_VISIBLE.has(id) || c.role === "pc" || c.role === "npc" || c.role === "side") {
      c.hidden = false;
      if (!c.role || c.role === "") c.role = MUST_VISIBLE.has(id) ? "npc" : c.role || "npc";
      // Fix slug-as-name for celine
      if (id === "celine" && (!c.display_name || String(c.display_name).toLowerCase() === "celine")) {
        c.display_name = "Celine";
      }
      continue;
    }

    // default: leave as-is but prefer visible for unknown roles without canon
    if (c.hidden === true && !canon) {
      /* leave intentionally hidden unknown */
    } else if (!canon) {
      c.hidden = false;
    }
  }

  // Special: ellaine-roommate only soft-hide if it points at celine
  const sofia = (reg.characters || []).find((c) => c.id === "ellaine-roommate");
  if (sofia && String(sofia.canonical_id || "").trim() === "celine") {
    sofia.hidden = true;
  } else if (sofia) {
    sofia.hidden = false;
    sofia.role = sofia.role || "npc";
  }

  return reg;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, "..", "..");
  const potatoPath =
    args.potato || path.join(root, "campaigns/tropic-gooner/characters-registry.json");
  const pcPath = args.pc || potatoPath;
  const outPath = args.out || potatoPath;

  const potato = load(potatoPath);
  const pc = pcPath === potatoPath ? potato : load(pcPath);
  let merged = unionRegistriesById(potato, pc);
  merged = applyVisibilityRules(merged);

  const visible = (merged.characters || [])
    .filter((c) => c.hidden !== true && c.role !== "gm")
    .map((c) => c.id)
    .sort();
  const need = ["alisa-stein", "jinpei-mclaren", "harper-sister", "celine"];
  const missNeed = need.filter((id) => !visible.includes(id));

  console.log(
    JSON.stringify(
      {
        dry_run: !args.write,
        potato_version: potato.version,
        pc_version: pc.version,
        merged_version_pre_write: merged.version,
        visible_count: visible.length,
        visible_ids: visible,
        missing_required: missNeed,
        total: (merged.characters || []).length,
      },
      null,
      2
    )
  );

  if (missNeed.length) {
    console.error("ABORT: required ids still not visible after merge", missNeed);
    process.exit(2);
  }

  if (!args.write) {
    console.error("dry-run OK — pass --write to persist");
    return;
  }

  const written = writeRegistryFile({
    absPath: outPath,
    data: merged,
    repoRoot: root,
    campaignId: "tropic-gooner",
    bump: true,
    preserveUnknownIds: true,
    lockHolder: args.holder || `restore-chars-side-npcs:${process.pid}`,
    lockNote: "restore named side NPCs union PC∪potato",
  });

  const vis2 = (written.characters || [])
    .filter((c) => c.hidden !== true && c.role !== "gm")
    .map((c) => c.id)
    .sort();
  console.log(
    JSON.stringify(
      {
        written: true,
        version: written.version,
        visible_ids: vis2,
        path: outPath,
      },
      null,
      2
    )
  );
}

main();
