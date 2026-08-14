/**
 * World roads SoT — NDJSON shards under campaigns/<id>/roads/
 * Never touches regions-ui.json. Highways paint stays map/highways.json (ref only).
 */
"use strict";

const fs = require("fs");
const path = require("path");

function roadsRoot(campaignDir) {
  return path.join(campaignDir, "roads");
}

function readRoadsIndex(campaignDir) {
  const abs = path.join(roadsRoot(campaignDir), "index.json");
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    return { error: "roads_index_read_failed", detail: String(e.message || e) };
  }
}

function readNdjson(abs) {
  if (!fs.existsSync(abs)) return [];
  const text = fs.readFileSync(abs, "utf8");
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* skip bad line */
    }
  }
  return out;
}

function shardPathForRegion(campaignDir, regionId, index) {
  const idx = index || readRoadsIndex(campaignDir);
  if (!idx || idx.error) return null;
  const shardId = (idx.region_to_shard && idx.region_to_shard[regionId]) || regionId;
  const entry = (idx.shards || []).find((s) => s.id === shardId);
  const rel = (entry && entry.path) || `shards/${shardId}.ndjson`;
  return path.join(roadsRoot(campaignDir), rel);
}

function readRoadsRegion(campaignDir, regionId) {
  const index = readRoadsIndex(campaignDir);
  if (!index) {
    return { version: 0, region_id: regionId, features: [], error: "roads_missing" };
  }
  if (index.error) return { version: 0, region_id: regionId, features: [], error: index.error };
  const abs = shardPathForRegion(campaignDir, regionId, index);
  const features = abs ? readNdjson(abs) : [];
  return {
    version: Number(index.version) || 1,
    updated_at: index.updated_at || null,
    region_id: regionId,
    features,
  };
}

/** Merge every roads shard (focus cities + island corridors). */
function readRoadsAll(campaignDir) {
  const index = readRoadsIndex(campaignDir);
  if (!index) return { version: 0, features: [], error: "roads_missing" };
  if (index.error) return { version: 0, features: [], error: index.error };
  const features = [];
  const seen = new Set();
  for (const shard of index.shards || []) {
    const abs = path.join(roadsRoot(campaignDir), shard.path || `shards/${shard.id}.ndjson`);
    for (const f of readNdjson(abs)) {
      const id = f && f.id ? String(f.id) : "";
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      features.push(f);
    }
  }
  return {
    version: Number(index.version) || 1,
    updated_at: index.updated_at || null,
    region_id: "all",
    features,
    shard_count: (index.shards || []).length,
  };
}

function readLogisticsIndex(campaignDir) {
  const abs = path.join(campaignDir, "logistics", "index.json");
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    return { error: "logistics_index_read_failed", detail: String(e.message || e) };
  }
}

function readLogisticsRoutes(campaignDir) {
  const abs = path.join(campaignDir, "logistics", "routes.ndjson");
  return readNdjson(abs);
}

function readBoardIndex(campaignDir) {
  const abs = path.join(campaignDir, "board", "index.json");
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    return { error: "board_index_read_failed", detail: String(e.message || e) };
  }
}

function readBoardThreads(campaignDir) {
  return readNdjson(path.join(campaignDir, "board", "threads.ndjson"));
}

function writeBoardResolve(campaignDir, payload) {
  const index = readBoardIndex(campaignDir);
  if (!index || index.error) throw new Error("board_missing");
  if (payload.base_version != null && Number(index.version) !== Number(payload.base_version)) {
    const err = new Error("version_conflict");
    err.code = "version_conflict";
    err.version = index.version;
    throw err;
  }
  const threadId = String(payload.thread_id || "").trim();
  if (!threadId) throw new Error("thread_id required");
  if (payload.action !== "resolve") throw new Error("bad_board_action");
  if (payload.impact !== false && payload.delta == null) {
    throw new Error("delta_required");
  }

  const threadsPath = path.join(campaignDir, "board", "threads.ndjson");
  const threads = readBoardThreads(campaignDir);
  let found = false;
  const nextThreads = threads.map((t) => {
    if (t.id !== threadId) return t;
    found = true;
    return Object.assign({}, t, {
      resolved: true,
      resolution: payload.resolution || "accepted",
      resolved_at: new Date().toISOString(),
      world_delta_id: payload.delta && payload.delta.id ? payload.delta.id : null,
    });
  });
  if (!found) throw new Error("thread_not_found");

  const deltasDir = path.join(campaignDir, "board", "deltas");
  if (!fs.existsSync(deltasDir)) fs.mkdirSync(deltasDir, { recursive: true });
  if (payload.delta) {
    const dAbs = path.join(deltasDir, `${threadId}.ndjson`);
    const line = JSON.stringify(Object.assign({}, payload.delta, { thread_id: threadId, at: new Date().toISOString() })) + "\n";
    fs.appendFileSync(dAbs, line);
  }

  fs.writeFileSync(threadsPath, nextThreads.map((t) => JSON.stringify(t)).join("\n") + "\n");
  const open = nextThreads.filter((t) => !t.resolved).map((t) => t.id);
  const nextIndex = {
    version: Number(index.version || 0) + 1,
    updated_at: new Date().toISOString(),
    open_thread_ids: open,
    resolved_count: nextThreads.filter((t) => t.resolved).length,
  };
  fs.writeFileSync(path.join(campaignDir, "board", "index.json"), JSON.stringify(nextIndex, null, 2) + "\n");
  return { index: nextIndex, thread: nextThreads.find((t) => t.id === threadId), delta: payload.delta || null };
}

function readWeatherPhenomena(campaignDir) {
  const abs = path.join(campaignDir, "weather", "phenomena.ndjson");
  return readNdjson(abs);
}

function readWeatherPhenomenaIndex(campaignDir) {
  const abs = path.join(campaignDir, "weather", "index.json");
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    return { error: "weather_phenomena_index_failed", detail: String(e.message || e) };
  }
}

module.exports = {
  readRoadsIndex,
  readRoadsRegion,
  readRoadsAll,
  readLogisticsIndex,
  readLogisticsRoutes,
  readBoardIndex,
  readBoardThreads,
  writeBoardResolve,
  readWeatherPhenomena,
  readWeatherPhenomenaIndex,
  readNdjson,
};
