# Linuxbox user-facing products audit — 2026-08-04 (~20:35–20:50 EDT)

**Scope:** Hub (:8790) · tableslop map (:8765) · campaigns availability (:8768) · Pixi RP (:8767) · tunnel/edge errors (24h).
**Method:** read-only probes via `ssh potato-lan` (loopback curls, journals, systemd, on-disk SoT) + public-edge curls from the box. No `&&`. No writes to GM borders / chat threads / registries / inbox.
**Fixes applied:** 1 (chat catalog restore — see P1). Holder: `linuxbox-products-audit-20260804`.

## Verdict: all four products UP and serving; one real config-gap fixed; remaining items are content-lane or pending-deploy, not outages.

| Product | Loopback | Public edge | Service | Verdict |
|---|---|---|---|---|
| Hub :8790 (`linuxbox-status`) | 200 | `abhinavall.net/Linuxbox/` (Access-gated) + `/Intel/` 200 | active, stable | **Healthy** (catalog gap fixed) |
| tableslop :8765 (`linuxbox-tableslop`) | 200 | `map.tableslop.org` 200 | active | **Healthy** (PC deploy pending) |
| campaigns :8768 (`linuxbox-campaigns-avail`) | 200 | `campaigns.tableslop.org` 200 | active | **Healthy** |
| Pixi RP :8767 (`linuxbox-pixi-rp`) | 200 | Tailscale/LAN only (by design) | active since Aug 3 19:46, NRestarts=0 | **Healthy** |
| origin proxy :8780 / portfolio :3000 | 200 | `abhinavall.net` 200 | active | Healthy |

---

## 1. Hub (:8790)

- **Playwright smokes PASS:** chat-ui smoke 2026-08-04 20:29 **PASS 8/8** (composer, new-chat campaign UI, no console errors). dashboard-ui smoke 2026-08-04 19:49 **PASS (0 fail, 4 warn)** incl. all chat-mobile checks (no h-overflow, Threads drawer open/close, composer reachable).
- **Smoke warns (all harness/data-scope, not product bugs):**
  - `1 lane chip in bad state` — think tick at smoke time had exit 124 (timeout, see P4); current tick running fine (`current_pod` think, started 20:35 EDT).
  - `no character tiles (registry empty?)` — false alarm: `/api/characters-registry?campaign=tropic-gooner` returns **15 visible rows** (file: 27 rows, version 32). Smoke likely sampled `nyc-mafia-dnd`, whose registry is legitimately empty (worldbuilding-phase campaign, no ingest yet).
  - `no inbox choice controls` — inbox `open[]` is empty (count 0); nothing to render.
  - `no character story file` — no story fixture to layout-test.
- **/api/agent sane:** dash_build `db-20260804-hub-obs-lanes-r1`; thermal available (cpu-thermal 64°C); eth0 link up 100 Mbps; per-core CPU present; `free_models_health` = free pool UP; `chat_jobs` idle; `inbox_open_count` 0.
- **Docs scopes OK:** `/api/docs/tree` 151 files; scopes = `nyc-mafia-dnd`, `tropic-gooner`, **`infranet`, `infranet-eng`** (infranet indexed as required). `/Linuxbox/docs-wiki.js` 200 (absolute-path rule holds).
- **Mobile lane layout OK:** `.mobile-page-select-wrap { display:none }` by default, `display:block` only inside `@media (max-width:767px)` — the known "steals column 1" regression is **not** present (`scripts/linuxbox/linuxbox-status/index.html:1716-1730`).
- **Journal:** zero error/5xx lines in 24h.

## 2. tableslop (:8765)

- **GM borders guard PASS:** `tableslop-gm-borders-guard.sh` → `PASS v=19 verts=371 (r01-paradise:277, r03-crimson-quay:94)`. Skip-worktree + v19-in-HEAD protections from today's `regions-ui-head-v19` work are holding.
- **Map assets/API:** `/` 200, `/api/map` 200 (15 pins, `overlay_layer: ui`, `label_layer: ui`), `/api/regions` 200 (17 task-board regions), `/camp/` proxy 200. Live overlay serves the same 15 `areas` as on-disk `regions-ui.json`; polygons stored as SVG `points` strings — Paradise 277 + Jackedsonville (id `r03-crimson-quay`) 94 intact; other 13 areas legitimately 0-vert placeholders awaiting GM Draw. (`/map.json`, `/regions-ui.json` 404 at root — served via `/api/*` instead; not a bug.)
- **Journal:** zero errors in 24h.
- **Health matrix (`tableslop_errors` in /api/agent): 9 content errors — GM/content lane, NOT runtime:**
  - `TS-MAP-CITY-BORDER-MISSING` ×1 — Porto Lujara (`r02-porto-lujuria`) live 0 verts. Ledger confirms the 277-pt bak poly was **GM-reassigned to Paradise on 2026-08-01** (area note on disk). Needs GM Draw or rebind — do not invent verts.
  - `TS-MAP-LABEL-LORE` ×6 — forbidden display names still referenced: Porto Lujuria, Crimson Quay, CuloVera, Lagoona Seica, Federal Shores (+1 dup class). vibes.png-spelling reconciliation.
  - `TS-MAP-SOFT-PIN` ×2 — Orchid Falls, Nueva Vista.

## 3. Pixi RP (:8767)

- **Auto-continue (Aug 2 fix) intact:** deployed `PixiApp/chat-ui/server.py` (Aug 2 17:36) contains Part A seamless server-side continuation (`_should_auto_continue`, `finish_reason=length` re-fire with assistant prefix, per-profile `continuation_max_tokens`). `response_hygiene.py` deployed same timestamp.
- **Config:** `CHAT_UI_TURN_MAX_TOKENS=4096` (raised per fix). `CHAT_UI_ALLOW_PAID_FALLBACK=1` — **intentional** per ledger 2026-08-02T23:55Z (Laguna RPD=0 → DeepSeek FG); not drift.
- **Recent turns clean:** latest session `c5409afe` (active today 18:05) — last 6 messages (user/assistant) all end with complete prose; no mid-sentence truncation, no hanging tails.
- **Service:** active since Aug 3 19:46, NRestarts=0, UI 200, `/static/app.js` 200. Journal quiet (no per-turn logging at default level — failures would surface in session state, none found).

## 4. Campaigns availability (:8768)

- Page 200 ("tableslop · campaigns"), `/api/availability` → `ok:true`, `tropic-gooner` status **up** with map/tracker/Discord links. Journal silent (no errors). Public edge 200.

## 5. Tunnels / 5xx / CORS / missing assets (24h)

- **No origin 5xx, no CORS errors, no missing-asset errors** in any product journal.
- `cloudflared-abhinavall` 156 ERR / `cloudflared-tableslop` 132 ERR, classified:
  - ~54/tunnel `failed to dial to edge with quic: timeout: no recent network activity` (+QUIC stream/datagram variants) — upstream UDP/NAT idle flaps on the home link; cloudflared re-dials and recovers (re-registrations visible; edges 200 now). Benign but noisy.
  - `context canceled` (~26 abhinavall, 5 tableslop) — clients aborting long-polls (`/api/think-live`, `/api/agent`); benign.
  - 1 DNS `lookup region1.v2.argotunnel.com: i/o timeout` — transient.
- All 4 public edges 200 at audit time: `map.tableslop.org`, `campaigns.tableslop.org`, `abhinavall.net/Intel/`, `abhinavall.net`.

---

## Prioritized issues

### P1 — FIXED: Hub Chat Models catalog missing on box
`agents/model-budget/chat-catalog.json` was absent on potato (only `.bak` files since Jul 24/25) → server fell back to injected free rows (`note: "injected — catalog missing live free rows"`, `tokens_per_sec_est: null`).
**Root cause:** box copy of `agents/protected-runtime-paths.json` is stale (`updated: 2026-07-15`, **no** chat-catalog entry) vs PC (`2026-08-01`, entry present with "prefer also committing to Linuxbox main" note). Unprotected + untracked → vanished.
**Fix applied:** restored from newest sane backup `chat-catalog.json.bak.pre-hubfree-r3` (9 curated rows: 5 free / 4 paid, incl. `_do_not_readd` policy). Verified `/api/chat/models` now serves all 9 curated rows, **0 injected**. Audit copy left at `chat-catalog.json.restored-audit-20260804`. No restart needed (server reads per-request).
**Residual (not done — deploy action):** publish/bundle PC→box so the 2026-08-01 protected-paths manifest lands on potato and the protection is durable.

### P2 — tableslop Draw Rebind not deployed to box
PC `scripts/linuxbox/tableslop-server.js` = 4623 lines **with** Draw Rebind (`drawRebindBtn`, `rebindDrawVertsToSelectedRegion`, "Unsaved verts belong to other region" → rebind/clear/cancel). Box = 2849 lines, **no rebind**. So "rebind working on box" = **no, not yet deployed** — expected under the PC-iterate/milestone-deploy rule.
**Action:** milestone deploy via `push-tableslop-map.sh` (regions-ui excluded by default) when the user calls the milestone. Not done unilaterally.

### P3 — tableslop health matrix: 9 GM/content items (see §2)
Porto border redraw, 6 lore-label reconciliations, 2 soft pins. Owner: GM/content lane. Agent must not invent verts or rename lore labels autonomously.

### P4 — think tick timeouts (cross-lane, tracked in infra audit)
Last completed tick exit 124 (`dashboard-running-now`, 19:52–19:57Z); infra audit same evening measured **41/113 (36%) exit-124 today** with C6-smoke + free-429 churn + SD I/O stalls inside the 240–300s `timeout`. Current tick healthy. Recommendation lives in `reports/linuxbox-audit-infra-2026-08-04.md` (`THINK_TIMEOUT_OPS` 300→420 or move smoke to sync tick).

### P5 — tunnel QUIC idle flaps (cosmetic/noise)
~54 dial timeouts/tunnel/24h, self-healing. If it ever becomes user-visible: consider `--protocol http2` on the units or UDP keepalive tuning at the NAT. Not changed.

## Not issues (checked, explicitly fine)
- `CHAT_UI_ALLOW_PAID_FALLBACK=1` on Pixi — deliberate Aug 2 ledger decision.
- Hub smoke's "characters registry empty" warn — tropic registry 15 visible rows; smoke sampled empty nyc registry.
- Pixi empty journal — quiet default logging; session state shows clean turns.
- `/api/health` 404 on Hub/Pixi, `/api/campaigns` 404 on :8768 — routes never existed; products use other endpoints.
- `context canceled` cloudflared ERRs — client aborts on long-polls.
- Portfolio :3000 + origin proxy :8780 — 200 loopback and edge.

## Fixes applied this audit
1. **Restored** `agents/model-budget/chat-catalog.json` on potato from `.bak.pre-hubfree-r3` (+ left `.restored-audit-20260804` copy). Verified via API. No service restart required.

No restarts, chmods, or cache-busts were needed. No GM borders, chat threads, registries, or inbox state touched.
