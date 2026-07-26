  function getInjectionPackSelection() {
    ensureRpg(session);
    const raw = session.rpg.injection_packs;
    if (Array.isArray(raw)) {
      return { mode: "force", force: raw.map(String), pin: [], mute: [] };
    }
    const obj = raw && typeof raw === "object" ? raw : {};
    return {
      mode: "gate",
      force: [],
      pin: Array.isArray(obj.pin) ? obj.pin.map(String) : [],
      mute: Array.isArray(obj.mute) ? obj.mute.map(String) : [],
    };
  }

  function setInjectionPackSelection(next) {
    ensureRpg(session);
    if (!next || next.mode === "gate") {
      const pin = (next && next.pin) || [];
      const mute = (next && next.mute) || [];
      if (!pin.length && !mute.length) {
        delete session.rpg.injection_packs;
      } else {
        session.rpg.injection_packs = { pin: pin.slice(), mute: mute.slice() };
      }
    } else {
      session.rpg.injection_packs = (next.force || []).slice();
    }
  }

  function setPacksStatus(msg) {
    const node = document.getElementById("packsStatus");
    if (node) node.textContent = msg || "";
  }

  function renderInjectionPacksUi() {
    const list = document.getElementById("packsList");
    if (!list) return;
    const ST = getSessionTurnAugment();
    const catalog =
      ST && typeof ST.listInjectionPacks === "function" ? ST.listInjectionPacks() : [];
    if (!session || !session.rpg) {
      list.innerHTML =
        '<p class="panel-hint">Load a session to pin or mute injection packs.</p>';
      return;
    }
    ensureRpg(session);
    const sel = getInjectionPackSelection();
    const last = Array.isArray(session.rpg._last_injection_packs)
      ? session.rpg._last_injection_packs.map(String)
      : [];
    if (!catalog.length) {
      list.innerHTML =
        '<p class="panel-hint">Pack registry not loaded — hard-refresh the page.</p>';
      return;
    }
    list.innerHTML = "";
    catalog.forEach(function (pack) {
      const id = String(pack.id || "");
      const pinned = sel.pin.indexOf(id) >= 0;
      const muted = sel.mute.indexOf(id) >= 0;
      const fired = last.indexOf(id) >= 0;
      const row = document.createElement("div");
      row.className =
        "packs-row" +
        (pinned ? " is-pinned" : "") +
        (muted ? " is-muted" : "") +
        (fired ? " is-fired" : "");
      row.setAttribute("data-pack-id", id);
      const meta = document.createElement("div");
      meta.className = "packs-meta";
      const title = document.createElement("div");
      title.className = "packs-title";
      title.textContent = String(pack.label || id);
      if (fired) {
        const badge = document.createElement("span");
        badge.className = "packs-badge";
        badge.textContent = "last fired";
        title.appendChild(badge);
      }
      const summary = document.createElement("div");
      summary.className = "packs-summary";
      summary.textContent = String(pack.summary || "");
      meta.appendChild(title);
      meta.appendChild(summary);
      const toggles = document.createElement("div");
      toggles.className = "packs-toggles";
      function makeToggle(kind, checked, titleText) {
        const lab = document.createElement("label");
        lab.title = titleText;
        const inp = document.createElement("input");
        inp.type = "checkbox";
        inp.checked = !!checked;
        inp.setAttribute("data-pack-toggle", kind);
        inp.setAttribute("data-pack-id", id);
        lab.appendChild(inp);
        lab.appendChild(document.createTextNode(kind === "pin" ? "Pin" : "Mute"));
        return lab;
      }
      toggles.appendChild(makeToggle("pin", pinned, "Force this pack every Send"));
      toggles.appendChild(makeToggle("mute", muted, "Never inject this pack"));
      row.appendChild(meta);
      row.appendChild(document.createElement("span"));
      row.appendChild(toggles);
      list.appendChild(row);
    });
    if (last.length) {
      setPacksStatus("Last Send: " + last.join(", "));
    } else if (sel.pin.length || sel.mute.length) {
      setPacksStatus(
        "Overrides: pin=" +
          (sel.pin.join(",") || "—") +
          " · mute=" +
          (sel.mute.join(",") || "—")
      );
    } else {
      setPacksStatus("Relevance gating (max 2/turn)");
    }
  }

  async function onPackToggleChange(ev) {
    const t = ev && ev.target;
    if (!t || !t.getAttribute || t.getAttribute("data-pack-toggle") == null) return;
    if (!session || !session.rpg) {
      setPacksStatus("Load a session first.");
      return;
    }
    const id = String(t.getAttribute("data-pack-id") || "");
    const kind = String(t.getAttribute("data-pack-toggle") || "");
    if (!id || (kind !== "pin" && kind !== "mute")) return;
    ensureRpg(session);
    const sel = getInjectionPackSelection();
    // Switching to gate mode if we were on a force-array
    let pin = sel.mode === "gate" ? sel.pin.slice() : [];
    let mute = sel.mode === "gate" ? sel.mute.slice() : [];
    function setList(arr, on) {
      const i = arr.indexOf(id);
      if (on && i < 0) arr.push(id);
      if (!on && i >= 0) arr.splice(i, 1);
    }
    if (kind === "pin") {
      setList(pin, !!t.checked);
      if (t.checked) setList(mute, false); // pin wins over mute
    } else {
      setList(mute, !!t.checked);
      if (t.checked) setList(pin, false);
    }
    setInjectionPackSelection({ mode: "gate", pin: pin, mute: mute });
    await saveSession();
    renderInjectionPacksUi();
    logDebug("injection_packs_override", { pin: pin, mute: mute });
  }

  function initInjectionPacksUi() {
    const list = document.getElementById("packsList");
    if (list && !list._packsBound) {
      list._packsBound = true;
      list.addEventListener("change", function (ev) {
        onPackToggleChange(ev);
      });
    }
    const btnClear = document.getElementById("btnPacksClear");
    if (btnClear && !btnClear._packsBound) {
      btnClear._packsBound = true;
      btnClear.addEventListener("click", async function () {
        if (!session || !session.rpg) return;
        ensureRpg(session);
        delete session.rpg.injection_packs;
        await saveSession();
        renderInjectionPacksUi();
        setPacksStatus("Overrides cleared");
      });
    }
    renderInjectionPacksUi();
  }
