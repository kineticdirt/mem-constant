# tableslop · Primavera — Client-first profile & save model

**Status:** PLANNING (Phase 0 scaffold in server — local profile works without Discord credentials)  
**Goal:** Login, profile, and saved progress **without** a database or heavy linuxbox CPU. Browser does the “game loop”; server pre-bakes static data and optionally stores tiny per-user JSON blobs.

---

## Design principles

| Principle | Meaning |
|-----------|---------|
| **Client-first** | UI state, notes, visit log, map resolution, animations — all in the browser. |
| **Not a native game** | No WebGPU / Unity — standard DOM + CSS + fetch. Optional Canvas only for pin math later. |
| **Pre-process, don’t compute live** | Map JSON, region boards, character markdown paths baked at deploy. No per-request LLM or image work. |
| **Server = dumb + fast** | Auth gate, static files, in-memory cache, optional 1-file-per-user sync. |
| **Progressive enhancement** | Works as **guest** (localStorage only). Discord login adds identity + optional cloud save. |

---

## Three data tiers

### Tier A — Static world (server, pre-built)

Shipped with git deploy; read once, cached aggressively.

- `campaigns/tropic-gooner/map/map.json` — pins, labels, types
- `projects/tableslop/regions.json` — workflow lanes (merged into `/api/map` at cache time)
- Future: `map/regions/R03.json` — lore excerpt, `discord_channel_id`, `character_slugs[]`
- Future: `characters/*.md` — fetched **on region click**, not on initial load

**Server tricks:** parse + merge at startup (or on file mtime change); serve with `Cache-Control: public, max-age=300` on `/api/map`. Map PNGs: `max-age=86400` (images change rarely).

### Tier B — Identity (server, cookie only)

Already implemented when `TABLESLOP_REQUIRE_DISCORD_AUTH=1`:

- Discord OAuth → `identify` scope → guild membership check via bot token
- Signed httpOnly session cookie: `{ id, username }` — **no user table**
- `/api/me` exposes session to client (no secrets)

**Optional login (auth off):** map stays public; “Link Discord” still sets cookie for future cloud sync.

### Tier C — Player state (client primary)

**Phase 0 (now):** `localStorage` key `tableslop-primavera-profile-v1`

```json
{
  "v": 1,
  "mapRes": "2k",
  "lastRegionId": "primavera-capital",
  "visited": ["primavera-capital", "north-dock"],
  "notes": { "north-dock": "Session 3: met the fixer" }
}
```

**Phase 1:** IndexedDB for larger offline lore cache (Service Worker optional — defer until region detail panels ship).

**Phase 2 — cloud save (optional, still no DB):**  
`POST /api/profile` with session cookie → write `~/.linuxbox-tableslop/profiles/{discord_id}.json` (cap ~64 KB).  
`GET /api/profile` merges over local on login. Conflict rule: **newest `updated_at` wins**; client keeps backup in localStorage.

**Phase 3 — character sheets:** client fetches `/api/character/{slug}` (static MD → JSON wrapper at deploy or first read cached). Server never runs character logic.

---

## Processing split (who does what)

| Work | Where | Notes |
|------|--------|-------|
| Pin placement / hit tests | Client | Percent coords; CSS `transform` for hover |
| 2K/4K swap | Client | Toggle `img.src`; browser decodes PNG |
| Vaporwave animations | Client | CSS only; `prefers-reduced-motion` respected |
| Map + region merge | Server once | Cached until `map.json` mtime changes |
| Discord OAuth + guild check | Server | One-time per session; bot REST call on callback only |
| User notes / visit log | Client | localStorage; sync optional |
| Character markdown render | Client | `marked` or minimal MD→HTML in browser; lazy fetch |
| Image tiling / sprites | **Defer** | Single PNG + browser downscale is enough for 14 pins |

---

## API surface (minimal)

| Route | Auth | Role |
|-------|------|------|
| `GET /health` | none | ops probe + `discord_auth` flag |
| `GET /api/me` | none | `{ logged_in, id, username, discord_auth, discord_configured }` |
| `GET /api/map` | if required | cached world bundle |
| `GET /api/regions` | if required | board JSON |
| `GET /map-image` | if required | PNG stream + cache headers |
| `GET/POST /api/profile` | session | Phase 2 — tiny JSON blob |
| `GET /api/region/:id` | if required | Phase 1 — static region chunk |
| `GET /api/character/:slug` | if required | Phase 3 — static MD |

---

## Save-on-CPU tricks (linuxbox ~2 GB)

1. **In-memory map cache** — no disk read per `/api/map` hit.
2. **Browser cache** — `Cache-Control` on map API + images; repeat visits = zero server work.
3. **Lazy loads** — region detail + character MD only when user opens a pin.
4. **No WebSocket** — poll nothing; static campaign map.
5. **No SSR** — single HTML shell; data via fetch (already the model).
6. **Pre-merge at deploy** — optional script `scripts/tableslop/bundle-map.mjs` emits `map.bundle.json` so runtime merge is O(1) read.
7. **ETag** (later) — `If-None-Match` on `/api/map` → 304 empty body.
8. **Service Worker** (later) — offline map for players who visited once; install only after Tier A stable.

---

## Phased rollout

### Phase 0 — Local pilot (no credentials)

- [x] Client profile in localStorage (map res, last region, visited, notes)
- [x] `/api/me` for UI login/logout affordances
- [x] Map JSON memory cache + cache headers
- [ ] Region detail panel reads notes from profile (mv-03)

### Phase 1 — Discord identity

- Human: Developer Portal Client ID/Secret → `configure-tableslop-discord-auth.sh`
- Enable `TABLESLOP_REQUIRE_DISCORD_AUTH=1` when ready to gate
- “Link Discord” visible even in public mode for early adopters

### Phase 2 — Cloud save (file-backed)

- `POST /api/profile` ≤64 KB JSON per Discord user
- Client merge on login; export/import JSON file for backup (game-style save slot)

### Phase 3 — Region + character lazy load

- Per-region JSON chunks + character MD endpoints
- Client-side MD render; Discord deep links from region chunk

---

## What we are **not** building (YAGNI)

- Supabase / Postgres / Redis
- Real-time multiplayer sync
- Server-side image processing or tiling farm
- WebGPU / Phaser / game engine
- Session replay or analytics pipeline

---

## Success criteria

1. Guest can close tab, reopen, and see last region + 2K/4K choice restored.
2. With Discord configured, login shows `@username`; logout clears session; map access follows `REQUIRE_AUTH`.
3. `/api/map` on linuxbox: no measurable CPU spike under repeated curl (cached).
4. Cloud save (Phase 2): one JSON file per user, no daemon beyond existing Node server.

**Coordinate:** `[PC]` lines in `AI_GROUPCHAT.md` before each phase. See also `tableslop-discord-oauth-plan.md` for OAuth portal steps.
