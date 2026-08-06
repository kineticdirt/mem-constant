# Isla Primavera — the phone

**Status:** [proposal] throughout, 2026-08-05. The people below are the GROUPS.md faces (canon orgs, proposal faces) plus one new casting (the harbormaster — the docks run on foremen per LORE-BIBLE, but nobody had a name). Dialogue lines are playable drafts, not canon, until the GM promotes them.

**What this is:** text-based diegetic calling on the tableslop platform. A player picks a contact, hears it ring, and holds a short text conversation that behaves like a phone call — not a chat window. Phase one is fully scripted and deterministic. The architecture leaves one seam where an LLM backend slots in later without any UI change.

---

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

| id | face | org | city | why they're on the phone |
|----|------|-----|------|--------------------------|
| `r02-harbormaster` | Domeng "Meng" Salcedo | Lujara Docks (foreman) | Porto Lujara | Harbormaster. Manifests, night boats, Carnaval floats. [proposal face — docks run on foremen per LORE-BIBLE; the name is new] |
| `r02-night-ledger` | Vera Lash | Night Ledger | Porto Lujara | Sells the arithmetic of everyone else's vice: raid forecasts, overtime sheets, whose books are clean. |
| `r03-quay-rojo` | Rudy "Slots" Marron | Quay Rojo | Jackedsonville | Protection and the unlicensed margin. Diplomatic by island gang standards. Answers after dark. |
| `r03-rough-ride` | Wes Kaimi | Rough Ride | Jackedsonville | Licensed security and investigation. Always answers — that is, literally, the product. |
| `r01-lunch-regulars` | Ines "Nes" Bautista | The Lunch Regulars | Paradise | Retired detective at table 6, CiDance buffet. Sells *who to ask*. Lunch hours. |
| `ash-list-editor` | Marco Reyes | The Ash List | Sierra Dorado (USD) | This semester's editor of the leak archive. Answers when the moderation queue lets him. |

Deliberately not call-able: the Gilded Anchor, the Crimson Tithe, CRT, CiDance corporate, Stevens dispatch. Courts don't list numbers; cops don't do tips; Stevens arrives *before* you call. That's the lore talking, not a missing feature.

## What calls can surface

Topic graphs are grounded in GROUPS.md / STORIES.md so a call can actually deliver world info: the 2 a.m. marina run and the day manifest it skips, the sealed Carnaval float, the raid that didn't happen, the notebook that didn't come home from table 6, Object 14, the humidity-proof bag Team 4 carried out of a casino corridor. Prices get named where the island would name them — cruise comps, manifest crate counts, a clean nine at 1,400 from Wes, the Tithe's weekly per-door number. All quoted facts are [proposal]-grade static strings until promoted.

## The LLM slot-in contract

The UI never talks to a model. It talks to one function:

```
responder(contact_id, history[]) -> reply
```

- `contact_id` — string from the directory (e.g. `"r02-harbormaster"`).
- `history[]` — the call so far: `[{ role: "caller" | "contact", text, topic? }]`. `topic` is engine bookkeeping threaded through history so the responder stays stateless and deterministic.
- `reply` — `{ text, action, topic?, mood? }` where `action` is `continue | goodbye | hangup | voicemail`. The UI renders `text` and obeys `action`. Nothing else changes.

**Phase one (now):** `scripts/tableslop/phone-responder.js` implements `responder()` as a deterministic topic-graph match — keywords by priority, seeded rotation, mood counter, exchange budget. Zero dependencies, runs in Node and in the browser.

**Phase two (later, not built):** swap the implementation behind the same signature for a call into the platform's free-first model routing (the same routing discipline as the rest of the stack: free pool first, paid only under the standing C8 policy). The scripted topics become the system prompt and the availability table stays as the gate, so callers still can't phone the harbormaster at 3 a.m. his time just because a model is awake. The UI, the call states, the transcript, and the history format do not change.

## Files

- Engine: `scripts/tableslop/phone-responder.js` (module + CLI + `--self-check`)
- Contact scripts: `scripts/linuxbox/tableslop-static/phone/contacts.js` (plain data file, dual-loads in Node and browser)
- UI: `scripts/linuxbox/tableslop-static/phone/` (`index.html`, `phone.js`, `phone.css`) — client-side only, no frameworks, no CDN, call history in localStorage
- Wiring: `scripts/linuxbox/tableslop-static/phone/INTEGRATION-NOTE.md`
