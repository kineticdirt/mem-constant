# Potato CPU vs AI overhead — improve efficiency, maintain function

**Date:** 2026-07-13  
**Policy:** Same always-on ops functions; less wasteful LLM/CPU. Do **not** disable Hermes, lanes, or campaign/meta capability. Cadence/policy changes that could reduce work throughput need human OK.

## Why this came up

Hub CPU bars look busy. Intent was: **potato = cheap deterministic always-on ops**; **laptop/PC = interactive Cursor AI**; Hermes think only when there is real unchecked work. Practice drifted toward model ticks + heavy local verification on a ~2 GiB ARM box.

## Evidence (SSH `potato`, 2026-07-13 ~18:20 EDT)

| Signal | Value |
|--------|--------|
| Load | ~2.9–4.0 on 4 cores |
| RAM | ~1.9 GiB total; ~45–378 MiB free; **~950 MiB swap used** |
| Hot processes | `hermes -p think chat` (~70–80% CPU), `verify_agent_intent.py --snapshot-out` (~90% CPU) |
| Heartbeats | `think-tick.last` / `fast-tick.last` updating |
| Crontab | fast **×2/min** (30s), think **1m**; plus **`agent-pod-scheduler.timer` 30s** |
| Intent snapshots | `/tmp/intent-*-think.json` ~**1.1 MB** each; **14 186 paths**, of which **~10 924 were `.git` objects** mis-labeled as `git/…` |
| Think pod log | LLM retries then **HTTP 404** (tool-use / `browser_back` on `hermes-4-70b`) — still burned ~2 min CPU |

**Current burn model (reality):**

1. **Dual think / dual fast** — user crontab *and* pod-scheduler both invoke Hermes for the same lanes. Scheduler applies resource-governor; crontab **bypasses** the 8 m think cooldown.
2. **Intent snapshot walked `.git`** every before/after tick (`norm_path` used `lstrip("./")`, turning `.git` → `git`).
3. **Always-on Hermes workers** for think/fast even when the answer would be IDLE.
4. Baseline always-on: dashboard node, cloudflared×2, tailscaled, optional gateway profiles (~hundreds of MiB).

Written doctrine (`CLAUDE.md`, `resource-governance.mdc`, `CURRENT_TASK.md`) already says free-first fast, think for real lane work, IDLE when empty — the gap was **implementation**, not intent.

## Target model (improve, don’t cut)

| Machine | Role |
|---------|------|
| **Potato** | Deterministic: git-bundle apply, deploy hooks, health, Hub metrics, swarm queue, intent gate; Hermes only when a lane has unchecked work / inbox ack needed |
| **Laptop / PC** | Interactive Cursor AI, heavy edits, Playwright when possible |
| **Hermes think** | Campaign / meta / dashboard **when work exists**; still report IDLE cleanly when not |

## Improvements ranked (preserve function first)

| Rank | Change | Preserves function? | Status |
|------|--------|---------------------|--------|
| 1 | Fix intent snapshot (don’t scan `.git`; prune walk; load spec once) | Yes — same gate, far less CPU | **Done** |
| 2 | Deterministic IDLE preflight for think/fast (skip LLM when no work; still log IDLE + heartbeat) | Yes — Hermes still runs when checkboxes/tasks/acks exist | **Done** |
| 3 | Make crontab think/fast **LLM-free** when `agent-pod-scheduler.timer` is active (deterministic + preflight only; scheduler owns Hermes) | Mostly — restores 8 m think cooldown behavior | **Needs your OK** |
| 4 | Fix think OpenRouter 404 / tool-use (`browser_back`) so failed ticks stop retry-burning CPU | Yes — restores useful think | **Needs your OK** (investigate model/tools) |
| 5 | Move Playwright / heavy browse off potato (Firecrawl cloud / PC) | Yes for ops lanes | Prefer ongoing; no cut |
| 6 | Lengthen think interval in manifest | Reduces cadence when work is backlog-heavy | **Needs your OK** — not applied |
| 7 | Pause idle RP pods / spin hunter gateway only when due | Already partially in `resource-governor.json` | Keep; don’t expand without OK |

## What changed this session (safe only)

- `scripts/linuxbox/verify_agent_intent.py` — fixed `norm_path`; `os.walk` with `.git` prune
- `scripts/linuxbox/agent-cycle-has-work.py` — deterministic WORK/IDLE for think + fast
- `agent-cycle-think-tick.sh` / `agent-cycle-fast-tick.sh` — skip LLM on IDLE; still stamp + `run-index` IDLE
- `agent-pod-scheduler.sh` — same IDLE preflight before snapshot/Hermes for think/fast
- Docs + ledger Result

**Not changed:** Hermes units, cron schedules, campaign pods, think cooldown value, Playwright off-box.

## Sign-off asks

1. **OK to make crontab think/fast never call Hermes** while pod-scheduler is active? (Same lanes; less double-burn; think cadence follows governor 8 m.)
2. **OK to chase Hermes-4-70b tool-use 404** (disable `browser_back` / adjust profile) so think ticks aren’t empty CPU+API retry loops?
