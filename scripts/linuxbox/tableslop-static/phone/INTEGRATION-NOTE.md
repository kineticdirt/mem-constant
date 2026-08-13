# INTEGRATION-NOTE — phone feature (do-not-wire-yet)

The phone is a standalone static feature. Nothing here is wired into
`tableslop-server.js` — this note is the wiring list for whoever mounts it.

## What needs mounting (one server, two statics)

1. **The phone dir itself** at `/phone/`:
   `scripts/linuxbox/tableslop-static/phone/` → `https://map.tableslop.org/phone/`
   (`index.html`, `phone.js`, `phone.css`, `contacts.js`).
2. **The engine** at `/tableslop/phone-responder.js`:
   `scripts/tableslop/phone-responder.js` — `phone.js` imports it as a module
   at the URL `/tableslop/phone-responder.js` (repo-relative path resolves
   there from any mount depth; keep the alias exact).

That's the whole contract: two static routes, no API endpoints, no auth, no DB.
Threads/history are localStorage-only, so no runtime-state protection needed
and deploys can't wipe player data (it lives client-side).

## Link-in

Add a HUD link on the map UI pointing at `/phone/` — suggested label: a
"PHONE" chip next to the region legend. Not done here (server file is
deliberately untouched).

## Sim heat (optional, later)

Spam frequency reads `window.TABLESLOP_SIM_HEAT` (0..1) if the host page sets
it before `phone.js` loads; default 0.3 (2-5 spam events/day, seeded per
calendar day). When the sim lane exposes a heat value, either set that global
or pass `?heat=` in the link URL. No fetch happens today.

## Test hooks

`?force=pickup|voicemail`, `?date=YYYY-MM-DD`, `?heat=0..1`, `?dial=<contact-id>`
— used by `.staging/tableslop-phone/smoke.mjs`; harmless in production.

## Engine / CLI

`node scripts/tableslop/phone-responder.js --self-check` must stay green after
any contact-script edit. CLI also does `--list`, `--spam`, `--number`,
`--contact <id> --say "..." [--state file.json]` for persistent test calls.

## LLM backend (phase 2)

See `campaigns/tropic-gooner/worldbuilding/PHONE.md` § "The LLM slot-in
contract": replace `respond(contact_id, history[])` per contact with a call
into the platform's free-first model routing; availability/mood/exchange gates
stay deterministic. UI unchanged.

## SFX / VFX bank (2026-08-13)

Shared catalog at `/sfx/` (`sfx-manifest.json`, `sfx-bank.js`, `assets/`).
Phone imports `../sfx/sfx-bank.js`. Turn **SND ON** to hear procedural clicks/keys/ringback/static until real Foley/voice files land in `assets/` + `voice-manifest.json`.
Radio dial uses `ui.knob` via dynamic import of `/sfx/sfx-bank.js`.
