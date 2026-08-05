# Hub API failures, idle behavior, and task continuity — 2026-08-04

**Machine:** linuxbox (`potato-lan`, `192.168.4.59`)  
**Investigator:** PC Cursor subagent  
**Evidence window:** 2026-08-04 ~14:00–22:12 UTC

## Executive summary

| Symptom | Root cause (evidence) | Fix / status |
|--------|------------------------|--------------|
| API calls failing | OpenRouter **free pool fully 429-blocked** (`think-free-429.json` lists 12 `:free` ids); think escalated to **paid DeepSeek** (C8 scenario 1). Hub `/api/chat/models` shows **injected** free rows because potato `chat-catalog.json` is **v1 / 6 models** (stale) — server fallback, not missing keys. | Keys present (`OPENROUTER_API_KEY`, `ZENMUX_API_KEY` both SET). Sync `chat-catalog.json` v4 to potato. Paid C8 already active. |
| Idling when shouldn't | Think is **not** in has-work IDLE — 5 open user-tasks + 7 dashboard backlog `[ ]`. Hub shows idle because: (1) **8-minute LLM throttle** (`THINK_INTERVAL_SEC=480`); (2) last tick **failed exit 124** (timeout) on `supply-chain-check-run` after `hermes update` ran ~180s; (3) `think-focus.json` stuck on `failed`. | Timeout class on heavy ops upgrades — don't batch `hermes update` in one tick. Continuity seeder added. |
| No new task generation | **By design** — nothing auto-minted tasks when queues emptied. `agent-cycle-has-work.py` already falls through to backlog boards, but no seeder created Playwright/backlog tasks. | New `think-continuity-seed.py` hooked into think tick. |
| supply-chain-check-run | Script **works** — `safe-update-check.sh hermes` → **SAFE** (`reports/supply-chain/hermes-20260804.md`). Think tick timed out mid-`hermes update`; `think-enforce-status` auto-marked task **done** despite incomplete batch. | Not a broken script; avoid full upgrade in one 300s ops tick. |

## 1. API failures — evidence

### OpenRouter 429 (think lane)

From `agents/state/think-free-429.json` (2026-08-04 UTC day):

```
models_429: inclusionai/ling-3.0-flash:free, nvidia/nemotron-3-super-120b-a12b:free,
cohere/north-mini-code:free, nvidia/nemotron-3-ultra-550b-a55b:free, poolside/laguna-s-2.1:free,
google/gemma-4-31b-it:free, openai/gpt-oss-20b:free, … poolside/laguna-xs-2.1:free
(12 models — entire free swap chain)
```

Live log tail from `/api/agent` → `running_now.live_log`:

```
======== free-exhaust mid-day re-probe ========
blocked=<all 12 free models>
recovered=
======== think PAID C8 scenario 1 (full free swap 429): deepseek/deepseek-v4-flash ========
```

**Interpretation:** Provider free-tier rate limits (429), not missing API keys or "no router" misconfig. C8 policy correctly escalated to paid DeepSeek.

### Hub Chat `/api/chat/models`

- HTTP **200**
- Potato catalog: **version 1**, **6 models** (paid-heavy; no live free tier rows)
- Server injects free models from routing config with note `"injected — catalog missing live free rows"` (`linuxbox-status-server.js` ~L707–728)
- PC repo has **chat-catalog.json v4** with full free pool — potato never received sync

### Hermes env (secrets not printed)

```
HERMES_ENV=present
OPENROUTER_API_KEY=SET
ZENMUX_API_KEY=SET
```

### Hub dashboard journal

No `/api/chat` or `/api/agent` 500/429 lines in `journalctl -u linuxbox-status` last 6h. API surface healthy; model **inference** fails upstream on OpenRouter free tier.

## 2. Idle behavior — evidence

### has-work check (deterministic)

```bash
python3 scripts/linuxbox/agent-cycle-has-work.py --lane think --repo ~/agent-dump
# → WORK: open user-tasks (exit 0)
```

Open user-tasks (5):

| id | priority | project |
|----|----------|---------|
| intel-auto-alerting | — | linuxbox |
| code-discovery-first-run | — | linuxbox |
| code-discovery-weekly-03 | low | linuxbox |
| infranet-next-spike | low | infranet |
| pixi-continuity-inject | medium | pixi-rp |

### think-focus.json (Hub "Active now")

```json
{
  "status": "failed",
  "task_id": "supply-chain-check-run",
  "blurb": "PAID C8 free-pool→paid deepseek/deepseek-v4-flash exit 124: … KeyboardInterrupt",
  "updated_at": "2026-08-04T22:00:19Z"
}
```

Last LLM stamp: `think-llm.last` = `2026-08-04T18:00:10-04:00` (~8 min cadence).

### Other open lane work

| Board | open `[ ]` count |
|-------|------------------|
| LINUXBOX_DASHBOARD_BACKLOG.md | 7 |
| maintenance-progress.md | 1 |
| system-integrity-progress.md | 1 |
| tableslop-progress.md | 2 |
| portfolio-progress.md | 1 |
| research-studies-progress.md | 8 |
| tropic-gooner / nyc progress | 0 |

**Why Hub looks idle:** Between 8-minute think ticks, focus stays on last **failed** run; cron minutes with throttle age < 480s exit silently (by design).

## 3. Task generation gap

- `agent-cycle-has-work.py` already checks backlog boards when user-tasks empty.
- **No seeder** existed to mint new `[ops]` tasks when everything was `done`.
- `supply-chain-check-run` was auto-closed by `think-enforce-status` on timeout — masked incomplete work.

## 4. Fixes applied (this session)

1. **`scripts/linuxbox/think-continuity-seed.py`** — before has-work each think tick:
   - If zero open user-tasks + dashboard backlog has `[ ]` → seed one `hub-backlog-<hash>` task.
   - If no `ops-hub-playwright-smoke` in last 24h → seed Playwright verify task.
2. **Hook** in `agent-cycle-think-tick.sh` (calls seeder, no LLM).
3. **Deploy** seeder + tick hook + `chat-catalog.json` v4 to potato.
4. **Playwright smoke** run on potato (see §5).

## 5. Playwright smoke result

```bash
bash scripts/linuxbox/run-dashboard-ui-smoke.sh
# exit 0 (~190s, first-time chromium install)
```

Report: `reports/dashboard-ui-smoke/2026-08-04.md`

Key lines: all tab smokes **OK**; WARN on empty inbox seeds / empty chars registry (expected on box). **No console errors.**

## 6. Recommendations (not implemented — ask GM)

- Split `supply-chain-check-run` into **one target per tick** (avoid `hermes update` in same 300s window as full batch).
- Re-open `supply-chain-check-run` or add per-target tasks for mem-constant, mempalace, etc. (only hermes report exists on disk).
- Mid-day free re-probe recovered **zero** models today — expect paid think until UTC midnight or provider recovery.
- Consider lowering think priority of essay-heavy / laptop-handshake tasks when `models_429` > 50% (already partially in picker).

## 7. Coordination

- Did **not** touch `regions-ui.json`, `chat-threads/`, or `characters-registry.json`.
- Hub lanes UI work (`db-20260803-hub-layout-grid-r1`) left intact — no conflicting server.js edits beyond catalog sync path.
