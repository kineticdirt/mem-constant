# tableslop — local design workspace

**Purpose:** Iterate UI/layout on the **PC** before merging into `scripts/linuxbox/tableslop-server.js` or pushing to linuxbox.

Live production stays on `https://map.tableslop.org/` until you sign off here.

## Run the preview

```bash
bash scripts/tableslop/serve-design-preview.sh
```

Open **http://127.0.0.1:8767/projects/tableslop/design/preview/** — uses real map image + `map.json` markers (repo-root static server).

## What’s in this folder

| Path | Role |
|------|------|
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | Tokens, typography, component inventory |
| [`LAYOUT.md`](./LAYOUT.md) | Screen zones, responsive behavior, next features |
| [`preview/`](./preview/) | HTML + CSS + JS prototype (source of truth for design) |

## Design goals (v2)

1. **Overworld clarity** — map is the hero; chrome stays thin.
2. **Region detail drawer** — selecting R1–R14 opens lore/actions (mv-03); list stays one tap away.
3. **Progressive depth** — guest → local notes → Discord link → character cards (see `client-first-profile-plan.md`).
4. **Same vaporwave DNA** — Orbitron / VT323 / Share Tech Mono; pink–cyan–purple; no new palette without reason.

## Merge checklist (when ready for linuxbox)

- [ ] Review region detail UX on desktop + phone width
- [ ] Port `preview/tableslop.css` + markup deltas into `tableslop-server.js` `viewerHtml()` (or extract shared assets first)
- [ ] Playwright smoke still passes (`campaigns/tropic-gooner/map/tableslop-smoke.mjs`)
- [ ] `bash scripts/linuxbox/push-tableslop-map.sh` only if map binaries changed
