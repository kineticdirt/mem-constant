/* Island Sim panel — reads sim-static.json (isla-sim.js --export), falls back to sim-state.json.
 * No server API, no framework. Design: docs/plans/isla-primavera-sim-design-2026-08-06.md */
(function () {
  "use strict";

  var FALLBACK_LABELS = {
    rum: "Rum", sugar: "Sugar", vice: "Vice (lic.)", guns: "Guns (illicit)", touro_dollar: "Touro $"
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function el(id) { return document.getElementById(id); }

  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(url + " -> HTTP " + r.status);
      return r.json();
    });
  }

  function normalize(data, sourceName) {
    // sim-state.json: incidents oldest-first, no commodity labels; sim-static.json: newest-first + labels
    var incidents = Array.isArray(data.incidents) ? data.incidents.slice() : [];
    if (incidents.length > 1 && incidents[0].world_day < incidents[incidents.length - 1].world_day) {
      incidents.reverse();
    }
    return {
      sourceName: sourceName,
      world_day: data.world_day || 0,
      generated_at: data.generated_at || null,
      commodities: data.commodities || FALLBACK_LABELS,
      cities: data.cities || {},
      tensions: data.tensions || {},
      incidents: incidents,
      history: Array.isArray(data.history) ? data.history : []
    };
  }

  function lastNDays(sim, n) {
    return sim.history.slice(Math.max(0, sim.history.length - n));
  }

  function weekDelta(sim, cid, key) {
    var h = sim.history;
    if (h.length < 2) return null;
    var back = Math.max(0, h.length - 1 - 7);
    var p0 = h[back].cities[cid] && h[back].cities[cid].prices[key];
    var p1 = h[h.length - 1].cities[cid].prices[key];
    if (!p0 || !p1) return null;
    return Math.round(((p1 - p0) / p0) * 1000) / 10;
  }

  function sparkline(points, w, h) {
    if (!points || points.length < 2) {
      return '<span class="delta flat">—</span>';
    }
    var min = Math.min.apply(null, points), max = Math.max.apply(null, points);
    var span = (max - min) || (Math.abs(max) * 0.01) || 1;
    var step = w / (points.length - 1);
    var coords = points.map(function (p, i) {
      var x = (i * step).toFixed(1);
      var y = (h - 2 - ((p - min) / span) * (h - 4)).toFixed(1);
      return x + "," + y;
    }).join(" ");
    var trend = points[points.length - 1] >= points[0] ? "#05ffa1" : "#ff2a6d";
    return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true">' +
      '<polyline points="' + coords + '" fill="none" stroke="' + trend + '" stroke-width="1.4" opacity="0.95"/></svg>';
  }

  function renderMarkets(sim) {
    var host = el("markets");
    var cids = Object.keys(sim.cities).sort();
    if (!cids.length) { host.innerHTML = ""; return; }
    var days = lastNDays(sim, 7);
    host.innerHTML = cids.map(function (cid) {
      var city = sim.cities[cid];
      var keys = Object.keys(city.markets || {}).sort();
      var rows = keys.map(function (k) {
        var m = city.markets[k];
        var d = weekDelta(sim, cid, k);
        var cls = d === null ? "flat" : (d > 0.05 ? "up" : (d < -0.05 ? "down" : "flat"));
        var dTxt = d === null ? "n/a" : ((d > 0 ? "+" : "") + d + "%");
        var pts = days.map(function (snap) {
          return snap.cities[cid] && snap.cities[cid].prices ? snap.cities[cid].prices[k] : null;
        }).filter(function (v) { return typeof v === "number"; });
        return "<tr>" +
          "<td>" + esc(sim.commodities[k] || k) + "</td>" +
          '<td class="price">' + esc(m.price) + "</td>" +
          '<td class="delta ' + cls + '">' + esc(dTxt) + "</td>" +
          "<td>" + sparkline(pts, 72, 20) + "</td>" +
          "</tr>";
      }).join("");
      return '<section class="panel">' +
        "<h2>" + esc(city.name) + " — market (" + esc(cid) + ")</h2>" +
        '<div class="body"><table class="mkt">' +
        "<thead><tr><th>commodity</th><th style='text-align:right'>price</th><th>7-day</th><th>trend</th></tr></thead>" +
        "<tbody>" + rows + "</tbody></table></div></section>";
    }).join("");
  }

  function renderHeat(sim) {
    var host = el("heat");
    var cids = Object.keys(sim.cities).sort();
    host.innerHTML = cids.map(function (cid) {
      var city = sim.cities[cid];
      var heat = Math.max(0, Math.min(100, Number(city.heat) || 0));
      var chip = heat > 60 ? '<span class="chip surge">CRT surge</span>'
        : heat > 50 ? '<span class="chip elev">elevated</span>' : "";
      return '<div class="heat-row">' +
        '<span class="city">' + esc(city.name) + chip + "</span>" +
        '<span class="heatbar"><span class="fill" style="width:' + heat.toFixed(1) + '%"></span><span class="thresh"></span></span>' +
        '<span class="val">' + heat.toFixed(1) + "/100</span>" +
        "</div>";
    }).join("");
  }

  function renderTensions(sim) {
    var host = el("tensions");
    var ids = Object.keys(sim.tensions).sort();
    if (!ids.length) { host.innerHTML = '<div class="empty">no tension data</div>'; return; }
    host.innerHTML = ids.map(function (id) {
      var v = Math.max(0, Math.min(1, Number(sim.tensions[id]) || 0));
      var pair = id.split("_vs_").map(function (s) {
        return s.split("-").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
      }).join(" × ");
      return '<div class="tension-row">' +
        '<span class="pair">' + esc(pair) + "</span>" +
        '<span class="bar"><span class="fill" style="width:' + (v * 100).toFixed(0) + '%"></span></span>' +
        '<span class="val">' + v.toFixed(2) + "</span>" +
        "</div>";
    }).join("");
  }

  function casualtyText(c) {
    if (c <= 0) return "no injuries";
    if (c === 1) return "1 casualty";
    if (c === 2) return "2 casualties";
    return "3 dead";
  }

  function renderBlotter(sim) {
    var host = el("blotter");
    if (!sim.incidents.length) {
      host.innerHTML = '<div class="empty">Blotter is clean. The island thanks you for your continued discretion.</div>';
      return;
    }
    var cityName = function (cid) {
      return sim.cities[cid] && sim.cities[cid].name ? sim.cities[cid].name : cid;
    };
    host.innerHTML = sim.incidents.slice(0, 20).map(function (i) {
      return '<div class="blot">' +
        '<div class="meta">' +
        '<span class="day">d' + esc(i.world_day) + "</span>" +
        '<span class="kind">' + esc(i.kind) + "</span>" +
        '<span class="where">' + esc(i.district) + ", " + esc(cityName(i.city)) + "</span>" +
        '<span class="who">' + esc((i.factions || []).join(" × ")) + "</span>" +
        '<span class="cas">' + esc(casualtyText(i.casualties)) + "</span>" +
        (i.gm ? '<span class="gm">GM</span>' : "") +
        "</div>" +
        '<div class="line">' + esc(i.blurb) + "</div>" +
        "</div>";
    }).join("");
  }

  function renderMeta(sim) {
    var stamp = sim.generated_at ? " · exported " + sim.generated_at.replace("T", " ").slice(0, 16) + "Z" : "";
    el("clock").innerHTML = "world day <b>" + esc(sim.world_day) + "</b>" + esc(stamp);
    el("foot").innerHTML = "source <b>" + esc(sim.sourceName) + "</b> — static JSON, no server API · " +
      "engine <b>scripts/tableslop/isla-sim.js</b> · GM overrides always win (sim-gm-overrides.json)";
  }

  function showEmpty(err) {
    var msg = '<div class="empty">no sim data found<br>run <code>node scripts/tableslop/isla-sim.js --init --tick 14 --export</code>' +
      '<br><span style="font-size:11px">(' + esc(err && err.message ? err.message : err) + ")</span></div>";
    el("markets").innerHTML = '<section class="panel"><h2>Markets</h2>' + msg + "</section>";
    el("heat").innerHTML = '<div class="empty">—</div>';
    el("tensions").innerHTML = '<div class="empty">—</div>';
    el("blotter").innerHTML = '<div class="empty">—</div>';
    el("clock").textContent = "offline";
  }

  fetchJson("sim-static.json")
    .catch(function () { return fetchJson("sim-state.json"); })
    .then(function (data) {
      var sim = normalize(data, data.commodities ? "sim-static.json" : "sim-state.json");
      renderMeta(sim);
      renderMarkets(sim);
      renderHeat(sim);
      renderTensions(sim);
      renderBlotter(sim);
    })
    .catch(showEmpty);
})();
