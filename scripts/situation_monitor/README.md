# Daily Situation Monitor (Agent Lane)

This folder provides a lightweight, non-interactive daily run for "monitor the situation" workflows.

**Not Vercel / not the Svelte dashboard** — we use RSS + markdown briefs locally. Category ideas only from [hipcityreg/situation-monitor](https://github.com/hipcityreg/situation-monitor). Full lane: [`docs/agents/situation-monitor-lane.md`](../../docs/agents/situation-monitor-lane.md).

For a **checkpointed** run that also updates `hermes/state.json`, use `scripts/hermes/continuity_run.sh` (see `scripts/hermes/README.md`).

## What it does

- Pulls configured RSS sources
- Builds a timestamped markdown brief in `reports/situation-monitor/`
- Optionally updates `.mem-constant/last-session.md` for carryover continuity

## Quick run

From repo root:

```bash
python scripts/situation_monitor/daily_situation_monitor.py --write-carryover
```

## Configure sources

Edit `scripts/situation_monitor/sources.example.json` (or copy to a custom file and pass `--sources`).

Each source uses:

- `name`
- `rss_url`
- `tags` (optional hints for category routing)

## Daily scheduler examples

### Windows Task Scheduler

Program/script:

```text
python
```

Arguments:

```text
scripts/situation_monitor/daily_situation_monitor.py --write-carryover
```

Start in:

```text
C:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump
```

### Linux cron (WSL or linuxbox)

```bash
0 8 * * * cd /path/to/agent-dump; python scripts/situation_monitor/daily_situation_monitor.py --write-carryover >> reports/situation-monitor/cron.log 2>&1
```

## Subagent execution pattern

Use a shell/general subagent with this task:

1. Run `python scripts/situation_monitor/daily_situation_monitor.py --write-carryover`
2. Return the output file path
3. Surface the top 3 watchlist lines
4. Flag source failures if any

This keeps runs deterministic and easy to automate.
