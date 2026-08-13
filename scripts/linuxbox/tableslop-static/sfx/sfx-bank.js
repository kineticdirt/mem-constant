/**
 * Tableslop shared SFX/VFX bank.
 * Manifest-driven: play(id) → file if present, else procedural WebAudio.
 * Fail soft — never block UI. Drop assets under /sfx/assets/ matching manifest file names.
 */
"use strict";

const MANIFEST_URL = "/sfx/sfx-manifest.json";

let manifest = null;
let enabled = false;
let volume = 0.35;
let audioCtx = null;
const missingFiles = new Set();
const loadedAudio = new Map();

function storageKey() {
  return (manifest && manifest.defaults && manifest.defaults.enabled_storage_key) || "tableslop-sfx-on";
}

function readEnabled() {
  try {
    const v = localStorage.getItem(storageKey());
    if (v == null) return false;
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

function writeEnabled(on) {
  try {
    localStorage.setItem(storageKey(), on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function ensureCtx() {
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

function entryById(id) {
  const list = (manifest && manifest.entries) || [];
  return list.find((e) => e.id === id) || null;
}

function assetUrl(file) {
  if (!file) return null;
  const base = (manifest && manifest.base_url) || "/sfx/assets/";
  return base.replace(/\/?$/, "/") + file;
}

function pulseVfx(target, vfxId) {
  if (!vfxId || typeof document === "undefined") return;
  const root = target || document.getElementById("phone") || document.body;
  if (!root || !root.classList) return;
  const cls = "sfx-vfx--" + String(vfxId).replace(/[^a-z0-9_-]/gi, "");
  root.classList.add("sfx-vfx", cls);
  window.setTimeout(() => {
    root.classList.remove(cls);
  }, 160);
}

function tone(ctx, freq, dur, type, gainVal, when) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || "sine";
  osc.frequency.value = freq;
  const g = (gainVal != null ? gainVal : 0.05) * volume;
  gain.gain.value = g;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t = ctx.currentTime + (when || 0);
  gain.gain.setValueAtTime(g, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noiseBurst(ctx, dur, gainVal, when) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  const g = (gainVal != null ? gainVal : 0.04) * volume;
  gain.gain.value = g;
  src.connect(gain);
  gain.connect(ctx.destination);
  const t = ctx.currentTime + (when || 0);
  gain.gain.setValueAtTime(g, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function playProc(name) {
  const ctx = ensureCtx();
  if (!ctx) return false;
  switch (name) {
    case "click":
      tone(ctx, 920, 0.035, "square", 0.035);
      return true;
    case "key":
      tone(ctx, 680 + Math.random() * 80, 0.045, "triangle", 0.04);
      return true;
    case "toggle":
      tone(ctx, 520, 0.05, "sine", 0.04);
      tone(ctx, 780, 0.05, "sine", 0.03, 0.04);
      return true;
    case "knob":
      tone(ctx, 240 + Math.random() * 40, 0.03, "sawtooth", 0.025);
      noiseBurst(ctx, 0.02, 0.02);
      return true;
    case "door_open":
      tone(ctx, 180, 0.12, "sine", 0.05);
      tone(ctx, 320, 0.18, "triangle", 0.035, 0.05);
      noiseBurst(ctx, 0.08, 0.03, 0.1);
      return true;
    case "door_close":
      noiseBurst(ctx, 0.05, 0.05);
      tone(ctx, 140, 0.1, "sine", 0.05, 0.02);
      return true;
    case "static":
      noiseBurst(ctx, 0.35, 0.045);
      return true;
    case "buzz":
      tone(ctx, 110, 0.35, "sawtooth", 0.04);
      tone(ctx, 115, 0.35, "sawtooth", 0.03, 0.01);
      return true;
    case "ringback":
      for (let ring = 0; ring < 3; ring++) {
        tone(ctx, 440, 0.4, "sine", 0.05, ring * 0.9);
        tone(ctx, 480, 0.4, "sine", 0.045, ring * 0.9 + 0.05);
      }
      return true;
    case "hangup":
      tone(ctx, 300, 0.08, "square", 0.04);
      noiseBurst(ctx, 0.06, 0.03, 0.05);
      return true;
    case "deny":
      tone(ctx, 220, 0.12, "square", 0.05);
      tone(ctx, 180, 0.18, "square", 0.045, 0.12);
      return true;
    case "busy":
      for (let i = 0; i < 4; i++) tone(ctx, 480, 0.2, "sine", 0.045, i * 0.4);
      return true;
    case "whoosh":
      noiseBurst(ctx, 0.22, 0.035);
      tone(ctx, 600, 0.15, "sine", 0.02, 0.02);
      return true;
    default:
      return false;
  }
}

async function tryPlayFile(url) {
  if (!url || missingFiles.has(url)) return false;
  try {
    let audio = loadedAudio.get(url);
    if (!audio) {
      audio = new Audio(url);
      audio.preload = "auto";
      loadedAudio.set(url, audio);
    }
    const probe = await fetch(url, { method: "HEAD", cache: "force-cache" });
    if (!probe.ok) {
      missingFiles.add(url);
      return false;
    }
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.currentTime = 0;
    await audio.play();
    return true;
  } catch {
    missingFiles.add(url);
    return false;
  }
}

async function play(id, opts) {
  const o = opts || {};
  if (!enabled && !o.force) return { ok: false, reason: "muted" };
  const entry = entryById(id);
  if (!entry) return { ok: false, reason: "unknown_id" };
  if (entry.vfx) pulseVfx(o.target || null, entry.vfx);
  if (entry.file) {
    const url = assetUrl(entry.file);
    if (await tryPlayFile(url)) return { ok: true, via: "file", id };
  }
  if (entry.proc && playProc(entry.proc)) return { ok: true, via: "proc", id };
  return { ok: false, reason: "no_source" };
}

function setEnabled(on) {
  enabled = !!on;
  writeEnabled(enabled);
  if (enabled) ensureCtx();
  return enabled;
}

function isEnabled() {
  return !!enabled;
}

function setVolume(v) {
  volume = Math.max(0, Math.min(1, Number(v) || 0));
  return volume;
}

async function load(url) {
  const u = url || MANIFEST_URL;
  try {
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error("manifest " + r.status);
    manifest = await r.json();
    if (manifest.defaults && manifest.defaults.volume != null) {
      volume = Number(manifest.defaults.volume) || volume;
    }
    enabled = readEnabled();
    return manifest;
  } catch (e) {
    manifest = { version: 0, entries: [], error: String(e && e.message || e) };
    enabled = readEnabled();
    return manifest;
  }
}

function listReady() {
  return ((manifest && manifest.entries) || []).map((e) => ({
    id: e.id,
    ready: e.ready || (e.file ? "file-slot" : e.proc ? "proc" : "slot"),
    kind: e.kind,
    tags: e.tags || [],
  }));
}

const TableslopSfx = {
  load,
  play,
  pulseVfx,
  setEnabled,
  isEnabled,
  setVolume,
  listReady,
  entryById,
};

if (typeof window !== "undefined") window.TableslopSfx = TableslopSfx;

export {
  TableslopSfx,
  load,
  play,
  pulseVfx,
  setEnabled,
  isEnabled,
  setVolume,
  listReady,
};
