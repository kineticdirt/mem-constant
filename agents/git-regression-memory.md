# Git / runtime regression memory

**Purpose:** durable “we already burned here” list so daily deslop + ponytail + think do not reintroduce the same wipe/revert/boot crash.  
**Authority:** append when a regression is proven with evidence; MemPalace may get a short promote later.  
**Not:** a blame log. Prefer **mechanism + prevention**.

| Date | Symptom | Mechanism | Prevention (must exist) | Files / refs |
|------|---------|-----------|-------------------------|--------------|
| 2026-08-02 | `regions-ui` → ellipse stubs / wipe | git bundle / preserve race + `sync-overlay-coords` stub writer | `tableslop-gm-borders-guard.sh`, `REGIONS-UI-LOCK.md`, watermark, refuse empty SCP | `campaigns/tropic-gooner/map/`, `reports/tableslop-regions-ui-wipe-rca-2026-08-02.md` |
| 2026-08-09 | map black, empty legend, REGION NONE | `load()` `const profile` then reassign after clearing `coord_overrides` → TypeError aborts boot | `let profile`; smoke `TS-MAP-OVERRIDE-BOOT` | `scripts/linuxbox/tableslop-server.js`, `tableslop-smoke.mjs` |
| 2026-08-09 | pins look “moved” after refresh | clearing localStorage `coord_overrides` snaps to server vibes coords; pins∉GM polys for several cities | **A locked 2026-08-10:** move pins into borders; update **coords.json + map.json**; never B/C without GM; clear site data once | `PIN-COORDS-LOCK.md`, `pin-into-borders-A-applied.json` |
| 2026-08-10 | `/api/map` ignored map.json pin edit | `coords.json` merge wins over markers | always patch coords regions when moving pins | `tableslop-server.js` `loadMapJson` |
| 2026-08-09 | map black (opacity / tiles) | `pickTileZoom` at fit requested maxZoom tiles stuck opacity 0; reduced-motion + map-reveal | scale-based zoom; `#mapImg{opacity:1}`; build meta cache-bust | `tableslop-server.js` map viewer |
| 2026-08-09 | Hub `:8790` D-state / VERIFY FAIL after bundle | bundle strips `+x` on `scripts/linuxbox/*.sh`; status hangs under swap | `fix-sh-crlf-remote.sh` / chmod after bundle; `verify-runtime-state.sh` | `docs/runtime-state-protection.md` |
| 2026-08-08 | `/world` hang “checking…” | template-literal newline broke inline JS; marked CDN blocked boot | `\n` escapes; bindMods early; `check-world-page-js.js` | `tableslop-server.js` `worldPageHtml` |

## How to append

1. One row per **class** of failure (not every tick flake).
2. **Prevention** column must name a file/script/guard that future agents will hit.
3. Daily deslop (`dd-*`) may mark a row’s prevention as strengthened in Done notes.

## Prevention thin (needs a stronger guard)

- Pin∉border for Paradise/Porto/Jacked — **resolved via A** (centroids); optional smoke PIP gate later if GM wants.
