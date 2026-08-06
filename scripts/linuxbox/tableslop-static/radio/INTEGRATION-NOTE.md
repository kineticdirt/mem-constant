# Radio integration note (for whoever owns the server window)

Everything in `scripts/linuxbox/tableslop-static/radio/` is standalone static. **No edit to
`tableslop-server.js` was made by this lane.** Wire it the same way as the `/3d` mount.

## Mount

Serve the directory at **`/radio/`**, following the `/3d` pattern in `tableslop-server.js`:

```js
const RADIO_DIR = path.join(__dirname, "tableslop-static", "radio");
// route (near the /3d stanzas):
//   /radio            -> serveStaticFile(res, path.join(RADIO_DIR, "index.html"), 300)
//   /radio/           -> same
//   /radio/<rel>      -> serveStaticFile(res, path.join(RADIO_DIR, rel), 300)   // traversal-guarded
```

`serveStaticFile` already maps `.html/.js/.css/.json`; add `.woff2` to `STATIC_FILE_TYPES`
as `font/woff2` (the page vendors three fonts under `radio/fonts/` — without the MIME the
browser falls back to monospace and the HUD loses the VT323/Orbitron look).

## Files that need production deploy (push lists)

- `scripts/linuxbox/tableslop-static/radio/index.html`
- `scripts/linuxbox/tableslop-static/radio/radio.js`
- `scripts/linuxbox/tableslop-static/radio/radio.css`
- `scripts/linuxbox/tableslop-static/radio/fonts/` (3 woff2, ~43 KB total)
- `scripts/linuxbox/tableslop-static/radio/stations.json`
- `scripts/linuxbox/tableslop-static/radio/bulletins.json` (**regenerate, don't just copy**)
- `scripts/tableslop/radio-bulletins.js` (the generator; runs anywhere Node runs)
- `campaigns/tropic-gooner/worldbuilding/RADIO.md` (lore, no deploy needed for the app)

## Nightly bulletin regen (suggested cron shape, not installed)

```
12 4 * * * node ~/agent-dump/scripts/tableslop/radio-bulletins.js >> /mnt/archive/logs/radio-bulletins.log 2>&1
```

Defaults write `bulletins.json` beside `stations.json` with today's date; `--date YYYY-MM-DD`
pins a world-day. Same date + same inputs = same bulletins (seeded PRNG), so regen is idempotent.

## isla-sim bridge (optional, phase 2 of the sim design)

If `sim-broadcast.json` (from `isla-sim.js --export`) sits in this radio dir, the generator
merges its typed items verbatim ahead of template bulletins; `--sim PATH` points elsewhere.
On potato the sim exports beside its state file — either copy/symlink `sim-broadcast.json`
into the radio dir in the same cron, or call:

```
node ~/agent-dump/scripts/tableslop/radio-bulletins.js --sim /path/to/sim-broadcast.json
```

No code change needed when the file appears or disappears; the engine falls back to
template-only. Merged bulletins carry `"source": "isla-sim"` and render a `·WIRE` tag in the UI.

## Island-map link I'd like added

A HUD link on the map page (next to the 3D toggle) to **`/radio/`**, label `RADIO` —
the dial is the island's ambient layer and deserves the same chrome as the map/3D views.
The radio page links back to `/` already (`.hud-link`).

## Notes / caveats

- `stations.json` stream URLs were curl-verified 2026-08-05 (`audio/mpeg`). Two stations
  (KLJR, KRBY) are intentionally stream-less; the player renders WebAudio static there.
  Re-verify quarterly — icecast URLs rot.
- Audio starts only on user gesture (PLAY) — browser autoplay policy; headless smokes will
  see the UI but not hear sound.
- `bulletins.json` is generated content, not canon; lore SoT is
  `campaigns/tropic-gooner/worldbuilding/RADIO.md`.
