# SpaceQuest worldbuilding lane — config

Background lane: the **linuxbox Hermes agent** periodically reads the SpaceQuest
campaign corpus and **drafts worldbuilding reports**. Drafts only — the table keeps
canon (per `campaigns/spacequest/characters/meta/LOCAL-LLM-NOTES.md`).

## Scope

- **Read:** `campaigns/spacequest/` — `story/`, `lore/`, `characters/`,
  `discord-export/*.md` analyses, and prior `campaigns/spacequest/reports/`.
- **Write:** new dated files under `campaigns/spacequest/reports/` only.
- **Never edit canon:** do **not** modify `story/`, `lore/`, `characters/`, or the
  Discord exports. Proposals go in `reports/`; a human promotes accepted ideas into
  canon and flips the backlog item.
- **No VTT/maps** (excluded from this repo copy by design).
- **Adult content:** the campaign is erotic-horror; keep reports at **design level**
  (structure, factions, arcs, continuity) — no explicit prose. Respect table safety
  tools referenced in `story/narrative-synthesis.md`.

## Each review tick

1. `git pull` if safe.
2. Read `campaigns/spacequest/reports/README.md` + the latest
   `*-worldbuilding-open-threads.md`.
3. Pick the **single highest-priority unresolved** open thread (the priority queue
   table). Skip items already drafted in a prior report.
4. Draft a proposal: new file `campaigns/spacequest/reports/<YYYY-MM-DD>-<slug>.md`,
   **evidence-anchored** (cite source files), **<800 words**.
5. Append a one-line row to the index table in `reports/README.md`.
6. Do **not** push to production anything; commit to repo only if the lane is
   configured to commit (default: leave for human review).

## Backlog source of truth

`campaigns/spacequest/characters/meta/PROJECT-BACKLOG.md` (Epics C–D) and the
open-threads report. When a human promotes a draft into canon, flip that backlog
row to **done** and note it in `AI_GROUPCHAT.md`.

## Runbook

`docs/agents/spacequest-worldbuilding-lane.md`
