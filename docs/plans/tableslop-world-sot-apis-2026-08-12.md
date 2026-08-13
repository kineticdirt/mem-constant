# Tableslop World SoT APIs — plan (2026-08-12)

**Role:** `role-backend` · **Campaign:** `tropic-gooner` / Isla Primavera  
**Status:** PLAN ONLY — no `tableslop-server.js` edits in this deliverable  
**Hard locks:** NEVER wipe / empty / ellipse-stub `campaigns/tropic-gooner/map/regions-ui.json` · **/3d shelved** (2D map = working SoT; height/3d transfer later)  
**Holder:** `tableslop-world-sot-apis`

**Why this exists:** World systems (roads, weather, board, phone, logistics) must grow without stuffing GB-scale geometry into one JSON, without PC↔potato clobber races, and without putting TTS on the 2 GB potato. Extend the existing `weather-state.json` + `tableslop-world-weather.js` + chars-registry `version`/`base_version` pattern.

**Existing anchors (do not reinvent):**

| Anchor | Path / resource |
|--------|-----------------|
| Weather SoT today | `campaigns/tropic-gooner/worldbuilding/weather-state.json` |
| Weather engine | `scripts/linuxbox/tableslop-world-weather.js` (lock `world-weather:tropic-gooner`) |
| Weather HTTP today | `GET`/`POST` `/api/world/weather` (POST actions; this plan adds PATCH shapes) |
| Diegetic clock | `campaigns/tropic-gooner/map/diegetic-clock.json` |
| Phone dial engine | `scripts/tableslop/phone-responder.js` (`lookupNumber`; intercepts exist, **no 911 yet**) |
| Phone static UI | `scripts/linuxbox/tableslop-static/phone/` |
| Registry versioning | `docs/chars-registry-versioning.md` (HTTP 409 `version_conflict`) |
| Multitask lock | `docs/multitask-shared-state-lock.md` + `scripts/linuxbox/multitask-lock.sh` |
| Sacred borders | `campaigns/tropic-gooner/map/regions-ui.json` — **out of scope forever for this plan** |

---

## 1. Shard layout (GB-safe NDJSON + index)

Root under campaign (not under `map/` so deploy/guards never confuse shards with `regions-ui`):

```text
campaigns/tropic-gooner/
  worldbuilding/
    weather-state.json          # hot summary (already exists; keep ≤ few hundred KB)
  roads/
    index.json                  # version, shard_ids[], bbox, region_id → shard map
    shards/
      r01-paradise.ndjson       # one road feature per line
      r02-porto-lujuria.ndjson
      r03-crimson-quay.ndjson
      …
    meta/
      highway-overlay-ref.json  # pointer to map/highways.json (do not duplicate verts)
  weather/
    index.json                  # version, phenomenon bag pointer, city ids
    phenomena.ndjson            # active/historical phenomenon events (append-friendly)
    ticks/
      2019-05-14.json           # optional daily snapshot shard (small)
  board/
    index.json                  # version, open_thread_ids[], resolved_count
    threads.ndjson              # one story/action thread per line
    deltas/
      <thread_id>.ndjson        # append-only World deltas applied for that thread
  phone/
    index.json                  # version, directory_sha, emergency_codes[]
    directory.ndjson            # contacts + intercepts (id-keyed)
    sessions/
      <session_id>.json         # active dispatch / call session (small JSON, not NDJSON)
    voice-manifest.json         # maps utterance_id → static relative path + hash
  logistics/
    index.json                  # version, route_ids[], mode tags
    routes.ndjson               # shipping / bus / supply edges
    loads.ndjson                # optional cargo/need pressure rows
```

### NDJSON / index contract

| Rule | Detail |
|------|--------|
| **Hot path** | Clients load `*/index.json` first (≤ ~64 KB target). Never download all shards on map open. |
| **One object / line** | Each NDJSON line is a JSON object with stable `id` (string). No pretty-print inside shards. |
| **Region load** | Roads: `GET` by `region_id` → server streams **one** shard file (or 404 empty). |
| **Append vs rewrite** | Phenomena / board deltas / logistics loads: **append** lines. Directory / roads geometry edits: rewrite shard under lock + bump index `version`. |
| **GB-safe** | Cap single shard ~50–100 MB soft; split by `region_id` (roads) or by month (phenomena history). Potato serves files; does not parse whole island into RAM on tick. |
| **No TTS blobs in SoT** | Voice audio lives under static cache (§6); SoT only stores manifest rows. |
| **Never** | Put road polylines or board history into `regions-ui.json` or one monolithic `world-state.json`. |

### Example road feature line

```json
{"id":"rd-par-marina-01","region_id":"r01-paradise","kind":"local","name":"Marina Spur","refs":["hwy:green"],"coords":[[12.4,44.1],[12.6,44.0]],"updated_at":"2026-08-12T00:00:00Z"}
```

### Example `roads/index.json`

```json
{
  "version": 1,
  "updated_at": "2026-08-12T00:00:00Z",
  "campaign": "tropic-gooner",
  "shards": [
    {"id": "r01-paradise", "path": "shards/r01-paradise.ndjson", "feature_count": 0, "bytes": 0}
  ],
  "region_to_shard": {"r01-paradise": "r01-paradise"},
  "notes": "2D working SoT; /3d shelved; regions-ui untouched"
}
```

---

## 2. Merge-by-id + multitask lock resources

Mirror chars-registry: **disk lock → ledger Intent → pull both copies → union by `id` → write with `base_version` → release**.

### Lock resource names (invent / standardize)

| Resource | Guards | Notes |
|----------|--------|-------|
| `chars-registry:tropic-gooner` | (existing) | unchanged |
| `world-weather:tropic-gooner` | (existing in `writeWeatherState`) | keep; also covers `weather/phenomena.ndjson` writes |
| `roads:tropic-gooner` | `roads/index.json` + any `roads/shards/*.ndjson` | **new** |
| `board:tropic-gooner` | `board/index.json`, `threads.ndjson`, `deltas/*` | **new** |
| `phone:tropic-gooner` | `phone/index.json`, `directory.ndjson`, sessions, voice-manifest | **new** |
| `phone-session:<session_id>` | single active dispatch/call session file | **new** (short TTL; stealable if stale) |
| `logistics:tropic-gooner` | `logistics/index.json` + NDJSON | **new** |
| `map:tropic-gooner` | (existing docs pattern) | pins / map.json only — **never** use for `regions-ui` agent rewrites |

### Merge-by-id rules

1. Union rows by `id`; never blind-overwrite potato with PC.
2. Prefer potato for live GM/runtime fields (dispatch sessions, board thread state, voice-manifest hashes already on box).
3. Soft-hide only via `hidden: true` + optional `canonical_id` (same class as registry stubs) — do not delete board/phone rows without GM ask.
4. NDJSON rewrite path: load shard → map by id → apply patch set → rewrite file atomically (temp + rename) under lock.
5. Append-only deltas: no merge needed for new lines; conflict only on index `version` when compacting.

### Agent acquire example

```bash
bash scripts/linuxbox/multitask-lock.sh acquire roads:tropic-gooner \
  --holder "pc-backend-$(date +%s)" --wait --note "union roads shard r01"
```

---

## 3. API sketch on `tableslop-server` (GET / PATCH only — no implementation)

Auth: same as World edit today (`editGate` / Discord owner|admin for mutating; public GET may stay read-only where product allows). All mutating bodies carry `base_version` from the shard **index** (or weather-state `version`).

> Today weather uses `POST`. New surfaces standardize on **PATCH** for mutations; weather may keep POST for back-compat and add PATCH aliases later. This section is shape-only.

### 3.1 Weather tick

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/world/weather` | Current `weather-state.json` (+ optional `?include=phenomena` → bag summary from `weather/index.json`) |
| `PATCH` | `/api/world/weather` | Advance / set clock drivers / seed phenomenon (see §4) |

**PATCH body (sketch):**

```json
{
  "base_version": 1,
  "action": "tick",
  "days": 1,
  "diegetic_date": "2019-05-15",
  "diegetic_time": "14:30",
  "push_phenomenon": {
    "id": "ph-trade-surge-01",
    "kind": "wind_anomaly",
    "ttl_hours": 36,
    "intensity": 0.6,
    "region_ids": ["r01-paradise", "r02-porto-lujuria"]
  }
}
```

**Responses:** `200` next state · `409` `{ "error": "version_conflict", "version": N, "base_version": M }` · `400` bad action.

### 3.2 Board resolve + delta

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/world/board` | `index.json` + optional `?thread_id=` one thread |
| `GET` | `/api/world/board/deltas?thread_id=` | NDJSON lines (or JSON array wrapper) for that thread |
| `PATCH` | `/api/world/board` | Resolve thread and/or append World delta |

**PATCH body (sketch):**

```json
{
  "base_version": 3,
  "thread_id": "thr-carnival-culture-01",
  "action": "resolve",
  "resolution": "accepted",
  "delta": {
    "id": "wd-2026-08-12-001",
    "ops": [
      {"op": "upsert_entity", "kind": "place", "id": "pl-carnival-row", "patch": {"status": "active"}},
      {"op": "note", "text": "Carnival culture lock → board writeback"}
    ]
  }
}
```

Rule: **resolve without `delta` is invalid** for GM spine threads that claim World impact (product: writeback mandatory). Soft threads may set `"delta": null` only if `impact: false` on the thread row.

### 3.3 Roads region load

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/world/roads` | `roads/index.json` only |
| `GET` | `/api/world/roads?region_id=r01-paradise` | That region's shard features (parsed array or NDJSON stream) |
| `PATCH` | `/api/world/roads` | Upsert/delete features by id inside one shard |

**PATCH body (sketch):**

```json
{
  "base_version": 1,
  "region_id": "r01-paradise",
  "upsert": [{"id": "rd-par-marina-01", "kind": "local", "coords": [[12.4, 44.1], [12.6, 44.0]]}],
  "delete_ids": []
}
```

**Out of scope:** anything that writes `regions-ui.json`. Highways art verts stay in `map/highways.json`; roads shards may **reference** them via `refs`, not copy.

### 3.4 Phone emergency lookup

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/world/phone/lookup?number=911` | Server-side `lookupNumber` + emergency routing metadata |
| `GET` | `/api/world/phone/session?session_id=` | Active dispatch session |
| `PATCH` | `/api/world/phone/session` | Create / advance / close dispatch session |

**GET lookup 200 (sketch for 911):**

```json
{
  "type": "emergency",
  "number": "911",
  "service": "island_emergency",
  "script_id": "em-911-intake-v1",
  "voice_utterance_ids": ["911-greeting", "911-ask-location"],
  "dispatch": { "can_open_session": true, "default_agency": "paradisio_county" }
}
```

Non-911 intercepts keep `type: "intercept"`; contacts `type: "contact"`; unknown `type: "dead"` — same taxonomy as `phone-responder.js`, extended with `emergency`.

---

## 4. Extend weather-state + `tableslop-world-weather.js` (conceptual)

Keep file path `worldbuilding/weather-state.json` as the **hot summary** clients already render. Extend schema; do not replace with shards-only.

### 4.1 New / extended fields on `weather-state.json`

```json
{
  "version": 2,
  "diegetic_date": "2019-05-14",
  "diegetic_time": "15:00",
  "clock_source": "map/diegetic-clock.json",
  "drivers": {
    "lat_lon": [23.0, -152.0],
    "trades": "NE",
    "ocean": "NEC_gyre",
    "windward_leeward": true
  },
  "phenomenon_bag": {
    "active_ids": ["ph-trade-surge-01"],
    "updated_at": "…"
  },
  "cities": { }
}
```

- **Datetime drivers:** tick reads `diegetic_date` + `diegetic_time` (and/or clock file). Season from month; wet/dry unchanged. Time-of-day biases storm cells (afternoon) vs haze.
- **Phenomenon bag:** small list of active ids on the hot JSON; full records in `weather/phenomena.ndjson`.
- **Feedback loop:** when generating next day, `dayRoll` (or successor) accepts bag → mutates rain/wind/flood_watch; decaying TTL removes ids and may spawn follow-on phenomena (storm → flood_watch residual).
- **Board coupling:** high-intensity phenomena may auto-suggest board thread stubs (API emits `suggested_thread` in PATCH response; does not invent SoT without GM/board PATCH).

### 4.2 Phenomenon NDJSON line

```json
{"id":"ph-trade-surge-01","kind":"wind_anomaly","started":"2019-05-14T12:00","ttl_hours":36,"decay":0.15,"intensity":0.6,"region_ids":["r01-paradise"],"effects":{"wind_mph_delta":8,"rain_chance_delta":12}}
```

### 4.3 Engine functions to add later (names only)

- `readPhenomenonBag(campaignDir)` / `appendPhenomenon` / `decayBag(now)`
- `dayRoll(seed, cityId, ymd, { time, bag })` — bag-aware
- `applyWeatherAction` gains `action: "tick"` (alias of advance + decay) and `action: "push_phenomenon"`

Lock remains `world-weather:tropic-gooner`. Potato: still **no LLM** weather.

---

## 5. Phone: `lookupNumber` intercepts for 911 + dispatch session state

### 5.1 Dial matrix extension (`phone-responder.js` — conceptual)

Normalize before match: strip non-digits; treat `911`, `9-1-1`, `0911` as emergency.

| Input | `type` | Behavior |
|-------|--------|----------|
| `911` / `9-1-1` | `emergency` | Open or attach dispatch session; play scripted intake (voice ids from manifest); **not** a beep-only dead line |
| Existing `555-0110` | `intercept` | CRT non-emergency (already present) |
| Existing `555-0170` | `intercept` | Stevens dispatch flavor (already present) |
| Unknown | `dead` | Primavera Bell NIS |

Product bugs named in calendar (`bug-phone-no-911`, beep-only) resolve when GET lookup + session PATCH exist and UI calls them instead of local-only dead path.

### 5.2 Dispatch session state (`phone/sessions/<id>.json`)

```json
{
  "id": "ps-20190514-001",
  "version": 1,
  "status": "intake",
  "number": "911",
  "opened_at_diegetic": "2019-05-14T15:02",
  "caller_character_id": null,
  "agency": "paradisio_county",
  "location_text": null,
  "incident_kind": null,
  "units": [],
  "log": [
    {"t": "15:02", "who": "system", "utterance_id": "911-greeting"}
  ],
  "updated_at": "…"
}
```

**PATCH actions:** `open` · `set_location` · `classify` · `dispatch_unit` · `close` · `append_log`.  
Lock: `phone-session:<id>` for the file; directory edits use `phone:tropic-gooner`.

Realism bar: intake asks where/what; dispatch can be busy/en-route; weather bag may delay units (flooded quay). No LLM required for v1 scripts.

---

## 6. Voice asset cache contract (PC generates → potato static)

**Potato never runs TTS.** PC (or laptop) generates speech/moans offline; files sync to box; server only serves static + manifest.

### Paths

| Role | Path |
|------|------|
| Manifest (SoT) | `campaigns/tropic-gooner/phone/voice-manifest.json` |
| Static audio on potato | `scripts/linuxbox/tableslop-static/phone/voice/` (or `campaigns/tropic-gooner/phone/voice/` served under `/phone/voice/`) |
| URL | `/phone/voice/<utterance_id>.ogg` (or `.wav`) |

### Manifest row

```json
{
  "version": 1,
  "updated_at": "…",
  "utterances": [
    {
      "id": "911-greeting",
      "relpath": "voice/911-greeting.ogg",
      "sha256": "…",
      "bytes": 0,
      "generated_on": "pc",
      "model_note": "pc-voice-spike",
      "diegetic_tags": ["emergency", "dispatcher"]
    }
  ]
}
```

### Pipeline

1. PC generates file → compute sha256 → update manifest row.  
2. `push-linuxbox.sh` / SCP copies **audio + manifest** (protected runtime if live-edited on potato).  
3. Phone UI: on emergency line, prefer `<audio src>` from manifest; fallback to text script if file missing (fail soft, log papercut — do not crash dial).  
4. Lock `phone:tropic-gooner` when rewriting manifest.

---

## 7. Versioning / `base_version` conflict behavior

Same contract as `docs/chars-registry-versioning.md`, applied per shard index (and weather-state / session files).

| Rule | Behavior |
|------|----------|
| Monotone `version` | Integer; bump on every successful write |
| Client sends `base_version` | Must equal on-disk `version` |
| Mismatch | **HTTP 409** `{ "error": "version_conflict", "version": <disk>, "base_version": <client>, "updated_at": … }` |
| UI / agent | Reload GET → merge → retry. **No force-overwrite** flag in product APIs |
| Omit `base_version` | Allowed only for break-glass ops tools; agents **must** send it |
| Lock ≠ version | Multitask lock prevents concurrent writers; `base_version` catches stale clients after lock release |
| NDJSON append compaction | Compaction rewrites shard + bumps index `version`; readers use etag/version from index |
| Session files | Own `version` field; PATCH with `base_version`; 409 same shape |

Revision backups (optional, weather already `.bak-*`): keep last ~12 under `agents/state/tableslop-sot-revisions/<resource>/`.

---

## 8. Verify commands (curl examples)

Assume local tableslop on `:8765` and an admin session cookie / header already used by World edit. Replace `COOKIE` as needed. **Do not** run destructive writes against `regions-ui`.

```bash
# Weather hot SoT (existing)
curl -sS -o /tmp/wx.json -w "%{http_code}" http://127.0.0.1:8765/api/world/weather
# expect 200; jq .version,.diegetic_date /tmp/wx.json

# Weather tick PATCH (after implemented)
curl -sS -X PATCH http://127.0.0.1:8765/api/world/weather \
  -H "Content-Type: application/json" \
  -H "Cookie: COOKIE" \
  -d '{"base_version":1,"action":"tick","days":1}'

# Conflict smoke: replay same base_version after a successful tick → 409
curl -sS -o /tmp/wx409.json -w "%{http_code}" -X PATCH http://127.0.0.1:8765/api/world/weather \
  -H "Content-Type: application/json" \
  -H "Cookie: COOKIE" \
  -d '{"base_version":1,"action":"tick","days":1}'
# expect 409; jq .error /tmp/wx409.json  → version_conflict

# Roads index + one region shard
curl -sS http://127.0.0.1:8765/api/world/roads
curl -sS "http://127.0.0.1:8765/api/world/roads?region_id=r01-paradise"

# Board index + resolve+delta (after implemented)
curl -sS http://127.0.0.1:8765/api/world/board
curl -sS -X PATCH http://127.0.0.1:8765/api/world/board \
  -H "Content-Type: application/json" \
  -H "Cookie: COOKIE" \
  -d '{"base_version":1,"thread_id":"thr-demo","action":"resolve","resolution":"accepted","delta":{"id":"wd-demo","ops":[{"op":"note","text":"verify"}]}}'

# Phone emergency lookup + session
curl -sS "http://127.0.0.1:8765/api/world/phone/lookup?number=911"
curl -sS -X PATCH http://127.0.0.1:8765/api/world/phone/session \
  -H "Content-Type: application/json" \
  -H "Cookie: COOKIE" \
  -d '{"base_version":0,"action":"open","number":"911"}'

# Voice static (after file sync)
curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:8765/phone/voice/911-greeting.ogg
# expect 200 when asset present; 404 until PC cache synced

# Sacred file must still exist and stay non-empty (guard, not an API)
wc -c campaigns/tropic-gooner/map/regions-ui.json
# fail loud if tiny/ellipse-only vs GM verts
```

Lock self-check (agents):

```bash
bash scripts/linuxbox/multitask-lock.sh status roads:tropic-gooner
bash scripts/linuxbox/multitask-lock.sh status world-weather:tropic-gooner
bash scripts/linuxbox/multitask-lock.sh status phone:tropic-gooner
bash scripts/linuxbox/multitask-lock.sh status board:tropic-gooner
bash scripts/linuxbox/multitask-lock.sh status logistics:tropic-gooner
```

---

## Implementation order (when coding starts — not this doc)

1. Scaffold empty `roads|weather|board|phone|logistics` dirs + `index.json` v1 (no regions-ui touch).  
2. Wire multitask lock names into persist helpers.  
3. Weather: phenomenon bag + tick PATCH; keep GET/POST.  
4. Phone: 911 in `lookupNumber` + session API + voice manifest static.  
5. Roads GET-by-region; PATCH upsert later.  
6. Board resolve+delta last (depends on World writeback product rules).  
7. Playwright/curl smokes from §8; push potato only at milestone.

**/3d:** shelved — no API surface in this plan.

---

## Ask GM (only if blocked later)

1. Board threads: GM-only vs player-visible on `/world` (ledger already flagged).  
2. Voice format preference: `.ogg` vs `.wav` for mobile Safari on Tailscale.
