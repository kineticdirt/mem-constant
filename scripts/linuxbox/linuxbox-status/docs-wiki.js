/**
 * Docs wiki client — folder tree, smart filter, edit/save, comments, visualize.
 * Depends on globals from index.html: base, esc, mdParse, goTab, fmtEt (optional).
 *
 * Load UX: never leave infinite "Loading…" — timeout + last-step status.
 * Graph is lazy (only when Visualize opens); tree browse works if graph fails.
 */
(function () {
  "use strict";

  const TREE_TIMEOUT_MS = 12_000;
  const GRAPH_TIMEOUT_MS = 15_000;
  const DOC_TIMEOUT_MS = 12_000;
  /** Session-long tree cache — Hub agent poll must NOT remount Docs. */
  const TREE_CACHE_MS = 24 * 60 * 60 * 1000;
  const GRAPH_CACHE_MS = 20_000;
  /** Client layout cap — server also caps; keep SVG/force cheap. */
  const GRAPH_LAYOUT_DOC_CAP = 80;
  const DOC_GROUP_ORDER = [
    { id: "characters", label: "Characters" },
    { id: "story", label: "Story / lore" },
    { id: "world", label: "Places / orgs / plot" },
    { id: "notes", label: "Notes" },
    { id: "reports", label: "Reports" },
    { id: "other", label: "Other" },
  ];

  let docsCatalog = null;
  let docsSelected = null; // { path, campaign, label }
  let docsMode = "read"; // read | edit | graph | beta | diff | propose
  let docsDocState = null; // { content, hash, writable, ... }
  let docsComments = [];
  let docsCollapsed = new Set();
  let docsSmartQuery = "";
  let docsTextFilter = "";
  let docsCampaignFilter = "";
  let docsPendingSelection = null; // { start, end, excerpt }
  /** Inline comment compose (no window.prompt). null | { start, end, excerpt, note, suggested, error } */
  let docsCommentCompose = null;
  let docsLastStep = "idle";
  let treeAbort = null;
  let graphAbort = null;
  let treeCache = { key: null, at: 0, data: null };
  let graphCache = { key: null, at: 0, data: null };
  let treeLoadGen = 0;
  let graphLoadGen = 0;
  let docsWikiReady = false;
  let docsWired = false;
  let wikiEntitiesCache = null;
  let wikiEntitiesBound = false;

  async function loadWikiEntities() {
    if (wikiEntitiesCache) return wikiEntitiesCache;
    if (!globalThis.WikiEntities || !WikiEntities.fetchEntities) return [];
    try {
      const camp = docsCampaignFilter || "tropic-gooner";
      const prefix = typeof base === "string" ? base : "";
      const data = await WikiEntities.fetchEntities(
        `${prefix}/api/wiki/entities?campaign=${encodeURIComponent(camp)}`
      );
      wikiEntitiesCache = Array.isArray(data) ? data : (data && data.entities) || [];
    } catch {
      wikiEntitiesCache = [];
    }
    return wikiEntitiesCache;
  }

  async function enhanceWikiEntityLinks(root) {
    const prose = root && root.querySelector ? root.querySelector("#docs-prose") : null;
    if (!prose || !globalThis.WikiEntities) return;
    const ents = await loadWikiEntities();
    WikiEntities.linkifyDom(prose, ents);
    if (!wikiEntitiesBound) {
      WikiEntities.bindPopovers(document.body, ents);
      wikiEntitiesBound = true;
    }
  }

  let docsVersions = [];
  let docsVersionPreview = null; // { id, content }
  let docsPendingDiff = null; // { before, after, reason }
  let docsBetaReply = "";
  let docsBetaError = "";
  let docsBetaBusy = false;
  let docsBetaHistory = [];
  let docsBetaHistoryPath = "";
  let docsBetaTruncated = false;
  /** In-memory scenario draft — survives remount during Run; sessionStorage is per-path backup. */
  let docsBetaScenario = "";
  let docsBetaScenarioPath = "";
  const BETA_SCENARIO_SS_PREFIX = "docs-beta-scenario:";
  const BETA_HISTORY_SS_PREFIX = "docs-beta-history:";
  const BETA_TRUNC_SS_PREFIX = "docs-beta-trunc:";
  const BETA_MODEL_LS_KEY = "docs-beta-model";
  const BETA_DEAD_MODEL_IDS = new Set([
    "tencent/hy3:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "zenmux:moonshotai/kimi-k3-free",
    "stepfun/step-3.7-flash",
  ]);
  let docsBetaCatalog = [];
  let docsBetaCatalogFetch = null;
  let docsBetaLastModel = "";

  function betaScenarioStorageKey(docPath) {
    return BETA_SCENARIO_SS_PREFIX + String(docPath || "unknown");
  }

  function betaHistoryStorageKey(docPath) {
    return BETA_HISTORY_SS_PREFIX + String(docPath || "unknown");
  }

  function loadBetaHistory(docPath) {
    const key = String(docPath || "");
    if (docsBetaHistoryPath === key && docsBetaHistory.length) return docsBetaHistory;
    docsBetaHistoryPath = key;
    try {
      const raw = sessionStorage.getItem(betaHistoryStorageKey(key));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          docsBetaHistory = parsed.filter(
            (r) => r && (r.role === "user" || r.role === "assistant") && String(r.content || "").trim()
          );
          return docsBetaHistory;
        }
      }
    } catch {
      /* ignore */
    }
    docsBetaHistory = [];
    return docsBetaHistory;
  }

  function loadBetaTruncated(docPath) {
    try {
      return sessionStorage.getItem(BETA_TRUNC_SS_PREFIX + String(docPath || "")) === "1";
    } catch {
      return false;
    }
  }

  function saveBetaTruncated(docPath, truncated) {
    docsBetaTruncated = Boolean(truncated);
    try {
      sessionStorage.setItem(BETA_TRUNC_SS_PREFIX + String(docPath || ""), docsBetaTruncated ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function betaCanContinue(docPath) {
    loadBetaHistory(docPath);
    const last = docsBetaHistory[docsBetaHistory.length - 1];
    return docsBetaHistory.length > 0 && last?.role === "assistant" && docsBetaTruncated;
  }

  function setBetaBusyControls(busy) {
    const pathHint = docsDocState?.path || "";
    const hasThread = loadBetaHistory(pathHint).length > 0;
    const canCont = betaCanContinue(pathHint);
    const pairs = [
      ["docs-beta-run", false],
      ["docs-beta-new", false],
      ["docs-beta-send", !hasThread],
      ["docs-beta-continue", !canCont],
    ];
    for (const [id, extraOff] of pairs) {
      const el = $(id);
      if (el) el.disabled = busy || extraOff;
    }
    const runBtn = $("docs-beta-run");
    if (runBtn) {
      if (busy) runBtn.textContent = "Running…";
      else runBtn.textContent = hasThread ? "Re-run opening" : "Run scene";
    }
    const contBtn = $("docs-beta-continue");
    if (contBtn && busy) contBtn.textContent = "Continuing…";
    else if (contBtn) contBtn.textContent = "Continue scene";
  }

  function saveBetaHistory(docPath, history) {
    docsBetaHistory = Array.isArray(history) ? history : [];
    docsBetaHistoryPath = String(docPath || "");
    try {
      sessionStorage.setItem(betaHistoryStorageKey(docPath), JSON.stringify(docsBetaHistory));
    } catch {
      /* ignore quota */
    }
  }

  function clearBetaThread(docPath) {
    docsBetaHistory = [];
    docsBetaHistoryPath = "";
    docsBetaReply = "";
    docsBetaTruncated = false;
    docsBetaError = "";
    try {
      sessionStorage.removeItem(betaHistoryStorageKey(docPath));
      sessionStorage.removeItem(BETA_TRUNC_SS_PREFIX + String(docPath || ""));
    } catch {
      /* ignore */
    }
  }

  function betaThreadMarkdown(history) {
    if (!history?.length) return "";
    return history
      .map((row) => {
        const label = row.role === "user" ? "**You (GM)**" : "**Scene**";
        return `${label}\n\n${row.content}`;
      })
      .join("\n\n---\n\n");
  }

  function defaultBetaScenario(pathHint) {
    return /sasha/i.test(pathHint || "")
      ? "I knock on Sasha's door after her workout and say hello. Write a long multi-beat scene (8–15 paragraphs) from my first-person view; Sasha stays third person (she/her). She acts — does not stall with questions."
      : "I open a scene with this character and say hello. Write a long multi-beat scene (8–15 paragraphs) from my first-person view; the character stays third person (name + she/he/they). They act.";
  }

  function loadBetaScenario(docPath) {
    const key = String(docPath || "");
    if (docsBetaScenarioPath === key && docsBetaScenario) return docsBetaScenario;
    try {
      const raw = sessionStorage.getItem(betaScenarioStorageKey(key));
      if (raw != null && String(raw).trim()) {
        docsBetaScenarioPath = key;
        docsBetaScenario = String(raw);
        return docsBetaScenario;
      }
    } catch {
      /* sessionStorage may be blocked */
    }
    return defaultBetaScenario(key);
  }

  function saveBetaScenario(docPath, text) {
    docsBetaScenarioPath = String(docPath || "");
    docsBetaScenario = String(text ?? "");
    try {
      sessionStorage.setItem(betaScenarioStorageKey(docsBetaScenarioPath), docsBetaScenario);
    } catch {
      /* ignore quota / private mode */
    }
  }

  function loadBetaModelPick() {
    try {
      const v = localStorage.getItem(BETA_MODEL_LS_KEY);
      return v && v !== "null" ? v : "auto";
    } catch {
      return "auto";
    }
  }

  function saveBetaModelPick(modelId) {
    try {
      localStorage.setItem(BETA_MODEL_LS_KEY, modelId || "auto");
    } catch {
      /* ignore */
    }
  }

  function betaCatalogRows() {
    return (docsBetaCatalog || []).filter(
      (m) => m && m.id && m.status !== "offline" && !BETA_DEAD_MODEL_IDS.has(m.id)
    );
  }

  function formatBetaModelOption(row) {
    const tier = row.tier === "paid" ? "paid" : "free";
    const cost =
      row.tier === "paid"
        ? ` · $${row.relative_cost_in ?? "?"}/$${row.relative_cost_out ?? "?"}`
        : "";
    const st = row.status && row.status !== "online" ? ` · ${row.status}` : "";
    return `${row.label || row.id} (${tier})${cost}${st}`;
  }

  async function ensureBetaCatalog() {
    if (betaCatalogRows().length) return true;
    if (docsBetaCatalogFetch) return docsBetaCatalogFetch;
    docsBetaCatalogFetch = (async () => {
      try {
        const data = await apiGet("/api/chat/models", { timeoutMs: DOC_TIMEOUT_MS });
        docsBetaCatalog = Array.isArray(data?.models) ? data.models : [];
        return betaCatalogRows().length > 0;
      } catch {
        return false;
      } finally {
        docsBetaCatalogFetch = null;
      }
    })();
    return docsBetaCatalogFetch;
  }

  function populateBetaModelSelect(selectedId) {
    const sel = $("docs-beta-model");
    if (!sel) return;
    const prev = selectedId != null ? selectedId : loadBetaModelPick();
    sel.innerHTML = `<option value="auto">Auto · free-first</option>`;
    const freeRows = betaCatalogRows().filter((m) => m.tier !== "paid");
    const paidRows = betaCatalogRows().filter((m) => m.tier === "paid");
    const addGroup = (label, rows) => {
      if (!rows.length) return;
      const og = document.createElement("optgroup");
      og.label = label;
      for (const row of rows) {
        const opt = document.createElement("option");
        opt.value = row.id;
        opt.textContent = formatBetaModelOption(row);
        og.appendChild(opt);
      }
      sel.appendChild(og);
    };
    addGroup("Free", freeRows);
    addGroup("Paid", paidRows);
    if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
    else sel.value = "auto";
    updateBetaModelActiveLabel();
  }

  function updateBetaModelActiveLabel() {
    const active = $("docs-beta-model-active");
    const sel = $("docs-beta-model");
    if (!active || !sel) return;
    const v = sel.value || "auto";
    const tokenHint = " · max 4096 tok/turn (+auto-continue)";
    if (v === "auto") {
      active.textContent = docsBetaLastModel
        ? `Active: ${docsBetaLastModel}${tokenHint}`
        : `Auto · free-first chain${tokenHint}`;
      return;
    }
    const label = sel.selectedOptions?.[0]?.textContent?.split(" (")[0] || v;
    active.textContent = `Active: ${label}${tokenHint}`;
  }

  function $(id) {
    return document.getElementById(id);
  }

  /** Local esc — do not depend on index.html load order if script path is wrong once. */
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtTime(iso) {
    if (typeof fmtEt === "function") return fmtEt(iso);
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso || "";
    }
  }

  function setDocsStatus(msg, opts = {}) {
    docsLastStep = msg || "idle";
    const status = $("docs-load-status");
    if (status) {
      status.textContent = msg || "";
      status.dataset.state = opts.error ? "error" : opts.busy ? "busy" : "ok";
      if (opts.error) status.classList.add("docs-status-error");
      else status.classList.remove("docs-status-error");
    }
  }

  function progressHtml(pct, label) {
    const w = Math.max(0, Math.min(100, Number(pct) || 0));
    return `<div class="docs-progress" role="status" aria-live="polite">
      <div class="docs-progress-track"><div class="docs-progress-bar" style="width:${w}%"></div></div>
      <div class="docs-progress-label">${esc(label || "")}</div>
    </div>`;
  }

  async function apiGet(path, opts = {}) {
    const timeoutMs = opts.timeoutMs || TREE_TIMEOUT_MS;
    const parentSignal = opts.signal;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onParentAbort = () => ctrl.abort();
    if (parentSignal) {
      if (parentSignal.aborted) ctrl.abort();
      else parentSignal.addEventListener("abort", onParentAbort, { once: true });
    }
    try {
      const res = await fetch(`${base}${path}`, { cache: "no-store", signal: ctrl.signal });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `http_${res.status}`);
      return j;
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(`Timed out after ${timeoutMs}ms (last: ${docsLastStep})`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
    }
  }

  async function apiSend(method, path, body) {
    const ctrl = new AbortController();
    const betaPath = method === "POST" && String(path).includes("character-beta");
    const timer = setTimeout(() => ctrl.abort(), betaPath ? 180_000 : DOC_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
        signal: ctrl.signal,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (betaPath) {
          const friendly = formatBetaApiError(res, j);
          throw new Error(friendly);
        }
        const bits = [j.error || `http_${res.status}`, j.hint, j.detail].filter(Boolean);
        throw new Error(bits.join(" — ").slice(0, 800));
      }
      return j;
    } catch (err) {
      if (err.name === "AbortError") {
        const msg = betaPath
          ? "Beta-test timed out (180s). Cloudflare may cut off sooner — use Continue scene for another hop."
          : `Timed out (last: ${docsLastStep})`;
        throw new Error(msg);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function formatBetaApiError(res, j) {
    if (!j || !j.error) {
      if (res.status === 502) {
        return "Hub gateway timeout (HTTP 502). Cloudflare often drops long generations (~100s) — retry or use Continue scene.";
      }
      if (res.status === 504) {
        return "Gateway timeout (HTTP 504) — generation took too long. Use Continue scene for another hop.";
      }
      return `Beta-test failed (HTTP ${res.status}).`;
    }
    const code = String(j.error);
    if (code === "beta_all_models_failed") {
      return [j.hint || "All models failed.", j.detail].filter(Boolean).join(" — ").slice(0, 800);
    }
    if (code.startsWith("openrouter_http_")) {
      const st = code.replace("openrouter_http_", "");
      if (st === "429") return "OpenRouter rate limit (429) — wait or pick a paid model.";
      if (st === "402") return "OpenRouter credits/reservation exhausted (402).";
      if (st === "401" || st === "403") return `OpenRouter auth failed (${st}).`;
      return `OpenRouter upstream error (HTTP ${st})${j.detail ? ` — ${String(j.detail).slice(0, 160)}` : ""}`;
    }
    if (code === "openrouter_timeout") {
      return "OpenRouter timed out (120s per hop). Try Continue scene or a shorter prompt.";
    }
    if (code === "empty_model_reply") {
      return "Model returned an empty reply — retry or switch model.";
    }
    return [j.hint || code, j.detail].filter(Boolean).join(" — ").slice(0, 800);
  }

  function matchSmart(file, q) {
    if (!q) return true;
    const raw = q.trim().toLowerCase();
    if (!raw) return true;
    const hay = [
      file.label,
      file.name,
      file.path,
      file.kind,
      file.sex || "",
      file.role || "",
      file.pronouns || "",
      file.status || "",
      ...(file.tags || []),
      ...(file.mentions || []).map((m) => `@${m}`),
      ...(file.aliases || []),
      file.id || "",
    ]
      .join(" ")
      .toLowerCase();

    // facet: kind:character / sex:female / role:… / tag:foo / @entity / draft / canon / character
    const tokens = raw.split(/\s+/).filter(Boolean);
    for (const tok of tokens) {
      if (tok === "draft") {
        if (!file.draft) return false;
        continue;
      }
      if (tok === "canon") {
        if (file.draft) return false;
        continue;
      }
      if (tok === "character" || tok === "sheet") {
        if (!file.character && (file.kind || "").toLowerCase() !== "character" && !/\/characters\//i.test(file.path || "")) {
          return false;
        }
        continue;
      }
      if (tok.startsWith("kind:")) {
        const want = tok.slice(5);
        const kind = (file.kind || "").toLowerCase();
        if (want === "character") {
          if (
            kind !== "character" &&
            !file.character &&
            !/\/characters\//i.test(file.path || "")
          ) {
            return false;
          }
        } else if (kind !== want) {
          return false;
        }
        continue;
      }
      if (tok.startsWith("sex:")) {
        if ((file.sex || "").toLowerCase() !== tok.slice(4)) return false;
        continue;
      }
      if (tok.startsWith("role:")) {
        const want = tok.slice(5);
        if (!(file.role || "").toLowerCase().includes(want) && !hay.includes(want)) return false;
        continue;
      }
      if (tok.startsWith("tag:")) {
        if (!(file.tags || []).includes(tok.slice(4))) return false;
        continue;
      }
      if (tok.startsWith("status:")) {
        if ((file.status || "").toLowerCase() !== tok.slice(7)) return false;
        continue;
      }
      if (tok.startsWith("@")) {
        const tip = tok.slice(1);
        const aliasHit = (file.aliases || []).map((a) => String(a).toLowerCase()).includes(tip);
        const idHit = (file.id || "").toLowerCase() === tip || (file.mentions || []).includes(tip);
        if (!aliasHit && !idHit && !hay.includes(tip)) return false;
        continue;
      }
      // free text — all tokens must appear
      if (!hay.includes(tok)) return false;
    }
    return true;
  }

  function filterFiles(files) {
    let out = files || [];
    if (docsCampaignFilter) {
      out = out.filter(
        (f) =>
          f.campaign === docsCampaignFilter ||
          f.path.includes(`campaigns/${docsCampaignFilter}/`) ||
          (docsCampaignFilter === "infranet" && f.path.startsWith("docs/infranet/")) ||
          (docsCampaignFilter === "infranet-eng" && f.path.startsWith("projects/infranet/"))
      );
    }
    const text = docsTextFilter.trim().toLowerCase();
    if (text) {
      out = out.filter((f) =>
        `${f.label} ${f.name} ${f.path}`.toLowerCase().includes(text)
      );
    }
    if (docsSmartQuery.trim()) out = out.filter((f) => matchSmart(f, docsSmartQuery));
    return out;
  }

  function collectMatchingPaths(files) {
    return new Set(filterFiles(files).map((f) => f.path));
  }

  function renderTreeNode(node, matching, depth) {
    const parts = [];
    const folderOpen = !docsCollapsed.has(node.id);
    const childFolders = (node.children || []).filter((c) => folderHasMatch(c, matching));
    const docs = (node.docs || []).filter((d) => matching.has(d.path || d.id));
    if (!childFolders.length && !docs.length && node.kind !== "campaign") return "";

    if (node.kind === "folder" || node.kind === "campaign") {
      const label = node.kind === "campaign" ? node.label : node.label;
      const count = countDocs(node, matching);
      parts.push(`<details class="docs-folder" data-id="${esc(node.id)}" ${folderOpen ? "open" : ""} style="margin-left:${Math.max(0, depth - 1) * 0.55}rem">
        <summary><span class="docs-folder-label">${esc(label)}</span> <span class="meta">${count}</span></summary>
        <div class="docs-folder-body">`);
      for (const c of childFolders) parts.push(renderTreeNode(c, matching, depth + 1));
      for (const d of docs) {
        const active = docsSelected && docsSelected.path === d.path;
        const badge = d.draft
          ? '<span class="docs-badge draft">draft</span>'
          : '<span class="docs-badge canon">canon</span>';
        const charBadge =
          d.character || (d.kind || "").toLowerCase() === "character" || /\/characters\//i.test(d.path || "")
            ? '<span class="docs-badge" style="border-color:#c9a0dc;color:#c9a0dc">char</span>'
            : "";
        parts.push(`<button type="button" class="docs-doc-btn${active ? " active" : ""}" data-path="${esc(d.path)}" data-campaign="${esc(d.campaign || (d.path || "").split("/")[1] || "")}" data-label="${esc(d.label || d.name)}">
          <strong>${esc(d.label || d.name)}</strong> ${badge}${charBadge}
          <div class="sub">${esc((d.path || "").split("/").slice(2).join("/"))}${d.mtime ? ` · ${esc(fmtDocMtime(d.mtime))}` : ""}</div>
        </button>`);
      }
      parts.push(`</div></details>`);
    }
    return parts.join("");
  }

  function folderHasMatch(node, matching) {
    if ((node.docs || []).some((d) => matching.has(d.path || d.id))) return true;
    return (node.children || []).some((c) => folderHasMatch(c, matching));
  }

  function countDocs(node, matching) {
    let n = (node.docs || []).filter((d) => matching.has(d.path || d.id)).length;
    for (const c of node.children || []) n += countDocs(c, matching);
    return n;
  }

  function bindTreeRetry(root) {
    const btn = root && root.querySelector("#docs-tree-retry");
    if (btn) btn.onclick = () => loadTree();
  }

  function showTreeError(root, msg) {
    setDocsStatus(`Tree failed · ${msg}`, { error: true });
    if (!root) return;
    root.innerHTML = `<p class="empty docs-status-error">Tree failed: ${esc(msg)}<br/>
      <span class="meta">Last step: ${esc(docsLastStep)}</span><br/>
      <button type="button" class="btn" id="docs-tree-retry">Retry</button></p>`;
    bindTreeRetry(root);
  }

  function fmtDocMtime(mtime) {
    if (!mtime) return "";
    try {
      if (typeof fmtEtDate === "function") return fmtEtDate(mtime);
      if (typeof fmtEt === "function") return fmtEt(mtime);
      return new Date(mtime).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return String(mtime).slice(0, 10);
    }
  }

  function fileGroupId(f) {
    if (f.group) return f.group;
    if (f.character || (f.kind || "").toLowerCase() === "character" || /\/characters\//i.test(f.path || "")) {
      return "characters";
    }
    const p = f.path || "";
    if (/\/reports\//i.test(p)) return "reports";
    if (/\/notes\//i.test(p)) return "notes";
    if (/\/story\//i.test(p) || /\/lore\//i.test(p) || /\/wiki\//i.test(p) || /\/worldbuilding\//i.test(p)) {
      return "story";
    }
    if (/^campaigns\/[^/]+\/(SETTING-|LOCKS)/i.test(p)) return "story";
    if (/\/places\//i.test(p) || /\/Organizations\//i.test(p) || /\/Plot Lines\//i.test(p) || /Things and Places/i.test(p)) {
      return "world";
    }
    return "other";
  }

  function renderFlatDocs(docs, matching) {
    return docs
      .filter((d) => matching.has(d.path || d.id))
      .map((d) => {
        const active = docsSelected && docsSelected.path === d.path;
        const badge = d.draft
          ? '<span class="docs-badge draft">draft</span>'
          : '<span class="docs-badge canon">canon</span>';
        const charBadge =
          d.character || (d.kind || "").toLowerCase() === "character" || /\/characters\//i.test(d.path || "")
            ? '<span class="docs-badge" style="border-color:#c9a0dc;color:#c9a0dc">char</span>'
            : "";
        return `<button type="button" class="docs-doc-btn${active ? " active" : ""}" data-path="${esc(d.path)}" data-campaign="${esc(d.campaign || (d.path || "").split("/")[1] || "")}" data-label="${esc(d.label || d.name)}">
          <strong>${esc(d.label || d.name)}</strong> ${badge}${charBadge}
          <div class="sub">${esc((d.path || "").split("/").slice(2).join("/"))}${d.mtime ? ` · ${esc(fmtDocMtime(d.mtime))}` : ""}</div>
        </button>`;
      })
      .join("");
  }

  function renderRecentDocs(files, matching, limit = 10) {
    const recent = [...files]
      .filter((d) => matching.has(d.path || d.id))
      .sort((a, b) => (b.mtime || "").localeCompare(a.mtime || ""))
      .slice(0, limit);
    if (!recent.length) return "";
    const paths = new Set(recent.map((d) => d.path || d.id));
    return `<details class="docs-folder docs-recent-block" open>
      <summary><span class="docs-folder-label">Recently updated</span> <span class="meta">${recent.length}</span></summary>
      <div class="docs-folder-body">${renderFlatDocs(recent, paths)}</div>
    </details>`;
  }

  function renderTree() {
    const root = $("docs-tree");
    if (!root || !docsCatalog) return;
    const scrollY = root.scrollTop;
    const campSelect = $("docs-campaign");
    if (campSelect && !campSelect.dataset.ready) {
      const camps = docsCatalog.campaigns || [];
      const active = camps.filter((c) => !c.archived);
      const archived = camps.filter((c) => c.archived);
      // Also offer SpaceQuest even if not in current catalog (All hides archived)
      const hasSq = camps.some((c) => c.campaign === "spacequest");
      campSelect.innerHTML =
        `<option value="">All scopes (active)</option>` +
        active
          .map((c) => `<option value="${esc(c.campaign)}">${esc(c.label)}</option>`)
          .join("") +
        `<optgroup label="Archived">` +
        (hasSq
          ? archived
              .map((c) => `<option value="${esc(c.campaign)}">${esc(c.label)} (archived)</option>`)
              .join("")
          : `<option value="spacequest">SpaceQuest / Space Base (archived)</option>`) +
        `</optgroup>`;
      campSelect.dataset.ready = "1";
      const pending = campSelect.dataset.pendingScope || "";
      if (pending) {
        docsCampaignFilter = pending;
        try { sessionStorage.removeItem("linuxbox-docs-scope"); } catch { /* ignore */ }
        delete campSelect.dataset.pendingScope;
      } else {
        try {
          const stored = sessionStorage.getItem("linuxbox-docs-scope");
          if (stored && !docsCampaignFilter) docsCampaignFilter = stored;
        } catch { /* ignore */ }
      }
      campSelect.value = docsCampaignFilter;
    }
    const allFiles = (docsCatalog.campaigns || []).flatMap((c) => c.files || []);
    const matching = collectMatchingPaths(allFiles);
    const meta = $("docs-tree-meta");
    if (meta) meta.textContent = `${matching.size} / ${allFiles.length} docs`;

    let html = "";
    let campIdx = 0;
    for (const camp of docsCatalog.campaigns || []) {
      if (docsCampaignFilter && camp.campaign !== docsCampaignFilter) continue;
      const files = (camp.files || []).filter((f) => matching.has(f.path || f.id));
      if (!files.length && (docsTextFilter || docsSmartQuery)) continue;
      const sepClass = campIdx === 0 ? "docs-camp-block" : "docs-camp-block docs-camp-sep";
      campIdx += 1;
      const arch = camp.archived ? ' <span class="docs-badge">archived</span>' : "";
      html += `<div class="${sepClass}" data-campaign="${esc(camp.campaign)}">
        <div class="docs-camp-head">${esc(camp.label || camp.campaign)}${arch}</div>`;
      html += renderRecentDocs(files, matching);
      for (const g of DOC_GROUP_ORDER) {
        const gFiles = files.filter((f) => fileGroupId(f) === g.id);
        if (!gFiles.length) continue;
        const gid = `${camp.campaign}::${g.id}`;
        const open = !docsCollapsed.has(gid);
        html += `<details class="docs-folder docs-kind-group" data-id="${esc(gid)}" ${open ? "open" : ""}>
          <summary><span class="docs-folder-label">${esc(g.label)}</span> <span class="meta">${gFiles.length}</span></summary>
          <div class="docs-folder-body">${renderFlatDocs(gFiles, matching)}</div>
        </details>`;
      }
      html += `</div>`;
    }
    if (!html) {
      root.innerHTML = docsTextFilter || docsSmartQuery
        ? `<p class="empty">No docs match filters</p>`
        : `<p class="empty">No docs indexed</p>`;
      return;
    }
    root.innerHTML = html;
    root.querySelectorAll(".docs-doc-btn").forEach((btn) => {
      btn.onclick = () => openDoc(btn.dataset.path, btn.dataset.campaign, btn.dataset.label);
    });
    root.querySelectorAll("details.docs-folder").forEach((det) => {
      det.addEventListener("toggle", () => {
        const id = det.dataset.id;
        if (!id) return;
        if (det.open) docsCollapsed.delete(id);
        else docsCollapsed.add(id);
      });
    });
    root.scrollTop = scrollY;
  }

  /** Active scopes for parallel "All" — SpaceQuest archived; open via Scope. */
  const ALL_SCOPE_IDS = ["tropic-gooner", "nyc-mafia-dnd", "infranet", "infranet-eng"];
  const ARCHIVED_SCOPE_IDS = ["spacequest"];

  async function fetchTreeParallel(signal, gen, root) {
    const campaigns = [];
    let done = 0;
    const total = ALL_SCOPE_IDS.length;
    const results = await Promise.all(
      ALL_SCOPE_IDS.map(async (id) => {
        try {
          const data = await apiGet(`/api/docs/tree?campaign=${encodeURIComponent(id)}`, {
            signal,
            timeoutMs: TREE_TIMEOUT_MS,
          });
          done += 1;
          if (gen === treeLoadGen && root) {
            const n = (data.campaigns || []).reduce((s, c) => s + (c.files || []).length, 0);
            root.innerHTML = `${progressHtml(
              20 + Math.round((done / total) * 55),
              `Fetching tree… ${done}/${total} scopes (${n} files in ${id})`
            )}`;
            setDocsStatus(`Fetching tree… ${done}/${total} · ${id}`, { busy: true });
          }
          return data.campaigns || [];
        } catch (err) {
          done += 1;
          // Only bail the whole batch on intentional abort (campaign change), not per-scope timeout
          if (signal.aborted) throw err;
          if (gen === treeLoadGen) {
            setDocsStatus(`Scope ${id} failed · ${err.message || err}`, { busy: true });
          }
          return [];
        }
      })
    );
    for (const chunk of results) campaigns.push(...chunk);
    return {
      updated_at: new Date().toISOString(),
      file_count: campaigns.reduce((s, c) => s + (c.files || []).length, 0),
      campaigns,
      cached: false,
      parallel: true,
    };
  }

  async function loadTree(opts = {}) {
    const root = $("docs-tree");
    const force = !!opts.force;
    const gen = ++treeLoadGen;
    if (treeAbort) treeAbort.abort();
    treeAbort = new AbortController();
    const signal = treeAbort.signal;

    const cacheKey = docsCampaignFilter || "*";
    if (
      !force &&
      treeCache.key === cacheKey &&
      Date.now() - treeCache.at < TREE_CACHE_MS &&
      treeCache.data
    ) {
      docsCatalog = treeCache.data;
      docsWikiReady = true;
      setDocsStatus("Tree ready (cached)", { busy: false });
      // Re-render only if tree is empty/loading — never wipe scroll on Hub poll
      if (root && (/Loading|Fetching|Rendering/i.test(root.textContent || "") || !root.querySelector(".docs-camp-block, .docs-doc-btn, details.docs-folder"))) {
        try {
          renderTree();
        } catch (err) {
          showTreeError(root, err.message || String(err));
        }
      }
      return;
    }

    const scopeLabel = docsCampaignFilter || "all scopes";
    if (root) {
      root.innerHTML = `${progressHtml(15, `Fetching tree… ${scopeLabel}`)}<p class="empty">Folder index…</p>`;
    }
    setDocsStatus(`Fetching tree… ${scopeLabel}`, { busy: true });

    const watchdog = setTimeout(() => {
      if (gen !== treeLoadGen) return;
      showTreeError(root, "Timed out after 15s (watchdog) — Retry");
    }, 15_000);

    try {
      if (docsCampaignFilter) {
        if (root) root.innerHTML = `${progressHtml(40, `Fetching tree… ${docsCampaignFilter}`)}`;
        docsCatalog = await apiGet(`/api/docs/tree?campaign=${encodeURIComponent(docsCampaignFilter)}`, {
          signal,
          timeoutMs: TREE_TIMEOUT_MS,
        });
      } else {
        if (root) root.innerHTML = `${progressHtml(25, "Fetching tree… 0/" + ALL_SCOPE_IDS.length + " scopes")}`;
        docsCatalog = await fetchTreeParallel(signal, gen, root);
      }
      if (gen !== treeLoadGen) return;
      treeCache = { key: cacheKey, at: Date.now(), data: docsCatalog };
      docsWikiReady = true;
      const n = (docsCatalog.campaigns || []).reduce((s, c) => s + (c.files || []).length, 0);
      setDocsStatus(`Rendering tree… ${n} files`, { busy: true });
      if (root) root.innerHTML = `${progressHtml(80, `Rendering tree… ${n} files`)}`;
      await new Promise((r) => requestAnimationFrame(r));
      if (gen !== treeLoadGen) return;
      renderTree();
      setDocsStatus(`Tree ready · ${n} docs`, { busy: false });
      // ponytail: never auto-open a doc — remount/reader jump was part of the scroll complaint
    } catch (err) {
      if (gen !== treeLoadGen) return;
      showTreeError(root, err.message || String(err));
    } finally {
      clearTimeout(watchdog);
    }
  }

  async function openDoc(docPath, campaign, label) {
    docsSelected = { path: docPath, campaign, label };
    docsMode = "read";
    docsPendingSelection = null;
    docsCommentCompose = null;
    try {
      sessionStorage.setItem("linuxbox-last-docs-path", docPath);
    } catch {
      /* ignore */
    }
    renderTree();
    const reader = $("report-reader");
    if (reader) {
      reader.innerHTML = `${progressHtml(20, "Loading document…")}<div class="empty-state">Fetching doc…</div>`;
    }
    setDocsStatus("Loading document…", { busy: true });
    try {
      setDocsStatus("Fetching doc + comments…", { busy: true });
      const [doc, comments] = await Promise.all([
        apiGet(`/api/docs/doc?path=${encodeURIComponent(docPath)}`, { timeoutMs: DOC_TIMEOUT_MS }),
        apiGet(`/api/docs/comments?path=${encodeURIComponent(docPath)}`, { timeoutMs: DOC_TIMEOUT_MS }),
      ]);
      docsDocState = doc;
      docsComments = comments.comments || [];
      docsVersionPreview = null;
      docsMode = "read";
      await loadVersionsForDoc(docPath);
      setDocsStatus(`Open · ${label || doc.file || "doc"}`, { busy: false });
      renderReader();
    } catch (err) {
      setDocsStatus(`Doc failed · ${err.message}`, { error: true });
      if (reader) {
        reader.innerHTML = `<div class="empty-state">Failed: ${esc(err.message)}<br/><span class="meta">Last step: ${esc(docsLastStep)}</span></div>`;
      }
    }
  }

  function renderCommentCompose() {
    const d = docsCommentCompose;
    if (!d) {
      return `<div class="docs-comment-compose docs-comment-compose--idle" id="docs-comment-compose">
        <p class="meta">Select text → Comment (inline form — no browser popups).</p>
      </div>`;
    }
    return `<div class="docs-comment-compose" id="docs-comment-compose">
      <h3>New comment</h3>
      <blockquote class="docs-comment-excerpt">${esc((d.excerpt || "").slice(0, 220))}</blockquote>
      <label class="meta" for="docs-comment-note">Note</label>
      <textarea id="docs-comment-note" class="docs-comment-ta" rows="3" placeholder="What’s wrong / what to change">${esc(d.note || "")}</textarea>
      <label class="meta" for="docs-comment-suggested">Suggested replacement (optional)</label>
      <textarea id="docs-comment-suggested" class="docs-comment-ta" rows="3" placeholder="Leave blank if none">${esc(d.suggested || "")}</textarea>
      ${d.error ? `<p class="docs-status-error">${esc(d.error)}</p>` : ""}
      <div class="docs-comment-actions">
        <button type="button" class="btn primary" id="docs-comment-save">Save comment</button>
        <button type="button" class="btn" id="docs-comment-cancel">Cancel</button>
      </div>
    </div>`;
  }

  function renderCommentsPanel() {
    const queued = docsComments.filter((c) => c.status === "queued");
    const others = docsComments.filter((c) => c.status !== "queued");
    const rows = [...queued, ...others]
      .map((c) => {
        const excerpt = c.span?.excerpt ? `<blockquote class="docs-comment-excerpt">${esc(c.span.excerpt.slice(0, 180))}</blockquote>` : "";
        const actions =
          c.status === "queued"
            ? `<div class="docs-comment-actions">
                ${c.suggested_text ? `<button type="button" class="btn" data-apply="${esc(c.id)}">Apply suggested</button>` : ""}
                <button type="button" class="btn" data-dismiss="${esc(c.id)}">Dismiss</button>
              </div>`
            : `<div class="meta">status: ${esc(c.status)}</div>`;
        return `<div class="docs-comment" data-id="${esc(c.id)}">
          <div class="docs-comment-note">${esc(c.note)}</div>
          ${excerpt}
          <div class="meta">${esc(fmtTime(c.created_at))}</div>
          ${actions}
        </div>`;
      })
      .join("");
    return `<div class="docs-comments">
      <h3>Comments <span class="meta">${queued.length} queued</span></h3>
      ${renderCommentCompose()}
      ${rows || `<p class="meta">Select text in the doc → Comment</p>`}
    </div>`;
  }

  function bindCommentActions(root) {
    root.querySelectorAll("[data-dismiss]").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await apiSend("POST", `/api/docs/comments/${btn.dataset.dismiss}`, {
            doc_path: docsSelected.path,
            status: "dismissed",
          });
          const comments = await apiGet(`/api/docs/comments?path=${encodeURIComponent(docsSelected.path)}`, {
            timeoutMs: DOC_TIMEOUT_MS,
          });
          docsComments = comments.comments || [];
          renderReader();
        } catch (err) {
          alert(`Dismiss failed: ${err.message}`);
        }
      };
    });
    root.querySelectorAll("[data-apply]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("Apply suggested text to this doc?")) return;
        try {
          await apiSend("POST", `/api/docs/comments/${btn.dataset.apply}`, {
            doc_path: docsSelected.path,
            apply: true,
          });
          treeCache = { key: null, at: 0, data: null };
          graphCache = { key: null, at: 0, data: null };
          await openDoc(docsSelected.path, docsSelected.campaign, docsSelected.label);
        } catch (err) {
          alert(`Apply failed: ${err.message}`);
        }
      };
    });
  }

  function captureSelectionFromProse() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !docsDocState) return null;
    const prose = $("docs-prose");
    if (!prose || !prose.contains(sel.anchorNode)) return null;
    const excerpt = String(sel.toString() || "").trim();
    if (!excerpt) return null;
    const content = docsDocState.content || "";
    const idx = content.indexOf(excerpt);
    const start = idx >= 0 ? idx : 0;
    const end = idx >= 0 ? idx + excerpt.length : excerpt.length;
    return { start, end, excerpt };
  }

  function captureSelectionFromEditor() {
    if (docsMode !== "edit") return null;
    const ta = $("docs-editor");
    if (!ta || ta.selectionStart === ta.selectionEnd) return null;
    const excerpt = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (!String(excerpt).trim()) return null;
    return { start: ta.selectionStart, end: ta.selectionEnd, excerpt };
  }

  function isCharacterDoc(doc) {
    if (!doc) return false;
    return (
      doc.character ||
      (doc.meta && String(doc.meta.kind || "").toLowerCase() === "character") ||
      String(doc.kind || "").toLowerCase() === "character" ||
      /\/characters\//i.test(doc.path || "")
    );
  }

  /**
   * Promote plain SECTION N: lines (Sasha-style sheets) to ATX ## so mdParse
   * emits real <h2> and fold/list logic can find them.
   * ponytail: also break mid-paragraph SECTION onto its own line first.
   */
  function promotePlainSectionHeadings(md) {
    let text = String(md || "");
    // Sasha packs some SECTION headers mid-paragraph — split them out.
    text = text.replace(/([^\n])\s+(SECTION\s+\d+\s*:)/gi, "$1\n$2");
    return text
      .split(/\r?\n/)
      .map((line) => {
        if (/^##\s+/.test(line)) return line;
        const m = line.match(/^(SECTION\s+\d+\s*:\s*.+)$/i);
        if (m) return `## ${m[1].trim()}`;
        return line;
      })
      .join("\n");
  }

  /** ATX ## + promoted SECTION titles for the H2 control list. */
  function extractDocHeadings(md) {
    const titles = [];
    const promoted = promotePlainSectionHeadings(md);
    for (const line of String(promoted || "").split(/\r?\n/)) {
      const atx = line.match(/^##\s+(.+?)\s*$/);
      if (!atx) continue;
      const title = atx[1].replace(/\s+#+\s*$/, "").trim();
      if (title) titles.push(title);
    }
    return titles;
  }

  function renderH2Bar(md) {
    const titles = extractDocHeadings(md || "");
    if (!titles.length) {
      return `<div class="docs-h2-bar" id="docs-h2-bar" data-count="0">
        <div class="docs-h2-bar-head"><span class="docs-h2-label">H2s</span></div>
        <p class="meta docs-h2-empty">No headings in this doc</p>
      </div>`;
    }
    const items = titles
      .map(
        (t, i) =>
          `<li><button type="button" class="docs-h2-jump" data-h2-idx="${i}">${esc(t.slice(0, 80))}</button></li>`
      )
      .join("");
    return `<div class="docs-h2-bar" id="docs-h2-bar" data-count="${titles.length}">
      <div class="docs-h2-bar-head">
        <span class="docs-h2-label">H2s <span class="meta">${titles.length}</span></span>
        <button type="button" class="btn" id="docs-btn-collapse" title="Collapse/expand H2 sections">Collapse H2s</button>
      </div>
      <ol class="docs-h2-list">${items}</ol>
    </div>`;
  }

  function collapsibleProseHtml(md) {
    const prepared = promotePlainSectionHeadings(md || "");
    const raw = typeof mdParse === "function" ? mdParse(prepared) : esc(prepared);
    // Wrap consecutive h2+siblings into details for long sheets
    const wrap = document.createElement("div");
    wrap.innerHTML = raw;
    const kids = [...wrap.childNodes];
    const out = document.createElement("div");
    let bucket = null;
    let summaryEl = null;
    let h2Idx = 0;
    const flush = () => {
      if (!bucket) return;
      const det = document.createElement("details");
      det.className = "docs-h2-fold";
      det.open = true;
      det.dataset.h2Idx = String(h2Idx++);
      const sum = document.createElement("summary");
      sum.appendChild(summaryEl);
      det.appendChild(sum);
      const body = document.createElement("div");
      body.className = "docs-h2-fold-body";
      bucket.forEach((n) => body.appendChild(n));
      det.appendChild(body);
      out.appendChild(det);
      bucket = null;
      summaryEl = null;
    };
    for (const node of kids) {
      if (node.nodeType === 1 && /^H2$/i.test(node.tagName)) {
        flush();
        summaryEl = node;
        bucket = [];
        continue;
      }
      if (bucket) bucket.push(node);
      else out.appendChild(node);
    }
    flush();
    return out.innerHTML || raw;
  }

  function renderVersionBar() {
    const n = docsVersions.length;
    if (!n) {
      return `<div class="docs-version-bar meta">No prior versions yet (saved after this build).</div>`;
    }
    const idx = docsVersionPreview
      ? Math.max(0, docsVersions.findIndex((v) => v.id === docsVersionPreview.id))
      : n; // n = current (live)
    const max = n;
    const label = docsVersionPreview
      ? `Preview ${docsVersionPreview.id}`
      : "Current";
    return `<div class="docs-version-bar">
      <label class="meta" for="docs-version-slider">History (${n})</label>
      <input type="range" id="docs-version-slider" min="0" max="${max}" value="${idx < 0 ? max : idx}" />
      <span class="meta" id="docs-version-label">${esc(label)}</span>
      ${docsVersionPreview ? `<button type="button" class="btn" id="docs-version-restore">Restore this</button>
        <button type="button" class="btn" id="docs-version-current">Back to current</button>` : ""}
    </div>`;
  }

  function renderBetaPanel() {
    const pathHint = docsDocState?.path || "";
    const sceneText = loadBetaScenario(pathHint);
    loadBetaHistory(pathHint);
    if (!docsBetaBusy) docsBetaTruncated = loadBetaTruncated(pathHint);
    const threadMd = betaThreadMarkdown(docsBetaHistory);
    const outFresh = docsBetaReply && !docsBetaBusy ? " docs-beta-out--fresh" : "";
    const hasThread = docsBetaHistory.length > 0;
    const canContinue = betaCanContinue(pathHint);
    return `<div class="docs-beta-panel" id="docs-beta-panel">
      <div class="docs-toolbar">
        <div class="docs-toolbar-left">
          <div class="doc-title docs-beta-heading">Beta-test character</div>
          <div class="meta">Engine guts · OpenRouter · not Pixi RP :8767 · ${esc(pathHint)}</div>
        </div>
        <button type="button" class="btn" id="docs-beta-back">← Sheet</button>
      </div>
      <label class="docs-beta-scenario-label" for="docs-beta-scenario">${hasThread ? "Opening scenario (read-only after first run — use follow-up below)" : "Opening scenario"}</label>
      <textarea id="docs-beta-scenario" class="docs-editor docs-beta-scenario" rows="4" spellcheck="true" ${hasThread ? "readonly" : ""}>${esc(sceneText)}</textarea>
      <div class="docs-beta-run-row">
        <div class="docs-beta-run-left">
          <button type="button" class="btn primary" id="docs-beta-run" ${docsBetaBusy ? "disabled" : ""}>${docsBetaBusy ? "Running…" : hasThread ? "Re-run opening" : "Run scene"}</button>
          ${hasThread ? `<button type="button" class="btn" id="docs-beta-new" ${docsBetaBusy ? "disabled" : ""}>New scene</button>` : ""}
          <span class="meta docs-beta-hint">Ctrl+Enter = run · follow-up below to continue chat</span>
        </div>
        <div class="docs-beta-model-wrap">
          <label class="meta" for="docs-beta-model">Model</label>
          <select id="docs-beta-model" class="docs-beta-model-select" title="Explicit pick sticks — Auto uses free-first chain then DeepSeek">
            <option value="auto">Auto · free-first</option>
          </select>
          <span class="meta docs-beta-model-active" id="docs-beta-model-active"></span>
        </div>
      </div>
      ${docsBetaError ? `<p class="docs-status-error">${esc(docsBetaError)}</p>` : ""}
      <div class="docs-beta-out prose${outFresh}" id="docs-beta-out">${threadMd ? mdParse(threadMd) : "<p class=\"meta\">Scene thread appears here after Run scene.</p>"}</div>
      <div class="docs-beta-follow-row">
        <label class="docs-beta-scenario-label" for="docs-beta-followup">Follow-up (player action / direction)</label>
        <textarea id="docs-beta-followup" class="docs-editor docs-beta-followup" rows="2" spellcheck="true" placeholder="I say… / I do…"></textarea>
        <div class="docs-beta-follow-actions">
          <button type="button" class="btn primary" id="docs-beta-send" ${docsBetaBusy || !hasThread ? "disabled" : ""}>Send</button>
          <button type="button" class="btn" id="docs-beta-continue" ${docsBetaBusy || !canContinue ? "disabled" : ""} title="Append when output hit token limit">${docsBetaBusy ? "Continuing…" : "Continue scene"}</button>
        </div>
      </div>
    </div>`;
  }

  function renderDiffPanel() {
    const d = docsPendingDiff;
    if (!d) return `<p class="empty">No pending diff</p>`;
    return `<div class="docs-diff-panel">
      <div class="docs-toolbar">
        <div class="docs-toolbar-left">
          <div class="doc-title">Review changes</div>
          <div class="meta">${esc(d.reason || "save")} · Accept writes + versions prior</div>
        </div>
        <div class="docs-toolbar-right">
          <button type="button" class="btn" id="docs-diff-cancel">Cancel</button>
          <button type="button" class="btn primary" id="docs-diff-accept">Accept</button>
        </div>
      </div>
      <pre class="docs-diff-pre">${esc(d.diff || "")}</pre>
    </div>`;
  }

  async function loadVersionsForDoc(docPath) {
    try {
      const v = await apiGet(`/api/docs/versions?path=${encodeURIComponent(docPath)}`, {
        timeoutMs: DOC_TIMEOUT_MS,
      });
      docsVersions = v.versions || [];
    } catch {
      docsVersions = [];
    }
  }

  function renderReader() {
    const reader = $("report-reader");
    if (!reader || !docsDocState) return;
    const readerScroll = reader.querySelector(".prose, .docs-editor, .docs-beta-out")?.scrollTop || 0;

    if (docsMode === "graph") {
      renderGraph(reader);
      return;
    }
    if (docsMode === "beta") {
      reader.innerHTML = renderBetaPanel();
      const pathHint = docsDocState?.path || "";
      const scenarioEl = $("docs-beta-scenario");
      const followEl = $("docs-beta-followup");
      if (scenarioEl) {
        if (!scenarioEl.readOnly) {
          scenarioEl.oninput = () => saveBetaScenario(pathHint, scenarioEl.value);
        }
        scenarioEl.onkeydown = (ev) => {
          if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
            ev.preventDefault();
            $("docs-beta-run")?.click();
          }
        };
      }
      if (followEl) {
        followEl.onkeydown = (ev) => {
          if (ev.key === "Enter" && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
            ev.preventDefault();
            $("docs-beta-send")?.click();
          }
        };
      }
      $("docs-beta-back").onclick = () => {
        if (scenarioEl && !scenarioEl.readOnly) saveBetaScenario(pathHint, scenarioEl.value);
        docsMode = "read";
        renderReader();
      };
      const modelSel = $("docs-beta-model");
      populateBetaModelSelect(loadBetaModelPick());
      ensureBetaCatalog().then((ok) => {
        if (ok) populateBetaModelSelect(loadBetaModelPick());
      });
      if (modelSel) {
        modelSel.onchange = () => {
          saveBetaModelPick(modelSel.value);
          updateBetaModelActiveLabel();
        };
      }

      async function runBetaRequest({ scenario, continueScene = false, resetHistory = false }) {
        const modelPick = modelSel?.value || loadBetaModelPick() || "auto";
        saveBetaModelPick(modelPick);
        if (scenarioEl && !scenarioEl.readOnly) saveBetaScenario(pathHint, scenarioEl.value);

        docsBetaBusy = true;
        docsBetaError = "";
        setBetaBusyControls(true);

        const modelLabel =
          modelPick === "auto"
            ? "Auto"
            : modelSel?.selectedOptions?.[0]?.textContent?.split(" (")[0] || modelPick;
        setDocsStatus(
          `Beta-test ${continueScene ? "continuing" : "running"} · ${modelLabel}…`,
          { busy: true }
        );

        try {
          const history = resetHistory ? [] : loadBetaHistory(pathHint).slice();
          const payload = {
            path: docsDocState.path,
            history,
            max_tokens: 4096,
            // Single OR hop per request — Continue scene button adds hops (CF tunnel ~100s cap).
            max_continues: 0,
          };
          if (continueScene) {
            payload.continue_scene = true;
            if (modelPick && modelPick !== "auto") payload.model = modelPick;
            else if (docsBetaLastModel) payload.model = docsBetaLastModel;
          } else if (scenario) {
            payload.scenario = scenario;
            if (modelPick && modelPick !== "auto") payload.model = modelPick;
          } else if (modelPick && modelPick !== "auto") {
            payload.model = modelPick;
          }

          const out = await apiSend("POST", "/api/docs/character-beta", payload);
          docsBetaHistory = Array.isArray(out.history) ? out.history : history;
          saveBetaHistory(pathHint, docsBetaHistory);
          docsBetaReply = out.reply || "";
          saveBetaTruncated(pathHint, out.truncated);
          docsBetaError = "";
          docsBetaLastModel = out.model || modelPick;
          const contNote = out.auto_continues ? ` · +${out.auto_continues} auto-continue` : "";
          const truncNote = docsBetaTruncated ? " · hit limit — Continue scene" : "";
          setDocsStatus(`Beta-test ok · ${out.model || "model"}${contNote}${truncNote}`, {
            busy: false,
          });
          if (followEl && !continueScene) followEl.value = "";
        } catch (err) {
          docsBetaError = err.message || String(err);
          setDocsStatus(`Beta-test failed · ${docsBetaError}`, { error: true, busy: false });
        } finally {
          docsBetaBusy = false;
          try {
            renderReader();
          } catch (renderErr) {
            setDocsStatus(`Beta-test UI refresh failed · ${renderErr.message || renderErr}`, {
              error: true,
              busy: false,
            });
          }
          const outEl = $("docs-beta-out");
          if (outEl) outEl.scrollTop = outEl.scrollHeight;
        }
      }

      $("docs-beta-run").onclick = async () => {
        const scenario = (scenarioEl?.value || "").trim();
        if (!scenario) {
          alert("Enter an opening scenario first.");
          return;
        }
        const hasThread = loadBetaHistory(pathHint).length > 0;
        if (hasThread && !confirm("Re-run opening scenario? This clears the current thread.")) return;
        clearBetaThread(pathHint);
        await runBetaRequest({ scenario, resetHistory: true });
      };
      $("docs-beta-new")?.addEventListener("click", () => {
        if (!confirm("Clear thread and start a new scene?")) return;
        clearBetaThread(pathHint);
        if (scenarioEl) {
          scenarioEl.readOnly = false;
          scenarioEl.value = loadBetaScenario(pathHint);
        }
        renderReader();
      });
      $("docs-beta-send")?.addEventListener("click", async () => {
        const follow = (followEl?.value || "").trim();
        if (!follow) {
          alert("Enter a follow-up action or line first.");
          return;
        }
        if (!loadBetaHistory(pathHint).length) {
          alert("Run scene first to start the thread.");
          return;
        }
        await runBetaRequest({ scenario: follow });
      });
      $("docs-beta-continue")?.addEventListener("click", async () => {
        if (!betaCanContinue(pathHint)) return;
        await runBetaRequest({ continueScene: true });
      });
      return;
    }
    if (docsMode === "diff") {
      reader.innerHTML = renderDiffPanel();
      $("docs-diff-cancel").onclick = () => {
        docsPendingDiff = null;
        docsMode = "edit";
        renderReader();
      };
      $("docs-diff-accept").onclick = async () => {
        const d = docsPendingDiff;
        if (!d) return;
        setDocsStatus("Saving…", { busy: true });
        try {
          const saved = await apiSend("PUT", "/api/docs/doc", {
            path: docsDocState.path,
            content: d.after,
            base_hash: docsDocState.hash,
          });
          docsDocState = saved;
          docsPendingDiff = null;
          docsMode = "read";
          docsVersionPreview = null;
          treeCache = { key: null, at: 0, data: null };
          await loadVersionsForDoc(docsDocState.path);
          setDocsStatus("Saved", { busy: false });
          renderReader();
        } catch (err) {
          setDocsStatus(`Save failed · ${err.message}`, { error: true });
          alert(`Save failed: ${err.message}`);
        }
      };
      return;
    }

    const title = docsSelected?.label || docsDocState.file;
    const pathHint = docsDocState.path;
    const dirtyHint = docsMode === "edit" ? " · editing" : "";
    const charDoc = isCharacterDoc(docsDocState);
    const viewContent = docsVersionPreview ? docsVersionPreview.content : docsDocState.content || "";
    const toolbar = `<div class="docs-toolbar">
      <div class="docs-toolbar-left">
        <div class="doc-title">${esc(title)}${dirtyHint}</div>
        <div class="meta">${esc(pathHint)}${docsDocState.draft ? " · draft" : " · canon"}</div>
      </div>
      <div class="docs-toolbar-right">
        <button type="button" class="btn" id="docs-btn-resolve" title="Jump to @slug sheet">@ resolve</button>
        ${charDoc ? `<button type="button" class="btn primary" id="docs-btn-beta" title="Run scene with sheet inject (engine guts)">Beta-test</button>` : ""}
        ${charDoc ? `<button type="button" class="btn" id="docs-btn-propose" title="Propose updates from reports">Promote from reports</button>` : ""}
        <button type="button" class="btn" id="docs-btn-comment" title="Comment on selection (inline form)">Comment</button>
        ${docsDocState.writable ? `<button type="button" class="btn" id="docs-btn-edit">${docsMode === "edit" ? "Preview" : "Edit"}</button>` : ""}
        ${docsMode === "edit" ? `<button type="button" class="btn primary" id="docs-btn-save">Save…</button>` : ""}
        <button type="button" class="btn" id="docs-btn-graph">Visualize</button>
      </div>
    </div>${renderVersionBar()}${renderH2Bar(viewContent)}`;

    let body;
    if (docsMode === "edit" && !docsVersionPreview) {
      body = `<textarea id="docs-editor" class="docs-editor" spellcheck="true">${esc(docsDocState.content || "")}</textarea>
        <div class="meta" id="docs-edit-hint">Save opens a diff to Accept. Versions snapshotted under agents/state/doc-versions/.</div>`;
    } else {
      // Docs reader always fills the main pane (CSS also forces max-width:none).
      // Global size-width 68ch must not squeeze sheets into a skinny left strip.
      body = `<div class="prose prose-full" id="docs-prose">${collapsibleProseHtml(viewContent)}</div>`;
    }

    reader.innerHTML = `${toolbar}<div class="docs-reader-split">${body}${renderCommentsPanel()}</div>`;
    enhanceWikiEntityLinks(reader);

    const slider = $("docs-version-slider");
    if (slider) {
      slider.oninput = async () => {
        const v = Number(slider.value);
        if (v >= docsVersions.length) {
          docsVersionPreview = null;
          docsMode = "read";
          renderReader();
          return;
        }
        const meta = docsVersions[v];
        if (!meta) return;
        try {
          const got = await apiGet(
            `/api/docs/version?path=${encodeURIComponent(docsDocState.path)}&id=${encodeURIComponent(meta.id)}`,
            { timeoutMs: DOC_TIMEOUT_MS }
          );
          docsVersionPreview = { id: meta.id, content: got.content || "" };
          docsMode = "read";
          renderReader();
        } catch (err) {
          alert(`Version read failed: ${err.message}`);
        }
      };
    }
    const restoreBtn = $("docs-version-restore");
    if (restoreBtn) {
      restoreBtn.onclick = async () => {
        if (!docsVersionPreview) return;
        if (!confirm(`Restore ${docsVersionPreview.id}? Current will be versioned first.`)) return;
        try {
          const saved = await apiSend("POST", "/api/docs/restore-version", {
            path: docsDocState.path,
            id: docsVersionPreview.id,
          });
          docsDocState = saved;
          docsVersionPreview = null;
          await loadVersionsForDoc(docsDocState.path);
          renderReader();
        } catch (err) {
          alert(`Restore failed: ${err.message}`);
        }
      };
    }
    const curBtn = $("docs-version-current");
    if (curBtn) {
      curBtn.onclick = () => {
        docsVersionPreview = null;
        renderReader();
      };
    }

    const editBtn = $("docs-btn-edit");
    if (editBtn) {
      editBtn.onclick = () => {
        if (docsMode === "edit") {
          const ta = $("docs-editor");
          if (ta) docsDocState.content = ta.value;
          docsMode = "read";
        } else {
          docsVersionPreview = null;
          docsMode = "edit";
        }
        renderReader();
      };
    }
    const saveBtn = $("docs-btn-save");
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const ta = $("docs-editor");
        const content = ta ? ta.value : docsDocState.content;
        const before = docsDocState.content || "";
        if (content === before) {
          alert("No changes.");
          return;
        }
        const linesA = before.split(/\r?\n/);
        const linesB = String(content).split(/\r?\n/);
        const diffLines = ["--- before", "+++ after"];
        const max = Math.max(linesA.length, linesB.length);
        for (let i = 0; i < max && diffLines.length < 400; i++) {
          if (linesA[i] === linesB[i]) diffLines.push(` ${linesA[i] ?? ""}`);
          else {
            if (i < linesA.length) diffLines.push(`-${linesA[i]}`);
            if (i < linesB.length) diffLines.push(`+${linesB[i]}`);
          }
        }
        docsPendingDiff = {
          before,
          after: content,
          reason: "save",
          diff: diffLines.join("\n"),
        };
        docsMode = "diff";
        renderReader();
      };
    }
    const commentBtn = $("docs-btn-comment");
    if (commentBtn) {
      commentBtn.onclick = () => {
        let sel = docsPendingSelection;
        if (docsMode === "edit") {
          sel = captureSelectionFromEditor() || sel;
        } else {
          sel = captureSelectionFromProse() || sel;
        }
        if (!sel || !sel.excerpt) {
          docsCommentCompose = {
            start: 0,
            end: 0,
            excerpt: "",
            note: "",
            suggested: "",
            error: "Select a text snippet first, then click Comment.",
          };
          renderReader();
          return;
        }
        docsPendingSelection = sel;
        docsCommentCompose = {
          start: sel.start,
          end: sel.end,
          excerpt: sel.excerpt,
          note: "",
          suggested: "",
          error: "",
        };
        renderReader();
        $("docs-comment-note")?.focus();
      };
    }
    const commentSave = $("docs-comment-save");
    if (commentSave) {
      commentSave.onclick = async () => {
        const noteEl = $("docs-comment-note");
        const sugEl = $("docs-comment-suggested");
        const note = String(noteEl?.value || "").trim();
        if (!docsCommentCompose || !docsCommentCompose.excerpt) {
          if (docsCommentCompose) {
            docsCommentCompose.error = "Select a text snippet first, then click Comment.";
            renderReader();
          }
          return;
        }
        if (!note) {
          docsCommentCompose.note = noteEl?.value || "";
          docsCommentCompose.suggested = sugEl?.value || "";
          docsCommentCompose.error = "Comment note is required.";
          renderReader();
          return;
        }
        const suggested = String(sugEl?.value || "").trim();
        try {
          await apiSend("POST", "/api/docs/comments", {
            doc_path: docsDocState.path,
            start: docsCommentCompose.start,
            end: docsCommentCompose.end,
            excerpt: docsCommentCompose.excerpt,
            note,
            suggested_text: suggested || null,
          });
          const comments = await apiGet(`/api/docs/comments?path=${encodeURIComponent(docsDocState.path)}`, {
            timeoutMs: DOC_TIMEOUT_MS,
          });
          docsComments = comments.comments || [];
          docsPendingSelection = null;
          docsCommentCompose = null;
          setDocsStatus("Comment saved", { busy: false });
          renderReader();
        } catch (err) {
          docsCommentCompose.note = note;
          docsCommentCompose.suggested = suggested;
          docsCommentCompose.error = `Comment failed: ${err.message}`;
          renderReader();
        }
      };
    }
    const commentCancel = $("docs-comment-cancel");
    if (commentCancel) {
      commentCancel.onclick = () => {
        docsCommentCompose = null;
        renderReader();
      };
    }
    const graphBtn = $("docs-btn-graph");
    if (graphBtn) {
      graphBtn.onclick = () => {
        docsMode = "graph";
        renderReader();
      };
    }
    const collapseBtn = $("docs-btn-collapse");
    if (collapseBtn) {
      collapseBtn.onclick = () => {
        const folds = reader.querySelectorAll("details.docs-h2-fold");
        if (!folds.length) {
          setDocsStatus("No H2 folds in preview (edit mode or no headings)", { busy: false });
          return;
        }
        const anyOpen = [...folds].some((d) => d.open);
        folds.forEach((d) => {
          d.open = !anyOpen;
        });
      };
    }
    reader.querySelectorAll(".docs-h2-jump").forEach((btn) => {
      btn.onclick = () => {
        const idx = btn.dataset.h2Idx;
        const fold = reader.querySelector(`details.docs-h2-fold[data-h2-idx="${idx}"]`);
        if (!fold) {
          setDocsStatus("Heading only in source — switch to Preview to jump", { busy: false });
          return;
        }
        fold.open = true;
        fold.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
    });
    const proseEl = reader.querySelector("#docs-prose");
    if (proseEl) {
      proseEl.addEventListener("mouseup", () => {
        const sel = captureSelectionFromProse();
        if (sel) docsPendingSelection = sel;
      });
    }
    const editorEl = $("docs-editor");
    if (editorEl) {
      editorEl.addEventListener("mouseup", () => {
        const sel = captureSelectionFromEditor();
        if (sel) docsPendingSelection = sel;
      });
    }
    const resolveBtn = $("docs-btn-resolve");
    if (resolveBtn) {
      resolveBtn.onclick = async () => {
        const q = prompt("Resolve @slug / id / alias (exact match only):", "");
        if (q == null || !String(q).trim()) return;
        try {
          const camp = docsSelected?.campaign || docsCampaignFilter || "";
          const qq = camp
            ? `?q=${encodeURIComponent(String(q).trim())}&campaign=${encodeURIComponent(camp)}`
            : `?q=${encodeURIComponent(String(q).trim())}`;
          const r = await apiGet(`/api/docs/resolve${qq}`, { timeoutMs: DOC_TIMEOUT_MS });
          if (!r.primary) {
            alert(`No exact match for ${q}`);
            return;
          }
          if (r.count > 1) {
            const pick = r.matches.map((m) => m.path).join("\n");
            if (!confirm(`${r.count} matches — open primary?\n${pick}`)) return;
          }
          openDoc(r.primary.path, r.primary.campaign, r.primary.label);
        } catch (err) {
          alert(`Resolve failed: ${err.message}`);
        }
      };
    }
    const betaBtn = $("docs-btn-beta");
    if (betaBtn) {
      betaBtn.onclick = () => {
        docsBetaError = "";
        docsBetaTruncated = false;
        // Keep docsBetaScenario / sessionStorage history — reopen restores thread for this path.
        docsMode = "beta";
        renderReader();
      };
    }
    const proposeBtn = $("docs-btn-propose");
    if (proposeBtn) {
      proposeBtn.onclick = async () => {
        setDocsStatus("Proposing from reports…", { busy: true });
        try {
          const out = await apiSend("POST", "/api/docs/propose-from-reports", {
            path: docsDocState.path,
            use_llm: false,
          });
          if (!out.reports || !out.reports.length) {
            alert("No matching reports for this sheet name.");
            setDocsStatus("No report matches", { busy: false });
            return;
          }
          docsPendingDiff = {
            before: out.before,
            after: out.proposed,
            reason: `promote-from-reports (${out.reports.length} hits)`,
            diff: out.diff || "",
          };
          docsMode = "diff";
          setDocsStatus(`Propose · ${out.mode}`, { busy: false });
          renderReader();
        } catch (err) {
          setDocsStatus(`Propose failed · ${err.message}`, { error: true });
          alert(`Propose failed: ${err.message}`);
        }
      };
    }
    bindCommentActions(reader);
    const prose = reader.querySelector(".prose");
    if (prose) prose.scrollTop = readerScroll;
  }

  function pickLayoutNodes(allNodes) {
    const camps = allNodes.filter((n) => n.kind === "campaign");
    let docs = allNodes.filter((n) => n.kind === "doc");
    let truncated = false;
    if (docs.length > GRAPH_LAYOUT_DOC_CAP) {
      truncated = true;
      docs = [...docs]
        .sort((a, b) => Number(!b.draft) - Number(!a.draft) || (a.label || "").localeCompare(b.label || ""))
        .slice(0, GRAPH_LAYOUT_DOC_CAP);
    }
    const keep = new Set([...camps, ...docs].map((n) => n.id));
    return { nodes: [...camps, ...docs], keep, truncated };
  }

  async function renderGraph(reader) {
    const gen = ++graphLoadGen;
    if (graphAbort) graphAbort.abort();
    graphAbort = new AbortController();
    const signal = graphAbort.signal;

    const paint = (pct, label, extra = "") => {
      reader.innerHTML = `<div class="docs-toolbar">
        <div>
          <div class="doc-title">Docs map</div>
          <div class="meta" id="docs-graph-step">${esc(label)}</div>
        </div>
        <button type="button" class="btn" id="docs-graph-back">← Back to doc</button>
      </div>${progressHtml(pct, label)}${extra}`;
      const back = $("docs-graph-back");
      if (back) {
        back.onclick = () => {
          docsMode = "read";
          if (docsSelected) openDoc(docsSelected.path, docsSelected.campaign, docsSelected.label);
          else if (docsDocState) renderReader();
        };
      }
    };

    paint(10, "Preparing graph…");
    setDocsStatus("Preparing graph…", { busy: true });

    try {
      const campQ = docsCampaignFilter ? `campaign=${encodeURIComponent(docsCampaignFilter)}&` : "";
      const cacheKey = `${docsCampaignFilter || "*"}:100`;
      let g;
      if (graphCache.key === cacheKey && Date.now() - graphCache.at < GRAPH_CACHE_MS && graphCache.data) {
        g = graphCache.data;
        paint(45, "Graph (cached)…");
        setDocsStatus("Graph (cached)…", { busy: true });
      } else {
        paint(25, "Fetching graph…");
        setDocsStatus("Fetching /api/docs/graph…", { busy: true });
        g = await apiGet(`/api/docs/graph?${campQ}limit=100`, {
          signal,
          timeoutMs: GRAPH_TIMEOUT_MS,
        });
        if (gen !== graphLoadGen) return;
        graphCache = { key: cacheKey, at: Date.now(), data: g };
      }

      paint(55, `Building graph (${(g.nodes || []).length} nodes)…`);
      setDocsStatus(`Building graph (${(g.nodes || []).length} nodes)…`, { busy: true });
      await new Promise((r) => requestAnimationFrame(r));
      if (gen !== graphLoadGen) return;

      const picked = pickLayoutNodes(g.nodes || []);
      const nodes = picked.nodes;
      const edges = (g.edges || []).filter((e) => picked.keep.has(e.source) && picked.keep.has(e.target));

      paint(70, `Laying out ${nodes.length} nodes…`);
      setDocsStatus(`Laying out ${nodes.length} nodes…`, { busy: true });
      await new Promise((r) => requestAnimationFrame(r));
      if (gen !== graphLoadGen) return;

      // Simple force layout (fewer ticks when large)
      const W = Math.max(640, reader.clientWidth - 48);
      const H = Math.max(420, Math.min(720, window.innerHeight * 0.55));
      const positions = new Map();
      const byCamp = new Map();
      nodes.forEach((n, i) => {
        const camp = n.campaign || n.id;
        if (!byCamp.has(camp)) byCamp.set(camp, []);
        byCamp.get(camp).push(n);
        const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
        const r = n.kind === "campaign" ? 0 : 120 + (i % 7) * 28;
        positions.set(n.id, {
          x: W / 2 + Math.cos(angle) * r,
          y: H / 2 + Math.sin(angle) * r,
        });
      });
      let ci = 0;
      for (const [, list] of byCamp) {
        const cx = (W / (byCamp.size + 1)) * (ci + 1);
        const cy = H / 2;
        list.forEach((n, j) => {
          const p = positions.get(n.id);
          if (n.kind === "campaign") {
            p.x = cx;
            p.y = cy;
          } else {
            const a = (j / Math.max(1, list.length)) * Math.PI * 2;
            p.x = cx + Math.cos(a) * (80 + (j % 5) * 18);
            p.y = cy + Math.sin(a) * (80 + (j % 5) * 18);
          }
        });
        ci++;
      }
      const ticks = nodes.length > 60 ? 18 : 36;
      for (let t = 0; t < ticks; t++) {
        for (const a of nodes) {
          for (const b of nodes) {
            if (a.id >= b.id) continue;
            const pa = positions.get(a.id);
            const pb = positions.get(b.id);
            let dx = pa.x - pb.x;
            let dy = pa.y - pb.y;
            let dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const min = a.kind === "campaign" || b.kind === "campaign" ? 90 : 36;
            if (dist < min) {
              const f = ((min - dist) / dist) * 0.15;
              pa.x += dx * f;
              pa.y += dy * f;
              pb.x -= dx * f;
              pb.y -= dy * f;
            }
          }
        }
        for (const e of edges) {
          const pa = positions.get(e.source);
          const pb = positions.get(e.target);
          if (!pa || !pb) continue;
          let dx = pb.x - pa.x;
          let dy = pb.y - pa.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const ideal = e.kind === "contains" ? 110 : 70;
          const f = ((dist - ideal) / dist) * 0.05;
          pa.x += dx * f;
          pa.y += dy * f;
          pb.x -= dx * f;
          pb.y -= dy * f;
        }
      }
      for (const p of positions.values()) {
        p.x = Math.max(24, Math.min(W - 24, p.x));
        p.y = Math.max(24, Math.min(H - 24, p.y));
      }

      paint(90, "Rendering…");
      setDocsStatus("Rendering graph…", { busy: true });
      await new Promise((r) => requestAnimationFrame(r));
      if (gen !== graphLoadGen) return;

      const edgeSvg = edges
        .map((e) => {
          const a = positions.get(e.source);
          const b = positions.get(e.target);
          if (!a || !b) return "";
          const stroke =
            e.kind === "contains"
              ? "rgba(120,140,160,0.25)"
              : e.kind === "mention"
                ? "rgba(80,200,160,0.45)"
                : "rgba(100,160,220,0.4)";
          return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="1"/>`;
        })
        .join("");

      const nodeSvg = nodes
        .map((n) => {
          const p = positions.get(n.id);
          const r = n.kind === "campaign" ? 10 : 5;
          const fill = n.kind === "campaign" ? "#e8c547" : n.draft ? "#7aa2c7" : "#9ad67a";
          const label = (n.label || "").slice(0, 28);
          return `<g class="docs-graph-node" data-path="${esc(n.path || "")}" data-kind="${esc(n.kind)}" style="cursor:pointer">
            <circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${fill}" stroke="#111" stroke-width="0.5"/>
            <title>${esc(n.label || n.id)}</title>
            <text x="${p.x + 8}" y="${p.y + 3}" font-size="9" fill="var(--muted,#889)">${esc(label)}</text>
          </g>`;
        })
        .join("");

      const docCount = nodes.filter((n) => n.kind === "doc").length;
      const truncNote =
        g.truncated || picked.truncated
          ? ` · showing ${docCount}${g.truncated_from ? ` of ${g.truncated_from}` : ""} (capped)`
          : "";
      const scopeNote = docsCampaignFilter ? ` · ${docsCampaignFilter}` : " · all campaigns";

      reader.innerHTML = `<div class="docs-toolbar">
        <div>
          <div class="doc-title">Docs map</div>
          <div class="meta">${docCount} docs${scopeNote}${truncNote} · click a node to open</div>
        </div>
        <button type="button" class="btn" id="docs-graph-back">← Back</button>
      </div>
      <div class="docs-graph-wrap">
        <svg id="docs-graph-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${edgeSvg}${nodeSvg}</svg>
      </div>`;
      setDocsStatus(`Graph ready · ${docCount} docs`, { busy: false });
      $("docs-graph-back").onclick = () => {
        docsMode = "read";
        if (docsSelected) openDoc(docsSelected.path, docsSelected.campaign, docsSelected.label);
      };
      reader.querySelectorAll(".docs-graph-node").forEach((gEl) => {
        gEl.addEventListener("click", () => {
          const p = gEl.getAttribute("data-path");
          if (!p) return;
          docsMode = "read";
          openDoc(p, p.split("/")[1], gEl.querySelector("title")?.textContent || p);
        });
      });
    } catch (err) {
      if (gen !== graphLoadGen) return;
      const msg = err.message || String(err);
      setDocsStatus(`Graph failed · ${msg}`, { error: true });
      // Tree must stay usable — only reader shows the error
      reader.innerHTML = `<div class="docs-toolbar">
        <div class="doc-title">Docs map</div>
        <button type="button" class="btn" id="docs-graph-back">← Back to doc</button>
      </div>
      <div class="empty-state docs-status-error">Graph failed: ${esc(msg)}<br/>
        <span class="meta">Last step: ${esc(docsLastStep)}</span><br/>
        <span class="meta">Tree browse still works — pick a doc in the sidebar.</span>
      </div>`;
      const back = $("docs-graph-back");
      if (back) {
        back.onclick = () => {
          docsMode = "read";
          if (docsSelected) openDoc(docsSelected.path, docsSelected.campaign, docsSelected.label);
        };
      }
    }
  }

  function wireControls() {
    if (docsWired) return;
    docsWired = true;
    const search = $("docs-search");
    if (search) {
      search.placeholder = "Filter tree…";
      search.oninput = () => {
        docsTextFilter = search.value || "";
        renderTree();
      };
    }
    const smart = $("docs-smart-filter");
    if (smart) {
      smart.oninput = () => {
        docsSmartQuery = smart.value || "";
        try {
          sessionStorage.setItem("linuxbox-docs-smart", docsSmartQuery);
        } catch { /* ignore */ }
        renderTree();
      };
    }
    const camp = $("docs-campaign");
    if (camp) {
      camp.onchange = () => {
        docsCampaignFilter = camp.value || "";
        try {
          sessionStorage.setItem("linuxbox-docs-scope", docsCampaignFilter);
        } catch { /* ignore */ }
        camp.dataset.ready = "";
        if (treeAbort) treeAbort.abort();
        if (graphAbort) graphAbort.abort();
        treeCache = { key: null, at: 0, data: null };
        graphCache = { key: null, at: 0, data: null };
        docsWikiReady = false;
        loadTree({ force: true, skipAutoOpen: true });
      };
    }
    const refresh = $("docs-tree-refresh");
    if (refresh) {
      refresh.onclick = () => {
        treeCache = { key: null, at: 0, data: null };
        graphCache = { key: null, at: 0, data: null };
        docsWikiReady = false;
        loadTree({ force: true, skipAutoOpen: true });
      };
    }
    const openGraph = () => {
      docsMode = "graph";
      const reader = $("report-reader");
      if (reader) renderGraph(reader);
    };
    const viz = $("docs-open-graph");
    if (viz) viz.onclick = openGraph;
    const hintViz = $("docs-hint-viz");
    if (hintViz) hintViz.onclick = openGraph;
    const newSheet = $("docs-new-sheet");
    if (newSheet) {
      newSheet.onclick = async () => {
        const campId =
          docsCampaignFilter ||
          prompt("Campaign id (tropic-gooner | nyc-mafia-dnd | spacequest):", "tropic-gooner");
        if (!campId) return;
        const display = prompt("Display name:", "");
        if (display == null || !String(display).trim()) return;
        const slugHint = prompt("Slug (kebab-case, blank = from name):", "") || "";
        setDocsStatus("Creating character sheet…", { busy: true });
        try {
          const created = await apiSend("POST", "/api/docs/character-sheet", {
            campaign: String(campId).trim(),
            display_name: String(display).trim(),
            slug: String(slugHint).trim() || undefined,
          });
          docsCampaignFilter = created.campaign || campId;
          const campEl = $("docs-campaign");
          if (campEl) {
            campEl.dataset.ready = "";
            campEl.value = docsCampaignFilter;
          }
          treeCache = { key: null, at: 0, data: null };
          graphCache = { key: null, at: 0, data: null };
          docsWikiReady = false;
          await loadTree({ force: true, skipAutoOpen: true });
          if (created.path) openDoc(created.path, created.campaign, created.slug);
        } catch (err) {
          setDocsStatus(`Create failed · ${err.message}`, { error: true });
          alert(`Create failed: ${err.message}`);
        }
      };
    }
  }

  window.docsWikiEnsureLoaded = function docsWikiEnsureLoaded() {
    wireControls();
    if (docsWikiReady && docsCatalog) {
      setDocsStatus("Tree ready (cached)", { busy: false });
      return;
    }
    window.loadDocsWiki({ force: false });
  };

  window.loadDocsWiki = function loadDocsWiki(opts = {}) {
    wireControls();
    try {
      const scope = sessionStorage.getItem("linuxbox-docs-scope");
      if (scope) docsCampaignFilter = scope;
      const smart = sessionStorage.getItem("linuxbox-docs-smart");
      if (smart) {
        docsSmartQuery = smart;
        const smartEl = $("docs-smart-filter");
        if (smartEl) smartEl.value = smart;
      }
    } catch { /* ignore */ }
    const campEl = $("docs-campaign");
    if (campEl && campEl.dataset.pendingScope) {
      docsCampaignFilter = campEl.dataset.pendingScope;
    }
    if (opts.force) {
      treeCache = { key: null, at: 0, data: null };
      docsWikiReady = false;
    }
    loadTree({ force: !!opts.force, skipAutoOpen: true });
  };

  window.docsWikiOpenPath = openDoc;
})();
