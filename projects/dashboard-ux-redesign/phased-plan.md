# Phased plan — dashboard UX redesign

## Phase 0 — Study + screenshots (current)

- Document IA, clutter, inbox gaps.
- Capture baseline screenshots (`screenshot-index.md`).
- Add `schema_version` to `agents/linuxbox-systems.json`.
- **No HTML/CSS changes.**

**Exit:** Human sign-off on grouping taxonomy + Phase 1 scope.

## Phase 1 — Collapsible groups (no drag)

- Rail: 4–5 groups (Ops / Intel / Campaign / Personal) + Hub + News primaries.
- Unify rail label = topbar title.
- News: drop redundant **Trackers** mode; collapse Markets sections.
- Tasks/Systems: `<details>` sections default collapsed.
- Fix News toolbar `role="tab"` a11y.
- Ship dashboard UI **2.2.0**.

## Phase 2 — Drag layout (session only)

- Edit mode on Hub + Systems: reorder KPIs/cards.
- `sessionStorage` only; reset on refresh.
- Ship **2.3.0**.

## Phase 3 — Persist layout

- `localStorage` `linuxbox-dash-layout-v1`; optional server profile later.
- Viewer: fixed simplified layout.
- Ship **2.4.0**.

## Open questions (need human)

1. **Build** tab — Personal or Ops group?
2. **Admin News default** — Briefs or Markets? (Hub CTA currently pushes Markets.)
3. **Viewer mobile** — 2 tabs enough or need “More” sheet?
4. **Layout persist** — phone + PC sync via server file, or local-only OK?
