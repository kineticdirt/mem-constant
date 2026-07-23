# Portfolio / blog — presentation & review options (for human pick)

**Date:** 2026-07-23 · **Project:** `abhinavall-portfolio`  
**Staging:** `.staging/portfolio-redesign/` (prefer over USB) · Live: https://abhinavall.net/

## Why

You asked for options to review, plus a **presentation** surface to view completed work and give feedback — full capability, not just “ship another hero tweak.”

## Option set (pick 1–2 to build next)

### P1 — Staging gallery (lowest risk)
- Index page under `.staging/portfolio-redesign/_present/` listing v8 pages + Playwright screenshot thumbs.
- Per piece: **Approve / Needs change / Defer** → writes `reports/portfolio/feedback-YYYY-MM-DD.json`.
- Agents read feedback on next tick; no live site touch until Approve.

### P2 — Dashboard “Present” mode (ops-integrated)
- New Hub/Tasks sibling or Chat mode template: **Present** — pull completed pf-* / dashboard / tableslop milestones.
- Feedback buttons → `agents/state/presentation-feedback.json` + optional Inbox.
- Best if you already live in `/Linuxbox/` on phone.

### P3 — Live abhinavall “Work / Lab” route (public-facing)
- New multi-page section (still v8 language): Lab / Work-in-progress / Feedback form (mailto or Access-gated POST).
- Heavier: touches production tunnel path; preview on `:8765`/`:8766` first.

### P4 — Side-by-side review board (design critique)
- Two-column: live abhinavall.net iframe vs staging; sticky comment box.
- Good for timeline-card / CRT / watermark debates without committing.

## Immediate site work (while you pick)

Independent of presentation mode, next concrete passes remain:
1. `pf-blog-01` — one v8 depth pass (experience or projects horizontal timeline) + Playwright smoke.
2. `pf-blog-02` — one technical essay (no internal infra in body).

## Recommendation

**Build P1 first** (hours, reversible), wire **P2** if you want phone feedback in the same place as Inbox. Defer P3 until a Lab page has content worth public.

Reply with e.g. `P1+P2` or `P4 only` — or edit live without a present mode first.
