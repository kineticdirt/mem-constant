/**
 * World dashboard control-plane JSON for Regions / Agriculture / Transport.
 * Markdown notes stay sidecars; this module is structured state only.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const MODULES = {
  regions: {
    file: "regions-state.json",
    resource: "world-regions:tropic-gooner",
    listKey: "focus",
  },
  agriculture: {
    file: "agriculture-state.json",
    resource: "world-agriculture:tropic-gooner",
    listKey: "crops",
  },
  transport: {
    file: "transport-state.json",
    resource: "world-transport:tropic-gooner",
    listKey: "modes",
  },
};

function statePath(campaignDir, mod) {
  const meta = MODULES[mod];
  if (!meta) throw new Error("bad_module");
  return path.join(campaignDir, "worldbuilding", meta.file);
}

function readModuleState(campaignDir, mod) {
  const abs = statePath(campaignDir, mod);
  if (!fs.existsSync(abs)) return { error: "summary_missing" };
  try {
    const data = JSON.parse(fs.readFileSync(abs, "utf8"));
    return Object.assign({ module: mod }, data);
  } catch (e) {
    return { error: "summary_read_failed", detail: String(e.message || e) };
  }
}

function writeModuleState(campaignDir, mod, state, lockFns) {
  const meta = MODULES[mod];
  if (!meta) throw new Error("bad_module");
  const abs = statePath(campaignDir, mod);
  const dir = path.dirname(abs);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const next = Object.assign({}, state, {
    updated_at: new Date().toISOString(),
    version: Number(state.version) > 0 ? Number(state.version) : 1,
  });
  delete next.error;
  delete next.module;
  delete next.highways_layer;
  const body = JSON.stringify(next, null, 2) + "\n";
  const resource = meta.resource;
  const holder = `tableslop-sot:${process.pid}`;
  const acquire = lockFns && lockFns.acquire;
  const release = lockFns && lockFns.release;
  const repoRoot = lockFns && lockFns.repoRoot;
  if (acquire && repoRoot) {
    acquire({ repoRoot, resource, holder, note: "write " + meta.file, wait: true });
  }
  try {
    if (fs.existsSync(abs)) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      try {
        fs.copyFileSync(abs, `${abs}.bak-${ts}`);
      } catch {
        /* bak best-effort */
      }
    }
    fs.writeFileSync(abs, body);
    return Object.assign({ module: mod }, next);
  } finally {
    if (release && repoRoot) {
      try {
        release({ repoRoot, resource, holder });
      } catch {
        /* ignore */
      }
    }
  }
}

function patchListItem(list, id, patch) {
  const rows = Array.isArray(list) ? list : [];
  const idx = rows.findIndex((r) => r && String(r.id) === String(id));
  if (idx < 0) throw new Error("item_not_found");
  const row = Object.assign({}, rows[idx]);
  for (const [k, v] of Object.entries(patch || {})) {
    if (k === "id") continue;
    row[k] = v;
  }
  const out = rows.slice();
  out[idx] = row;
  return out;
}

function applyModulePatch(cur, payload) {
  const next = Object.assign({}, cur);
  const ver = Number(cur.version || 0) + 1;
  if (payload.patch_item && payload.patch_item.id) {
    const id = payload.patch_item.id;
    const patch = payload.patch_item.patch || payload.patch_item;
    if (payload.list_key === "focus" || (next.focus && next.focus.some((r) => r && r.id === id))) {
      next.focus = patchListItem(next.focus, id, patch);
    } else if (payload.list_key === "watch" || (next.watch && next.watch.some((r) => r && r.id === id))) {
      next.watch = patchListItem(next.watch, id, patch);
    } else if (payload.list_key === "crops" || (next.crops && next.crops.some((r) => r && r.id === id))) {
      next.crops = patchListItem(next.crops, id, patch);
    } else if (payload.list_key === "fishing" || (next.fishing && next.fishing.some((r) => r && r.id === id))) {
      next.fishing = patchListItem(next.fishing, id, patch);
    } else if (payload.list_key === "modes" || (next.modes && next.modes.some((r) => r && r.id === id))) {
      next.modes = patchListItem(next.modes, id, patch);
    } else {
      throw new Error("item_not_found");
    }
  }
  if (payload.highway_note !== undefined) next.highway_note = String(payload.highway_note || "");
  if (Array.isArray(payload.play_notes)) next.play_notes = payload.play_notes.map((x) => String(x));
  if (Array.isArray(payload.logistics)) next.logistics = payload.logistics.map((x) => String(x));
  if (payload.blurb !== undefined) next.blurb = String(payload.blurb || "");
  next.version = ver;
  return next;
}

function readHighwaysLayerStatus(campaignDir) {
  const layersPath = path.join(campaignDir, "map", "layers.json");
  const out = {
    layer_id: "highways",
    present: false,
    source: null,
    status: "missing_layers_json",
    geometry_owner: "map",
    map_url: "https://map.tableslop.org/",
    note: "Highway geometry is a separate map track. World Transport reports status only — does not draw roads.",
  };
  if (!fs.existsSync(layersPath)) return out;
  try {
    const layers = JSON.parse(fs.readFileSync(layersPath, "utf8"));
    const row = (layers.layers || []).find((l) => l && l.id === "highways");
    if (!row) {
      out.status = "layer_not_declared";
      return out;
    }
    out.present = true;
    out.source = row.source == null ? null : row.source;
    out.label = row.label || "Highways";
    out.default_on = row.default === true;
    if (row.source == null || row.source === "") {
      out.status = "placeholder_no_source";
    } else {
      const abs = path.join(campaignDir, String(row.source).replace(/\\/g, "/"));
      out.status = fs.existsSync(abs) ? "source_on_disk" : "source_missing";
      out.source_exists = fs.existsSync(abs);
    }
    return out;
  } catch (e) {
    out.status = "layers_read_failed";
    out.detail = String(e.message || e);
    return out;
  }
}

module.exports = {
  MODULES,
  readModuleState,
  writeModuleState,
  applyModulePatch,
  readHighwaysLayerStatus,
  statePath,
};
