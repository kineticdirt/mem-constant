# Discord → campaign analysis (2026-07-29)

**Goal:** AI can analyze Discord-backed campaigns properly — transcript → cast / sheets / worldbuilding / continuity — not just “is the channel alive?”

**Holder:** `discord-campaign-analyze`

**Why (user intent):** For Discord campaigns, the AI should reason from actual play text and promote durable campaign artifacts. Today we mostly have **ids + last-activity probes** and a **one-shot Tropic export/ingest** path; there is no reliable end-to-end analyze loop.

**Related:** `docs/agents/discord-hunter-linuxbox.md`, `campaigns/tropic-gooner/reports/discord-ingest-runbook.md`, `campaigns/tropic-gooner/reports/chronicle-history.md`, `docs/plans/cursor-auto-away-from-pc-2026-07-29.md` (Cloud Automations = **planned only**).

---

## Current inventory (honest)

### 1. campaigns.tableslop — probe / tracker / last activity

| Piece | Path / surface | What it does | Limit |
|-------|----------------|--------------|-------|
| Per-campaign Discord ids | `campaigns/{eurosluts,tropic-gooner,nyc-mafia-dnd}/discord.json` | guild / category / channel + label | Euro + Tropic filled; **NYC `needs_ids`** |
| Probe script | `scripts/linuxbox/campaign-discord-probe.py` | Writes `agents/state/campaign-discord-status.json` | **No message bodies** — channel name, last_message_id/at, ok/detail only |
| Portal | `campaigns-availability-server.js` `:8768` | Deep links + `chat`/`glance` on trackers | Player-safe last-activity badge; **not** a digest |
| Cron | — | Manual / deploy | **Not on recurring cron** (ledger gap 2026-07-28) |

**Verdict:** Good for “is RP happening?” — **not** analysis.

### 2. Tropic Discord export / ingest / Hunter gateway

| Piece | Path | What it does | Limit |
|-------|------|--------------|-------|
| Live bot | `hermes-gateway-hunter-reckoning` | Discord connected as AI_RP_Master (when unit healthy) | Live chat / commands — **not** batch analyze |
| Export | `export_discord_lore.py`, `tools/discord_gui_exporter.py` | Category → `discord-export/.../messages.md` + attachments | Heavy; potato think **HOLDs** unattended guild export |
| Archive | `/mnt/archive/.../discord-export/` (~2038 files) + chronicle cites full category export | Offline SoT for Tropic | Often **linuxbox/archive only** — PC lean tree may lack export |
| Ingest | `tools/ingest_discord_sheets.py` only | `#basic-sheets` + privates + threads → `characters/discord/<slug>.md` | Sheet merge, not full scene/world continuity |
| Registry | `sync_character_registry.py --write` after ingest | Roster ids / story_path | Roster ≠ rich sheets |
| Portraits | Chars Resolve + `resolve_discord_attachments.py` | Copy attachments from export / bot | Image hygiene only |
| Runbook | `reports/discord-ingest-runbook.md` | How to export/connect | Documented; think soft-closed Discord HOLD thrash |
| One-shot synthesis | `reports/chronicle-history.md` (2026-07-05) | Party map + open threads from export | Manual agent draft; **`#general` digest still open**; no repeatable pipeline |

### 3. eurosluts `discord.json`

```json
guild + category + channel (campaign-rp / Guild Hall) → campaign_id eurosluts
```

Used by probe + `:8768` Euro tracker. **No** eurosluts `discord-export/`, ingest tool, or chronicle sibling under this tree.

### 4. Think lanes reading Discord

| Behavior | Reality |
|----------|---------|
| Task boards | Tropic/Hunter progress once pointed at export/ingest/open-threads |
| Think tick | **Skips / soft-closes** Discord export·ingest HOLD items (timeout class; paid last-resort thrash) |
| Live reading | Probe may run on deploy; Hermes hunter for live Discord — **think does not stream channel bodies into campaign SoT** |

### 5. Summarizer / Docs promote from Discord

| Surface | Discord? |
|---------|----------|
| Hub Chat **+ Promote to task** / **+ Save to campaign** | From **Chat threads**, not Discord transcripts |
| Docs draft→canon promote | Planned / deferred in Docs plans — **not** Discord-sourced |
| Pixi Satyr / scene stubs | Pixi RP path — **not** wired to Discord export |
| Stories Discord-link panel | Links / render ingested sheets — **not** auto-promote from messages.md |

**Verdict:** No first-class “summarize Discord → Docs/story/WORLD_DELTA” path.

---

## Desired (analyze properly)

```text
Discord (live or export)
  → scoped transcript chunks (channel/thread, time window)
  → analysis pass (cast mentions, facts, scenes, open threads, contradictions)
  → durable outputs:
       cast/registry stubs + sheet enrich (diegetic only)
       worldbuilding notes under reports/ or story/
       continuity / open-threads updates
       optional Docs promote (human confirm)
  → player-safe glance stays on :8768 (metadata only)
```

Success criteria (verifiable):

1. Given a Tropic `messages.md` slice (or Euro export once present), produce a dated report under `campaigns/<id>/reports/` with cast + open threads + world facts — no invented faces/ages beyond sources.
2. Sheet ingest remains additive (`characters/discord/` or Docs template sheets); registry merge respects lock + `version`.
3. Probe/tracker stays metadata-only (never leak bodies to public campaigns.tableslop).
4. Think never re-opens unattended full-guild export as a thrash box.

---

## Gaps (transcript → cast / sheets / worldbuilding / continuity)

| Gap | Today | Need |
|-----|-------|------|
| Message bodies for analysis | Probe = last-msg only; export Tropic-heavy, Euro none, NYC ids missing | Scoped export or incremental fetch per campaign |
| Repeatable analyzer | One chronicle draft | Scripted or agent job: chunk → report → optional promote |
| Cast extraction | Ingest sheets channels only | Scene/thread cast + edges → registry (merge, no wipe) |
| Sheet depth | Ingested discord/*.md uneven; Docs pillars separate | Bridge ingest → Docs sheet template / enrich pass |
| Worldbuilding | Lore channels skimmed in chronicle | Channel allowlist → notes under story/reports |
| Continuity | `open-threads.md` one-shot | Diff vs prior digest; diegetic clock from dates |
| Live → SoT | Hunter gateway live chat ≠ archive | Optional incremental export after sessions (manual/Automation — not 1m think) |
| Multi-campaign | Euro ids only; NYC blank | Fill NYC ids; Euro export+ingest sibling or shared tool |
| PC/potato parity | Export often archive-only | Sync or analyze-on-potato only |
| Docs promote | Chat-only promote | Explicit “from Discord report” promote (confirm) |

---

## Phase 0 — inventory + contracts (this doc)

- [x] Inventory probe / export / ingest / think / Docs promote
- [x] Name desired pipeline + gaps
- [ ] Confirm SoT machine for analysis: **potato** (export lives there) vs PC lean mirror
- [ ] Confirm first campaign pilot: **Tropic** (has export) vs Euro (ids only)
- [ ] Cursor Cloud Automations: **planned in** `docs/plans/cursor-auto-away-from-pc-2026-07-29.md` — **not implemented** (no Hub Automations UI, no `.cursor/environment.json`, no GitHub cloud env wired by us). Optional later for rare “digest after export” jobs — **not** Hermes 1m cron.

**Phase 0 deliverable:** this plan + ledger. No new runtime pipeline yet.

---

## Phase 1 — Tropic offline analyze MVP

1. **Input contract** — Point at one existing category/channel export path (archive or `discord-export/`); document allowlist (RP threads, lore, sheets; exclude or summarize `#general` separately).
2. **Chunker** — Deterministic split of `messages.md` by thread/channel + date (no LLM required for split).
3. **Analyze job** — One paid/strong or free-chain pass → `reports/discord-analyze-<date>.md` (cast facts, scenes, open threads, contradictions). Human review before registry writes.
4. **Optional promote** — After OK: enrich `characters/discord/` or Docs sheet; append `open-threads.md`; **never** blind-overwrite registry (lock + merge).
5. **Keep probe as-is** — Refresh `campaign-discord-status.json` for :8768 last-activity only; do not put bodies in that JSON.

**Out of Phase 1:** Euro full export, NYC ids, live streaming ingest, Satyr-on-Discord, public digest on campaigns.tableslop.

---

## Non-goals

- Public player portal showing message bodies.
- Think tick doing full guild export.
- Inventing portraits / sheet ages past sources.
- Treating Cursor Cloud Automations as already live.

---

## Open questions (ask before Phase 1 code)

1. Pilot campaign: Tropic-only first?
2. Where should analyze reports land: `reports/` only until promote, or direct Docs draft?
3. Who runs the job: PC Cursor session, potato manual script, or (later) Cursor Automation?
