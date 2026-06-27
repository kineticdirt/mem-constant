# Light-mode = a wholly separate-aesthetic site (BACKGROUND / low priority)

**Status:** background lane — only when **all** higher-priority lanes are idle. Not important.
**Profile:** `think`. **Preview only — never deploy to production `abhinavall.net`.**

## Intent (from user)

Light mode should **not** be a CSS reskin of the dark brutalist site. It is a **separate site**:
different **aesthetic and components**, surfacing **different things** — but drawing from the
**same well of information** (same content source: jobs, projects, writing, stats).

- Dark site = v8-brutalist-map (cyberpunk, horizontal-scroll timeline cards, deep-black chrome).
- Light site = its own design language (calm, editorial, generous whitespace, different
  navigation + component set). It may foreground different info (e.g. lead with writing/essays
  or a narrative bio rather than the brutalist project grid).

## Scope (staging only)

- `.staging/portfolio-redesign/light-site/` (new tree — keep separate from `v8-brutalist-map/`)
- `agents/portfolio-light-progress.md` (lane state)
- read-only: existing content inventory (`PORTFOLIO_CONTENT_INVENTORY.md`), v8 content for data

**Do not:** touch `sites/abhinavall.net/`, push to linuxbox production, or alter the dark site.

## Smallest-parts backlog (one per tick)

1. Define the light-site **brief**: aesthetic direction, which info it foregrounds vs the dark
   site, component list (writeup in `light-site/BRIEF.md`). Needs a short human steer first.
2. Shared **content source**: extract the common data (jobs/projects/writing) the dark site uses
   into a single JSON/markdown both sites can read, so they don't drift.
3. Scaffold `light-site/index.html` + its own CSS (separate design tokens — not v8's).
4. Build the distinct component set (e.g. editorial article list, calm bio, contact) — different
   from the brutalist cards.
5. Playwright smoke under `.staging/portfolio-redesign/_screenshots/` (separate from v8 smoke).

## Verify
- Light site renders standalone in local preview; visually distinct from v8 (not a recolor).
- Same underlying facts as the dark site (no contradictory bio/jobs).

## Open question for human (when this lane activates)
- Which information should the light site **lead with** that the dark site de-emphasizes
  (writing/essays? a narrative résumé? speaking/projects)? One sentence is enough to start.
