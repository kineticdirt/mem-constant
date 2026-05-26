# abhinavall.net background lane

Monitor and lightly review **[https://abhinavall.net/](https://abhinavall.net/)** from **linuxbox** without deploying the site to the Pi or using Vercel.

## Storage layout (USB thumb drive)

When **`PERSONAL`** is mounted at `/media/abhinav/PERSONAL`:

```text
/media/abhinav/PERSONAL/agent-work/abhinavall-net/
  reports/     # check-*.md (daily), review-*.md (weekly), LATEST-CHECK.md
  cache/       # ephemeral; purged by cleanup
  archive/     # rolled-off reports
  inbox/       # optional next-task.md for approved site work
```

**vfat note:** Avoid huge numbers of tiny files; each run writes **one** markdown report. Cleanup enforces retention automatically.

If USB is unplugged, checks still run into `~/agent-dump/reports/website-abhinavall/` (warning in log).

## Jobs

| Cron | Schedule | What |
|------|----------|------|
| `site-abhinavall-ping` | Daily **06:30** | `curl` + TLS date → `check-*.md` (no LLM) |
| `site-abhinavall-review` | **Sunday 10:00** | Hermes `web_extract` + short review markdown |

Situation-monitor jobs (`situation-rss`, `situation-hermes`) are separate — see [situation-monitor-lane.md](situation-monitor-lane.md).

## Install (linuxbox)

```bash
cd ~/agent-dump
bash scripts/linuxbox/install-website-abhinavall-cron.sh
```

## Manual check

```bash
bash scripts/website/abhinavall_check.sh
```

## Optional work queue

Create on USB:

`/media/abhinav/PERSONAL/agent-work/abhinavall-net/inbox/next-task.md`

Example: “Draft a short blog post outline about X” or “Verify project links still resolve.” Point **`agents/CURRENT_TASK.md`** at that file for the 1m Hermes cycle to advance it in small steps.

## Rules for agents

- **Read-only** on production unless `inbox/next-task.md` explicitly requests drafts (stored under USB `reports/` or `cache/`, not pushed live automatically).
- Run **`abhinavall_cleanup.sh`** after every write.
- Do not fill internal Pi disk with logs — prefer USB.

Config: [`agents/WEBSITE_ABHINAVALL.md`](../../agents/WEBSITE_ABHINAVALL.md)
