/**
 * Docs wiki APIs — tree index, allowlisted md edit, span comments, soft graph.
 * Runtime comments live under agents/state/doc-comments/ (protected by agents/state/**).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const http = require("http");

const WRITE_ROOTS = ["story", "notes", "reports", "lore", "characters", "places", "Organizations", "Plot Lines", "Things and Places of Note", "worldbuilding"];
/** System (non-campaign) Docs scopes — Hub Docs silo indexes these beside campaigns. */
const SYSTEM_DOC_SCOPES = [
  {
    id: "infranet",
    label: "Infranet",
    roots: ["docs/infranet"],
    writablePrefix: "docs/infranet/",
  },
  {
    id: "infranet-eng",
    label: "Infranet (eng)",
    roots: ["projects/infranet"],
    // Engineering tree is read-only in Docs (edit via git / IDE).
    writablePrefix: null,
  },
];
const MAX_DOC_BYTES = 512 * 1024;
const MAX_TREE_FILES = 800;
const MAX_WALK_DEPTH = 5;
/** Cap bytes read per file for mentions/links/tags (frontmatter still from first 4k). */
const MAX_EXTRACT_BYTES = 48 * 1024;
/** Soft graph: keep UI responsive on large tropic/all-campaign trees. */
const MAX_GRAPH_DOCS = 100;
const TREE_CACHE_MS = 15_000;
const GRAPH_CACHE_MS = 15_000;
/** Hub Docs: never index salvage/session stubs or agent handoff files. */
const SKIP_DOC_DIR_NAMES = new Set(["_trash", "_session"]);

let _treeCache = new Map(); // key → { at, data }
let _graphCache = new Map();

function cacheKey(kind, opts = {}) {
  return `${kind}:${opts.campaign || ""}:${opts.limit || ""}`;
}

function getCached(map, key, ttlMs) {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) {
    map.delete(key);
    return null;
  }
  return hit.data;
}

function setCached(map, key, data) {
  map.set(key, { at: Date.now(), data });
  return data;
}

function invalidateDocsCaches() {
  _treeCache.clear();
  _graphCache.clear();
}

function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}

function parseFrontmatter(content) {
  const text = String(content || "");
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { meta: {}, body: text };
  }
  const end = text.indexOf("\n---", 4);
  if (end < 0) return { meta: {}, body: text };
  const block = text.slice(4, end);
  const body = text.slice(end + 4).replace(/^\r?\n/, "");
  const meta = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith("[") && v.endsWith("]")) || (v.startsWith('"') && v.endsWith('"'))) {
      try {
        v = JSON.parse(v.replace(/'/g, '"'));
      } catch {
        /* keep string */
      }
    }
    meta[m[1]] = v;
  }
  return { meta, body };
}

function extractMentions(content) {
  const out = new Set();
  const re = /@([a-zA-Z][a-zA-Z0-9_-]{1,48})/g;
  let m;
  while ((m = re.exec(content))) out.add(m[1].toLowerCase());
  return [...out];
}

function extractWikiLinks(content) {
  const out = new Set();
  const re = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let m;
  while ((m = re.exec(content))) out.add(m[1].trim().toLowerCase());
  return [...out];
}

function extractTags(content, meta) {
  const tags = new Set();
  if (meta?.kind) tags.add(String(meta.kind).toLowerCase());
  if (meta?.tags) {
    const list = Array.isArray(meta.tags) ? meta.tags : String(meta.tags).split(/[,\s]+/);
    for (const t of list) if (t) tags.add(String(t).toLowerCase().replace(/^#/, ""));
  }
  const re = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_-]{1,32})\b/g;
  let m;
  while ((m = re.exec(content))) tags.add(m[1].toLowerCase());
  return [...tags];
}

function isUnderRepo(repo, abs) {
  const root = path.resolve(repo) + path.sep;
  const resolved = path.resolve(abs);
  return resolved.startsWith(root);
}

function systemScopeForRel(relPath) {
  const rel = String(relPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  for (const scope of SYSTEM_DOC_SCOPES) {
    for (const root of scope.roots || []) {
      const prefix = root.endsWith("/") ? root : `${root}/`;
      if (rel === root || rel.startsWith(prefix)) return scope;
    }
  }
  return null;
}

function docsWriteAllowed(repo, relPath, campaigns) {
  const rel = String(relPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel || rel.includes("..") || !/\.md$/i.test(rel)) return { ok: false, error: "bad_path" };
  if (/characters-registry\.json$/i.test(rel)) return { ok: false, error: "registry_forbidden" };
  const abs = path.join(repo, rel);
  if (!isUnderRepo(repo, abs)) return { ok: false, error: "escape" };

  const sys = systemScopeForRel(rel);
  if (sys) {
    if (!sys.writablePrefix) return { ok: false, error: "system_read_only" };
    const wp = sys.writablePrefix.endsWith("/") ? sys.writablePrefix : `${sys.writablePrefix}/`;
    if (!(rel === sys.writablePrefix.replace(/\/$/, "") || rel.startsWith(wp))) {
      return { ok: false, error: "system_root_not_writable" };
    }
    return { ok: true, rel, abs, campaignId: sys.id, top: rel.split("/")[0], system: true };
  }

  if (!rel.startsWith("campaigns/")) return { ok: false, error: "not_campaign" };
  const parts = rel.split("/");
  if (parts.length < 3) return { ok: false, error: "too_shallow" };
  const campaignId = parts[1];
  if (!campaigns[campaignId]) return { ok: false, error: "unknown_campaign" };
  // campaigns/<id>/<file>.md at campaign root (SETTING-*, LOCKS*, etc.)
  if (parts.length === 3) {
    const cfg = campaigns[campaignId];
    if (!cfg?.campaignRootMd) return { ok: false, error: "root_not_allowlisted" };
    const fname = parts[2];
    if (!/\.md$/i.test(fname) || fname.toLowerCase() === "readme.md") return { ok: false, error: "bad_path" };
    if (/^CURSOR-AUTO-/i.test(fname)) return { ok: false, error: "root_not_allowlisted" };
    return { ok: true, rel, abs, campaignId, top: "(root)", rootCanon: true };
  }
  if (parts.length < 4) return { ok: false, error: "too_shallow" };
  const top = parts[2];
  const cfg = campaigns[campaignId];
  const allowed = new Set([...(cfg.storyDirs || []), "notes", "reports", ...WRITE_ROOTS]);
  if (!allowed.has(top)) return { ok: false, error: "root_not_allowlisted" };
  const campRoot = path.join(repo, "campaigns", campaignId);
  if (!abs.startsWith(campRoot + path.sep)) return { ok: false, error: "escape_campaign" };
  return { ok: true, rel, abs, campaignId, top };
}

function docGroupForPath(rel, isCharacter) {
  const p = String(rel || "").replace(/\\/g, "/");
  if (isCharacter || /\/characters\//i.test(p)) return "characters";
  if (/\/reports\//i.test(p)) return "reports";
  if (/\/notes\//i.test(p)) return "notes";
  if (/\/story\//i.test(p) || /\/lore\//i.test(p) || /\/wiki\//i.test(p) || /\/worldbuilding\//i.test(p)) {
    return "story";
  }
  if (/^campaigns\/[^/]+\/(SETTING-|LOCKS)/i.test(p)) return "story";
  if (
    /\/places\//i.test(p) ||
    /\/Organizations\//i.test(p) ||
    /\/Plot Lines\//i.test(p) ||
    /Things and Places of Note/i.test(p)
  ) {
    return "world";
  }
  return "other";
}

/** Display order + labels for Docs tree kind groups. */
const DOC_GROUP_ORDER = [
  { id: "characters", label: "Characters" },
  { id: "story", label: "Story / lore" },
  { id: "world", label: "Places / orgs / plot" },
  { id: "notes", label: "Notes" },
  { id: "reports", label: "Reports" },
  { id: "other", label: "Other" },
];

function walkDocsTree(absDir, relPrefix, acc, depth, caps, opts = {}) {
  const maxDepth = opts.maxDepth != null ? opts.maxDepth : MAX_WALK_DEPTH;
  if (depth > maxDepth || !fs.existsSync(absDir) || acc.length >= caps.maxFiles) return;
  let ents;
  try {
    ents = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of ents) {
    if (acc.length >= caps.maxFiles) return;
    if (ent.name.startsWith(".")) continue;
    const abs = path.join(absDir, ent.name);
    const rel = `${relPrefix}/${ent.name}`.replace(/\\/g, "/");
    if (ent.isDirectory()) {
      if (SKIP_DOC_DIR_NAMES.has(ent.name)) continue;
      walkDocsTree(abs, rel, acc, depth + 1, caps, opts);
    } else if (ent.name.endsWith(".md") && ent.name.toLowerCase() !== "readme.md") {
      if (/^CURSOR-AUTO-/i.test(ent.name)) continue;
      let st;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      let meta = {};
      let mentions = [];
      let links = [];
      let tags = [];
      try {
        // ponytail: only need head for extract — full read on big reports blocked tree/graph.
        const fd = fs.openSync(abs, "r");
        let raw;
        try {
          const buf = Buffer.alloc(Math.min(MAX_EXTRACT_BYTES, st.size || MAX_EXTRACT_BYTES));
          const n = fs.readSync(fd, buf, 0, buf.length, 0);
          raw = buf.slice(0, n).toString("utf8");
        } finally {
          fs.closeSync(fd);
        }
        const parsed = parseFrontmatter(raw.slice(0, 4000));
        meta = parsed.meta;
        mentions = extractMentions(raw);
        links = extractWikiLinks(raw);
        tags = extractTags(raw, meta);
      } catch {
        /* skip meta */
      }
      const underReports = rel.includes("/reports/");
      const underNotes = rel.includes("/notes/");
      const aliases = meta.aliases
        ? Array.isArray(meta.aliases)
          ? meta.aliases.map(String)
          : [String(meta.aliases)]
        : [];
      const isCharacter =
        String(meta.kind || "").toLowerCase() === "character" ||
        /\/characters\//i.test(rel);
      const tagList = Array.isArray(tags) ? [...tags] : [];
      if (isCharacter && !tagList.includes("character")) tagList.push("character");
      // Path under characters/ ⇒ kind:character (even without frontmatter — e.g. sasha.md)
      let kind =
        meta.kind ||
        (isCharacter ? "character" : underReports || underNotes ? "draft" : "canon");
      if (isCharacter && String(kind).toLowerCase() !== "character") kind = "character";
      const group = docGroupForPath(rel, isCharacter);
      acc.push({
        path: rel,
        name: ent.name,
        label: (meta.title && String(meta.title)) || ent.name.replace(/\.md$/i, ""),
        kind,
        group,
        draft: !!(underReports || underNotes),
        mtime: st.mtime.toISOString(),
        size: st.size,
        tags: tagList,
        mentions,
        links,
        aliases,
        id: meta.id ? String(meta.id) : null,
        sex: meta.sex != null ? String(meta.sex).toLowerCase() : null,
        role: meta.role != null ? String(meta.role).toLowerCase() : null,
        pronouns: meta.pronouns != null ? String(meta.pronouns) : null,
        status: meta.status != null ? String(meta.status).toLowerCase() : null,
        character: isCharacter,
      });
    }
  }
}

function nestPaths(files, campaignId, pathPrefix) {
  const root = { id: campaignId, label: campaignId, kind: "campaign", children: [], docs: [] };
  const folderMap = new Map();
  folderMap.set("", root);
  const prefix = pathPrefix
    ? pathPrefix.endsWith("/")
      ? pathPrefix
      : `${pathPrefix}/`
    : `campaigns/${campaignId}/`;

  function ensureFolder(parts) {
    let key = "";
    let parent = root;
    for (const part of parts) {
      key = key ? `${key}/${part}` : part;
      if (!folderMap.has(key)) {
        const node = { id: `${campaignId}/${key}`, label: part, kind: "folder", path: key, children: [], docs: [] };
        folderMap.set(key, node);
        parent.children.push(node);
      }
      parent = folderMap.get(key);
    }
    return parent;
  }

  for (const f of files) {
    const rel = f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path;
    const parts = rel.split("/");
    const fileName = parts.pop();
    const folder = ensureFolder(parts);
    folder.docs.push({
      ...f,
      campaign: campaignId,
      rel,
      file: fileName,
      id: f.path,
      kind: "doc",
    });
  }

  function sortNode(n) {
    n.children.sort((a, b) => a.label.localeCompare(b.label));
    n.docs.sort((a, b) => a.label.localeCompare(b.label));
    for (const c of n.children) sortNode(c);
  }
  sortNode(root);
  return root;
}

function listDocsTree(repo, campaigns, opts = {}) {
  const key = cacheKey("tree", { ...opts, include_archived: !!opts.include_archived });
  const cached = getCached(_treeCache, key, TREE_CACHE_MS);
  if (cached) return { ...cached, cached: true };

  const campaignFilter = opts.campaign || null;
  const includeArchived = !!opts.include_archived;
  const trees = [];
  let total = 0;
  for (const [id, cfg] of Object.entries(campaigns)) {
    if (campaignFilter && campaignFilter !== id) continue;
    // Default All scopes: hide archived campaigns (SpaceQuest) unless explicitly scoped
    if (!campaignFilter && cfg.archived && !includeArchived) continue;
    const roots = new Set([...(cfg.storyDirs || ["story"]), "notes", "reports"]);
    const files = [];
    for (const sub of roots) {
      walkDocsTree(path.join(repo, "campaigns", id, sub), `campaigns/${id}/${sub}`, files, 0, {
        maxFiles: MAX_TREE_FILES - total,
      });
    }
    if (cfg.campaignRootMd) {
      walkDocsTree(path.join(repo, "campaigns", id), `campaigns/${id}`, files, 0, {
        maxFiles: MAX_TREE_FILES - total,
      }, { maxDepth: 0 });
    }
    for (const f of files) f.campaign = id;
    files.sort((a, b) => a.path.localeCompare(b.path));
    total += files.length;
    trees.push({
      campaign: id,
      label: cfg.label || id,
      kind: "campaign",
      archived: !!cfg.archived,
      file_count: files.length,
      tree: nestPaths(files, id),
      files,
      groups: DOC_GROUP_ORDER.map((g) => ({
        id: g.id,
        label: g.label,
        count: files.filter((f) => (f.group || "other") === g.id).length,
      })),
    });
  }
  for (const scope of SYSTEM_DOC_SCOPES) {
    if (campaignFilter && campaignFilter !== scope.id) continue;
    const files = [];
    for (const root of scope.roots || []) {
      walkDocsTree(path.join(repo, root), root, files, 0, {
        maxFiles: MAX_TREE_FILES - total,
      });
    }
    for (const f of files) f.campaign = scope.id;
    files.sort((a, b) => a.path.localeCompare(b.path));
    total += files.length;
    // Common prefix for nesting: single root, or empty (show docs/ vs projects/)
    const nestPrefix =
      (scope.roots || []).length === 1 ? `${scope.roots[0].replace(/\/$/, "")}/` : "";
    trees.push({
      campaign: scope.id,
      label: scope.label || scope.id,
      kind: "system",
      file_count: files.length,
      tree: nestPaths(files, scope.id, nestPrefix),
      files,
    });
  }
  const data = {
    updated_at: new Date().toISOString(),
    file_count: total,
    campaigns: trees,
    cached: false,
  };
  return setCached(_treeCache, key, data);
}

function readDocsDoc(repo, campaigns, relPath) {
  const gate = docsWriteAllowed(repo, relPath, campaigns);
  // Read allowlist = campaign roots OR system Doc scopes
  if (!gate.ok) {
    const rel = String(relPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (rel.includes("..") || !/\.md$/i.test(rel)) {
      throw Object.assign(new Error(gate.error || "bad_path"), { status: 400 });
    }
    const sys = systemScopeForRel(rel);
    if (sys) {
      const abs = path.join(repo, rel);
      if (!isUnderRepo(repo, abs) || !fs.existsSync(abs)) {
        throw Object.assign(new Error("not_found"), { status: 404 });
      }
      const content = fs.readFileSync(abs, "utf8");
      const parsed = parseFrontmatter(content);
      const st = fs.statSync(abs);
      return {
        campaign: sys.id,
        path: rel,
        file: path.basename(rel),
        content,
        hash: sha1(content),
        mtime: st.mtime.toISOString(),
        size: st.size,
        meta: parsed.meta,
        draft: /\/wiki\//i.test(rel) || /\/reports\//i.test(rel) || /\/notes\//i.test(rel),
        writable: false,
        system: true,
      };
    }
    // Still allow read of any md under campaigns/<id>/(storyDirs|notes|reports)
    if (!rel.startsWith("campaigns/")) {
      throw Object.assign(new Error(gate.error || "bad_path"), { status: 400 });
    }
    const parts = rel.split("/");
    const campaignId = parts[1];
    const cfg = campaigns[campaignId];
    if (!cfg) throw Object.assign(new Error("unknown_campaign"), { status: 400 });
    const top = parts[2];
    const allowed = new Set([...(cfg.storyDirs || []), "notes", "reports", ...WRITE_ROOTS]);
    if (!allowed.has(top)) throw Object.assign(new Error("root_not_allowlisted"), { status: 403 });
    const abs = path.join(repo, rel);
    if (!fs.existsSync(abs)) throw Object.assign(new Error("not_found"), { status: 404 });
    const content = fs.readFileSync(abs, "utf8");
    const parsed = parseFrontmatter(content);
    const st = fs.statSync(abs);
    return {
      campaign: campaignId,
      path: rel,
      file: path.basename(rel),
      content,
      hash: sha1(content),
      mtime: st.mtime.toISOString(),
      size: st.size,
      meta: parsed.meta,
      draft: top === "reports" || top === "notes",
      writable: docsWriteAllowed(repo, rel, campaigns).ok,
    };
  }
  if (!fs.existsSync(gate.abs)) throw Object.assign(new Error("not_found"), { status: 404 });
  const content = fs.readFileSync(gate.abs, "utf8");
  const parsed = parseFrontmatter(content);
  const st = fs.statSync(gate.abs);
  return {
    campaign: gate.campaignId,
    path: gate.rel,
    file: path.basename(gate.rel),
    content,
    hash: sha1(content),
    mtime: st.mtime.toISOString(),
    size: st.size,
    meta: parsed.meta,
    draft: gate.system
      ? /\/wiki\//i.test(gate.rel)
      : gate.top === "reports" || gate.top === "notes",
    writable: true,
    system: !!gate.system,
  };
}

function writeDocsDoc(repo, campaigns, relPath, content, baseHash, opts = {}) {
  const gate = docsWriteAllowed(repo, relPath, campaigns);
  if (!gate.ok) throw Object.assign(new Error(gate.error), { status: 403 });
  const body = String(content ?? "");
  if (Buffer.byteLength(body, "utf8") > MAX_DOC_BYTES) {
    throw Object.assign(new Error("body_too_large"), { status: 413 });
  }
  let prior = null;
  if (fs.existsSync(gate.abs)) {
    prior = fs.readFileSync(gate.abs, "utf8");
    if (baseHash && sha1(prior) !== baseHash) {
      throw Object.assign(new Error("conflict_base_hash"), { status: 409 });
    }
  }
  fs.mkdirSync(path.dirname(gate.abs), { recursive: true });
  const out = body.endsWith("\n") ? body : `${body}\n`;
  if (prior != null && prior !== out && !opts.skipVersion) {
    try {
      snapshotDocVersion(repo, gate.rel, prior, { reason: opts.reason || "save" });
    } catch {
      /* version store must not block save */
    }
  }
  fs.writeFileSync(gate.abs, out, "utf8");
  invalidateDocsCaches();
  const doc = readDocsDoc(repo, campaigns, gate.rel);
  doc.version_count = listDocVersions(repo, gate.rel).versions.length;
  return doc;
}

function commentsDir(repo) {
  return path.join(repo, "agents", "state", "doc-comments");
}

function commentsFileFor(repo, docPath) {
  const safe = sha1(docPath).slice(0, 16);
  return path.join(commentsDir(repo), `${safe}.json`);
}

function readCommentsStore(repo, docPath) {
  const fp = commentsFileFor(repo, docPath);
  if (!fs.existsSync(fp)) {
    return { doc_path: docPath, comments: [], updated_at: null };
  }
  try {
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    return {
      doc_path: docPath,
      comments: Array.isArray(data.comments) ? data.comments : [],
      updated_at: data.updated_at || null,
    };
  } catch {
    return { doc_path: docPath, comments: [], updated_at: null };
  }
}

function writeCommentsStore(repo, store) {
  const dir = commentsDir(repo);
  fs.mkdirSync(dir, { recursive: true });
  const fp = commentsFileFor(repo, store.doc_path);
  store.updated_at = new Date().toISOString();
  fs.writeFileSync(fp, JSON.stringify(store, null, 2) + "\n", "utf8");
  return store;
}

function listDocComments(repo, docPath) {
  return readCommentsStore(repo, docPath);
}

function addDocComment(repo, campaigns, body) {
  const docPath = String(body.doc_path || "").replace(/\\/g, "/");
  const gate = docsWriteAllowed(repo, docPath, campaigns);
  // Comments allowed on any readable allowlisted path
  try {
    readDocsDoc(repo, campaigns, docPath);
  } catch (err) {
    throw Object.assign(new Error(err.message || "doc_not_found"), { status: err.status || 404 });
  }
  const note = String(body.note || "").trim().slice(0, 4000);
  if (!note) throw Object.assign(new Error("note_required"), { status: 400 });
  const start = Math.max(0, Number(body.start) || 0);
  const end = Math.max(start, Number(body.end) || start);
  const excerpt = String(body.excerpt || "").slice(0, 2000);
  const suggested = body.suggested_text != null ? String(body.suggested_text).slice(0, 8000) : null;
  const spanHash = sha1(excerpt || `${start}:${end}`);
  const store = readCommentsStore(repo, docPath);
  const comment = {
    id: `ann_${Date.now().toString(36)}_${sha1(note + spanHash).slice(0, 6)}`,
    doc_path: docPath,
    campaign: gate.ok ? gate.campaignId : docPath.split("/")[1],
    span: { start, end, hash: spanHash, excerpt },
    note,
    suggested_text: suggested,
    status: "queued",
    created_at: new Date().toISOString(),
    applied_at: null,
    dismissed_at: null,
  };
  store.comments.push(comment);
  writeCommentsStore(repo, store);
  return { ok: true, comment, store };
}

function patchDocComment(repo, campaigns, commentId, patch) {
  // Find store by scanning (small) or require doc_path
  const docPath = String(patch.doc_path || "").replace(/\\/g, "/");
  if (!docPath) throw Object.assign(new Error("doc_path_required"), { status: 400 });
  const store = readCommentsStore(repo, docPath);
  const idx = store.comments.findIndex((c) => c.id === commentId);
  if (idx < 0) throw Object.assign(new Error("comment_not_found"), { status: 404 });
  const c = store.comments[idx];
  const status = String(patch.status || "").toLowerCase();
  if (status === "dismissed" || status === "rejected") {
    c.status = "dismissed";
    c.dismissed_at = new Date().toISOString();
  } else if (status === "applied" || patch.apply) {
    if (!c.suggested_text) throw Object.assign(new Error("no_suggested_text"), { status: 400 });
    const doc = readDocsDoc(repo, campaigns, docPath);
    const content = doc.content;
    const excerpt = c.span?.excerpt || "";
    let next = content;
    if (excerpt && content.includes(excerpt)) {
      next = content.replace(excerpt, c.suggested_text);
    } else if (Number.isFinite(c.span?.start) && Number.isFinite(c.span?.end) && c.span.end > c.span.start) {
      const slice = content.slice(c.span.start, c.span.end);
      if (c.span.hash && sha1(slice) !== c.span.hash) {
        throw Object.assign(new Error("span_hash_mismatch"), { status: 409 });
      }
      next = content.slice(0, c.span.start) + c.suggested_text + content.slice(c.span.end);
    } else {
      throw Object.assign(new Error("cannot_locate_span"), { status: 409 });
    }
    writeDocsDoc(repo, campaigns, docPath, next, doc.hash);
    c.status = "applied";
    c.applied_at = new Date().toISOString();
  } else if (patch.note != null) {
    c.note = String(patch.note).slice(0, 4000);
  }
  store.comments[idx] = c;
  writeCommentsStore(repo, store);
  return { ok: true, comment: c, store };
}

function pickGraphFiles(allFiles, limit) {
  const cap = Math.max(20, Math.min(MAX_GRAPH_DOCS, Number(limit) || MAX_GRAPH_DOCS));
  if (allFiles.length <= cap) return { files: allFiles, truncated: false, total: allFiles.length };
  // Prefer characters / canon over drafts so Visualize stays useful when capped
  const ranked = [...allFiles].sort((a, b) => {
    const score = (f) =>
      (f.character ? 4 : 0) +
      (!f.draft ? 2 : 0) +
      (String(f.kind || "").toLowerCase() === "character" ? 2 : 0);
    return score(b) - score(a) || a.path.localeCompare(b.path);
  });
  return { files: ranked.slice(0, cap), truncated: true, total: allFiles.length };
}

function buildDocsGraph(repo, campaigns, opts = {}) {
  const key = cacheKey("graph", opts);
  const cached = getCached(_graphCache, key, GRAPH_CACHE_MS);
  if (cached) return { ...cached, cached: true };

  const catalog = listDocsTree(repo, campaigns, opts);
  const nodes = [];
  const edges = [];
  const pathToId = new Map();
  const slugToPaths = new Map();
  const basenameToPaths = new Map();
  const labelToPaths = new Map();

  const allFiles = catalog.campaigns.flatMap((c) =>
    (c.files || []).map((f) => ({ ...f, _campaign: c.campaign, _campLabel: c.label }))
  );
  const picked = pickGraphFiles(allFiles, opts.limit);
  const fileSet = new Set(picked.files.map((f) => f.path));

  const campsSeen = new Set();
  for (const f of picked.files) {
    if (!campsSeen.has(f._campaign)) {
      campsSeen.add(f._campaign);
      nodes.push({
        id: `camp:${f._campaign}`,
        label: f._campLabel || f._campaign,
        kind: "campaign",
        campaign: f._campaign,
      });
    }
    const nid = `doc:${f.path}`;
    pathToId.set(f.path, nid);
    nodes.push({
      id: nid,
      label: f.label || f.name,
      kind: "doc",
      path: f.path,
      campaign: f._campaign,
      draft: !!f.draft,
      folder: f.path.split("/").slice(2, -1).join("/") || "(root)",
    });
    const slug = (f.id || f.name.replace(/\.md$/i, "")).toLowerCase().replace(/\s+/g, "-");
    if (!slugToPaths.has(slug)) slugToPaths.set(slug, []);
    slugToPaths.get(slug).push(f.path);
    for (const a of f.aliases || []) {
      const as = String(a).toLowerCase().replace(/\s+/g, "-");
      if (!slugToPaths.has(as)) slugToPaths.set(as, []);
      slugToPaths.get(as).push(f.path);
    }
    const base = f.name.toLowerCase().replace(/\.md$/i, "");
    if (!basenameToPaths.has(base)) basenameToPaths.set(base, []);
    basenameToPaths.get(base).push(f.path);
    const lab = (f.label || "").toLowerCase();
    if (lab) {
      if (!labelToPaths.has(lab)) labelToPaths.set(lab, []);
      labelToPaths.get(lab).push(f.path);
    }
    edges.push({
      source: `camp:${f._campaign}`,
      target: nid,
      kind: "contains",
    });
  }

  for (const f of picked.files) {
    const src = pathToId.get(f.path);
    for (const mention of f.mentions || []) {
      const targets = slugToPaths.get(mention) || [];
      for (const t of targets) {
        if (t === f.path || !fileSet.has(t)) continue;
        const tid = pathToId.get(t);
        if (tid) edges.push({ source: src, target: tid, kind: "mention" });
      }
    }
    for (const link of f.links || []) {
      const slug = link.replace(/\s+/g, "-");
      const targets = slugToPaths.get(slug) || [];
      for (const t of targets) {
        if (t === f.path || !fileSet.has(t)) continue;
        const tid = pathToId.get(t);
        if (tid) edges.push({ source: src, target: tid, kind: "wikilink" });
      }
      const base = path.basename(link).toLowerCase();
      for (const t of basenameToPaths.get(base) || []) {
        if (t === f.path || !fileSet.has(t)) continue;
        edges.push({ source: src, target: pathToId.get(t), kind: "wikilink" });
      }
      for (const t of labelToPaths.get(link.toLowerCase()) || []) {
        if (t === f.path || !fileSet.has(t)) continue;
        edges.push({ source: src, target: pathToId.get(t), kind: "wikilink" });
      }
    }
  }

  // Deduplicate edges
  const seen = new Set();
  const uniq = [];
  for (const e of edges) {
    const k = `${e.source}|${e.target}|${e.kind}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(e);
  }

  const data = {
    updated_at: new Date().toISOString(),
    nodes,
    edges: uniq,
    file_count: catalog.file_count,
    graph_docs: picked.files.length,
    truncated: picked.truncated,
    truncated_from: picked.truncated ? picked.total : undefined,
    limit: Math.max(20, Math.min(MAX_GRAPH_DOCS, Number(opts.limit) || MAX_GRAPH_DOCS)),
    cached: false,
  };
  return setCached(_graphCache, key, data);
}

function slugifyCharacterId(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function characterSheetDir(campaignId) {
  if (campaignId === "spacequest") return "characters/pcs";
  return "characters";
}

function loadCharacterSheetTemplate(repo) {
  const abs = path.join(repo, "campaigns", "_templates", "character-sheet.md");
  if (!fs.existsSync(abs)) {
    throw Object.assign(new Error("template_missing"), { status: 500 });
  }
  // Templates may arrive from Windows SCP with CRLF — normalize before fill/write
  return fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function fillCharacterSheetTemplate(template, opts) {
  const slug = opts.slug;
  const display = opts.display_name || slug;
  const campaign = opts.campaign;
  const aliases = Array.isArray(opts.aliases) ? opts.aliases : [];
  const age = opts.age != null && opts.age !== "" ? opts.age : "null";
  const pronouns = opts.pronouns != null && opts.pronouns !== "" ? JSON.stringify(String(opts.pronouns)) : "null";
  const sex = opts.sex != null && opts.sex !== "" ? JSON.stringify(String(opts.sex)) : "null";
  const role = opts.role != null && opts.role !== "" ? JSON.stringify(String(opts.role)) : "null";
  const aliasesYaml = JSON.stringify(aliases.map(String));
  let out = String(template);
  // Replace frontmatter fields on first lines only (template uses empty quoted / null placeholders)
  out = out.replace(/^id:\s*""[^\n]*/m, `id: ${slug}`);
  out = out.replace(/^aliases:\s*\[\][^\n]*/m, `aliases: ${aliasesYaml}`);
  out = out.replace(/^campaign:\s*""[^\n]*/m, `campaign: ${campaign}`);
  out = out.replace(/^age:\s*null[^\n]*/m, `age: ${age}`);
  out = out.replace(/^pronouns:\s*null[^\n]*/m, `pronouns: ${pronouns}`);
  out = out.replace(/^sex:\s*null[^\n]*/m, `sex: ${sex}`);
  out = out.replace(/^role:\s*null[^\n]*/m, `role: ${role}`);
  out = out.replace(/^status:\s*stub[^\n]*/m, "status: draft");
  out = out.replace(/^# Display Name\s*$/m, `# ${display}`);
  return out.endsWith("\n") ? out : `${out}\n`;
}

/**
 * Create a new character sheet from campaigns/_templates/character-sheet.md.
 * Does not touch characters-registry.json.
 */
function createCharacterSheet(repo, campaigns, body = {}) {
  const campaignId = String(body.campaign || "").trim();
  if (!campaigns[campaignId]) {
    throw Object.assign(new Error("unknown_campaign"), { status: 400 });
  }
  const slug = slugifyCharacterId(body.slug || body.id || body.display_name);
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw Object.assign(new Error("bad_slug"), { status: 400 });
  }
  const subDir = body.subdir ? String(body.subdir).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") : characterSheetDir(campaignId);
  if (subDir.includes("..") || !subDir.startsWith("characters")) {
    throw Object.assign(new Error("bad_subdir"), { status: 400 });
  }
  // Ensure characters (or characters/pcs) is indexable / writable
  const cfg = campaigns[campaignId];
  const top = subDir.split("/")[0];
  const roots = new Set([...(cfg.storyDirs || []), "notes", "reports", ...WRITE_ROOTS]);
  if (!roots.has(top)) {
    throw Object.assign(new Error("characters_not_in_storyDirs"), { status: 403 });
  }
  const rel = `campaigns/${campaignId}/${subDir}/${slug}.md`;
  const gate = docsWriteAllowed(repo, rel, campaigns);
  if (!gate.ok) throw Object.assign(new Error(gate.error), { status: 403 });
  if (fs.existsSync(gate.abs)) {
    throw Object.assign(new Error("already_exists"), { status: 409, path: rel });
  }
  const template = loadCharacterSheetTemplate(repo);
  const content = fillCharacterSheetTemplate(template, {
    slug,
    display_name: body.display_name || body.name || slug,
    campaign: campaignId,
    aliases: body.aliases || [],
    age: body.age,
    pronouns: body.pronouns,
    sex: body.sex,
    role: body.role,
  });
  fs.mkdirSync(path.dirname(gate.abs), { recursive: true });
  fs.writeFileSync(gate.abs, content, "utf8");
  invalidateDocsCaches();
  return {
    ok: true,
    path: rel,
    slug,
    campaign: campaignId,
    doc: readDocsDoc(repo, campaigns, rel),
  };
}

/**
 * Resolve @slug / alias / filename to a character (or other) docs path.
 * Exact id/alias/slug match only — never fuzzy-merge distinct cast.
 */
function resolveDocsEntity(repo, campaigns, opts = {}) {
  const raw = String(opts.q || opts.slug || opts.id || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  if (!raw) throw Object.assign(new Error("q_required"), { status: 400 });
  const campaignFilter = opts.campaign || null;
  const catalog = listDocsTree(repo, campaigns, { campaign: campaignFilter });
  const matches = [];
  for (const camp of catalog.campaigns) {
    for (const f of camp.files) {
      const id = (f.id || "").toLowerCase();
      const slug = f.name.replace(/\.md$/i, "").toLowerCase();
      const aliases = (f.aliases || []).map((a) => String(a).toLowerCase().replace(/\s+/g, "-"));
      const aliasPlain = (f.aliases || []).map((a) => String(a).toLowerCase());
      const hit =
        id === raw ||
        slug === raw ||
        aliases.includes(raw) ||
        aliasPlain.includes(raw) ||
        (f.label || "").toLowerCase() === raw;
      if (!hit) continue;
      matches.push({
        path: f.path,
        campaign: camp.campaign,
        id: f.id || slug,
        label: f.label || f.name,
        kind: f.kind,
        character: !!f.character,
        aliases: f.aliases || [],
      });
    }
  }
  // Prefer character sheets when ambiguous
  matches.sort((a, b) => Number(b.character) - Number(a.character) || a.path.localeCompare(b.path));
  return {
    q: raw,
    count: matches.length,
    matches,
    primary: matches[0] || null,
  };
}

// ---------------------------------------------------------------------------
// Version history (agents/state/doc-versions/ — under protected agents/state/**)
// ---------------------------------------------------------------------------

const MAX_DOC_VERSIONS = 40;

function versionsDirFor(repo, docPath) {
  const safe = sha1(docPath).slice(0, 16);
  return path.join(repo, "agents", "state", "doc-versions", safe);
}

function snapshotDocVersion(repo, docPath, content, meta = {}) {
  const dir = versionsDirFor(repo, docPath);
  fs.mkdirSync(dir, { recursive: true });
  const metaPath = path.join(dir, "meta.json");
  let store = { doc_path: docPath, versions: [] };
  if (fs.existsSync(metaPath)) {
    try {
      store = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (!Array.isArray(store.versions)) store.versions = [];
    } catch {
      store = { doc_path: docPath, versions: [] };
    }
  }
  const n = store.versions.length + 1;
  const id = `v${String(n).padStart(3, "0")}`;
  const file = `${id}.md`;
  fs.writeFileSync(path.join(dir, file), content, "utf8");
  store.doc_path = docPath;
  store.versions.push({
    id,
    file,
    hash: sha1(content),
    bytes: Buffer.byteLength(content, "utf8"),
    created_at: new Date().toISOString(),
    reason: meta.reason || "save",
  });
  while (store.versions.length > MAX_DOC_VERSIONS) {
    const drop = store.versions.shift();
    try {
      fs.unlinkSync(path.join(dir, drop.file));
    } catch {
      /* ignore */
    }
  }
  fs.writeFileSync(metaPath, JSON.stringify(store, null, 2) + "\n", "utf8");
  return store;
}

function listDocVersions(repo, docPath) {
  const dir = versionsDirFor(repo, docPath);
  const metaPath = path.join(dir, "meta.json");
  if (!fs.existsSync(metaPath)) {
    return { doc_path: docPath, versions: [] };
  }
  try {
    const store = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    return {
      doc_path: docPath,
      versions: Array.isArray(store.versions) ? store.versions : [],
    };
  } catch {
    return { doc_path: docPath, versions: [] };
  }
}

function readDocVersion(repo, docPath, versionId) {
  const list = listDocVersions(repo, docPath);
  const v = list.versions.find((x) => x.id === versionId);
  if (!v) throw Object.assign(new Error("version_not_found"), { status: 404 });
  const fp = path.join(versionsDirFor(repo, docPath), v.file);
  if (!fs.existsSync(fp)) throw Object.assign(new Error("version_file_missing"), { status: 404 });
  const content = fs.readFileSync(fp, "utf8");
  return { doc_path: docPath, version: v, content };
}

function restoreDocVersion(repo, campaigns, docPath, versionId) {
  const snapped = readDocVersion(repo, docPath, versionId);
  // writeDocsDoc will snapshot current before restore
  return writeDocsDoc(repo, campaigns, docPath, snapped.content, null, {
    reason: `restore:${versionId}`,
  });
}

/** Minimal unified diff for Hub Accept UI (no deps). */
function unifiedDiff(before, after, opts = {}) {
  const a = String(before || "").split(/\r?\n/);
  const b = String(after || "").split(/\r?\n/);
  const maxLines = opts.maxLines || 400;
  const out = [];
  out.push("--- before");
  out.push("+++ after");
  let i = 0;
  let j = 0;
  let lines = 0;
  while ((i < a.length || j < b.length) && lines < maxLines) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push(` ${a[i]}`);
      i += 1;
      j += 1;
    } else if (j < b.length && (i >= a.length || a[i] !== b[j])) {
      // prefer showing + then - when diverge
      if (i < a.length && (j >= b.length || !b.slice(j, j + 3).includes(a[i]))) {
        out.push(`-${a[i]}`);
        i += 1;
      } else {
        out.push(`+${b[j]}`);
        j += 1;
      }
    } else if (i < a.length) {
      out.push(`-${a[i]}`);
      i += 1;
    } else {
      out.push(`+${b[j]}`);
      j += 1;
    }
    lines += 1;
  }
  if (i < a.length || j < b.length) out.push("… (diff truncated)");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Character beta-test (engine guts — OpenRouter; not Pixi RP :8767)
// ---------------------------------------------------------------------------

function readDotEnvKey(filePath, keyName) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (!line.startsWith(`${keyName}=`)) continue;
      const val = line.slice(keyName.length + 1).trim().replace(/^["']|["']$/g, "");
      if (val) return val;
    }
  } catch {
    /* missing */
  }
  return null;
}

function loadOpenRouterKeyForDocs() {
  const home = process.env.HOME || "/home/abhinav";
  return (
    readDotEnvKey(path.join(home, ".linuxbox-pixi", "deckard-local.env"), "OPENROUTER_API_KEY") ||
    readDotEnvKey(path.join(home, ".hermes", ".env"), "OPENROUTER_API_KEY") ||
    process.env.OPENROUTER_API_KEY ||
    null
  );
}

function httpsJson(url, { method = "POST", headers = {}, body = null, timeoutMs = 90000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "http:" ? http : https;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "http:" ? 80 : 443),
        path: u.pathname + u.search,
        method,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = { raw: text.slice(0, 2000) };
          }
          resolve({ status: res.statusCode || 0, json, text });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("openrouter_timeout"));
    });
    if (body) req.write(body);
    req.end();
  });
}

function normalizeBetaHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw.slice(-40)) {
    const role = String(row?.role || "").toLowerCase();
    const content = String(row?.content || "").trim();
    if ((role !== "user" && role !== "assistant") || !content) continue;
    out.push({ role, content: content.slice(0, 12000) });
  }
  return out;
}

const BETA_CONTINUE_USER =
  "Continue the scene exactly where you stopped. Do not repeat prior paragraphs. Keep the same POV and tense.";

const BETA_LENGTH_FINISH = new Set(["length", "max_tokens", "model_length"]);

function betaFinishTruncated(finishReason) {
  return BETA_LENGTH_FINISH.has(String(finishReason || "").toLowerCase());
}

/** ponytail: Number(undefined) is NaN — `NaN ?? 2` stays NaN and skips the OR loop. */
function betaClampAutoContinues(raw, fallback = 2) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), 0), 4);
}

function betaHumanUpstreamError(err) {
  const msg = String(err?.message || "");
  if (msg === "openrouter_timeout") {
    return "OpenRouter timed out (120s per hop). Try Continue scene or a shorter prompt.";
  }
  const m = msg.match(/^openrouter_http_(\d+)$/);
  if (m) {
    const st = m[1];
    if (st === "429") return "OpenRouter rate limit (429) — wait or pick a paid model.";
    if (st === "402") return "OpenRouter credits/reservation exhausted (402).";
    if (st === "401" || st === "403") return `OpenRouter auth failed (${st}) — check API key on potato.`;
    return `OpenRouter upstream error (HTTP ${st}).`;
  }
  if (msg === "empty_model_reply") return "Model returned an empty reply — retry or switch model.";
  if (msg === "beta_all_models_failed") {
    const hint = err.hint ? ` ${err.hint}` : "";
    const detail = err.detail ? ` ${String(err.detail).slice(0, 200)}` : "";
    return `All models failed.${hint}${detail}`.trim();
  }
  return msg || "beta_failed";
}

function betaExtractReply(choice) {
  const msg = choice?.message || {};
  const content = String(msg.content || choice.text || "").trim();
  if (content) return content;
  return "";
}

/**
 * Beta-test a character sheet: inject sheet into prompt, multi-turn scene thread.
 * Does not touch :8767 or characters-registry.json.
 */
async function runCharacterBeta(repo, campaigns, body = {}) {
  const docPath = String(body.path || body.doc_path || "").replace(/\\/g, "/");
  if (!docPath) throw Object.assign(new Error("path_required"), { status: 400 });
  const doc = readDocsDoc(repo, campaigns, docPath);
  const isChar =
    doc.meta?.kind === "character" ||
    /\/characters\//i.test(docPath) ||
    String(doc.kind || "").toLowerCase() === "character";
  if (!isChar) {
    throw Object.assign(new Error("not_a_character_sheet"), {
      status: 400,
      hint: "Open a characters/*.md sheet (e.g. sasha.md)",
    });
  }
  const continueScene = Boolean(body.continue_scene);
  const scenario = String(body.scenario || body.prompt || body.message || "").trim().slice(0, 4000);
  const priorHistory = normalizeBetaHistory(body.history);
  if (!continueScene && !scenario && !priorHistory.length) {
    throw Object.assign(new Error("scenario_required"), {
      status: 400,
      hint: "Provide a scene prompt for the beta-test",
    });
  }
  if (continueScene && priorHistory.length && priorHistory[priorHistory.length - 1].role !== "assistant") {
    throw Object.assign(new Error("continue_requires_assistant_tail"), {
      status: 400,
      hint: "Continue scene needs a prior assistant turn to extend",
    });
  }
  const key = loadOpenRouterKeyForDocs();
  if (!key) {
    throw Object.assign(new Error("no_openrouter_key"), {
      status: 503,
      hint: "Set OPENROUTER_API_KEY in ~/.linuxbox-pixi/deckard-local.env (preferred) or ~/.hermes/.env",
    });
  }
  // Cap sheet inject — Sasha is long
  const sheetText = String(doc.content || "").slice(0, 14000);
  const explicitModel = String(body.model || "").trim();
  const autoMode = !explicitModel || explicitModel === "auto";
  const freeChain = [
    process.env.DOCS_BETA_MODEL || "",
    "poolside/laguna-xs-2.1:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "cohere/north-mini-code:free",
    // Paid last-resort when free pool is 429'd — Pixi key budget
    "deepseek/deepseek-v4-flash",
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);
  // Explicit UI pick sticks — no silent failover to a different model.
  const modelChain = autoMode ? freeChain : [explicitModel];
  const maxTokens = Math.min(Math.max(Number(body.max_tokens) || 4096, 512), 8192);
  const maxAutoContinues = continueScene
    ? 0
    : betaClampAutoContinues(body.max_continues, 2);

  const system = [
    "You beta-test a campaign character sheet for immersion (Docs ↔ Pixi engine guts).",
    "POV (required): narrate from the PLAYER's first person — use \"I / me / my\" for the player.",
    "The sheet character is EXTERNAL: use their name and she/he/they — never second-person \"you\" for the player, and never write the scene as the character's interior monologue or \"I\"-as-character.",
    "Stay diegetic: multi-beat scene paragraphs; the character speaks and acts (quoted dialogue + third-person action).",
    "Write a full scene beat — not a teaser. Aim for 8–15 substantial paragraphs when the GM asks for a long scene; keep momentum through action and dialogue.",
    "Respect clothing/physical state from the sheet and prior beats — do not skip undress or assume garments are off unless established.",
    "English only. Explicit content OK if the sheet supports it — no euphemistic dodge or soft refusal.",
    "Do not invent faces, ages past the sheet, or partners not on the sheet.",
    "Do not ask the GM clarifying questions — the character decides and acts.",
    "No meta/OOC.",
  ].join(" ");

  const sheetBlock = `Character sheet SoT (${docPath}):\n\n${sheetText}`;
  const messages = [{ role: "system", content: system }];
  if (!priorHistory.length) {
    const opening = scenario || "Open a short scene with this character.";
    messages.push({
      role: "user",
      content: `${sheetBlock}\n\n---\nScenario from GM (player = first person \"I\"; sheet character = third person):\n${opening}`,
    });
  } else {
    messages.push({
      role: "user",
      content: `${sheetBlock}\n\n---\nPrior scene thread continues below. Player = first person \"I\"; sheet character = third person.`,
    });
    for (const row of priorHistory) {
      messages.push({ role: row.role, content: row.content });
    }
    if (continueScene) {
      messages.push({ role: "user", content: BETA_CONTINUE_USER });
    } else if (scenario) {
      messages.push({
        role: "user",
        content: `GM follow-up (player action or direction):\n${scenario}`,
      });
    }
  }

  async function callModel(model, msgs) {
    const payload = JSON.stringify({ model, messages: msgs, max_tokens: maxTokens });
    const resp = await httpsJson("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://abhinavall.net/Linuxbox/",
        "X-Title": "linuxbox-docs-character-beta",
        "Content-Length": Buffer.byteLength(payload),
      },
      body: payload,
      timeoutMs: 120000,
    });
    return resp;
  }

  let lastErr = null;
  for (const model of modelChain) {
    let workingMessages = messages.map((m) => ({ ...m }));
    let fullReply = "";
    let finishReason = null;
    let autoContinues = 0;
    let failed = false;
    try {
      for (let round = 0; round <= maxAutoContinues; round++) {
        const resp = await callModel(model, workingMessages);
        if (resp.status < 200 || resp.status >= 300) {
          const detail = (resp.text || "").slice(0, 600);
          lastErr = Object.assign(new Error(`openrouter_http_${resp.status}`), {
            status: 502,
            detail,
            model,
            hint: betaHumanUpstreamError({ message: `openrouter_http_${resp.status}`, detail }),
          });
          if (resp.status === 401 || resp.status === 403) throw lastErr;
          failed = true;
          break;
        }
        const choice = resp.json?.choices?.[0] || {};
        const chunk = betaExtractReply(choice);
        finishReason = choice.finish_reason || null;
        if (!chunk) {
          lastErr = Object.assign(new Error("empty_model_reply"), {
            status: 502,
            model,
            detail: JSON.stringify(resp.json || {}).slice(0, 400),
          });
          failed = true;
          break;
        }
        fullReply = fullReply ? `${fullReply}\n\n${chunk}` : chunk;
        if (!betaFinishTruncated(finishReason) || round >= maxAutoContinues) break;
        workingMessages.push({ role: "assistant", content: chunk });
        workingMessages.push({ role: "user", content: BETA_CONTINUE_USER });
        autoContinues += 1;
      }
    } catch (err) {
      lastErr = Object.assign(new Error(err.message || "openrouter_request_failed"), {
        status: err.status || 502,
        model,
        detail: err.detail,
        hint: betaHumanUpstreamError(err),
      });
      continue;
    }
    if (failed || !fullReply) continue;

    let updatedHistory = [...priorHistory];
    if (continueScene && updatedHistory.length && updatedHistory[updatedHistory.length - 1].role === "assistant") {
      const tail = updatedHistory.pop();
      updatedHistory.push({ role: "assistant", content: `${tail.content}\n\n${fullReply}` });
    } else {
      const userTurn = continueScene ? null : scenario || null;
      if (userTurn) updatedHistory.push({ role: "user", content: userTurn });
      updatedHistory.push({ role: "assistant", content: fullReply });
    }

    return {
      ok: true,
      path: docPath,
      campaign: doc.campaign,
      model,
      explicit_pick: !autoMode,
      tried: modelChain.slice(0, modelChain.indexOf(model) + 1),
      scenario: continueScene ? "[continue]" : scenario || null,
      reply: fullReply,
      history: updatedHistory,
      finish_reason: finishReason,
      truncated: betaFinishTruncated(finishReason),
      auto_continues: autoContinues,
      max_tokens: maxTokens,
      sheet_bytes: Buffer.byteLength(sheetText, "utf8"),
      note: "Engine-guts beta only — not Pixi RP :8767. Apply notes to sheet via Docs edit later.",
    };
  }
  const fail =
    lastErr ||
    Object.assign(new Error("beta_all_models_failed"), {
      status: 500,
      hint: `Tried: ${modelChain.join(" → ")}`,
    });
  fail.hint = fail.hint || betaHumanUpstreamError(fail);
  throw fail;
}

/**
 * Propose sheet/story updates from campaign reports (MVP).
 * Deterministic: find reports mentioning the target name; return excerpt list + optional draft stub.
 * LLM polish is optional when OpenRouter key present and body.use_llm=true.
 */
async function proposeFromReports(repo, campaigns, body = {}) {
  const targetPath = String(body.path || body.doc_path || "").replace(/\\/g, "/");
  if (!targetPath) throw Object.assign(new Error("path_required"), { status: 400 });
  const doc = readDocsDoc(repo, campaigns, targetPath);
  const campaignId = doc.campaign;
  const cfg = campaigns[campaignId];
  if (!cfg) throw Object.assign(new Error("unknown_campaign"), { status: 400 });

  const needle =
    String(body.query || doc.meta?.id || path.basename(targetPath, ".md") || "")
      .trim()
      .toLowerCase() || "sasha";
  const reportsDir = path.join(repo, "campaigns", campaignId, "reports");
  const hits = [];
  if (fs.existsSync(reportsDir)) {
    const names = fs.readdirSync(reportsDir).filter((n) => n.endsWith(".md")).slice(0, 80);
    for (const name of names) {
      const rel = `campaigns/${campaignId}/reports/${name}`;
      let raw = "";
      try {
        raw = fs.readFileSync(path.join(reportsDir, name), "utf8");
      } catch {
        continue;
      }
      if (!raw.toLowerCase().includes(needle)) continue;
      const idx = raw.toLowerCase().indexOf(needle);
      const start = Math.max(0, idx - 120);
      const excerpt = raw.slice(start, start + 420).replace(/\s+/g, " ").trim();
      hits.push({ path: rel, excerpt, mtime: fs.statSync(path.join(reportsDir, name)).mtime.toISOString() });
      if (hits.length >= 12) break;
    }
  }

  const before = doc.content || "";
  let proposed = before;
  let mode = "noop";
  if (hits.length) {
    mode = "append_evidence";
    const block = [
      "",
      "",
      "## Evidence from reports (proposed — review before Accept)",
      `<!-- docs-propose ${new Date().toISOString()} query=${needle} -->`,
      ...hits.map((h) => `- \`${h.path}\`: ${h.excerpt}`),
      "",
    ].join("\n");
    if (!before.includes("## Evidence from reports (proposed")) {
      proposed = before.trimEnd() + block;
    } else {
      mode = "already_has_evidence_block";
      proposed = before;
    }
  }

  if (body.use_llm && hits.length && mode === "append_evidence") {
    const key = loadOpenRouterKeyForDocs();
    if (key) {
      const model = String(body.model || process.env.DOCS_BETA_MODEL || "poolside/laguna-xs-2.1:free");
      const prompt =
        `Update this character/canon doc using report evidence. Return FULL markdown only.\n` +
        `Do not invent faces/ages. Merge facts; keep existing structure.\n\n` +
        `DOC:\n${before.slice(0, 8000)}\n\nEVIDENCE:\n${hits.map((h) => h.excerpt).join("\n---\n").slice(0, 6000)}`;
      try {
        const payload = JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You revise campaign docs from report evidence." },
            { role: "user", content: prompt },
          ],
          max_tokens: 3500,
        });
        const resp = await httpsJson("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://abhinavall.net/Linuxbox/",
            "Content-Length": Buffer.byteLength(payload),
          },
          body: payload,
          timeoutMs: 90000,
        });
        const text = resp.json?.choices?.[0]?.message?.content || "";
        if (resp.status >= 200 && resp.status < 300 && text.trim()) {
          proposed = text.trim();
          mode = "llm_merge";
        }
      } catch {
        /* keep deterministic proposal */
      }
    }
  }

  return {
    ok: true,
    path: targetPath,
    campaign: campaignId,
    query: needle,
    reports: hits,
    mode,
    before,
    proposed,
    diff: unifiedDiff(before, proposed, { maxLines: 350 }),
    note:
      mode === "noop"
        ? "No matching reports — nothing to propose."
        : "Review diff; Accept writes via PUT /api/docs/doc (versions snapshotted).",
  };
}

module.exports = {
  listDocsTree,
  readDocsDoc,
  writeDocsDoc,
  listDocComments,
  addDocComment,
  patchDocComment,
  buildDocsGraph,
  createCharacterSheet,
  resolveDocsEntity,
  docsWriteAllowed,
  parseFrontmatter,
  slugifyCharacterId,
  characterSheetDir,
  invalidateDocsCaches,
  sha1,
  MAX_GRAPH_DOCS,
  SYSTEM_DOC_SCOPES,
  DOC_GROUP_ORDER,
  docGroupForPath,
  snapshotDocVersion,
  listDocVersions,
  readDocVersion,
  restoreDocVersion,
  unifiedDiff,
  runCharacterBeta,
  proposeFromReports,
  loadOpenRouterKeyForDocs,
};
