/* hunter.js — Hunter Board (Isla Primavera / tableslop). Client-side only, no fetch, no CDN.
 * Renders window.HUNTER_DATA (bundled by scripts/tableslop/hunter-prep.js --export).
 * All determinism (reveal order, resolve rolls) is precomputed by the CLI; this file walks it.
 */
(function () {
  "use strict";

  var DATA = window.HUNTER_DATA;
  var STORE_KEY = "hunter-board-v1";

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  if (!DATA || !DATA.cases) {
    var es = $("emptyState");
    if (es) {
      es.innerHTML = "";
      es.appendChild(el("div", "es-big", "hunter-data.js missing"));
      es.appendChild(el("div", null, "Run: node scripts/tableslop/hunter-prep.js --export"));
    }
    return;
  }

  var TIERS = DATA.veil.tiers.slice().sort(function (a, b) { return a.at - b.at; });
  var GEAR_BY_ID = {};
  DATA.gear.forEach(function (g) { GEAR_BY_ID[g.id] = g; });

  /* ---------- state (persisted: revealed tell ids per case) ---------- */

  function loadState() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch (e) { /* storage unavailable — board works in-memory */ }
    return { selected: null, revealed: {} };
  }
  function saveState() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  var state = loadState();
  if (!state.revealed || typeof state.revealed !== "object") state.revealed = {};

  function revealedSet(caseId) {
    if (!state.revealed[caseId]) state.revealed[caseId] = [];
    return state.revealed[caseId];
  }
  function caseById(id) {
    for (var i = 0; i < DATA.cases.length; i++) if (DATA.cases[i].id === id) return DATA.cases[i];
    return null;
  }
  function sumDeltas(c) {
    return c.tells.reduce(function (s, t) { return s + t.delta; }, 0);
  }
  function progressOf(c) {
    var have = {};
    revealedSet(c.id).forEach(function (t) { have[t] = true; });
    return c.tells.reduce(function (s, t) { return s + (have[t.id] ? t.delta : 0); }, 0);
  }
  function veilTier(progress) {
    var tier = 0;
    TIERS.forEach(function (t) { if (progress >= t.at) tier = t.tier; });
    return tier;
  }
  function veilLabel(tier) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].tier === tier) return TIERS[i].label;
    return "mundane cover";
  }

  /* ---------- case list ---------- */

  var KIND_COLORS = [
    [/vampire/i, "var(--pink)"],
    [/ghoul/i, "var(--magenta)"],
    [/ghost/i, "var(--cyan)"],
    [/cursed object/i, "var(--purple)"],
    [/werewolf/i, "var(--sun)"],
    [/fae/i, "var(--cyan)"],
    [/island-unique/i, "var(--sun)"],
  ];
  function kindColor(kind) {
    for (var i = 0; i < KIND_COLORS.length; i++) {
      if (KIND_COLORS[i][0].test(kind)) return KIND_COLORS[i][1];
    }
    return "var(--muted)";
  }
  function dangerPips(d) {
    var wrap = el("span", "danger-pips");
    for (var i = 1; i <= 5; i++) {
      wrap.appendChild(el("span", i <= d ? null : "off", "●"));
    }
    return wrap;
  }

  function renderCaseList() {
    var list = $("caseList");
    list.innerHTML = "";
    DATA.cases.forEach(function (c) {
      var card = el("button", "case-card" + (state.selected === c.id ? " is-active" : ""));
      card.type = "button";
      card.setAttribute("data-case", c.id);
      card.setAttribute("role", "option");
      card.appendChild(el("div", "cc-name", c.name));
      var sub = el("div", "cc-sub");
      var chip = el("span", "kind-chip", c.kind);
      chip.style.color = kindColor(c.kind);
      sub.appendChild(chip);
      sub.appendChild(dangerPips(c.danger));
      var prog = progressOf(c);
      var veil = el("span", "cc-veil");
      veil.appendChild(document.createTextNode("veil "));
      var b = el("b", null, prog + "/" + sumDeltas(c));
      veil.appendChild(b);
      sub.appendChild(veil);
      card.appendChild(sub);
      card.addEventListener("click", function () { selectCase(c.id); });
      list.appendChild(card);
    });
  }

  /* ---------- case view ---------- */

  function renderHead(c) {
    $("chName").textContent = c.name;
    var chip = $("chKind");
    chip.textContent = c.kind;
    chip.style.color = kindColor(c.kind);
    var dd = $("chDanger");
    dd.innerHTML = "";
    dd.appendChild(dangerPips(c.danger));
    $("chTurf").textContent = c.turf + "  (" + c.region + ")  ·  public veil " + c.veil_start;
    $("chCover").textContent = c.mundane_cover;
  }

  function renderVeil(c) {
    var sum = sumDeltas(c);
    var prog = progressOf(c);
    var tier = veilTier(prog);
    var meter = $("veilMeter");
    meter.querySelectorAll(".veil-tick").forEach(function (t) { t.remove(); });
    $("veilFill").style.width = Math.min(100, (prog / sum) * 100) + "%";
    TIERS.forEach(function (t) {
      if (t.at <= 0 || t.at >= sum) return;
      var tick = el("div", "veil-tick");
      tick.style.left = (t.at / sum) * 100 + "%";
      meter.appendChild(tick);
    });
    var label = $("veilLabel");
    label.innerHTML = "";
    var b = el("b", null, "tier " + tier + " · " + veilLabel(tier));
    label.appendChild(b);
    label.appendChild(document.createTextNode("  " + prog + "/" + sum));
  }

  function nextTellFor(c, action) {
    var have = revealedSet(c.id);
    for (var i = 0; i < c.reveal_order.length; i++) {
      var tid = c.reveal_order[i];
      if (have.indexOf(tid) !== -1) continue;
      var tell = null;
      for (var j = 0; j < c.tells.length; j++) if (c.tells[j].id === tid) { tell = c.tells[j]; break; }
      if (tell && tell.by.indexOf(action) !== -1) return tell;
    }
    return null;
  }

  function renderActions(c) {
    var bar = $("actionBar");
    bar.innerHTML = "";
    DATA.veil.actions.forEach(function (a) {
      var btn = el("button", "act-btn", a);
      btn.type = "button";
      btn.setAttribute("data-action", a);
      btn.disabled = !nextTellFor(c, a);
      btn.title = btn.disabled ? "No new seam via " + a + " — diminishing returns" : "Work the case: " + a;
      btn.addEventListener("click", function () {
        var tell = nextTellFor(c, a);
        if (!tell) return;
        revealedSet(c.id).push(tell.id);
        saveState();
        renderCaseView(c);
        renderCaseList();
      });
      bar.appendChild(btn);
    });
  }

  function renderTruth(c) {
    var body = $("truthBody");
    body.innerHTML = "";
    var tier = veilTier(progressOf(c));
    if (tier >= DATA.veil.unlocks.profile_at_tier) {
      body.textContent = c.kind + " — " + c.truth;
    } else {
      var span = el("span", "redact", c.truth);
      body.appendChild(span);
      body.appendChild(el("div", "redact-label", "redacted — the cover story is holding"));
    }
  }

  function renderWeak(c) {
    var list = $("weakList");
    list.innerHTML = "";
    var tier = veilTier(progressOf(c));
    if (tier >= DATA.veil.unlocks.weaknesses_at_tier) {
      c.weaknesses.forEach(function (w) { list.appendChild(el("li", null, w)); });
    } else {
      c.weaknesses.forEach(function (w) {
        var li = el("li");
        li.appendChild(el("span", "redact", w));
        list.appendChild(li);
      });
      var li = el("li");
      li.appendChild(el("span", "redact-label", "redacted — preparation is not possible yet"));
      list.appendChild(li);
    }
  }

  function renderTells(c) {
    var grid = $("tellGrid");
    grid.innerHTML = "";
    var have = revealedSet(c.id);
    c.reveal_order.forEach(function (tid) {
      var tell = null;
      for (var j = 0; j < c.tells.length; j++) if (c.tells[j].id === tid) { tell = c.tells[j]; break; }
      if (!tell) return;
      var revealed = have.indexOf(tid) !== -1;
      var note = el("div", "tell-note" + (revealed ? "" : " sealed"));
      note.setAttribute("data-tell", tid);
      note.appendChild(el("div", "tn-by", revealed ? tell.by.join(" · ") : "sealed"));
      note.appendChild(el("div", "tn-desc", revealed ? tell.desc : "the veil holds — work the case"));
      if (revealed) note.appendChild(el("div", "tn-delta", "+" + tell.delta + " veil"));
      grid.appendChild(note);
    });
  }

  function drawStrings(c) {
    var svg = $("stringLayer");
    var board = $("corkBoard");
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var truthPin = $("truthCard");
    if (!truthPin) return;
    var bb = board.getBoundingClientRect();
    var tb = truthPin.getBoundingClientRect();
    var x1 = tb.left + tb.width / 2 - bb.left;
    var y1 = tb.top + 8 - bb.top;
    var notes = board.querySelectorAll(".tell-note:not(.sealed)");
    notes.forEach(function (note) {
      var nb = note.getBoundingClientRect();
      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", nb.left + nb.width / 2 - bb.left);
      line.setAttribute("y2", nb.top + 7 - bb.top);
      svg.appendChild(line);
    });
  }

  /* ---------- prep panel ---------- */

  function renderPrep(c) {
    var panel = $("prepPanel");
    panel.innerHTML = "";
    panel.appendChild(el("div", "colhead", "Preparation"));
    var tier = veilTier(progressOf(c));
    if (tier < DATA.veil.unlocks.weaknesses_at_tier) {
      var lock = el("div", null);
      lock.id = "prepLock";
      lock.appendChild(el("div", "pl-big", "PREP LOCKED"));
      lock.appendChild(el("div", "pl-sub",
        "Veil tier " + tier + " of 3. A hunter who prepares at tier 1 is a person buying silver for a dog. Expose the case first."));
      panel.appendChild(lock);
      return;
    }

    panel.appendChild(el("div", "prep-h", "Kit — " + c.id));
    var kitList = el("div", null);
    kitList.id = "kitList";
    c.kit.forEach(function (gid) {
      var g = GEAR_BY_ID[gid];
      if (!g) return;
      var row = el("div", "kit-row");
      row.appendChild(el("span", "kr-name", g.name));
      row.appendChild(el("span", "kr-price", "$" + g.price));
      row.appendChild(el("span", "kr-src", g.source));
      var flag = /gray|illegal/.test(g.legality);
      row.appendChild(el("span", "kr-leg" + (flag ? " flag" : ""), g.legality));
      kitList.appendChild(row);
    });
    panel.appendChild(kitList);
    var total = el("div", null);
    total.id = "kitTotal";
    total.appendChild(el("span", null, "total"));
    total.appendChild(el("span", null, "$" + c.kit_total));
    panel.appendChild(total);

    panel.appendChild(el("div", "prep-h", "Plan"));
    var plan = el("div", null);
    plan.id = "planLine";
    plan.textContent = c.plan;
    panel.appendChild(plan);

    panel.appendChild(el("div", "prep-h", "Outcome swing"));
    var tbl = el("table");
    tbl.id = "swingTable";
    var thead = el("tr");
    ["mode", "clean", "cost", "disaster"].forEach(function (h) { thead.appendChild(el("th", null, h)); });
    tbl.appendChild(thead);
    ["prepared", "rushed"].forEach(function (mode) {
      var t = c.resolve[mode].table;
      var tr = el("tr");
      tr.appendChild(el("td", null, mode));
      tr.appendChild(el("td", null, String(t.clean_win)));
      tr.appendChild(el("td", null, String(t.win_with_cost)));
      tr.appendChild(el("td", null, String(t.disaster)));
      tbl.appendChild(tr);
    });
    panel.appendChild(tbl);

    var btns = el("div", "res-btns");
    var bp = el("button", "res-btn", "resolve prepared");
    bp.id = "resolvePrep";
    bp.type = "button";
    var br = el("button", "res-btn", "resolve rushed");
    br.id = "resolveRush";
    br.type = "button";
    btns.appendChild(bp);
    btns.appendChild(br);
    panel.appendChild(btns);

    var out = el("div");
    out.id = "resolveOut";
    panel.appendChild(out);

    function showResolve(mode) {
      var r = c.resolve[mode];
      out.style.display = "block";
      out.innerHTML = "";
      out.appendChild(el("div", "ro-mode", "deterministic · " + mode + " · danger " + c.danger + "/5 · roll " + r.roll));
      out.appendChild(el("div", "ro-outcome " + r.outcome, r.outcome.replace(/_/g, " ")));
      var heats = (c.resolve.heat && c.resolve.heat[mode]) || [];
      if (heats.length) {
        var ul = el("ul");
        ul.id = "heatList";
        heats.forEach(function (h) {
          var li = el("li");
          var b = el("b", null, h.source + " sev " + h.severity + " → " + h.faction);
          li.appendChild(b);
          li.appendChild(document.createTextNode(" " + h.note));
          ul.appendChild(li);
        });
        out.appendChild(ul);
      } else {
        out.appendChild(el("div", "ro-mode", "no heat events — quiet work is the only cheap work"));
      }
    }
    bp.addEventListener("click", function () { showResolve("prepared"); });
    br.addEventListener("click", function () { showResolve("rushed"); });
  }

  /* ---------- assembly ---------- */

  function renderCaseView(c) {
    $("emptyState").hidden = true;
    $("caseView").hidden = false;
    renderHead(c);
    renderVeil(c);
    renderActions(c);
    renderTruth(c);
    renderTells(c);
    renderWeak(c);
    renderPrep(c);
    window.requestAnimationFrame(function () { drawStrings(c); });
  }

  function selectCase(id) {
    state.selected = id;
    saveState();
    renderCaseList();
    var c = caseById(id);
    if (c) renderCaseView(c);
  }

  $("resetBoard").addEventListener("click", function () {
    state = { selected: state.selected, revealed: {} };
    saveState();
    renderCaseList();
    var c = caseById(state.selected);
    if (c) renderCaseView(c);
  });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      var c = caseById(state.selected);
      if (c && !$("caseView").hidden) drawStrings(c);
    }, 120);
  });

  renderCaseList();
  if (state.selected && caseById(state.selected)) {
    selectCase(state.selected);
  }
})();
