# Tableslop dual-app roadmap (2026-08-01)

> **GameSys alias:** Theme B play runtime is now named **GameSys** (Isla Primavera). SoT: [`gamesys-isla-primavera-2026-08-14.md`](gamesys-isla-primavera-2026-08-14.md). Theme A (campaigns host) stays campaigns.tableslop.org.

**Status:** PLAN ONLY — no product feature implementation in this document’s delivery.  
**Holder:** `tableslop-recalibrate-setup` (was `tableslop-dual-app-plan`)  
**Audience:** GM (Wholesome Boi) + PC/laptop implementers + potato Hermes (read, don’t thrash).  
**Why this exists:** Lock a long-horizon vision for **two Themes under Tableslop** into bite-sized, test-gated phases — so work expands intent instead of patching symptoms on `:8765` / `:8768`. Near-term = **Setup → Beta**, not full launch.

**Related:**  
`docs/plans/gamesys-isla-primavera-2026-08-14.md` · `docs/tableslop-linuxbox.md` · `docs/plans/isla-primavera-wb-finish-checklist-2026-08-01.md` · `projects/tableslop/client-first-profile-plan.md` · `docs/plans/discord-campaign-analyze-2026-07-29.md` · `projects/tableslop/manifest.json` · `agents/tableslop-progress.md` · `docs/cloudflare-tunnels-linuxbox.md` · `docs/chars-registry-versioning.md` · `docs/multitask-shared-state-lock.md`

---

## GM recalibration (2026-08-01 evening)

Lock these as active product defaults until GM amends:

1. **Dual services = hosting platform for now.** App A (`:8768`) + App B (`:8765`) host the chronicle online. **Laptop becomes main hardware later** for heavier sim/authoring — potato is fine as host at current scale.
2. **Scale:** ~**10 users total**, **2–3 concurrent**. Potato RAM is adequate for that; stop over-worrying box memory for this product. (Still no heavy always-on Chromium/LLM on 1m crons — that is ops hygiene, not “Tableslop won’t fit.”)
3. **Near-term product role:** **archive + slowly simulating.** Soft diegetic clock target: **1 in-world day ≈ 48h IRL** (tunable — not a hard physics constant).
4. **Hub = link-out only** — see box below. Do not rebuild the map inside `/Linuxbox/`.
5. **Worry about small stuff / initial setup.** Get to a **beta-ready** point. Full-launch overhead (OAuth polish, radio, streets at city scale, autonomous coax) comes **after** beta.
6. **Deterministic first (non-AI)** for core loops. AI fills the rest later.
7. **Deterministic generation = pregeneration only** — authored/prebaked parts, city/street lists, fog polygons, encounter decks, etc. **Not** live LLM citygen every tick.
8. **Isla Primavera worldbuilding is an active workstream now** — finish docs/data before moon features. Checklist: `docs/plans/isla-primavera-wb-finish-checklist-2026-08-01.md`.
9. **Post-S3 product focus (2026-08-01 GM):** after Setup→Beta S0–S3, prioritize **(a) map HUD / wireframes aligned to painted art**, **(b) testing + structured error collection**, **(c) App A+B dashboard functionality**. **Character flesh deferred** — former-PC sheets stay kernels for place/world texture (`wb-tg-factions` closed: no quest-obligation favor anchors). Hub stays link-out only.

### What Hub link-out means (plain English)

The admin dashboard at **`https://abhinavall.net/Linuxbox/`** is ops/process improvement (Inbox, Chat, Docs, Chars admin, Systems). For Tableslop it should **only link out** to **`map.tableslop.org`** (play world) and **`campaigns.tableslop.org`** (group hosting). Those two sites are the game / campaign SoT. Hub must **not** embed or re-implement the map as if Hub were the product.

---

## 0. Why the GM is asking (intent read)

You already have **two live surfaces**. The ask is not “build a third product.” It is:

1. **Name and grow Theme A** — campaign hosting / ops / meta for **two player groups** (Discord-linked), not a thin availability page forever.
2. **Name and grow Theme B** — the map as the **full Hunter + WoD + Isla Primavera** play world (not “just pins”), with ambition toward Google-Maps-depth places, radio/comms, fog, encounters, and characters that keep acting when players log off — under **GM coax**, never fiat puppetry.
3. **Force a timeline** that is honest about Discord as identity, registry locks, and **test gates** — and that aims at **beta** (archive + slow sim + finished Isla WB), not moon features first. Potato hosts; laptop takes heavier work later.

If that read is wrong, correct the Open GM decisions section before any Setup/Beta code.

---

## 1. Vision & intent

### 1.1 Two Themes under Tableslop

| Theme | Product name (working) | Live hostname / port | Role |
|-------|------------------------|----------------------|------|
| **A — Campaign ops** | **campaign.tableslop** (brand) | Live: **`campaigns.tableslop.org`** → potato **`:8768`** (`linuxbox-campaigns-avail`) | Host **two campaign groups**: Discord-linked players (roles on the bot’s servers), availability, cancel/session lifecycle, group dashboard, **meta analysis**, **players ↔ characters** links |
| **B — World map / play surface** | **map.tableslop** | **`map.tableslop.org`** → potato **`:8765`** (`linuxbox-tableslop`) | **Hunter: The Reckoning + World of Darkness + Isla Primavera** as **one entity** (system + custom campaign + island world). Full dashboard: radio, encounters, NPCs, fog of war, cities → subzones → streets (long ambition), call/text other characters, **autonomous PC/NPC**, GM **coax** |

**Hostname note:** Brand speech may say `campaign.tableslop`; DNS/public URL today is **plural** `campaigns.tableslop.org`. See §8 Open GM decisions — keep plural as canonical, add CNAME alias `campaign.`, or rebrand docs only.

**Hub policy (unchanged):** Hub `/Linuxbox/` **links out** to these products — see **What Hub link-out means** above. Hub is not the Tableslop SoT and must not embed the map product as if it were.

### 1.2 Shared chronicle (do not fork the world)

- **Tropic Gooner** and **Hunter: The Reckoning** share chronicle tree `campaigns/tropic-gooner/`.
- **One Discord guild** (WoD / Tropic category) for that chronicle; **two Hermes pods** (`tropic-gooner`, `hunter-reckoning`) as operational layers — not two worlds.
- Theme B’s fiction entity is that shared chronicle rendered as Isla Primavera map + Hunter/WoD play loop.
- Theme A may host **two groups** that are *not* necessarily both Tropic (euro / nyc / tropic mix — GM pick). Character SoTs stay per-campaign folders; cross-link by id, never blind merge.

### 1.3 Architecture assumption (flag for GM)

| App | Expand | Shared later |
|-----|--------|--------------|
| **App A** | Expand **`:8768`** / `campaigns-availability-server.js` | Shared Discord identity / session cookie / player↔character graph |
| **App B** | Expand **`:8765`** / `tableslop-server.js` | Same identity when OAuth unblocked; read-only or negotiated write to registry under multitask lock |

**Assumption:** Keep **two Node processes + two public hostnames** (already tunnel-split). Do **not** merge into one monolith on potato. Shared auth and character-link APIs come later as thin contracts, not a rewrite into one server.

### 1.4 North-star product sentences

- **App A:** “Players know when we play, who is in, who cancelled, who plays which sheet — and the GM gets meta on the groups without opening Discord archaeology by hand.”
- **App B:** “The island is a place you can navigate, hear, fight, and leave your character in — while the GM steers arcs by coax, not by rewriting your agency.”

---

## 2. Current state (honest inventory)

### 2.1 Dual surface — already real

| Surface | Evidence |
|---------|----------|
| Map | `linuxbox-tableslop` **:8765** · `https://map.tableslop.org/` · data `campaigns/tropic-gooner/map/map.json` + layers compositor |
| Campaigns | `linuxbox-campaigns-avail` **:8768** · `https://campaigns.tableslop.org/` · optional interim `map.tableslop.org/camp/` proxy |
| Tunnel | `cloudflared-tableslop` / `WOD_HTR_LinBox_TABLESLOP` — map + campaigns hostnames; **not** on abhinavall tunnel |

### 2.2 App B (map) — what exists vs stubs

| Capability | Today |
|------------|--------|
| Overworld HUD, pan/zoom, R1–R14 pins, region detail, cast read API, sheet render, localStorage notes | **Shipped / testing** (see `agents/tableslop-progress.md` ts-a…g) |
| Layer stack (`map/layers.json`) | **Scaffold:** streets, fog, events, buildings, districts, etc. mostly `source: null` placeholders |
| Fog of war / encounters / radio / autonomous agents / GM coax | **Not implemented** (layer hooks / UI feedback draw only — not game systems) |
| Discord OAuth gate | Scripts/plan exist; **`da-01` blocked** on Developer Portal human step |
| Client-first profile | Phase 0 localStorage; cloud profile / Discord link planned (`client-first-profile-plan.md`) |
| Cast edits | Hub Chars admin; map is read + deeplink handoff (correct split) |

### 2.3 App A (campaigns) — what exists vs gaps

| Capability | Today |
|------------|--------|
| Tracker JSON (PC / schedule / availability / inventory) + glance UI | **Yes** |
| Discord probe | **Last-message metadata only** (no bodies) — `campaign-discord-probe.py` → `agents/state/campaign-discord-status.json` |
| Cancel / no-show / session lifecycle | **No** |
| Meta analysis dashboard | **No** (sibling plan: Discord analyze is offline Tropic-first, not :8768 product) |
| `discord_user_id` on registry → player link | **Mostly empty** — link players↔characters not operational |
| Two-group hosting UX | Euro + NYC called out in UI copy; Tropic/Hunter chronicle lives mainly on map + Discord — **group product model not finished** |

### 2.4 Constraints (hard)

| Constraint | Implication |
|------------|-------------|
| Potato **~2 GB RAM** | Fine for ~**10 users / 2–3 concurrent** hosting. Still: no heavy always-on Chromium/LLM on 1m ops crons; Firecrawl cloud for browse. Heavy sim/authoring → **laptop later**; potato keeps archive + slow clock. |
| **No DB — client-first** | JSON files + localStorage / optional `~/.linuxbox-tableslop/profiles/{id}.json`; no Postgres |
| **CF tunnel split** | Tableslop hostnames stay on tableslop connector; don’t route through abhinavall `:8780` |
| **Registry multitask lock** | Any write to `characters-registry.json` → `multitask-lock.sh` + merge-by-id + `version` |
| **Hub = link-out** | Don’t re-embed map as Hub SoT |
| **Secrets** | Discord tokens / OAuth secrets only in potato env (`~/.hermes`, `~/.linuxbox-tableslop`, campaign `.env`) — never commit |
| **Soft diegetic clock** | Default stub: **1 world day ≈ 48h IRL** (`hours_per_world_day=48` in config JSON — tunable) |

### 2.5 Starting templates

Scenario / region / sheet **templates** should be **archived** as references. Live scenario development is **GM-owned**. Agents may scaffold empty boards; they must not treat archived starters as live canon or auto-fill story.

---

## 3. Principles

1. **Two Themes, one brand** — Tableslop = platform; Isla Primavera / Hunter / WoD = Theme B fiction; App A = multi-group ops.
2. **Archive templates; GM owns scenarios** — starters in archive; no silent template→live promotion.
3. **Coax ≠ fiat** — GM influence = missions, growth/fall hints, arc “imbue” commands that characters may resist or warp. Never silent override of player agency or sheet truth.
4. **Discord as identity spine** — guild membership + roles define who can see what; OAuth when `da-01` unblocks; probe stays metadata-public-safe.
5. **Test-first phase exits** — Playwright + gobbledygook fixtures + diagnostics scripts; Cursor-heavy OK; curl alone is not enough for UI claims.
6. **Potato hosts; laptop later for heavy** — potato serves static+JSON+thin APIs + archive/slow sim at beta scale. Heavy analyze / street-graph authoring / dense sim moves to **laptop** when needed — not because 2–3 concurrent players break potato.
7. **Registry hygiene** — lock, merge, version; never wipe GM NPCs; soft-hide stubs only.
8. **Mystery exciting, confusion frustrating** — Theme B depth reveals by play and coax; UI must not dump every layer at once.
9. **Ponytail** — expand existing `:8765` / `:8768` servers; no new framework stack without SAFE-gate + GM OK.
10. **Ledger before mutate** — Intent/Result on `AI_GROUPCHAT.md` for cross-agent work; holder names per phase.

---

## 4. Architecture sketch (systems + why)

Shared mental model: **App A = calendar/roster/meta**; **App B = spatial sim + diegetic UI**; **Identity + Character graph** straddle both.

```text
Discord guilds/roles ──► Identity (OAuth / role claims)
         │                      │
         ▼                      ▼
   App A :8768              App B :8765
   session ops              map layers + HUD
   meta analytics           radio / text / encounters
   player↔character  ◄──►  cast / presence / coax bus
         │                      │
         └──────── JSON SoT ────┘
            tropic-gooner/ + per-group trackers
            registry (locked) · profiles · session logs
```

### 4.1 Identity / Discord

**What:** OAuth `identify` + guild membership; optional role claims (player / GM / spectator). Session cookie only — no user table.  
**Why:** Matches client-first plan; bot already on Hunter gateway; roles are the natural ACL for “two groups.”  
**Depends:** `da-01` portal secrets.

### 4.2 Session ops (App A)

**What:** Availability windows, RSVP, **cancel**, no-show, session start/end, optional Discord event deep-link. State in tracker JSON + append-only `session-events.jsonl` (per group).  
**Why:** Explicit GM ask; today availability is display-only.

### 4.3 Character link (shared)

**What:** `discord_user_id` (or role-mapped allowlist) ↔ `characters-registry.json` id; UI on App A “My characters” and App B “I play as…”.  
**Why:** Without this, meta and autonomous PC are ungrounded.  
**Safety:** Writes only under multitask lock; prefer Hub/Chars for create; Apps A/B link existing rows.

### 4.4 Meta analytics (App A)

**What:** Player-safe dashboards: attendance, cancel rate, last activity (probe), optional **offline** Discord analyze reports linked (not live message bodies on public URL).  
**Why:** GM asked for meta; analyze plan already separates public metadata vs archive bodies (`discord-campaign-analyze-2026-07-29.md`).

### 4.5 Map layers (App B)

**What:** Fill `layers.json` sources incrementally: fog → events/encounters → streets/districts → buildings. Cities drill to subzones.  
**Hierarchy (GM 2026-08-01):** island regions (R1–R14+) → **city** → **sub-regions** (every city will have them; Paradise pilot = `paradise-subzones.json`). Draw borders v1 = parent region polygons; nested city sub-region draw is next.  
**Why:** Ambition is Google-Maps-level; delivery is layer-by-layer with fixtures so potato never computes graphs live.

### 4.6 Sim tick / autonomous agents (App B)

**What:** Sparse tick: offline PCs/NPCs act from personality + history + coax queue; log actions to session/chronicle; player hop-in resumes control.  
**Why:** Core vision (“log off while character acts”) — near-term framed as **archive + slow sim**, not realtime AI citygen.  
**Where to run (D6 locked default):** potato keeps **archive + soft clock**; denser autonomous ticks move to **laptop later**. No live LLM citygen every tick — pregen decks/polygons/lists only until post-beta. (See §8.)

### 4.7 Comms — radio / call / text (App B)

**What:** Diegetic channels (island radio, SMS-like threads between characters) backed by JSON threads; optional Discord mirror for humans.  
**Why:** Explicit ask; keeps play on-map when Discord is noisy.

### 4.8 Encounter engine (App B)

**What:** Data-driven encounter cards keyed by region/subzone/time-of-day/threat tags; spawn into `events` layer; resolve with light dice or narrative stub first.  
**Why:** Hunter needs hunt structure without Foundry-weight VTT on potato.

### 4.9 GM coax bus

**What:** Queue of imbue commands: `{target, kind: mission|growth|fall|arc, payload, intensity, expires}` — agents read coax as soft priors; never rewrite inventory/age/identity silently.  
**Why:** Distinguishes this product from “GM edits your sheet.”

### 4.10 Observability / diagnostics

**What:** `/health`, layer load diagnostics, Playwright smokes per phase, fixture packs under `.staging/` or `campaigns/tropic-gooner/map/fixtures/`, incident form on tick fail.  
**Why:** Long timeline without gates = endless half-features.

---

## 5. Phased roadmap

**Convention:** A phase is **done** only when success metrics + verify/tests pass. Later phases may start design docs in parallel; **code promotion** waits on gate.

**Rough horizon (guidance, not a contract):** **Setup → Beta corridor (S0–S3)** first — see §9. Long-horizon P0–P6+ below remain the expansion backlog; **P2–P6 polish deferred post-beta**. Potato hosts at ~10/2–3 scale; laptop later for heavy.

---

### P0 — Freeze dual-app contract + safety rails

**Goal:** Everyone agrees App A = `:8768`, App B = `:8765`; hostname decision recorded; test harness skeleton; no feature sprawl.

**Bite-sized deliverables**
1. This roadmap accepted / amended in ledger (GM).
2. One-pager in `docs/tableslop-linuxbox.md` (or short cross-link) stating dual Theme A/B + Hub link-out.
3. Hostname decision recorded (keep `campaigns.` / alias / rename).
4. Fixture pack stub: gobbledygook group trackers + fake registry link file (gitignored or `fixtures/`).
5. Playwright entry points listed: existing `tableslop-smoke.mjs` + new `campaigns-avail-smoke.mjs` skeleton (even if skip-if-down).
6. Diagnostics: document curl health matrix for `:8765` / `:8768` / public hostnames.

**Success metrics**
- GM ack of assumption App A/B split (or counter-decision).
- Smoke scripts exist and fail loudly when service down (not silent pass).

**Verify / tests**
- `curl` loopback health 200 both ports (on potato when reachable).
- Playwright: map pins still in bounds; campaigns home renders two-group glance without secrets.

**Deps:** None (docs + harness).  
**Out of scope:** OAuth, cancel lifecycle, fog data, sim tick.

---

### P1 — App A: session lifecycle + player↔character link MVP

**Goal:** Two groups can RSVP/cancel; characters link to Discord users for at least one pilot group.

**Bite-sized deliverables**
1. Tracker schema v2: `sessions[]`, `rsvps[]`, `cancels[]` with timestamps + actor ids.
2. UI: mark available / cancel session / show who cancelled.
3. Character link UI (GM or self-serve): attach `discord_user_id` to registry id (pilot group only).
4. Probe remains metadata-only on public pages.
5. Optional: deep-link “open Discord” for scheduled session channel.

**Success metrics**
- Cancel appears in glance + API within 1 refresh.
- ≥1 real player↔character link for Tropic **or** chosen pilot group.
- No message bodies on `campaigns.tableslop.org`.

**Verify / tests**
- Fixture JSON round-trip unit (node assert / pytest).
- Playwright: cancel flow on fixture mode (`?fixture=1` or local file override).
- Registry write path: lock acquire/release logged if link write touches registry.

**Deps:** P0; GM pick of which two groups (§8).  
**Out of scope:** Full meta charts; Discord OAuth (can still use manual id paste until `da-01`).

---

### P2 — Identity (Discord OAuth) shared cookie contract

**Goal:** Unblock `da-01`; members login; non-members 403; same identity usable by A and B (even if separate cookies initially, document migration to shared parent domain cookie later).

**Bite-sized deliverables**
1. Human: Discord Developer Portal redirect URIs for `map.` and `campaigns.` (and alias if any).
2. Env sync scripts run; secrets only on potato.
3. `/api/me` on both apps (or B first, A second).
4. Guest mode remains for public map **if** GM wants public POC — decision in §8.
5. Role → group ACL stub (config JSON, not hardcoded names in UI logic).

**Success metrics**
- Member login → map; non-member 403 (Playwright).
- Linked profile can load “my characters” from App A.

**Verify / tests**
- `da-03` login smoke automated where possible; manual checklist otherwise.
- Auth off still serves guest map if policy says so.

**Deps:** P0; human `da-01`. P1 can partially precede.  
**Out of scope:** Full cloud profile sync (may slip to P2.5); Pixi auth.

---

### P3 — App A meta dashboard + analyze handoff

**Goal:** Meta without leaking Discord bodies to the public portal.

**Bite-sized deliverables**
1. Attendance / cancel rate / streak widgets from session-events JSONL.
2. “Last Discord activity” from probe (existing).
3. Links to **offline** analyze reports under `campaigns/*/reports/discord-analyze-*.md` (from analyze plan Phase 1).
4. Name lookup helper (Nelly / Toga / Red class) over registry + ingest sheets — admin or GM-gated.
5. Export “session recap stub” markdown for Discord paste (optional early vision expansion).

**Success metrics**
- GM can answer “who flakes / who shows” from App A without opening export.
- Public portal still body-free (automated grep/test on HTML responses).

**Verify / tests**
- Fixture meta numbers match expected counts.
- Playwright screenshot of meta panel; no `content`/`body` fields in public API JSON schema test.

**Deps:** P1; analyze plan Phase 1 for rich reports.  
**Out of scope:** Live streaming channel text into App A.

---

### P4 — App B map depth: fog, encounters, city→subzone

**Goal:** First “game” vertical slice on Primavera — not full street graph yet.

**Bite-sized deliverables**
1. Fog layer with **authored** revealed polygons (GM file); toggle + persist reveal state client-side (and optional profile sync).
2. Encounter deck JSON + spawn into `events` layer for 1–2 regions.
3. City drill: one city (e.g. Paradise / R1) → subzone list + stub map or panel (streets still optional stubs).
4. NPC presence chips from registry (read-only) filtered by region `character_ids`.
5. Archive any starter scenario templates used in demos.

**Success metrics**
- Player can reveal fog and see one encounter resolve (narrative stub OK).
- Subzone navigation works without breaking R1–R14 overworld.

**Verify / tests**
- Playwright: fog toggle, encounter open/close, subzone back-nav.
- Fixture layers load with null sources skipped (no throw).
- Perf budget: initial map load acceptable on phone emulation.

**Deps:** P0; cast region pins (mostly done). OAuth nice-to-have.  
**Out of scope:** Full Google-Maps street mesh; autonomous agents; radio.

---

### P5 — Comms (radio / text / call) + diegetic phone UI (thin)

**Goal:** Characters can message each other on-map; radio is a channel, not a toy widget.

**Bite-sized deliverables**
1. Text threads JSON keyed by character ids; poll or SSE-lite.
2. Radio bulletin board (GM + autonomous posts).
3. “Call” = structured request + accept/decline (not WebRTC v1 — diegetic UX first; realtime media later optional).
4. Permission: only linked players (or GM) send as that character.

**Success metrics**
- Two fixture characters exchange text; third cannot spoof without link.
- Radio posts appear on HUD without LLM on request path.

**Verify / tests**
- Playwright multi-context or sequential user spoof attempt denied.
- Schema validation on thread append.

**Deps:** P2 identity strongly preferred; P4 for place context.  
**Out of scope:** Full VoIP; Discord bot relay (can be P5.5).

---

### P6 — Autonomous PC/NPC + GM coax bus

**Goal:** Log off → character continues from personality/history + coax; hop back in.

**Bite-sized deliverables**
1. Coax queue API/file + GM UI (imbue mission/growth/fall/arc).
2. Agent prompt contract: sheet pillars + recent scene stub + coax; **refusal** of fiat identity edits.
3. Tick runner (off-potato default) writes `autonomous-log.jsonl` + optional WORLD-ish notes under campaign reports.
4. Presence states: present / acting_offline / awaiting_player.
5. Hop-in: player takes control; tick skips that character.

**Success metrics**
- One offline tick produces logged action consistent with sheet (human or eval rubric).
- Coax changes likelihood, not force (eval: ≥1 resist/warp example in fixtures).
- Tick runner does not thrash 1m think with LLM citygen (pregen + sparse archive ticks only).
- Soft clock advances at configured rate (default 48h IRL / world day) without player babysitting.

**Verify / tests**
- Harness: fixture sheet + coax → expected action class (Cursor/Meta-Harness friendly).
- Regression: coax cannot change age/name/inventory without explicit GM tool + confirm.
- Multitask lock if registry updated.

**Deps:** P4–P5; character link; model budget policy.  
**Out of scope (platform baseline):** multi-agent crowds.  
**GM override 2026-08-10:** Isla Primavera **full economic sim** is **in scope** — see `agents/tableslop-economy-progress.md` + `worldbuilding/economy-state.json` (water / minerals / other → commodity tick).

---

### P6+ — Streets at city scale & polish

**Goal:** Toward Google-Maps ambition **one city at a time**.

**Bite-sized deliverables (examples)**
1. Street SVG/GeoJSON for Paradise only; pan/zoom LOD.
2. Building footprints selective.
3. Encounter/fog authored against street graph.
4. Patronage / rival crews / weather clock as data overlays (see §6).
5. Spectator mode; after-action reports; Discord recap export.

**Success metrics**
- One city feels navigable at street level without melting CPU (prebaked assets — deterministic pregen, not live LLM).
- Overworld still works when city layer off.

**Verify / tests**
- Tile/SVG size budgets; mobile Playwright; accessibility of pan/zoom.

**Deps:** P4+.  
**Out of scope:** Island-wide OSM import in one phase.

---

## 6. Vision expansions (optional — expand intent)

Mark **optional**. Prioritize only after core phase gates or explicit GM pull.

| Idea | Fits | Why it expands intent |
|------|------|------------------------|
| **After-action reports** | A/B | Session → structured recap for Discord + meta |
| **Rumor network** | B | Soft information flow between NPCs; feeds coax & radio |
| **Weather / diegetic clock** | B | Time/weather shifts encounters & autonomous picks |
| **Patronage** | B | Hunter creed / faction favor as non-fiat pressure |
| **Rival crews** | B | Parallel autonomous opposition without GM babysitting |
| **Phone as diegetic UI** | B | Map chrome becomes in-world device (pairs with P5) |
| **Spectator mode** | A/B | Watch-only role from Discord; no coax rights |
| **Export Discord recap** | A | One-click paste; ties to analyze plan |
| **Tableslop cast home** | B | Continue moving cast UX from Hub→map (already preferred) |
| **Campaign portals per group** | A | Euro / NYC skins under same App A engine |
| **Interim `/camp` retirement** | infra | Once `campaigns.` is universal muscle memory |
| **Shared `.tableslop.org` cookie** | infra | One login across A/B |
| **NSFW boundaries matrix** | B | Map vs Discord vs Pixi — what surfaces allow what |
| **Eval harness for coax** | meta | Meta-Harness scores resist/warp vs fiat (stack self-improve) |

---

## 7. Testing doctrine (all phases)

1. **Gobbledygook fixtures** — fake groups, fake Discord ids, fake sheets; never require live guild for CI.
2. **Playwright** — map smoke + campaigns smoke + auth smoke; mobile emulation for App B.
3. **API schema tests** — public JSON must not grow `message_content` fields.
4. **Diagnostics script** — one `scripts/linuxbox/tableslop-dual-diag.sh` (future) printing health, layer null counts, tracker schema version, OAuth configured bool (no secrets).
5. **Cursor-heavy OK** — phase verify can be Cursor Auto / IDE browser; do **not** put Cursor on 1m potato cron.
6. **SAFE-gate** — any new dependency/framework upgrade via `safe-update-check.sh`.
7. **Registry** — any write test must demonstrate lock or use fixture copy, never wipe potato registry in tests.

---

## 8. Open GM decisions (answer before / during Setup)

| ID | Decision | Options / notes | Status / blocks |
|----|----------|-----------------|-----------------|
| **D1** | Hostname: keep **`campaigns.tableslop.org`**, add **`campaign.`** CNAME alias, or docs-only brand “campaign.tableslop”? | **LOCKED default (2026-08-01):** keep **plural** `campaigns.` live for now; alias/rename later optional | OAuth redirect URIs later |
| **D2** | Which **two groups** does App A host first? | eurosluts + nyc-mafia-dnd (current UI) vs euro + tropic vs nyc + tropic | Still open — S3 / App A |
| **D3** | Confirm **App A = expand :8768**, **App B = expand :8765**, shared identity later (this plan’s assumption)? | **LOCKED (2026-08-01):** **yes** — dual hosting platform | All phases |
| **D4** | Unblock Discord OAuth **`da-01`** (portal Client ID/Secret + redirect URIs) when? | now / after S3 manual links | **Post-beta** unless GM unblocks early |
| **D5** | Public map guest access after OAuth exists? | guest+login / members-only | Post-beta / P2 |
| **D6** | Autonomous **sim tick** host? | **LOCKED default (2026-08-01):** potato = **archive + slow sim** (soft clock); denser autonomous work → **laptop later**. No live LLM citygen. | Softens P6 |
| **D7** | NSFW boundaries on **map.tableslop** vs Discord vs Pixi? | map PG-13 / map adult / Discord-only explicit | Still open — content |
| **D8** | Should Tropic/Hunter appear as **one App A group** or stay map+Discord-only while App A serves other two? | | Still open — App A |
| **D9** | Street ambition: **one city pilot** name? | Recommend **Paradise** (Sasha base + densest places-directory) | S2 pregen |
| **D10** | Cancel policy: soft cancel vs strike counts vs none? | feeds meta widgets | Post-beta / P1–P3 |

---

## 9. Setup → Beta corridor (near-term — replace sprawl)

**Goal:** beta-ready hosting + finished-enough Isla WB + deterministic pregen assets. **Defer P2–P6** (OAuth polish, meta dashboard, radio/comms, autonomous coax, streets-at-scale) to **post-beta**.

```text
S0 Setup
  → S1 Isla Primavera worldbuilding finish (deterministic docs/data)
  → S2 Deterministic pregen assets (no AI)
  → S3 Minimal App A link — **done 2026-08-01** (`tableslop-s3-link`)
  → BETA GATE
  → (post-beta) P2–P6+ from §5
```

### S0 — Setup

**Bite-sized**
1. [x] Health matrix documented + curl/Playwright smokes listed for `:8765` / `:8768` / public hostnames. — `scripts/linuxbox/tableslop-health-matrix.sh` + `map/tableslop-smoke.mjs` + `map/campaigns-avail-smoke.mjs`
2. [x] Docs cross-link: `docs/tableslop-linuxbox.md` ↔ this roadmap ↔ Hub link-out plain English.
3. [x] Archive template policy restated (starters archived; GM owns live scenarios — §2.5). — `campaigns/tropic-gooner/ARCHIVE-TEMPLATE-POLICY.md`
4. [x] Soft diegetic clock **config stub** (JSON), e.g. `{ "hours_per_world_day": 48 }` — tunable; not hard physics. — `campaigns/tropic-gooner/map/diegetic-clock.json`
5. [x] Confirm hosting OK on potato at ~10 users / 2–3 concurrent (no RAM doom language in ops copy). — GM recalibration § locked; health matrix verifies origins.

**Exit:** dual hostnames healthy; clock stub exists; Hub does not claim map SoT. **S0 done 2026-08-01** (holder `tableslop-s0-s1-impl`).

### S1 — Isla Primavera worldbuilding finish

**Bite-sized:** deterministic docs/data — places, regions, orgs, close open decisions from `worldbuilding-questions.md` / promote leftovers into `worldbuilding-decisions.md`.  
**SoT checklist:** `docs/plans/isla-primavera-wb-finish-checklist-2026-08-01.md`.  
**Exit:** “finished enough for beta” boxes on that checklist checked (no LLM citygen).

**Done enough for beta decisions 2026-08-01:** `wb-tg-factions` closed (no quest-obligation favor anchors; flesh deferred). Remaining checklist gaps are soft regions / R15–R17 lore / optional deep-dives — not blockers for post-S3 product focus.

### S2 — Deterministic pregen assets

**Bite-sized (authored files, no AI required)**
1. [x] One city pilot **subzones list** (Paradise) — `map/paradise-subzones.json` (**pattern for all cities later**)
2. [x] Fog polygons as authored GeoJSON — `map/fog-polygons.geojson` (R15–R17 + soft regions)
3. [x] Encounter deck JSON keyed by region/threat tags — `map/encounter-decks.json` (R1 + R2)

**Exit:** files on disk + `layers.json` points at non-null optional sources (`optional: true` — missing file must not break map). **S2 authored 2026-08-01** (holder `tableslop-s0-s1-impl`). Fog/encounter **UX** still post-beta. **City sub-regions** are durable product shape (not Paradise-only).

### S3 — Minimal App A link (setup only)

Player ↔ character id **paste** OK (manual Discord / registry id). Only if still needed for beta; do **not** expand into full OAuth/session lifecycle (that’s post-beta P1/P2).

**Exit:** one documented way to attach a player id to a character id without Portal OAuth.

**Done 2026-08-01** (holder `tableslop-s3-link`): sidecar `campaigns/<id>/player-character-links.json`; `GET`/`POST` `/api/campaigns/:id/links`; paste UI on tracker pages; note in `docs/tableslop-linuxbox.md`. No OAuth.

### Post-S3 / post-beta (reprioritized 2026-08-01)

**Do next (meat-and-potatoes — holder `tableslop-post-s3-focus`):**
1. **Map HUD ↔ art** — pin/label spellings + overlay regions match `vibes.png` (name SoT) and runtime raster (`master-enhanced.png` / pyramid). Design preview OK; deploy map JSON/server bits to potato.
2. **Testing / error collection** — structured codes beyond health matrix (`reports/tableslop-errors/` + smokes that write FAIL with codes).
3. **Dashboard functionality** — App A campaigns glance + App B map: fix/ship obvious broken UX from smokes (no radio/autonomous).

**Still deferred (moon):** P2 OAuth · P3 meta · P4 fog UX polish beyond authored files · P5 radio/comms · P6 autonomous/coax · P6+ streets · **full character flesh** — keep designs in §5; **do not** pull into near-term unless GM re-prioritizes.

---

## 10. Appendix — file path index

| Path | Role |
|------|------|
| `docs/plans/tableslop-dual-app-roadmap-2026-08-01.md` | **This plan** |
| `docs/plans/isla-primavera-wb-finish-checklist-2026-08-01.md` | Isla Primavera WB finish (S1) |
| `docs/tableslop-linuxbox.md` | Hosting / tunnel / cast SoT |
| `docs/cloudflare-tunnels-linuxbox.md` | Tunnel split policy |
| `docs/plans/discord-campaign-analyze-2026-07-29.md` | Transcript→artifacts (feeds App A meta, not public bodies) |
| `projects/tableslop/client-first-profile-plan.md` | No-DB profile / OAuth tiers |
| `projects/tableslop/manifest.json` | Map/project task board |
| `projects/tableslop/regions.json` | R1–R14 workflow |
| `agents/tableslop-progress.md` | Tick-sized map progress |
| `agents/TABLESLOP_PROJECT_TASK.md` | Think lane SoT |
| `scripts/linuxbox/tableslop-server.js` | App B server |
| `scripts/linuxbox/campaigns-availability-server.js` | App A server |
| `scripts/linuxbox/campaign-discord-probe.py` | Last-msg probe |
| `campaigns/tropic-gooner/map/map.json` | Overworld pins |
| `campaigns/tropic-gooner/map/layers.json` | Layer stubs (fog/streets/…) |
| `campaigns/tropic-gooner/characters-registry.json` | Cast SoT (locked runtime) |
| `campaigns/*/discord.json` | Guild/channel ids |
| `docs/chars-registry-versioning.md` | version / merge |
| `docs/multitask-shared-state-lock.md` | multitask lock |
| `campaigns/tropic-gooner/map/tableslop-smoke.mjs` | Map Playwright |
| `tableslop-discord-oauth-plan.md` / `docs/tableslop-discord-auth.md` | OAuth plan (da-01) |

---

## 11. Non-goals (explicit)

- Replacing Discord as social home for humans.
- Running Foundry/Planar Ally as the Tableslop core (they may coexist; App B stays ponytail web).
- Merging Pixi RP (`:8767`) into map.tableslop (share patterns later; different product).
- Putting Hub Chat / think LLM on every map click.
- Rebuilding the map product inside Hub `/Linuxbox/`.
- Live LLM citygen / streetgen every sim tick (pregen only until GM says otherwise).
- Implementing App A/B product features in the same change-set as this plan document (plan/docs only for recalibration).

---

*End of plan. Amend via ledger holder `tableslop-recalibrate-setup` (or successor) + PR/doc edit; do not silently fork a second roadmap.*
