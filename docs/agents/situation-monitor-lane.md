# Situation monitor lane (no Vercel)

Keep up with news, markets, and geopolitics **without** deploying [hipcityreg/situation-monitor](https://github.com/hipcityreg/situation-monitor) to Vercel or running its Svelte dashboard on the Pi.

## Two layers

| Layer | Tool | Cost on 2 GB Pi |
|-------|------|------------------|
| **RSS brief** | `scripts/situation_monitor/daily_situation_monitor.py` | Low (HTTP + Python only) |
| **Topic digest** | Hermes cron `situation-hermes` + **web_search** (Firecrawl) | API credits; no local browser |

## Outputs (gitignored reports dir)

- `reports/situation-monitor/situation-brief-*.md` — RSS aggregation
- `reports/situation-monitor/LATEST-BRIEF.md` — symlink/copy of newest RSS brief
- `reports/situation-monitor/hermes-digest-*.md` — LLM synthesis from watchlist + RSS context

## Configure topics

Edit **`agents/SITUATION_WATCHLIST.md`** (bullets = what Hermes searches each morning).

## Configure RSS feeds

Copy and edit:

```bash
cp scripts/situation_monitor/sources.example.json scripts/situation_monitor/sources.json
```

Point `--sources` at `sources.json` in cron (install script does this).

## Linuxbox install

From repo on the Pi (or SSH):

```bash
cd ~/agent-dump
bash scripts/linuxbox/install-situation-monitor-cron.sh
```

Creates:

1. **`situation-rss`** — `0 8 * * *`, `--no-agent`, runs RSS script (no OpenRouter/Firecrawl spend).
2. **`situation-hermes`** — `0 9 * * *`, uses **web** toolset + watchlist file.

**`agent-cycle`** (`every 1m`) stays on **idle** in `agents/CURRENT_TASK.md` so you do not burn API credits every minute.

## PC / manual run

```bash
python scripts/situation_monitor/daily_situation_monitor.py --write-carryover
bash scripts/hermes/continuity_run.sh
```

## Ad-hoc research

Put a short instruction in **`agents/CURRENT_TASK.md`** (see template in that file). The 1m cycle advances one step until `TASK_COMPLETE`.

## Related

- Personal site background lane: [website-abhinavall-lane.md](website-abhinavall-lane.md) ([abhinavall.net](https://abhinavall.net/))

## Reference

Upstream dashboard repo (for category ideas only): [github.com/hipcityreg/situation-monitor](https://github.com/hipcityreg/situation-monitor)
