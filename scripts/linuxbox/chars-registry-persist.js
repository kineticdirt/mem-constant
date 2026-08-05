/**
 * Characters registry IO: version bump, revision backups, PC∪potato union-by-id.
 * Soft rule: never drop unknown GM ids; never hide named NPCs without canonical_id merge.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REVISION_KEEP = 12;

function VersionConflictError(message, detail) {
  const err = new Error(message || "version_conflict");
  err.code = "version_conflict";
  err.detail = detail || {};
  return err;
}

function asIntVersion(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function assertBaseVersion(onDisk, clientBase) {
  if (clientBase === undefined || clientBase === null || clientBase === "") return;
  const disk = asIntVersion(onDisk && onDisk.version);
  const base = asIntVersion(clientBase);
  if (base !== disk) {
    throw VersionConflictError("version_conflict", {
      disk_version: disk,
      base_version: base,
      updated_at: onDisk && onDisk.updated_at,
      hint: "Hard-refresh Chars, then retry. Stale multitask write refused.",
    });
  }
}

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

function unionRelations(a, b) {
  const out = [];
  const seen = new Set();
  for (const raw of [...(a || []), ...(b || [])]) {
    if (!raw || typeof raw !== "object") continue;
    const to_id = String(raw.to_id || raw.to || "").trim();
    if (!to_id) continue;
    const type = String(raw.type || "related").trim().slice(0, 48) || "related";
    const label = String(raw.label || type).trim().slice(0, 80);
    const key = `${to_id.toLowerCase()}::${type.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ to_id, type, label });
  }
  return out;
}

/**
 * Merge one character row. Prefer potato images/gallery when present;
 * fill metadata from PC; never force-hide named NPCs without canonical_id.
 */
function mergeCharacterRows(potatoRow, pcRow) {
  const a = potatoRow && typeof potatoRow === "object" ? potatoRow : null;
  const b = pcRow && typeof pcRow === "object" ? pcRow : null;
  if (!a && !b) return null;
  if (!a) return JSON.parse(JSON.stringify(b));
  if (!b) return JSON.parse(JSON.stringify(a));

  const out = { ...JSON.parse(JSON.stringify(b)), ...JSON.parse(JSON.stringify(a)) };

  // Prefer capitalized / richer display_name from PC when potato used slug as name
  const aName = String(a.display_name || "").trim();
  const bName = String(b.display_name || "").trim();
  if (bName && (!aName || aName.toLowerCase() === String(a.id).toLowerCase())) {
    out.display_name = bName;
  } else if (aName) {
    out.display_name = aName;
  } else {
    out.display_name = bName || out.id;
  }

  for (const k of ["role", "status", "notes", "canonical_id", "story_path", "player_name"]) {
    if ((out[k] === undefined || out[k] === null || out[k] === "") && b[k] != null && b[k] !== "") {
      out[k] = b[k];
    }
  }

  out.aliases = uniqStrings([...(Array.isArray(a.aliases) ? a.aliases : []), ...(Array.isArray(b.aliases) ? b.aliases : [])]);
  out.relations = unionRelations(a.relations, b.relations);
  out.duplicate_paths = uniqStrings([
    ...(Array.isArray(a.duplicate_paths) ? a.duplicate_paths : []),
    ...(Array.isArray(b.duplicate_paths) ? b.duplicate_paths : []),
  ]);
  out.doc_attachments = uniqStrings([
    ...(Array.isArray(a.doc_attachments) ? a.doc_attachments : []),
    ...(Array.isArray(b.doc_attachments) ? b.doc_attachments : []),
  ]);
  out.images = uniqStrings([
    ...(Array.isArray(a.images) ? a.images : []),
    ...(Array.isArray(b.images) ? b.images : []),
  ]);

  const aImg = String(a.image_path || "").trim();
  const bImg = String(b.image_path || "").trim();
  out.image_path = aImg || bImg || (out.images[0] || "");

  // Soft-hide only true merge stubs (canonical_id set). Named side NPCs stay visible.
  const hasCanon = Boolean(String(out.canonical_id || "").trim());
  if (hasCanon) {
    out.hidden = true;
  } else if (out.role === "gm" || out.role === "author-stub" || out.role === "thread-twin" || out.role === "ingest-noise") {
    if (out.hidden === undefined) out.hidden = Boolean(a.hidden || b.hidden);
  } else {
    // npc / pc / side — never inherit accidental undefined/true wipe
    const eitherExplicitlyHidden = a.hidden === true || b.hidden === true;
    const eitherExplicitlyVisible = a.hidden === false || b.hidden === false;
    if (eitherExplicitlyVisible) out.hidden = false;
    else if (eitherExplicitlyHidden && hasCanon) out.hidden = true;
    else out.hidden = false;
  }

  if (out.role == null || out.role === "") {
    out.role = b.role || a.role || "npc";
  }
  if (out.can_proxy == null) out.can_proxy = Boolean(a.can_proxy || b.can_proxy);

  return out;
}

/**
 * Union two registries by character id. Potato (live) is preferred for overlapping rows;
 * PC-only ids are added. Ids only on potato are kept (never dropped).
 */
function unionRegistriesById(potatoReg, pcReg) {
  const potato = potatoReg && typeof potatoReg === "object" ? potatoReg : { characters: [] };
  const pc = pcReg && typeof pcReg === "object" ? pcReg : { characters: [] };
  const byId = new Map();
  for (const c of Array.isArray(pc.characters) ? pc.characters : []) {
    if (c && c.id) byId.set(c.id, { pc: c, potato: null });
  }
  for (const c of Array.isArray(potato.characters) ? potato.characters : []) {
    if (!c || !c.id) continue;
    const hit = byId.get(c.id);
    if (hit) hit.potato = c;
    else byId.set(c.id, { pc: null, potato: c });
  }

  const characters = [];
  for (const { pc: pcRow, potato: poRow } of byId.values()) {
    const merged = mergeCharacterRows(poRow, pcRow);
    if (merged) characters.push(merged);
  }
  characters.sort((x, y) => String(x.id).localeCompare(String(y.id)));

  const pVer = asIntVersion(potato.version);
  const cVer = asIntVersion(pc.version);
  const nextVersion = Math.max(pVer, cVer) + 1;
  const notesBits = [
    String(potato.notes || "").trim(),
    String(pc.notes || "").trim(),
    `${new Date().toISOString().slice(0, 10)}: union-merge potato∪PC (preserve GM ids; restore side NPCs; bump version).`,
  ].filter(Boolean);

  return {
    version: nextVersion,
    campaign_id: potato.campaign_id || pc.campaign_id || "tropic-gooner",
    updated_at: new Date().toISOString(),
    goal_doc: potato.goal_doc || pc.goal_doc || undefined,
    notes: notesBits.join(" "),
    characters,
    revision: nextVersion,
  };
}

function revisionDirFor(repoRoot, campaignId) {
  return path.join(repoRoot, "agents", "state", "chars-registry-revisions", campaignId || "unknown");
}

function rotateRevisions(dir, keep) {
  if (!fs.existsSync(dir)) return;
  const files = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => ({ n, m: fs.statSync(path.join(dir, n)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  for (const f of files.slice(Math.max(0, keep))) {
    try {
      fs.unlinkSync(path.join(dir, f.n));
    } catch {
      /* ignore */
    }
  }
}

/**
 * Backup current file, bump version, write under multitask lock (unless skipLock).
 * @param {object} opts
 * @param {string} opts.absPath
 * @param {object} opts.data - registry to write (mutated: version/updated_at)
 * @param {string} [opts.repoRoot]
 * @param {string} [opts.campaignId]
 * @param {number|string|null} [opts.baseVersion] - if set, must match on-disk version
 * @param {boolean} [opts.bump=true]
 * @param {number} [opts.keep=REVISION_KEEP]
 * @param {boolean} [opts.skipLock=false] - tests only; production writes must lock
 * @param {string} [opts.lockHolder]
 * @param {string} [opts.lockNote]
 */
function writeRegistryFile(opts) {
  const absPath = opts.absPath;
  if (!absPath) throw new Error("no_registry_path");
  const repoRoot = opts.repoRoot || path.resolve(path.dirname(absPath), "..", "..", "..");
  const campaignIdGuess = opts.campaignId || (opts.data && opts.data.campaign_id) || "tropic-gooner";
  const lockResource = opts.lockResource || `chars-registry:${campaignIdGuess}`;

  const run = () => writeRegistryFileUnlocked(opts, repoRoot);

  if (opts.skipLock) return run();

  const { acquire, release } = require("./multitask-lock");
  const holder =
    opts.lockHolder ||
    `chars-registry-persist:${process.pid}`;
  acquire({
    repoRoot,
    resource: lockResource,
    holder,
    note: opts.lockNote || `writeRegistryFile ${lockResource}`,
    wait: true,
  });
  try {
    return run();
  } finally {
    try {
      release({ repoRoot, resource: lockResource, holder });
    } catch {
      /* ignore */
    }
  }
}

function writeRegistryFileUnlocked(opts, repoRootIn) {
  const absPath = opts.absPath;
  const data = opts.data || { characters: [] };
  data.characters = Array.isArray(data.characters) ? data.characters : [];

  let onDisk = null;
  if (fs.existsSync(absPath)) {
    try {
      onDisk = JSON.parse(fs.readFileSync(absPath, "utf8"));
    } catch {
      onDisk = null;
    }
  }

  if (opts.baseVersion !== undefined) {
    assertBaseVersion(onDisk || { version: 0 }, opts.baseVersion);
  }

  // Safety: if rewriting full registry from outside merge, never drop unknown ids when previous exists
  if (opts.preserveUnknownIds && onDisk && Array.isArray(onDisk.characters)) {
    const keep = new Map(data.characters.map((c) => [c.id, c]));
    for (const c of onDisk.characters) {
      if (c && c.id && !keep.has(c.id)) keep.set(c.id, c);
    }
    data.characters = [...keep.values()].sort((x, y) => String(x.id).localeCompare(String(y.id)));
  }

  const bump = opts.bump !== false;
  const prevVer = asIntVersion(onDisk && onDisk.version);
  let version;
  if (!bump) {
    version = asIntVersion(data.version) || prevVer || 1;
  } else if (onDisk) {
    version = prevVer + 1;
  } else {
    version = Math.max(1, asIntVersion(data.version) || 1);
  }

  const repoRoot = repoRootIn || opts.repoRoot || path.resolve(path.dirname(absPath), "..", "..", "..");
  const campaignId = opts.campaignId || data.campaign_id || "tropic-gooner";
  const revDir = revisionDirFor(repoRoot, campaignId);
  fs.mkdirSync(revDir, { recursive: true });

  if (onDisk) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const bakName = `v${prevVer}-${ts}.json`;
    fs.writeFileSync(path.join(revDir, bakName), JSON.stringify(onDisk, null, 2) + "\n");
    // sibling .bak for quick local recover
    try {
      fs.writeFileSync(`${absPath}.bak-${ts}`, JSON.stringify(onDisk, null, 2) + "\n");
    } catch {
      /* ignore */
    }
    rotateRevisions(revDir, opts.keep || REVISION_KEEP);
  }

  data.version = version;
  data.revision = version;
  data.updated_at = new Date().toISOString();
  data.campaign_id = data.campaign_id || campaignId;

  fs.writeFileSync(absPath, JSON.stringify(data, null, 2) + "\n");
  return data;
}

module.exports = {
  REVISION_KEEP,
  VersionConflictError,
  asIntVersion,
  assertBaseVersion,
  mergeCharacterRows,
  unionRegistriesById,
  writeRegistryFile,
  revisionDirFor,
  unionRelations,
  uniqStrings,
};
