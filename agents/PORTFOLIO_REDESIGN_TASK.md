# Portfolio redesign — overnight run (abhinavall.net)

**Goal:** Build **3 separate, complete portfolio websites** plus a **preview hub** to toggle between them. Each version gets its own **research** pass before build. Full content in [`PORTFOLIO_CONTENT_INVENTORY.md`](PORTFOLIO_CONTENT_INVENTORY.md). **Do not** deploy to production.

## Three separate sites + toggle hub

Each version is a **standalone site** (own `index.html`, `styles.css`, `main.js`, `assets/`). Not shared CSS across versions.

| Folder | Site | Research file |
|--------|------|----------------|
| **v1-system/** | Dark devtools (Linear / Vercel) | `v1-system/research.md` |
| **v2-editorial/** | Light editorial (Anthropic / Stripe) | `v2-editorial/research.md` |
| **v3-kinetic/** | Bold kinetic motion | `v3-kinetic/research.md` |

**Preview hub** (toggle without redeploying):

```text
portfolio-redesign/index.html   # tab switcher → iframes each site
```

Bootstrap copies `scripts/website/portfolio_preview_hub.html` → `index.html`. Agent may enhance hub copy/styling but **must keep 3-tab toggle**.

**Serve all four on tailnet:**

```bash
bash scripts/website/portfolio_serve_preview.sh
# http://100.122.108.94:8765/  — hub with toggle
```

## Per-version research (before each build)

For **each** version, before writing HTML:

1. Run **1–2 `web_search` queries** specific to that direction (e.g. “Linear app marketing site layout 2025”, “portfolio timeline CSS scroll”, “devtools landing page typography”).
2. Write **`research.md`** in that version folder: 5–10 bullets — patterns to steal, what to avoid, layout/motion ideas **for this site only**.
3. Then build the site informed by that research (not copy-paste from other versions).

## Design north star

Modern **AI / devtools company** sites — **not** generic AI-slop. See anti-slop rules in prior brief (no purple blobs, no template filler). Dynamic UX per site (scroll reveals, sticky nav, etc.).

## Workspace (USB)

```text
/media/abhinav/PERSONAL/agent-work/abhinavall-net/portfolio-redesign/
  index.html              # preview hub (toggle)
  content-inventory.md
  analysis.md
  directions.md
  progress.md
  comparison.md
  v1-system/   (+ research.md)
  v2-editorial/ (+ research.md)
  v3-kinetic/  (+ research.md)
```

## Phases (one step per 1m tick)

| Step | Action |
|------|--------|
| 0 | Inventory on USB + `analysis.md` |
| 1 | `directions.md` — how the 3 sites differ |
| 2 | **Research v1** → `v1-system/research.md` |
| 3 | **Build v1-system** (full standalone site) |
| 4 | Validate v1 + inventory checklist |
| 5 | **Research v2** → `v2-editorial/research.md` |
| 6 | **Build v2-editorial** |
| 7 | Validate v2 |
| 8 | **Research v3** → `v3-kinetic/research.md` |
| 9 | **Build v3-kinetic** |
| 10 | Validate v3 |
| 11 | Ensure **`index.html` hub** toggles all 3; smoke-test iframe src paths |
| 12 | `comparison.md` — pick favorite, link hub URL |
| 13 | `TASK_COMPLETE` + idle |

## Hard rules

- **Full inventory content** in every site.
- **Separate sites** — do not use one HTML with theme switch only; three distinct implementations.
- **`web_search`** for research steps; **no browser** unless stuck.
- After each build: `bash scripts/website/portfolio_validate.sh <version-dir>`
- Never deploy to abhinavall.net.
