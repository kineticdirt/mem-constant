/**
 * wiki-entity-links.js — [[kind: label]] → hyperlinks + popover for Isla Primavera.
 * Browser ESM or classic script (attaches globalThis.WikiEntities).
 * Campaign SoT: campaigns/tropic-gooner/wiki/entities.json
 */
(function (root) {
  "use strict";

  const LINK_RE = /\[\[([a-z]+)\s*:\s*([^\]]+?)\]\]/gi;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function norm(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function indexEntities(entities) {
    const byKey = new Map();
    for (const e of entities || []) {
      if (!e || !e.id) continue;
      const keys = [e.id, e.name].concat(e.aliases || []);
      for (const k of keys) {
        const n = norm(k);
        if (n) byKey.set(n, e);
      }
      // kind:name compound keys
      const kn = norm(e.kind) + ":" + norm(e.name);
      byKey.set(kn, e);
      for (const a of e.aliases || []) {
        byKey.set(norm(e.kind) + ":" + norm(a), e);
      }
    }
    return byKey;
  }

  function resolve(index, kind, label) {
    const k = norm(kind);
    const lab = norm(label);
    return (
      index.get(k + ":" + lab) ||
      index.get(lab) ||
      null
    );
  }

  /** Replace [[kind: label]] in plain text / HTML-ish string with <a class="wiki-ent">. */
  function linkify(text, entities, opts) {
    const index = indexEntities(entities);
    const unknownClass = (opts && opts.unknownClass) || "wiki-ent is-unknown";
    const knownClass = (opts && opts.knownClass) || "wiki-ent";
    return String(text || "").replace(LINK_RE, (_, kind, label) => {
      const k = String(kind).toLowerCase();
      const lab = String(label).trim();
      const ent = resolve(index, k, lab);
      const id = ent ? ent.id : "";
      const cls = ent ? knownClass : unknownClass;
      const title = ent
        ? (ent.name + (ent.location ? " · " + ent.location : ""))
        : "Unlinked " + k + " — add to wiki/entities.json";
      return (
        '<a href="#ent/' +
        esc(id || k + ":" + lab) +
        '" class="' +
        cls +
        '" data-wiki-kind="' +
        esc(k) +
        '" data-wiki-label="' +
        esc(lab) +
        '"' +
        (id ? ' data-wiki-id="' + esc(id) + '"' : "") +
        ' title="' +
        esc(title) +
        '">' +
        esc(lab) +
        "</a>"
      );
    });
  }

  /** Walk text nodes under root and linkify [[…]] (skips SCRIPT/STYLE/A). */
  function linkifyDom(root, entities) {
    if (!root) return;
    const skip = new Set(["SCRIPT", "STYLE", "A", "TEXTAREA", "INPUT", "CODE", "PRE"]);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        let p = node.parentElement;
        while (p && p !== root) {
          if (skip.has(p.tagName)) return NodeFilter.FILTER_REJECT;
          p = p.parentElement;
        }
        return node.nodeValue && node.nodeValue.indexOf("[[") >= 0
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const textNode of nodes) {
      const raw = textNode.nodeValue;
      if (!LINK_RE.test(raw)) continue;
      LINK_RE.lastIndex = 0;
      const html = linkify(raw, entities);
      if (html === raw) continue;
      const wrap = document.createElement("span");
      wrap.innerHTML = html;
      const parent = textNode.parentNode;
      while (wrap.firstChild) parent.insertBefore(wrap.firstChild, textNode);
      parent.removeChild(textNode);
    }
  }

  function findById(entities, id) {
    return (entities || []).find((e) => e && e.id === id) || null;
  }

  function popoverHtml(ent, kind, label, entities) {
    if (!ent) {
      return (
        '<div class="wiki-pop-inner">' +
        "<strong>Unlinked</strong>" +
        '<p class="wiki-pop-meta">' +
        esc(kind) +
        ": " +
        esc(label) +
        "</p>" +
        "<p>Add an entity to <code>campaigns/tropic-gooner/wiki/entities.json</code> (or Quick-create later).</p>" +
        "</div>"
      );
    }
    const when = ent.when && ent.when.y
      ? [ent.when.y, ent.when.m, ent.when.d].filter((x) => x != null && x !== "").join("-")
      : "";
    const facts = (ent.facts || [])
      .map((f) => "<li>" + esc(f) + "</li>")
      .join("");
    const related = (ent.related_ids || [])
      .map((rid) => findById(entities, rid))
      .filter(Boolean)
      .map(
        (r) =>
          '<button type="button" class="wiki-pop-rel" data-wiki-id="' +
          esc(r.id) +
          '">' +
          esc(r.name) +
          "</button>"
      )
      .join(" ");
    return (
      '<div class="wiki-pop-inner">' +
      "<strong>" +
      esc(ent.name) +
      "</strong>" +
      '<p class="wiki-pop-meta">' +
      esc(ent.kind) +
      (ent.location ? " · " + esc(ent.location) : "") +
      (when ? " · " + esc(when) : "") +
      (ent.region_id ? " · " + esc(ent.region_id) : "") +
      "</p>" +
      (facts ? "<ul class=\"wiki-pop-facts\">" + facts + "</ul>" : "") +
      (related ? '<div class="wiki-pop-related">' + related + "</div>" : "") +
      "</div>"
    );
  }

  function ensurePopoverStyles() {
    if (document.getElementById("wiki-ent-style")) return;
    const s = document.createElement("style");
    s.id = "wiki-ent-style";
    s.textContent =
      ".wiki-ent{color:#01cdfe;text-decoration:underline;text-underline-offset:2px;cursor:pointer}" +
      ".wiki-ent.is-unknown{color:#fffb96;border-bottom:1px dashed #fffb96;text-decoration:none}" +
      ".wiki-pop{position:fixed;z-index:99999;max-width:min(320px,92vw);padding:10px 12px;" +
      "background:#16082a;border:1px solid #01cdfe;color:#e8e0f0;font:13px/1.4 ui-sans-serif,system-ui,sans-serif;" +
      "box-shadow:0 8px 28px rgba(0,0,0,.45)}" +
      ".wiki-pop strong{color:#ff71ce;letter-spacing:.04em}" +
      ".wiki-pop-meta{margin:4px 0 8px;font-size:11px;color:#9d8fc9}" +
      ".wiki-pop-facts{margin:0;padding-left:1.1em;font-size:12px}" +
      ".wiki-pop-related{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}" +
      ".wiki-pop-rel{font:inherit;font-size:11px;cursor:pointer;color:#01cdfe;background:transparent;" +
      "border:1px solid rgba(1,205,254,.45);padding:2px 6px}" +
      ".wiki-pop-close{position:absolute;top:4px;right:6px;border:0;background:transparent;" +
      "color:#9d8fc9;cursor:pointer;font-size:14px}";
    document.head.appendChild(s);
  }

  function bindPopovers(root, entities, opts) {
    ensurePopoverStyles();
    const list = entities || [];
    let pop = document.getElementById("wiki-ent-pop");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "wiki-ent-pop";
      pop.className = "wiki-pop";
      pop.hidden = true;
      pop.setAttribute("role", "dialog");
      document.body.appendChild(pop);
    }
    function hide() {
      pop.hidden = true;
      pop.innerHTML = "";
    }
    function showFor(anchor, ent, kind, label) {
      pop.innerHTML =
        '<button type="button" class="wiki-pop-close" aria-label="Close">×</button>' +
        popoverHtml(ent, kind, label, list);
      pop.hidden = false;
      const r = anchor.getBoundingClientRect();
      let top = r.bottom + 6;
      let left = r.left;
      pop.style.top = "0px";
      pop.style.left = "0px";
      const pr = pop.getBoundingClientRect();
      if (left + pr.width > window.innerWidth - 8) left = window.innerWidth - pr.width - 8;
      if (top + pr.height > window.innerHeight - 8) top = Math.max(8, r.top - pr.height - 6);
      pop.style.top = top + "px";
      pop.style.left = Math.max(8, left) + "px";
      pop.querySelector(".wiki-pop-close").onclick = (ev) => {
        ev.preventDefault();
        hide();
      };
      pop.querySelectorAll(".wiki-pop-rel").forEach((btn) => {
        btn.onclick = (ev) => {
          ev.preventDefault();
          const next = findById(list, btn.getAttribute("data-wiki-id"));
          showFor(anchor, next, next && next.kind, next && next.name);
        };
      });
    }
    root.addEventListener("click", (ev) => {
      const a = ev.target.closest && ev.target.closest("a.wiki-ent");
      if (!a || !root.contains(a)) return;
      ev.preventDefault();
      const id = a.getAttribute("data-wiki-id");
      const kind = a.getAttribute("data-wiki-kind") || "";
      const label = a.getAttribute("data-wiki-label") || a.textContent;
      const ent = id ? findById(list, id) : resolve(indexEntities(list), kind, label);
      showFor(a, ent, kind, label);
      if (opts && typeof opts.onOpen === "function") opts.onOpen(ent, a);
    });
    document.addEventListener(
      "keydown",
      (ev) => {
        if (ev.key === "Escape") hide();
      },
      true
    );
  }

  async function fetchEntities(url) {
    const r = await fetch(url || "/api/wiki/entities?campaign=tropic-gooner", {
      cache: "no-store",
    });
    if (!r.ok) throw new Error("entities " + r.status);
    const j = await r.json();
    return j.entities || j || [];
  }

  /** Self-check (Node or browser). */
  function selfCheck() {
    const sample = [
      {
        id: "school-piu-south",
        kind: "school",
        name: "PIU South Campus",
        aliases: ["PIU South"],
        location: "Paradise",
        facts: ["interns"],
      },
    ];
    const html = linkify("Went to [[school: PIU South]] in [[year: 2019]].", sample);
    const ok =
      html.indexOf('data-wiki-id="school-piu-south"') >= 0 &&
      html.indexOf("is-unknown") >= 0 &&
      html.indexOf("PIU South</a>") >= 0;
    if (!ok) throw new Error("wiki-entity-links selfCheck failed: " + html);
    return "OK";
  }

  const api = {
    LINK_RE,
    indexEntities,
    resolve,
    linkify,
    linkifyDom,
    popoverHtml,
    bindPopovers,
    fetchEntities,
    selfCheck,
    findById,
  };

  root.WikiEntities = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
