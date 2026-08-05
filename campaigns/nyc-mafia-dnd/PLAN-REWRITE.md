# Plan: NYC Mafia × D&D — 1950s–1960s Era & Late-1800s Spell-Tech Full Rewrite

This document details the exact plan and breakdown of tasks to execute the full rewrite of the campaign files to align with the NEW canon.

## 1. LOCKS.md Rewrite
- **Goal:** Lock the NEW canon and void the old 1931 Prohibition/magitech-divergence era.
- **Details:**
  - Update `LOCKS.md` header and status to reflect the absolute lock of the 1950s–1960s NYC + Jersey culture and late-1800s tech.
  - Mark B1 (Calendar) as locked to 1950s–1960s.
  - Mark B1b (Tech skin) as locked to late-1800s industrial (brass, steam, guild foundries, speaking-tubes).
  - Mark B1c (Texture) as locked to NYC + Jersey stereotypes (Italian, Irish, Jewish, Black, Puerto Rican, Chinese).
  - Mark B1d (Vice) as locked to jazz clubs, instruments as status/magic foci, alcohol, drugs, nightlife.
  - Mark D2 (Automaton) as locked to **existential threat** at civilization scale.
  - Explicitly mark 1931, Prohibition, OTR, BCC, magitech-divergence, and "automaton as rare garnish" as **VOID/superseded**.

## 2. SETTING-SPELL-TECH-TREE.md Update
- **Goal:** Align charter and era framing to the NEW canon while retaining the needs→spell method.
- **Details:**
  - Update lens charter to explicitly reference 1950s–1960s NYC + Jersey culture and late-1800s tech.
  - Ensure the needs→spell method (Procedure in §2) is preserved and reinforced.
  - Update the core needs table and existing technologies inventory to reflect late-1800s tech (e.g., brass speaking-tubes, continual flame, steam lifts, warded carriages) and 1950s–1960s vice/nightlife.
  - Ensure automata are framed as an existential threat.

## 3. Rewrite/Modify All Reports under `campaigns/nyc-mafia-dnd/reports/`
- **Goal:** Rewrite all content reports under the NEW canon.
- **Details:**
  - Glob all `.md` files in `campaigns/nyc-mafia-dnd/reports/`.
  - Rewrite the following core reports (ensure they exist and are full, rich, and GM-usable):
    1. `2026-08-01-era-and-tone.md` - Establish 1950s-1960s NYC/Jersey tone, late-1800s tech, gender roles, STE prose with flair.
    2. `magic-in-the-city.md` - Detail D&D 5e spellcasting-rooted technology, guild foundries, and temple patronage.
    3. `five-families.md` - Reskin the five families (Valenti, Moretti, Chen-Okafor, Kowalski, Ashford) to 1950s-1960s.
    4. `opening-job.md` - Detail the jazz-club / licensed-salon raid cold open.
    5. `pc-roles.md` - Define family-adjacent operator roles (fixers, muscle, ward-breakers, club musicians).
    6. `locations.md` - Detail NYC/Jersey districts, clubs, and trades with late-1800s tech.
    7. `law-and-magic.md` - Detail licensed guild/temple craft vs bootleg ritual (healing bands, construct cores, bound spirits).
    8. `session-01-outline.md` - Create a detailed session outline with the new 1950s-1960s / late-1800s tech.
    9. `the-below.md` - Foreshadow the Below (mid-campaign reveal, necromancy, soul-binding).
  - For legacy dated reports (e.g., `2026-07-*` or `2026-06-*`), either rewrite them in place or add a clear `status: superseded` banner pointing to the new `2026-08-01` canonical reports.
  - Update `reports/README.md` and `reports/progress.md` to reflect the new canonical files.

## 4. story/premise.md and README.md Alignment
- **Goal:** Align high-level campaign overviews to the NEW canon.
- **Details:**
  - Rewrite `campaigns/nyc-mafia-dnd/story/premise.md` to frame the 1950s-1960s NYC/Jersey culture, late-1800s tech, and automata threat.
  - Rewrite `campaigns/nyc-mafia-dnd/README.md` to match.

## 5. Create/Expand Missing Worldbuilding Files
- **Goal:** Create or expand files for economics, nightlife, and boroughs.
- **Details:**
  - Create/expand `campaigns/nyc-mafia-dnd/worldbuilding/details/city-economics.md` (prices, trades, licensing, rackets).
  - Create/expand `campaigns/nyc-mafia-dnd/worldbuilding/details/nightlife-culture.md` (jazz clubs, instruments as foci, drugs, alcohol, stereotypes).
  - Create/expand `campaigns/nyc-mafia-dnd/worldbuilding/strokes/borough-city-build.md` (borough-by-borough breakdown under the late-1800s tech + 1950s-1960s culture).

## 6. AI_GROUPCHAT.md Prepend
- **Goal:** Update the ledger with intent and results.
- **Details:** Prepend the Intent line (done) and prepend the Result line once files are written.

## 7. SCP rewritten tree to potato
- **Goal:** Sync the PC filesystem changes to the remote linuxbox.
- **Details:** Use `scp -r` or individual `scp` commands for `reports/`, `LOCKS.md`, `SETTING-SPELL-TECH-TREE.md`, `story/`, and `worldbuilding/`. No chaining with `&&`.

## 8. Kick/Refresh Potato Cursor Auto
- **Goal:** Prompt the remote Cursor Auto agent to refine and expand the research without inventing conflicting eras.
- **Details:** Write prompts/queued files on potato to guide the next run.
