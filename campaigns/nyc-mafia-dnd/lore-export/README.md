# lore-export — README (GM note, not part of the handout)

Player-facing lore pack for NYC Mafia × D&D. Drop the numbered files on the table / in Discord. `LORE-DUMP.md` is the same content concatenated into one file for printing or a single paste.

## Files

| File | Covers | Primary sources |
|------|--------|-----------------|
| `00-START-HERE.md` | Orientation + reading order | — |
| `01-world.md` | Era stack, capability asymmetry, tone | `SETTING-CAPABILITY-ASYMMETRY.md`, `reports/2026-08-01-era-and-tone.md`, `story/premise.md` |
| `02-families.md` | Five Families, OCU/FAB/FSA, evidence, Ledger, rumors | `reports/2026-08-01-five-families.md`, `-law-and-magic.md`, `-police-ocu.md`, `-rumors-table.md`, `-npc-roster*.md`, `story/factions.md` |
| `03-peoples.md` | Every people group ↔ ancestry, family bloodlines | `SETTING-PEOPLES-RACES.md`, `SETTING-ANCESTRIES-WARDS.md`, `reports/2026-08-01-family-ancestries.md` |
| `04-magic-and-tech.md` | Spell-tech, licensing, contraband, capsule arms | `SETTING-ARMS.md`, `SETTING-SPELL-TECH-TREE.md`, `reports/2026-08-01-magic-in-the-city.md` |
| `05-city-and-nightlife.md` | Boroughs, transit, scry-press, prices, clubs, social reality | `SETTING-URBAN-FRINGE.md`, `SETTING-SCRY-PRESS.md`, `worldbuilding/details/city-economics.md`, `reports/2026-08-01-locations.md` |
| `06-fringe-and-monsters.md` | Vampires, werewolves, constructs, the Below, undead, druids | `SETTING-URBAN-FRINGE.md`, `reports/2026-08-01-the-below.md`, `SETTING-CAPABILITY-ASYMMETRY.md` |
| `07-crew-and-table.md` | Heist frame, seats, leash, session zero, table rules | `story/crew-start-heisters.md`, `story/session-zero-discord.md`, `reports/_session/2026-08-01-pc-roles.md` |
| `08-glossary.md` | All terms | all of the above |

## Spoiler firewall — what is deliberately NOT in the pack

Keep these **out** of any player-facing copy. They live in GM-only docs:

- What the Blue Note ledger **actually is** / the twist (`story/heist-blue-note-job.md` §5, `story/session-01-run-sheet.md`).
- Session-1 complications, escape legs, endings, clocks (`story/heist-blue-note-job.md` §4–6, run-sheet).
- The **Below access-point table** (Court Street / Canal Overflow / Stapleton / Dead Stop) and its controlling families — players get the Below as **street rumor only** until arc 2.
- The Below's named entities (the Echo, the Chattering, the Sleeper in the Hollow) and their mechanics — players get "the pipes remember" / "the rats drink magic" / "something under the docks gets fed," not names.
- The Valenti crypt-shelf price ($200/mo) — it points at the access map.
- NPC GM levers — Julian Cross's "knows every pact / clerks on retainer," Eddie Trillo's parallel contract, Rosa's binder knowledge, Sal's forged papers, Gutter's nightmares.
- The Bone Index deeper layer / the Below's late-campaign truth (`reports/2026-08-01-the-below.md` beyond surface flavor).
- GM-only session-1 readiness checklists (`story/session-zero-discord.md` GM section).
- Private character GM notes (`characters/*.md` private blocks).

If you add to the pack, re-run the scan:

```bash
cd campaigns/nyc-mafia-dnd/lore-export
grep -rniE 'ledger actually|what the ledger|bone index|spirit-ledger|reactive script|rogue collective|crypt shel|Court Street Station|Canal Street Overflow|Stapleton|Dead Stop|run.sheet|escape leg|complication|G-5|Julian Cross|Trillo|the Echo|Chattering|Sleeper in' *.md
```

Any hit outside this README is a leak.

## Regenerating the single-file dump

```bash
cd campaigns/nyc-mafia-dnd/lore-export
cat 00-START-HERE.md 01-world.md 02-families.md 03-peoples.md 04-magic-and-tech.md 05-city-and-nightlife.md 06-fringe-and-monsters.md 07-crew-and-table.md 08-glossary.md > LORE-DUMP.md
```
