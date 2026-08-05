/**
 * Soft-merge character registry rows (Chars tab).
 * Secondary → hidden stub with canonical_id; portraits copied into primary dir (sources kept).
 * NEVER hard-delete GM/user-created characters — soft-hide only; ask before merge/delete.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const CHAR_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

function uniqStrings(arr) {
  const out = [];
  const seen = new Set();
  for (const raw of arr || []) {
    const s = String(raw || "").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function normalizeRel(imagePath) {
  if (!imagePath || typeof imagePath !== "string") return "";
  const normalized = imagePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || path.isAbsolute(normalized)) return "";
  return normalized;
}

function collisionSafeDest(absDir, baseName) {
  const ext = path.extname(baseName);
  const stem = path.basename(baseName, ext).slice(0, 80) || "portrait";
  let candidate = `${stem}${ext}`;
  let n = 2;
  while (fs.existsSync(path.join(absDir, candidate))) {
    candidate = `${stem}-${n}${ext}`;
    n += 1;
  }
  return candidate;
}

/**
 * Plan merge: mutate a deep-copied registry + list file copies.
 * @returns {{ registry, moves: {fromRel,toRel}[], summary }}
 */
function planCharacterMerge(registry, primaryId, secondaryIds) {
  const primary = String(primaryId || "").trim();
  const secs = uniqStrings(secondaryIds).filter((id) => id !== primary);
  if (!primary) throw new Error("primary_required");
  if (!secs.length) throw new Error("secondary_required");

  const data = JSON.parse(JSON.stringify(registry || { characters: [] }));
  data.characters = Array.isArray(data.characters) ? data.characters : [];
  const byId = new Map(data.characters.map((c) => [c.id, c]));
  const prim = byId.get(primary);
  if (!prim) throw new Error("primary_not_found");
  for (const sid of secs) {
    if (!byId.has(sid)) throw new Error(`secondary_not_found:${sid}`);
  }

  const moves = [];
  const aliasesAdded = [];
  const pathsAdded = [];
  const today = new Date().toISOString().slice(0, 10);

  const primImgs = Array.isArray(prim.images) ? prim.images.map(String) : [];
  const primAliases = Array.isArray(prim.aliases) ? prim.aliases.map(String) : [];
  const primDups = Array.isArray(prim.duplicate_paths) ? prim.duplicate_paths.map(String) : [];
  const primDocs = Array.isArray(prim.doc_attachments) ? prim.doc_attachments.map(String) : [];

  for (const sid of secs) {
    const sec = byId.get(sid);
    const aliasCandidates = [
      sec.display_name,
      sec.id,
      ...(Array.isArray(sec.aliases) ? sec.aliases : []),
    ];
    for (const a of aliasCandidates) {
      const s = String(a || "").trim();
      if (!s) continue;
      if (s.toLowerCase() === String(prim.display_name || "").toLowerCase()) continue;
      if (s.toLowerCase() === primary.toLowerCase()) continue;
      if (!primAliases.some((x) => x.toLowerCase() === s.toLowerCase())) {
        primAliases.push(s);
        aliasesAdded.push(s);
      }
    }

    if (sec.story_path) {
      const sp = String(sec.story_path);
      if (sp !== prim.story_path && !primDups.includes(sp)) primDups.push(sp);
    }
    for (const dp of Array.isArray(sec.duplicate_paths) ? sec.duplicate_paths : []) {
      const sp = String(dp || "");
      if (sp && sp !== prim.story_path && !primDups.includes(sp)) primDups.push(sp);
    }
    for (const d of Array.isArray(sec.doc_attachments) ? sec.doc_attachments : []) {
      const ref = String(d || "");
      if (ref && !primDocs.includes(ref)) primDocs.push(ref);
    }

    if (!prim.discord_username && sec.discord_username) prim.discord_username = sec.discord_username;
    if (!prim.discord_user_id && sec.discord_user_id) prim.discord_user_id = sec.discord_user_id;
    if (!prim.player_name && sec.player_name) prim.player_name = sec.player_name;

    const secImgs = Array.isArray(sec.images) ? sec.images.map(String) : [];
    if (sec.image_path) secImgs.push(String(sec.image_path));
    for (const raw of uniqStrings(secImgs)) {
      const rel = normalizeRel(raw);
      if (!rel) continue;
      const ext = path.extname(rel).toLowerCase();
      if (!CHAR_IMAGE_EXTS.has(ext)) continue;
      const portraitPrefix = `characters/portraits/${sid}`;
      if (rel === portraitPrefix || rel.startsWith(`${portraitPrefix}/`) || rel.startsWith(`${portraitPrefix}.`)) {
        // Will copy on apply; dest path filled after collision check in applyPortraitMoves
        moves.push({ fromRel: rel, secondaryId: sid, kind: "portrait" });
      } else if (!primImgs.includes(rel)) {
        primImgs.push(rel);
        pathsAdded.push(rel);
      }
    }

    sec.hidden = true;
    sec.canonical_id = primary;
    sec.status = "stub";
    sec.role = sec.role === "gm" ? "gm" : "merged";
    sec.notes = `Merged into ${primary} on ${today}. Originals kept on disk; use canonical row.`;
    sec.aliases = [];
    sec.images = [];
    sec.image_path = "";
  }

  prim.aliases = uniqStrings(primAliases);
  prim.duplicate_paths = uniqStrings(primDups);
  prim.doc_attachments = uniqStrings(primDocs);
  prim.images = uniqStrings(primImgs);
  if (prim.hidden) prim.hidden = false;
  if (prim.status === "stub") prim.status = "active";

  return {
    registry: data,
    moves,
    summary: {
      primary_id: primary,
      secondary_ids: secs,
      aliases_added: uniqStrings(aliasesAdded),
      paths_repointed: pathsAdded,
      portrait_copies_planned: moves.length,
    },
  };
}

/**
 * Copy portrait files into primary dir (never delete sources). Updates primary.images paths.
 */
function applyPortraitMoves(campRoot, plan, primaryId) {
  const prim = (plan.registry.characters || []).find((c) => c.id === primaryId);
  if (!prim) throw new Error("primary_not_found");
  const destDirRel = `characters/portraits/${primaryId}`;
  const destDirAbs = path.join(campRoot, destDirRel);
  const applied = [];
  const imgs = Array.isArray(prim.images) ? prim.images.slice() : [];

  for (const move of plan.moves || []) {
    if (move.kind !== "portrait") continue;
    const fromAbs = path.join(campRoot, move.fromRel);
    if (!fs.existsSync(fromAbs) || !fs.statSync(fromAbs).isFile()) {
      // Missing file: still re-point conceptually if basename-only leaf
      continue;
    }
    fs.mkdirSync(destDirAbs, { recursive: true });
    const base = path.basename(move.fromRel);
    const safe = collisionSafeDest(destDirAbs, base);
    const toRel = `${destDirRel}/${safe}`;
    const toAbs = path.join(campRoot, toRel);
    if (path.resolve(fromAbs) !== path.resolve(toAbs)) {
      fs.copyFileSync(fromAbs, toAbs);
    }
    if (!imgs.includes(toRel)) imgs.push(toRel);
    applied.push({ fromRel: move.fromRel, toRel });
  }

  prim.images = uniqStrings(imgs);
  if (!prim.image_path && prim.images.length) {
    const still = prim.images.filter((p) => /\.(jpe?g|png|webp)$/i.test(p));
    prim.image_path = still[0] || prim.images[0];
  }
  plan.summary.portrait_copied = applied;
  return plan;
}

function listPortraitRelsOnDisk(campRoot, charId) {
  const rels = [];
  const dirRel = `characters/portraits/${charId}`;
  const dirAbs = path.join(campRoot, dirRel);
  if (fs.existsSync(dirAbs) && fs.statSync(dirAbs).isDirectory()) {
    for (const name of fs.readdirSync(dirAbs)) {
      const ext = path.extname(name).toLowerCase();
      if (!CHAR_IMAGE_EXTS.has(ext)) continue;
      const abs = path.join(dirAbs, name);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) rels.push(`${dirRel}/${name}`);
    }
  }
  for (const ext of CHAR_IMAGE_EXTS) {
    const leaf = `characters/portraits/${charId}${ext}`;
    const abs = path.join(campRoot, leaf);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) rels.push(leaf);
  }
  return rels;
}

function mergeCharactersOnDisk(campRoot, registry, primaryId, secondaryIds) {
  const secs = uniqStrings(secondaryIds).filter((id) => id !== String(primaryId || "").trim());
  // Fold on-disk portrait files into the plan even if not listed in registry.images
  const data = JSON.parse(JSON.stringify(registry || { characters: [] }));
  for (const sid of secs) {
    const row = (data.characters || []).find((c) => c.id === sid);
    if (!row) continue;
    const imgs = Array.isArray(row.images) ? row.images.map(String) : [];
    for (const rel of listPortraitRelsOnDisk(campRoot, sid)) {
      if (!imgs.includes(rel)) imgs.push(rel);
    }
    row.images = imgs;
  }
  const plan = planCharacterMerge(data, primaryId, secondaryIds);
  applyPortraitMoves(campRoot, plan, String(primaryId).trim());
  return plan;
}

module.exports = {
  CHAR_IMAGE_EXTS,
  planCharacterMerge,
  applyPortraitMoves,
  mergeCharactersOnDisk,
  uniqStrings,
  normalizeRel,
};
