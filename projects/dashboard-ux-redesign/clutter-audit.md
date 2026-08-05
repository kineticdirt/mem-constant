# Clutter audit

## Rail

- 11 equal-weight tabs; no grouping or overflow menu.
- Label mismatch: Docs/Reports, Camp/Campaigns, Build/Mazda3 build.
- 56px rail — cramped text, no icons.
- Hub duplicates lane status (cards + topbar chips).

## News (primary pain)

1. Rail **News** → toolbar **4 modes** → list **group h2s** → reader.
2. **Trackers** duplicates links already in Markets/Social.
3. Markets panel: TradingView + table + tools + inline brief — always expanded.
4. Toolbar lacks proper `role="tab"` / `aria-selected`.
5. Hub quick action jumps to Markets, not Briefs.

## Other dense panels

- **Tasks:** sidebar always expanded (projects, new task, filters, campaign queue).
- **Systems:** flat card grid, no collapse by kind (tunnel/app/agent).

## Smoke coverage gap

`dashboard-ui-smoke.mjs` skips **Systems** and **Garage** tabs.
