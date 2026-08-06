# Isla Primavera — the phone

**Status:** [proposal] throughout, 2026-08-05. The people below are the GROUPS.md faces (canon orgs, proposal faces) plus one new casting (the harbormaster — the docks run on foremen per LORE-BIBLE, but nobody had a name). Dialogue lines are playable drafts, not canon, until the GM promotes them.

**What this is:** text-based diegetic calling on the tableslop platform, in a retro feature-phone shell (green LCD, soft keys, a dial pad — the island's phones are ten years behind everything else, which fits). A player picks a contact, hears it ring, and holds a short text conversation that behaves like a phone call — not a chat window. Threads persist per contact SMS-style; the phone also receives ambient inbound spam and wrong numbers on its own. Phase one is fully scripted and deterministic. The architecture leaves one seam where an LLM backend slots in later without any UI change.

---

## The phone itself

- **Numbers.** Island numbers are seven-digit `555-01XX` [proposal]; the telco is **Primavera Bell** [proposal]. Every contact in the directory has a number, and the dial pad works both ways: pick a name or punch digits.
- **Dial-by-number.** Known contact numbers ring through. A few numbers nobody gives out (Stevens dispatch, the CiDance fourteenth floor, the CRT non-emergency line) answer with flavor intercepts. Everything else: "The number you have dialed is not in service… This is a recording. Primavera Bell."
- **Spam.** The phone gets ambient inbound traffic on its own schedule: robocall texts (the Touro-Card warranty, a FREE weekend at the Paradise Meridian, Red Fortune loyalty upgrades, a Coral Trace records notice that tells you not to reply) and wrong-number flavor from islanders (a tita's mangoes, a Carnaval barn-shift debt, crates short at the harbor meant for Meng). Seeded per day, deterministic, 2–5 events/day. Frequency scales with sim heat when the host provides it (`window.TABLESLOP_SIM_HEAT`, default 0.3 — wired to the sim lane later; documented, not built). Robocalls answer a reply or two, then the number goes dead. Wrong numbers apologize once.
- **Persistence.** Threads and the call log live in localStorage on the client. The CLI side of the engine persists conversation state to a local JSON file (`--state`), same shape, for testing and future server-side ownership.

## The call model

One call, six states, no exceptions:

1. **dial** — player picks a contact from the directory. The UI shows what the island would tell you: name, role, city, and a one-line availability hint ("after dark only," "lunch hours, table 6").
2. **ring** — a beat of waiting. Two to four rings, then resolution.
3. **pickup | voicemail** — decided by a seeded per-day availability table (same contact, same day, same answer — the island is consistent even when it's rude). Busy people go to voicemail. Voicemail is a real state: the player hears the greeting and can leave one message, which lands in the call log.
4. **exchange** — short back-and-forth. Replies are phone-speech: brief, interruptible, human. The contact drives toward their own life — they have a fryer on, a manifest open, a lecture in ten minutes.
5. **goodbye** — the natural end. The caller says bye, or the contact wraps up because they're done. Every contact has a finite exchange budget; nobody small-talks forever on island time.
6. **hangup** — the bad end. Be rude or creepy and the contact's mood counter ticks down; at zero they hang up on you, mid-sentence if it suits them. Mood is per-call. The island forgives between calls. Mostly.

## Who answers, and why

Six contacts at launch, one per lane of island knowledge. Call-ability rule: a phone number has to be *findable* — these are people whose work puts them near a phone and whose business is, at least on the surface, talking to strangers.

| id | number | face | org | city | why they're on the phone |
|----|--------|------|-----|------|--------------------------|
| `r02-harbormaster` | 555-0104 | Domeng "Meng" Salcedo | Lujara Docks (foreman) | Porto Lujara | Harbormaster. Manifests, night boats, Carnaval floats. [proposal face — docks run on foremen per LORE-BIBLE; the name is new] |
| `r02-night-ledger` | 555-0182 | Vera Lash | Night Ledger | Porto Lujara | Sells the arithmetic of everyone else's vice: raid forecasts, overtime sheets, whose books are clean. |
| `r03-quay-rojo` | 555-0147 | Rudy "Slots" Marron | Quay Rojo | Jackedsonville | Protection and the unlicensed margin. Diplomatic by island gang standards. Answers after dark. |
| `r03-rough-ride` | 555-0177 | Wes Kaimi | Rough Ride | Jackedsonville | Licensed security and investigation. Always answers — that is, literally, the product. |
| `r01-lunch-regulars` | 555-0160 | Ines "Nes" Bautista | The Lunch Regulars | Paradise | Retired detective at table 6, CiDance buffet. Sells *who to ask*. Lunch hours. |
| `ash-list-editor` | 555-0123 | Marco Reyes | The Ash List | Sierra Dorado (USD) | This semester's editor of the leak archive. Answers when the moderation queue lets him. |

Deliberately not call-able: the Gilded Anchor, the Crimson Tithe, CRT, CiDance corporate, Stevens dispatch. Courts don't list numbers; cops don't do tips; Stevens arrives *before* you call. That's the lore talking, not a missing feature.

## What calls can surface

Topic graphs are grounded in GROUPS.md / STORIES.md so a call can actually deliver world info: the 2 a.m. marina run and the day manifest it skips, the sealed Carnaval float, the raid that didn't happen, the notebook that didn't come home from table 6, Object 14, the humidity-proof bag Team 4 carried out of a casino corridor. Prices get named where the island would name them — cruise comps, manifest crate counts, a clean nine at 1,400 from Wes, the Tithe's weekly per-door number. All quoted facts are [proposal]-grade static strings until promoted.

## The LLM slot-in contract

The UI never talks to a model. It talks to one function, per contact:

```
respond(contact_id, history[]) -> reply
```

- `contact_id` — string from the directory (e.g. `"r02-harbormaster"`).
- `history[]` — the call so far: `[{ role: "caller" | "contact", text, topic? }]`. `topic` is engine bookkeeping threaded through history so the responder stays stateless and deterministic.
- `reply` — `{ text, action, topic?, mood? }` where `action` is `continue | goodbye | hangup | voicemail`. The UI renders `text` and obeys `action`. Nothing else changes.

**Phase one (now):** `scripts/tableslop/phone-responder.js` implements `respond()` as a deterministic topic-graph match — keywords by priority, seeded rotation, mood counter, exchange budget. Zero dependencies, one ESM file, runs in Node (CLI + `--self-check`) and in the browser as a module script.

**Phase two (later, not built):** swap the implementation behind the same signature for a call into the platform's free-first model routing (free pool first, paid only under the standing C8 policy). Message in, reply out, with the contact's sheet — voice, role, topics, availability — as the model's context. The scripted topics become the system prompt and few-shot examples; the availability table, mood counter, and exchange budget stay as deterministic gates around the model, so callers still can't phone the harbormaster at 3 a.m. his time or sweet-talk Rudy past his patience just because a model is awake. The UI, the call states, the transcript format, the spam lane, and the history format do not change. Spam stays scripted even then — ambient flavor doesn't need a model, it needs a schedule.

## Files

- Engine: `scripts/tableslop/phone-responder.js` (ESM module + CLI + `--self-check`)
- Contact scripts: `scripts/linuxbox/tableslop-static/phone/contacts.js` (plain data file; registers `globalThis.PHONE_CONTACTS`)
- UI: `scripts/linuxbox/tableslop-static/phone/` (`index.html`, `phone.js`, `phone.css`) — client-side only, no frameworks, no CDN, threads/call log in localStorage
- Wiring: `scripts/linuxbox/tableslop-static/phone/INTEGRATION-NOTE.md`
