/**
 * Cyber/CRT underlays — CRT, glitch, netrun (not Pip-Boy green).
 */
(function () {
  "use strict";

  const THEMES_ON = ["red", "default", "neon"];

  const EGGS = [
    { id: "crt-vignette", onThemes: THEMES_ON },
    { id: "glitch-chroma", onThemes: THEMES_ON },
    { id: "cyber-grid", onThemes: THEMES_ON },
    { id: "netrun-drift", onThemes: ["red", "neon"] },
    { id: "static-noise", onThemes: THEMES_ON },
    { id: "hacker-glyphs", onThemes: ["red", "neon"] },
  ];

  function themeName() {
    return document.body.getAttribute("data-theme") || "default";
  }

  function underlaysEnabled() {
    return THEMES_ON.indexOf(themeName()) >= 0;
  }

  function buildStack() {
    const stack = document.getElementById("siteUnderlayStack");
    if (!stack) return;
    EGGS.forEach(function (egg) {
      if (stack.querySelector('[data-egg="' + egg.id + '"]')) return;
      const layer = document.createElement("div");
      layer.className = "site-underlay-layer";
      layer.setAttribute("data-egg", egg.id);
      if (egg.customText) layer.setAttribute("data-custom-text", egg.customText);
      stack.appendChild(layer);
    });
  }

  function syncUnderlays() {
    const stack = document.getElementById("siteUnderlayStack");
    if (!stack) return;
    const on = underlaysEnabled();
    stack.hidden = !on;
    const theme = themeName();
    EGGS.forEach(function (egg) {
      const layer = stack.querySelector('[data-egg="' + egg.id + '"]');
      if (!layer) return;
      layer.hidden = !(on && egg.onThemes.indexOf(theme) >= 0);
    });
  }

  function init() {
    buildStack();
    syncUnderlays();
    const observer = new MutationObserver(syncUnderlays);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
