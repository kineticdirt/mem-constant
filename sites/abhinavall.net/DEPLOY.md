# Deploy — abhinavall.net

**Production source (this folder):** `agent-dump/sites/abhinavall.net/`

Synced from **`.staging/portfolio-redesign/v8-brutalist-map/`** — multi-page brutalist map, **`abhinavall.net`** glitch header/footer brand, Map/List nav, fixed footer bar (connect/top/jobs/blog/ask), blog lane, default theme **`red`**.

## Verify locally

From repo root (`agent-dump`):

```bash
bash scripts/website/portfolio_validate.sh sites/abhinavall.net
```

Or:

```bash
cd sites/abhinavall.net
python -m http.server 8765 --bind 127.0.0.1
```

Open http://127.0.0.1:8765/ — confirm **abhinavall.net** glitch bar, **red** theme, map, projects, blog.

Playwright smoke (optional):

```bash
cd .staging/portfolio-redesign/_screenshots
PREVIEW_URL=http://127.0.0.1:8765/ npm test
```

## Deploy to https://abhinavall.net/ (linuxbox)

Production origin: **`~/personal_portfolio`** on linuxbox, served by **`abhinav-portfolio.service`** on **`:3000`**, tunnel **`8780→3000`** (`/Linuxbox/` still routes to **`:8790`**).

From repo root on PC:

```bash
bash scripts/website/push_abhinavall_to_linuxbox.sh
```

Manual flow: validate → `tar` `sites/abhinavall.net/` → `scp` to linuxbox → extract into `~/personal_portfolio` (keep `api/`, `node_modules/`, `package.json`) → `sudo systemctl restart abhinav-portfolio`.

Backup on Pi: `~/personal_portfolio-backup-pre-v8-*` before first v8 push.

**Agents:** deploy only on explicit user request. After deploy: `bash scripts/website/abhinavall_check.sh`.

## Agent docs

- Portfolio lane: `agents/WEBSITE_ABHINAVALL.md`
- Staging edits: `.staging/portfolio-redesign/v8-brutalist-map/` then re-sync here.
