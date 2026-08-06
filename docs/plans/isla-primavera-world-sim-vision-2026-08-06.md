# Isla Primavera world sim — north-star vision

**Status:** DESIGN / north-star (2026-08-06). Document lane: synthesis and architecture, no code in this delivery.
**Holder:** `isla-primavera-world-sim-vision`
**Audience:** GM (Wholesome Boi) + PC/laptop/potato implementers + AI agents contributing silos.
**GM mandate (verbatim):** "Make sure that we understand the goal of creating a needlessly complicated 'semi-realistic' world." / "I realize this is massive, but we need to smartly implement this. The hardware will not be able to handle it, but I want the code to be implemented. Upgrades will be coming soon enough."

**Related:**
`docs/plans/tableslop-dual-app-roadmap-2026-08-01.md` (product phasing, dual-app split) · `campaigns/tropic-gooner/worldbuilding/LORE-BIBLE.md` (canon) · `worldbuilding/GROUPS.md` (factions) · `worldbuilding/STORIES.md` (seeds) · `docs/pixi/ENGINE-GOBSTOPPER.md` (pacing philosophy) · `campaigns/tropic-gooner/map/layers.json` (spatial substrate) · `map/diegetic-clock.json` (soft clock: 1 world day ≈ 48h IRL)

---

## 1. The goal, stated plainly

We are building a world that is **needlessly complicated on purpose**, and **semi-realistic on purpose**. Both halves are a design discipline, not an apology.

**Needlessly complicated** means the island simulates far more than any player will ever look at: shipping manifests for ports the party never visits, a spam-call ecology on a phone they could leave in a drawer, housing pressure in blocks they drive past. The excess is the point. A world that only contains what the plot needs feels like a stage set the moment the player walks off the marked path. A world that contains the unneeded thing — the third warehouse, the unrelated argument, the robocall about an extended warranty on a 1957 Dodge — feels like a place.

**Semi-realistic** means we do not simulate reality; we simulate *consequence*. Nobody needs a fluid-dynamics model of the bay. Everybody needs the rule that a body dumped in the marina on a gala night produces a Stevens van before it produces a police report. Semi-realism is causality at the granularity of gossip, prices, and overtime sheets — the granularity at which the lore bible is already written.

The discipline has three clauses:

1. **Every system is simple alone.** The market sim is a price table with supply and heat terms. The radio is a playlist plus a bulletin queue. The phone is threads and a ring state. No single silo is allowed to become a model that needs a whitepaper. If a silo design needs more than a page to explain its internal math, the design is wrong.
2. **Realism emerges from COUNT and COUPLING, not from any single complex model.** Sixteen simple silos that can see each other's shadows produce the texture of a living island. One brilliant silo that sees nothing produces a tech demo.
3. **The player can ignore 90% of it, but the 10% they touch must be consistent with everything.** A player who never opens the phone must never meet a contradiction because the phone exists. A player who does open it must find that the spam calls know about last night's raid — because the raid was an event, and the spammers read the same world the radio does.

**Gobstopper pacing governs all of it** (`docs/pixi/ENGINE-GOBSTOPPER.md`): mystery is exciting, confusion is frustrating. The complication is *depth the player can earn*, never fog the player cannot diagnose. A contradiction between the radio and the market is a bug, not a mystery. A body the radio won't explain is a mystery, and the design must guarantee the explanation exists and is reachable by looking.

### Anti-goals

- **No theme-park scripting.** No ride-queue quest lines that fire the same way for every player at the same landmark. Systems produce situations; the GM and the players produce stories. (STORIES.md seeds remain playable proposals, not scheduled triggers.)
- **No omniscient narrator.** No surface ever shows the player truth their character could not reach. Every renderer is *somebody's* voice with *somebody's* knowledge bounds: the DJ, the group chat, the newspaper's night desk. There is no neutral camera in this world.
- **No visible dice.** Resolution may be probabilistic underneath; the surface shows outcomes and reasons, never mechanics. The player learns the island's physics the way residents do — by watching what happens, not by reading the odds.

---

## 2. The silo catalog

A **silo** is one simple system with its own state, its own tick logic, and exactly one legal way to talk to the rest of the world: emitting typed events onto the shared stream (§3). Silos never call each other.

Status grades: **built** (on disk and live) · **in-flight** (code or data exists; active work) · **designed** (spec level, no implementation) · **proposed** (named here, specced later).

### 2.1 Island map / regions — **built** (Phase 0)

The spatial substrate. R1–R14 region ids with GM-drawn borders (`map/regions-ui.json`, locked), pin coords (locked), the layer compositor (`map/layers.json`), pregen assets (`paradise-subzones.json`, `fog-polygons.geojson`, `encounter-decks.json`), and the diegetic clock stub.
**Consumes:** authored art, GM polygons. **Produces:** the location vocabulary — every event in §3 references `region`, `city`, `subzone` ids owned here. **This silo is the address system of the world.**

### 2.2 City maps — **in-flight** (Phase 1)

Deterministic per-city district layouts. `scripts/tableslop/gen-city-maps.mjs` tiles each parent region polygon into named wedge districts with seeded PRNG (re-runs reproduce the same city; GM edits win over regeneration via the `gm_touched` marker). r01 Paradise, r02 Porto Lujara, r03 Crimson Quay generated; district names follow the lore bible.
**Consumes:** `regions-ui.json` (read-only). **Produces:** district/subzone geometry and street-name lists — the finer-grained location refs every urban event uses.

### 2.3 Lore bible — **built, living** (Phase 0)

`worldbuilding/LORE-BIBLE.md`, `GROUPS.md`, `STORIES.md`, `REGIONS.md`, plus `reports/organizations/` deep dives. Canon/proposal/open grading is already house law here and is adopted by this document unchanged.
**Consumes:** GM locks and taste answers. **Produces:** the content vocabulary — faction ids (PRI numbers), named faces, tensions, hooks — that events reference. The bible is *not* a runtime file; silos read distilled data (§2.13), not prose.

### 2.4 Accounts / roles — **in-flight** (Phase 1)

Who is who, at two levels. **Player level:** Discord-linked identity and role claims (player / GM / spectator), per the dual-app roadmap (OAuth post-beta; paste-link MVP is S3-done). **In-world level:** which surfaces a given identity can read — this is the ACL half of the veil system (§4). A hunter-linked player sees hunter-tier blurbs; the public sees covers.
**Consumes:** Discord ids, `characters-registry.json` (under multitask lock). **Produces:** role claims consumed by renderers. Emits almost nothing itself.

### 2.5 3D buildings — **in-flight** (Phase 1 scaffold, depth in Phase 3)

Building footprints and massing per city district, generated deterministically from city-map geometry: footprint grids clipped to district polygons, heights from district character (tower district vs. Casco Viejo), all seeded. First render target is extruded SVG/canvas on the map, not a game engine.
**Consumes:** city maps, the (currently null) `parcels` layer. **Produces:** the `buildings` layer and addressable locations ("the suite floor of a mid-tier hotel off the Carnaval Route" becomes a place events can point at).

### 2.6 Radio — **in-flight** (Phase 1)

The island's stations. A music scheduler (son cubano, bolero, reggaeton, EDM — the bible's sound map is the station list) plus a **bulletin queue** rendered from the public event stream. Radio is a terminal consumer: it emits nothing.
**Consumes:** event stream (public tier, magnitude ≥ threshold), diegetic clock. **Produces:** the HUD audio/bulletin feed. With the news flag off it still plays music — graceful degradation is a requirement, not a fallback.

### 2.7 Market / gunplay sim — **in-flight** (Phase 1)

A deterministic price-and-supply model per region for the island's tradable sins: guns, contraband, vice services, protection. Prices move on supply (from logistics, §2.11) and heat (derived from incident events, §3.4). When price, supply, and heat cross authored thresholds, the sim **emits incidents** — a skimming crew gets hit, a deal goes bad. Gunplay is a market outcome before it is a dice roll.
**Consumes:** event stream (incidents, logistics), faction tensions from GROUPS.md data. **Produces:** `market.price_shift`, `incident.*` events.

### 2.8 Text-based calling / phone — **in-flight** (Phase 1)

Character-to-character text threads plus structured calls (request / accept / decline — diegetic UX first, no WebRTC, per roadmap P5). This is the player's handset into the world.
**Consumes:** identity, registry, presence. **Produces:** thread state; with the consent rules in §6, notable calls can emit `comms.tip` events (a warning passed, a meet arranged). Most calls emit nothing — private means private.

### 2.9 Social media — **proposed → Phase 2**

In-world feeds where NPCs and factions post. A roster of authored personas (the culinary student, the CRT-adjacent patriot account, the marina lifestyle influencer, Quay Rojo's not-quite-official hype page) reacts to the event stream **with propagation lag**: same-day locally, next-day across the island, unless magnitude forces velocity. Players can post; a viral player post is itself an event.
**Consumes:** event stream, persona roster, heat. **Produces:** `social.post`, `social.trend` events — this is the only silo whose *output* is also public-opinion *input* (§3.5).

### 2.10 Spam calls — **proposed → Phase 2**

The ambience layer of the phone. Robocall scams, wrong numbers, debt collectors, timeshare pitches, the occasional Tithe recruitment pitch that isn't quite a pitch. Cheap to build, enormous texture yield. Two rules make it a silo and not a joke folder: spam volume **reacts** to the world (insurance scams spike after public incidents; a wrong number in a hunter thread can be a real signal wearing a spam cover), and a small authored fraction carries hunter-tier blurbs for players who learn to listen.
**Consumes:** diegetic clock, event stream, player location. **Produces:** ambience; occasional `hook.*` events.

### 2.11 Resources / logistics — **proposed → Phase 3** (thin feed earlier if the market needs it)

Shipping manifests, port throughput at the three bay cities, the IFC cold chain, cruise schedules. This is the supply side of the market sim: guns don't get cheaper because a table says so; they get cheaper because a container cleared the Lujara docks with a manifest that doesn't quite match.
**Consumes:** authored port data, event stream (disruptions, sweeps). **Produces:** `logistics.delay`, `logistics.manifest_anomaly` events; supply levels the market consumes through the stream.

### 2.12 In-game news — **Phase 2 formalization (the contract is §3 of this document)**

Not a silo that simulates anything. The news layer is the **set of renderers** over filtered views of the event stream: radio bulletins, social pickup, a newspaper digest with an editorial voice per outlet. It owns the blurb-selection rules and nothing else. The GM named this "a massive one — how each silo influences the other"; §3 is the design.

### 2.13 Laws / norms / psychology — **in-flight** (being written as `worldbuilding/SOCIETY.md`)

The behavioral rulebook: vice zoning and ordinance 44-B, CRT posture tiers, who gets swept and who gets a warrant, gender dynamics, housing norms — the constants of island behavior. Its runtime form is a **distilled data file** (`society-rules.json`) that silos consult: the market needs the vice-zoning map, the CRT event generator needs the tier table, housing needs the displacement pressure rules. Prose stays in SOCIETY.md; the JSON is compiled from it, by hand, with canon grading.
**Consumes:** canon. **Produces:** rule tables. Emits nothing; it is consulted, not heard.

### 2.14 Hunter: The Reckoning systems — **designed → Phase 2 prototype**

The player-facing supernatural loop: enemy groups, gunplay/melee resolution, **preparation** (research, interviews, surveillance, gear), and the investigation loop that is the player's half of the veil (§4). Preparation is a first-class verb because the GM's reference model is Supernatural: the work *is* the hunt.
**Consumes:** bestiary (§2.15), event stream (hunter tier), veil/standing state (own). **Produces:** `hunter.raid`, `investigation.progress`, and — when the work goes loud — `incident.*` events the public silos see through their covers.

### 2.15 Supernatural bestiary — **proposed → Phase 2**

Data files per entity type and court: the Gilded Anchor and Crimson Tithe (vampires with tax policies), the fae court off the Lagooni Seika boardwalk, the Garou eco-NGO, ghouls, ghosts, cursed objects, the thing answering the humidity. Each entry: behavior table, evidence table (what it leaves behind), **veil rating** (§4), and mundane-cover templates. v1 scope: Anchor, Tithe, one ghost, one cursed object.
**Consumes:** lore bible. **Produces:** entity instances and `supernatural.*` events that always ship with a mundane cover.

### 2.16 Housing / economy texture — **proposed → Phase 3**

Rents, vacancies, buyouts, who lives where. The Consortium's green condos rise over bought-out abuelas; that is already canon — this silo makes it a *pressure* that moves social chatter, faction recruitment pools, and neighborhood texture. Not a real-estate sim; a displacement engine.
**Consumes:** city maps, society rules, event stream. **Produces:** `housing.displacement` events, neighborhood drift the social silo talks about.

---

## 3. The cross-influence matrix — the news wire as a formal contract

This is the keystone. Everything above is a list of toys until this section makes them a world.

### 3.1 The one rule

**Silos never read each other. Silos emit events; silos read the event stream.** The stream is the only shared medium. A silo's internal state (prices, manifests, thread contents, veil standing) is private. What the world knows, it knows through events. This is what keeps sixteen simple systems from becoming one tangled one, and it is what makes every influence edge in the matrix below *auditable*: you can replay the stream and watch the cause become the effect.

### 3.2 The event envelope — `world-events.json`

Append-only JSONL, sharded by world-week: `campaigns/tropic-gooner/sim/events/world-events-<epoch-week>.jsonl`. No database (client-first constraint); derived indexes may be built but must be rebuildable from the shards. Every event:

```json
{
  "schema": 1,
  "id": "evt-0014-r03-0042",
  "world_day": 14,
  "tick": 114,
  "silo": "market-gunplay",
  "kind": "incident.shooting",
  "location": { "region": "r03-crimson-quay", "city": "jackedsonville", "subzone": "the-row", "building": null },
  "actors": { "faction_ids": ["PRI-0201", "PRI-0602"], "character_ids": [], "anonymous_count": 3 },
  "magnitude": 6,
  "visibility": "public",
  "origin": "sim",
  "blurbs": {
    "public": "Overnight gunfire near the Row; county police say the situation is contained and there is no danger to tourists.",
    "hidden": "Quay Rojo collectors hit a Tithe skimming crew behind the Red Fortune. Two down, one walked into the dark.",
    "hunter": "One of the downed men was dead before the shooting started. The coroner's van had a barcode."
  },
  "causes": ["evt-0012-r03-0017"],
  "tags": ["gunplay", "quay-rojo", "crimson-tithe"]
}
```

Field rules:

- **`world_day`** is monotonic from a sim epoch; the diegetic year question (LORE-BIBLE Open question 1) is deliberately not encoded — display mapping lands when the GM rules. Sim logic never hardcodes a calendar year.
- **`kind`** is `<silo>.<event>`, a flat vocabulary. Phase 1 ships a starter set; new kinds register in a `KINDS.md` beside the schema.
- **`magnitude`** is 0–10 with anchors: 0–2 texture (noise complaint) · 3–4 local news (arrest, small fire) · 5–6 city news (shooting, raid) · 7–8 island news (casino massacre, cruise-contract scare) · 9–10 season-defining (used maybe once a season; inflation is a design bug).
- **`visibility`** is the highest tier at which the event renders: `public` (all renderers) · `hidden` (insider channels: Lunch Regulars gossip, Night Ledger forecasts, hunter boards) · `hunter` (hunter-tier surfaces only) · `gm_only` (exists as sim cause, has no player surface).
- **`blurbs`** are written **at emit time by the emitting silo**, all tiers at once. The emitting silo knows the truth and the cover; renderers only *select* by tier. The alternative — renderers inventing covers — scatters truth-invention across sixteen systems and is forbidden.
- **`causes`** links the causal chain. Not every event needs one, but every *interesting* one does. This field is what makes the island debuggable and the mysteries answerable.
- **`origin`** is `sim | gm | player`. GM-authored events are never modified by sim logic (§6).

### 3.3 Renderers are pure views

Radio bulletins, social posts, and the newspaper are functions over `(events, tier, locality, clock)`. They hold no world state. The same event therefore *sounds* different per outlet — the booster station downplays the shooting, the Jackedsonville station names the carpet — because that is voice, applied at render time, over one shared fact. Contradiction between outlets is only legal as *spin*, never as fact drift.

### 3.4 Heat is derived, never stored

**Heat** (police attention, public alarm) is computed per location-bucket from the stream: sum of incident magnitudes with exponential decay over recent world-days. Consumer silos (market pricing, CRT posture, social volume) read heat as a pure function of the stream. It may be *cached*; it may never become independently mutable state. Stored-and-drifted heat is the classic confusion failure: two silos disagreeing about how hot a block is, with no way to find out why. The stream is the answer to "why."

### 3.5 The influence matrix

Read each row as: **from → event → medium (lag) → to → effect.**

| From | Event | Medium | To | Effect |
|---|---|---|---|---|
| market/gunplay | `incident.shooting` | radio bulletin (same day, local) | social | chatter spike, personas react |
| market/gunplay | `incident.shooting` | stream → heat fn | market | heat raises prices, lowers supply tolerance |
| market/gunplay | `incident.shooting` | stream → heat fn | CRT posture | heat crosses tier → sweep likelihood up |
| factions | `faction.tension_spike` | social chatter (same day) | news | pickup at magnitude ≥ 4 |
| news pickup | (rendered story) | newspaper digest (next day) | CRT | public heat forces a posture response |
| hunter | `hunter.raid` | missing-person story (1–2 day lag) | social | gossip, rumor variants |
| hunter | `hunter.raid` | stream (hidden tier) | target faction | reprisal planning, posture change |
| logistics | `logistics.delay` | stream (hidden tier) | market | gun supply down |
| market | `market.price_shift` | stream | gunplay sim | high price + scarcity → incident rate up |
| supernatural | `supernatural.feeding` (cover: `incident.medical`) | radio (cover blurb) | public | nothing — the cover is the point |
| supernatural | same event | hunter board (veil permitting) | hunter | investigation thread opens |
| housing | `housing.displacement` | social grumble (days) | factions | recruitment pool shifts |
| phone/social | `social.trend` (viral clip) | stream → heat fn | CRT | viral wrong-door clip forces Tier 3 someone didn't want |
| spam calls | `hook.recruitment` | phone (player-only) | hunter | a wrong number that isn't |
| player | `player.post` / `player.action` | stream | everything | players are silos too |

### 3.6 The four canonical chains (worked examples)

**Incident → bulletin → heat → price.** The market sim emits `incident.shooting` on the Row (magnitude 6, public, all three blurbs written at emit). The radio renderer picks it up same-day because it's local and public; the Paradise booster station runs the cover soft, the Jackedsonville station runs it straight. The heat function for `the-row` recomputes upward. Next market tick reads heat through the stream: price of protection on the Row rises, a skimming crew's risk premium crosses threshold, and the *next* incident becomes more likely — the loop closes without any silo having the other's address.

**Tension spike → chatter → pickup → police heat.** GROUPS data says Rojo–Tithe tribute disagreement is live. The faction silo emits `faction.tension_spike` (magnitude 4, hidden — insiders know first). Social personas in Jackedsonville chatter same-day; the newspaper renderer's night desk picks it up at magnitude threshold next morning; the story runs; *now* it's public. The CRT posture table reads public heat on the Quay and moves a sweep up the calendar — which Night Ledger's forecast (a hidden-tier renderer) predicts, which a player can buy. The same fact walked four surfaces at four speeds, and each surface was honest about what it knew when.

**Hunter raid → missing-person news → gossip → faction response.** The party hits a Tithe scavenging nest. The hunter silo emits `hunter.raid` (hunter tier) and the world sim emits the *mundane shadow*: three `incident.missing_person` events over the next two days (public, cover blurbs). Social gossip does what it does with missing persons; a persona posts a thread; the Tithe reads its own hidden-tier channel and changes collection routes. The party's *work* stays invisible; its *shadow* is fully visible. That asymmetry is the genre.

**Shipping delay → guns supply → gunplay pricing → incident rate.** A cruise-week security clamp (itself an event) delays a container at the Lujara docks: `logistics.delay`, hidden tier. The market reads it: gun supply in r02/r03 drops, price rises. The gunplay sim's thresholds: high price plus steady demand means more deals done on credit, more credit means more collections gone wrong — `incident.*` rate ticks up two world-days later, in a different city, for reasons a player *could* reconstruct from the shipping news if they read the manifest page of the paper. Almost nobody will. That's the needless part. The consistency is the semi-realistic part.

---

## 4. The hidden-supernatural rule (the veil)

The GM's reference is Supernatural: the monster is there, and you do not see it unless you look. Formalized:

1. **Every supernatural entity and event carries a `veil` rating, 0–10.** 10 is functionally invisible (the Dry Contract); 2 is a ghoul working marina parking at dusk. Veil is a property of the *thing*, authored in the bestiary.
2. **Supernatural events always emit with a mundane cover.** `supernatural.feeding` hits the stream as `incident.medical` with a cover blurb — "a guest, a medical event, the kind of thing the discretion clause exists for." The public tier *is* the cover. There is no leakage by default.
3. **Truth renders only at tier.** The same event's `hunter` blurb exists from birth (the emitting silo wrote it) but renders only on hunter-tier surfaces.
4. **Investigation lowers effective veil, locally.** Research, interviews, surveillance, and prep accumulate **standing** (per hunter cell, per subject — an entity or court) in the hunter silo's own state. Effective visibility of a subject = its veil minus that cell's standing. Below threshold, the hunter-tier blurbs unlock *for that cell*. Standing is never global: what Sasha's crew knows, a fresh Imbued in Porto does not.
5. **Veil breach is involuntary visibility.** A feeding in front of a livestream is a `supernatural.veil_breach` event — public, high magnitude, and a summons: Stevens & Co. and Coral Trace are the factions that *respond* to breaches, which makes the cover-up economy a gameplay loop instead of lore wallpaper. Team 7's reputation is a magnitude modifier.
6. **Gobstopper pacing applies.** Standing accrues through *actions with costs* — a night at the Ash List archive, an interview that could get back to Coral Trace, surveillance that might be noticed. No surface sells standing for a menu click. Earned reveals, agency, no instant wish-fulfillment; and the pacing rule's other half holds: when the player *has* earned it, the truth arrives whole — hesitation is not sandbagging.

The confusion guard from §1 applies doubled here: any cover blurb must be *internally consistent* as a mundane story (the timestamps the party can check must line up — until the player has the standing to notice the one that doesn't).

---

## 5. Phased implementation map

Hardware-honest: production is a 2 GB ARM box today, and the GM's instruction stands — *implement the code anyway; upgrades are coming*. The resolution of that tension is **feature flags**: the world model is complete in code; activation is config. Every silo ships behind `sim-flags.json` (one flag per silo). A silo whose flag is off emits nothing and its renderers degrade gracefully — radio plays music, the paper prints wire copy, the phone still texts. The box runs the phases it can carry; the laptop, and later hardware, carry the rest. **No phase fakes scale with hardcoded shortcuts** — off is honest; shallow-and-on is the sin.

**Phase 0 — built.** GM-drawn borders and pins (locked), layer compositor, lore bible / groups / stories, diegetic-clock stub, S2 pregen assets (Paradise subzones, fog polygons, encounter decks). *Flagged:* nothing — always on. *Unblocked:* the address system and vocabulary everything else references.

**Phase 1 — in flight.** Accounts/roles (paste-link MVP done; OAuth post-beta), city maps (three cities generated, GM-editable), 3D buildings scaffold (footprints + massing from district geometry), radio (music scheduler + template bulletins), market/gunplay sim core (price table, thresholds, incident emission), phone (text threads + structured calls). The event stream runs in **draft schema** from day one — silos emit against §3.2 even before any renderer consumes it. *This is deliberate:* events accumulate from the first tick, so when the news layer formalizes, the island already has a past. *Flagged:* `silos.market`, `silos.radio`, `silos.phone`, `silos.buildings_3d`, `silos.accounts`. *Unblocked:* the record, and every downstream consumer.

**Phase 2 — next.** News wire formalization (schema v1 freeze, the renderer suite: radio bulletins, newspaper digest, social pickup), the social-media silo (authored persona roster, propagation lag, player posting), the hunter silo prototype (investigation/standing loop + preparation verbs + one enemy group end-to-end), bestiary v1 (Anchor, Tithe, one ghost, one cursed object), spam calls. *Flagged:* `silos.news`, `silos.social`, `silos.hunter`, `silos.bestiary`, `silos.spam`. *Unblocked:* the "island feels alive" loop and veil gameplay — the phase where the cross-influence matrix starts paying rent.

**Phase 3 — depth.** Logistics (manifests, throughput, supply chains feeding the market), housing/economy texture, denser offline autonomous sim (the 48h clock carrying the world between sessions — laptop-class work, per roadmap D6). *Flagged:* `silos.logistics`, `silos.housing`, `silos.autosim_dense`. *Unblocked:* long-horizon causality; the world moving without a session.

**Phase 4 — scale-up, when hardware lands.** Full-cast autonomous ticks, dense city sims at street level, LLM prose renderers (template blurbs become generated prose — a *renderer* upgrade only; the event record stays template-true underneath), real 3D if wanted. *Gates:* hardware arrival, model budget. Nothing in this phase changes the architecture; it only widens what is on.

---

## 6. Standing rules for contributors and AI agents

How to add a silo without breaking the web:

1. **Emit, never read.** Your silo writes events to the stream and may read the stream. It never opens another silo's state file, and it never invents a private channel to one. If you need a fact another silo owns, the answer is an event kind, not a function call.
2. **Write all your blurbs at emit time.** Public, hidden, hunter — your silo knows the truth and the cover; the renderers only select. If you cannot write the cover, the event is not ready to emit.
3. **Canon ids or nothing.** Events reference canon identifiers: PRI faction numbers, region/city/subzone ids, registry character ids. Never a name-string, never an invented shadow entity. New content is marked `[proposal]` until the GM promotes it (LORE-BIBLE grading applies everywhere).
4. **Deterministic ticks.** Sim logic takes `(prior_state, events, seed(world_day, silo_id))` and returns new state plus events. No wall-clock randomness. LLM output is never sim state — an LLM may render prose *from* an event; the event underneath stays template-true.
5. **GM override always wins.** Hand-authored events (`origin: gm`) are never modified by sim logic; a GM edit to any silo state file beats regeneration (the `gm_touched` pattern from city maps is the model). Coax-not-fiat still governs characters.
6. **Flag it.** Every new silo lands behind a `sim-flags.json` entry, default off on potato until proven. Off silos emit nothing; renderers degrade gracefully.
7. **Locations are mandatory.** Every event carries at minimum a region id; use point-in-polygon against the locked GM borders rather than inventing coordinates.
8. **Magnitude honesty.** Anchors in §3.2 are load-bearing. If everything is a 7, nothing is.
9. **The 90/10 test.** Before a silo ships: a player ignoring it entirely must never meet a contradiction from it; a player touching it must find it consistent with the whole stream. Test both.
10. **Ledger before mutate.** Intent/Result lines in `AI_GROUPCHAT.md`; multitask lock + merge-by-id for any shared-state write; registry writes respect `version`. This document does not exempt anyone from house law.

---

## 7. Open GM questions this design inherits

1. **The diegetic year** (LORE-BIBLE Open question 1: 2019 vs 2025) — gates the display mapping of `world_day`; sim logic is year-agnostic until ruled.
2. **Social media scale** — Phase 2 ships a few dozen authored personas; pregenerated thousands are a Phase 3/4 call.
3. **Public map guest access** (roadmap D5) — affects whether radio/news surfaces have a fully public tier or a members tier.
4. **NSFW boundaries on map.tableslop** (roadmap D7) — the phone and social silos inherit the answer.

---

*End of vision doc. Amend via ledger holder `isla-primavera-world-sim-vision` (or successor); do not fork a second north star. When this and the dual-app roadmap disagree about product phasing, the roadmap wins for hosting/app questions and this wins for world-sim questions; log the seam in the ledger when it matters.*
