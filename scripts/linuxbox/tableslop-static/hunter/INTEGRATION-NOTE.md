# INTEGRATION-NOTE — Hunter: The Reckoning silo (tableslop / Isla Primavera)

2026-08-05 · PC lane · **No git commit, no deploy, no server edits were made.** All files below are new and standalone.

## What exists now

| File | Purpose |
|------|---------|
| `campaigns/tropic-gooner/worldbuilding/HUNTER.md` | Worldbuilding layer: the veil model (tiers 0–3), bestiary (15 entries), 7 enemy groups, hunter cells, preparation doctrine (gunplay/melee/heat design contract). Canon-graded per LORE-BIBLE conventions. |
| `scripts/tableslop/hunter-prep.js` | Zero-dep deterministic node CLI: cases + tells, investigation actions (veil), `--loadout` prep kits, `--resolve prepared\|rushed` outcome rolls + heat events, `--export` UI bundle, `--self-check`. |
| `scripts/linuxbox/tableslop-static/hunter/index.html` | Hunter Board page (vaporwave HUD + corkboard-and-string). Client-side only, no frameworks, no CDN. |
| `scripts/linuxbox/tableslop-static/hunter/hunter.js` | Board logic. Renders `window.HUNTER_DATA`; persists revealed tells in `localStorage` (`hunter-board-v1`). |
| `scripts/linuxbox/tableslop-static/hunter/hunter-data.js` | **Generated** bundle (do not hand-edit): cases, gear, veil thresholds, precomputed reveal orders + resolve rolls + heat events. |
| `.staging/portfolio-redesign/_screenshots/hunter-board-smoke.mjs` | Playwright smoke (23 checks, zero console errors). Screenshots → `.staging/tableslop-hunter/`. |

## Wiring the route (deferred — `tableslop-server.js` is owned by another lane)

The board works today over any static file server. To serve it from the tableslop app later, follow the existing `/3d` pattern (`tableslop-server.js`, `THREE_D_DIR` / `serveStaticFile`): add a `HUNTER_DIR = path.join(__dirname, "tableslop-static", "hunter")` constant and route `/hunter`, `/hunter/`, `/hunter/index.html`, and `/hunter/<file>` (traversal-guarded like `/3d/`). The page is public-safe (case lore only, no runtime state); the auth posture is a GM call — hunter case files are in-world secrets, so gating behind the existing tableslop auth like the edit routes is reasonable.

## Regenerating the data bundle

```bash
node scripts/tableslop/hunter-prep.js --export
# default output: scripts/linuxbox/tableslop-static/hunter/hunter-data.js
```

Deterministic: same case data → same reveal orders and rolls (only the timestamp line changes). The export writes CRLF (workspace convention; `core.autocrlf=true` stores LF in git).

## Heat events contract (for the sim lane — documented, not implemented here)

`--resolve` (and the exported `resolve.heat` block) emits zero or more events:

```json
{ "event": "heat", "case": "thin-blood-plus-one", "source": "gunfire|collateral|witness|cleanup_bill",
  "severity": 1, "faction": "CRT|Stevens|Coral Trace|Visibility Board", "note": "one line, diegetic" }
```

Severity: 1 = paperwork, 2 = attention, 3 = response. Sources: `gunfire` (any firearm discharge), `collateral` (bystander/property), `witness` (survivors who talk), `cleanup_bill` (Stevens invoices). The sim lane owns what heat *does*; this silo only emits. Design rationale: HUNTER.md § "The preparation doctrine".

## Verification

- `node scripts/tableslop/hunter-prep.js --self-check` → SELF-CHECK OK (15 cases / 70 tells / 12 gear rows; outcome tables sum to 1 for both modes at all 5 danger ratings; every case simulated resolvable to veil tier 3; export determinism).
- `cd .staging/portfolio-redesign/_screenshots && node hunter-board-smoke.mjs` → all 23 checks pass, zero console errors; screenshots in `.staging/tableslop-hunter/` (`hunter-board.png`, `hunter-case-file.png`, `hunter-prep-panel.png`). Note: smoke launches chromium with `--disable-gpu` (Windows headless `Page.captureScreenshot` quirk).

## Locks honored / scope notes

- `wb-tg-masquerade` (veil is canon), `wb-tg-threats` (threat types), `wb-tg-hunter-rules` (default Hunter — creeds referenced, no stat blocks), `wb-tg-date` (2019 — gear prices are 2019 USD), `wb-tg-factions` (no favor-debt anchors anywhere).
- Not touched: `regions-ui.json`, `map.json`, registries, `agents/state/**`, existing worldbuilding files, `tableslop-server.js`.
- New named faces (the Plus-One, the Doorman, Sister Aurea Finn, Ondi Paz, the Last Light bar) are marked **[proposal]** in HUNTER.md pending GM. Five GM questions are queued in HUNTER.md § Open questions — not posted to the Hub Inbox (lane discipline is one question per tick; the GM can promote from the doc).
- Villa Miel / Lagooni Seika content is *prep*, per the STORIES.md footer — those arcs stay queued behind real table time.
