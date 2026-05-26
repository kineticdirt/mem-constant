# Website lane: abhinavall.net

Public site: **https://abhinavall.net/** — portfolio / personal presence (not hosted on linuxbox).

## Agent role (background)

- **Monitor** uptime, HTTP status, TLS, response time.
- **Review** homepage content and key outbound links (GitHub, LinkedIn, etc.) on a light schedule.
- **Do not** change production hosting, DNS, or live HTML unless a task is explicitly queued in **`inbox/next-task.md`** on USB (human-approved work only).
- **Stay tidy** — all artifacts on USB; run cleanup after every job; no clutter in `agent-dump` git tree.

## Storage (thumb drive first)

| Path | Purpose |
|------|---------|
| `/media/abhinav/PERSONAL/agent-work/abhinavall-net/reports/` | Dated check + review markdown |
| `.../cache/` | Short-lived scrape temp (purged often) |
| `.../archive/` | Reports older than retention window |
| `.../inbox/` | Optional: drop `next-task.md` for approved site work |

If USB is **not** mounted, jobs fall back to `~/agent-dump/reports/website-abhinavall/` and log a warning.

## Retention (enforced by cleanup script)

- **reports/**: keep newest **14** files; older → **archive/** (max **30** archive files, then delete oldest).
- **cache/**: delete files older than **7** days; directory may be emptied after each run.
- Never commit USB contents to git.

## Cron jobs (linuxbox)

| Name | Schedule | Mode |
|------|----------|------|
| `site-abhinavall-ping` | `30 6 * * *` | `--no-agent` HTTP/TLS check |
| `site-abhinavall-review` | `0 10 * * 0` | Hermes **web_extract** + short review |

Install: `bash scripts/linuxbox/install-website-abhinavall-cron.sh`

## Ad-hoc site work

On USB, create `inbox/next-task.md` with one paragraph (what to research or draft). Hermes **1m** cycle or a manual `hermes chat` can pick it up when you also set `agents/CURRENT_TASK.md` to reference that file.

## Portfolio redesign (approved batch)

Overnight **3 dynamic prototypes** (full content inventory, modern devtools aesthetic, anti-slop) — see **`agents/PORTFOLIO_REDESIGN_TASK.md`** and **`agents/PORTFOLIO_CONTENT_INVENTORY.md`**. Start: `bash scripts/linuxbox/start-portfolio-overnight.sh`. Does **not** deploy to production.
