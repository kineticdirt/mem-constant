# Linuxbox agent lanes + tasks + inbox — deep health audit

**Machine:** linuxbox (`potato-lan`, raspbian-bullseye-aml-s905x-cc, up 9 days)
**Investigator:** PC Cursor subagent (holder `linuxbox-lanes-audit-20260804`)
**Evidence window:** 2026-08-05 00:36–01:10 UTC (2026-08-04 evening ET)
**Mode:** read-mostly; 4 trivial safe fixes deployed; no state wipes.

## Executive summary

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | **P0** | Potato live think tick **regressed to pre-fix version** — 2026-08-03 free-429 false-block fix + Hub goal-control silently reverted by deploy replaying old HEAD | **Fixed** (deployed PC master `8505df2` forward) |
| 2 | **P1** | `user-tasks.json` carried **43 hallucinated future timestamps** (up to +4h) from LLM hand-edits; breaks picker sort + age logic; old tasks' `created_at` rewritten | **Fixed** (clamped + sync-tick guard) |
| 3 | **P1** | Supply-chain update lane coverage is **fictional for 5/6 targets** — rotation task marked `done` with no report on disk; batch task times out then enforce marks done | Not fixed (needs policy decision) |
| 4 | **P1** | `think-enforce-status` marks tasks **done after exit-124 timeout** — self-fulfilling success metric ("status not open" satisfied by the safety net itself); recurred tonight on `dashboard-running-now-active-lanes` | Not fixed (design change) |
| 5 | **P2** | Picker/has-work only accept `status=="open"` — one `pending` task orphaned forever; enum drift | **Fixed** (open\|pending) |
| 6 | **P2** | Incident-cleanup **recursion**: cleanup task minted about a cleanup task (`inc-clean-2a7fa8da548f` recursive title) | **Fixed** (rollup guard) |
| 7 | **P2** | Attempt-capped boards **jam permanently**: "all boxes over attempt cap" is the #1 incident class (56+17+16+13+11 occurrences); no escalation/split path; RR state stale 13h+ | Not fixed |
| 8 | **P2** | Pod/config drift: spacequest (archived 2026-07-24), nyc, ponytail-cleanup still in manifest `every 5m` but unrun since Jul 15–26; swarm-dispatch fires every sync minute against a queue idle since Jul 5 | Not fixed (cosmetic) |
| 9 | **P3** | Inbox healthy — 0 open / 69 answered / seeds honored / no dups / symlink correct | No action |
| 10 | **P3** | Papercuts exists, 3 entries since Aug 1, light adoption; the one open entry (supply-chain exit-124) **reproduced again tonight** | No action |
| 11 | **P3** | Cursor Auto lane clean — no orphan processes; 7 one-shot prompt records; default `TIMEOUT_SEC=300` short for coding tasks; literal `euro-adventure-${STAMP}.log` filename (unexpanded var) | No action |
| 12 | **P3** | Meta-harness + think reports **land fresh on disk but Hub never reads them** — Hub consumes only `think-focus.json` / `think-last.log` / `pod-scheduler.json` | Gap (if Meta tab intended to show them) |

**Observations (no action):** hunter-reckoning Discord gateway in **D-state since Jul 28** (177h CPU, PID 633720) — pods still complete (exit 0, intent_ok) but the gateway itself may be wedged; watchdog should evaluate. Think cadence jitter at UTC day-rollover (38-min LLM gap 23:57→00:35Z) consistent with serial re-probe of the 8-model free chain after reset. Free pool legitimately thin tonight (8 models marked 429 by 00:35Z; Laguna RPD previously 0) — C8 paid DeepSeek carrying per policy.

---

## 1. P0 — think tick regression on potato (FIXED)

**Evidence:**

- Live `scripts/linuxbox/agent-cycle-think-tick.sh` on potato was **1153 lines / 45,747 B, mtime 2026-08-04 20:45 EDT**, with **zero** occurrences of `log_has_real_done_or_blocked` (the 2026-08-03 false-block fix) and zero `GOAL_CTRL` (Hub goal redirect/pause).
- PC master had the fixed version: **1956 lines**, both markers present, commit `8505df2` `fix(linuxbox): stop think exit-124 burn + pod fail-spam` (2026-08-04 20:50 EDT, concurrent PC agent).
- Potato `tmp-deploy-cursor-news/agent-cycle-think-tick.sh` (Aug 3 22:32 staging, 1948 lines) also has both — the fix lived potato-side since Aug 3 but was **never committed** until `8505df2` tonight.
- Potato HEAD `25106e5` contains the old 1153-line tick; `git status` shows the file clean → live file == old HEAD state.
- Two think runs tonight (00:35:45Z, 00:44:52Z) still show `HUMAN GOAL OVERRIDE … Redirect: Brother, create some tasks.` in their prompts — launched **before** the revert; live script mtime 00:45Z matches the revert moment.

**Mechanism (same class as regions-ui wipes):** potato-only hotfix on a git-tracked file; a later bundle/`git-pull-and-deploy` reset replayed old HEAD over it. No fail-loud on feature regression.

**Blast radius of the revert:** (a) template-echo false DONE matching can again mark the whole free chain 429 — consistent with 8/8 models marked 429 within 35 min of UTC midnight; (b) `agent-goal-control.json` redirect/pause (`redirect_goal: "Brother, create some tasks."`, set via Hub 14:49Z) is no longer honored by new ticks.

**Fix applied:** deployed PC master `8505df2` tick to potato (atomic mv after `bash -n`), verified 1956 lines + 8 markers live. Also staged `/tmp/pre-fix-think-tick.sh.bak`.

**Prevention gap (report-only):** deploy pipeline has no "feature marker" check for lane scripts the way tableslop has GM-border guards. `verify-runtime-state.sh` could grep for `log_has_real_done_or_blocked` + `GOAL_CTRL` post-deploy and fail loud.

## 2. P1 — hallucinated future timestamps in user-tasks.json (FIXED)

**Evidence (before fix):** open tasks carried `created_at` of `2026-08-05T02:50:00Z`, `04:25:00Z`, `04:30:00Z` and `pc-laptop-usb-refresh` an `updated_at` of `01:15:00.000Z` — all **in the future** (audit ran 00:36–00:55Z). Values cluster by batch with seconds `:00`. `intel-auto-alerting` was already open at 22:12Z (per `reports/hub-api-idle-tasks-2026-08-04.md`) yet showed `created_at 02:50Z` — old timestamps were **rewritten**.

**Root cause:** C4 requires the think LLM to set task status "via a real JSON edit" of the 153 KB file. Hand-editing agents invent timestamps — the offsets match an ET→UTC **double conversion** (+4h: e.g. real 00:30Z mis-stamped `04:30Z`), and whole-file re-serialization rewrites unrelated tasks' fields.

**Impact:** picker sorts by `created_at` string ascending → future-stamped tasks sink to the bottom (self-deprioritize); any age/SLA math breaks; task history falsified.

**Fix applied:**
- One-off clamp on potato: **43 stamps** >10 min in the future reset to real UTC now.
- `agent-cycle-sync.sh` (runs every think minute, deterministic) now clamps `created_at`/`updated_at` >10 min ahead → now. Idempotent, ~30 lines, `|| true` guarded.

**Prevention (report-only):** the durable fix is to stop having the LLM hand-edit JSON — route status changes through `think-shell-access-form.py enforce-status` (already the post-run safety net) and drop the "real JSON edit" instruction from the prompt. That changes the C4 contract → GM decision.

## 3. P1 — supply-chain lane: coverage fictional for 5/6 targets

**Evidence:**
- `reports/supply-chain/` on potato: `hermes-20260804.md` (today, from the earlier manual run) + `mem-constant`/`mempalace`/`claude-mem` reports dated **2026-06-27** — 38 days stale against `cadence_days: 3` (~12× overdue).
- `tb-supply-chain-mem-constant-3day` ("3-day supply-chain rotation") is **done** (stamp was future-dated `02:30Z` before clamp) — **no mem-constant report exists since Jun 27**. Done-without-artifact = "done but failing", the wrong-status class.
- `supply-chain-check-run` (batch of all 6 targets) is done; its recurrence entry shows `timeout_124` — batch can't finish in the 180–300 s tick window (`hermes update` alone ~180 s), then enforce-status marks done (see §4).
- No HOLD spam: zero HOLD verdicts on disk.
- The tick script never invokes the gate (`grep update-targets|safe-update|supply` = no hits) — the lane is entirely user-task-driven; the earlier report's "one target per tick" recommendation was only partially realized (per-target tasks exist but close without evidence).

**Minimal fix direction (not applied — needs GM ok):** per-target rotation already exists; make the rotation task's success metric "**`reports/supply-chain/<target>-<date>.md` exists and is fresh**", and teach enforce-status to require that artifact for `tb-supply-chain-*`/`supply-chain-check-run` ids before marking done.

## 4. P1 — enforce-status marks done on timeout (self-fulfilling metric)

**Evidence:** `dashboard-running-now-active-lanes` is **done** (updated == created, no Done line in body) after its 23:52Z tick exited **124** (`reports/think-ticks/LATEST.md`). `_infer_outcome()` in `think-shell-access-form.py` infers DONE from a marker line, prose ("status = done"), or "smoke PASS + intent" — any of which can appear in a timed-out log; the task's own success metric ("harness: user-task status not open") is then satisfied **by the safety net itself**. Same path auto-closed `supply-chain-check-run` earlier (papercut `pc-2026-08-04-think-exit124-supply-chain-timeout`, still open — and it **reproduced tonight**).

**Fix direction (not applied — design change):** when `exit==124`/SIGINT, enforce-status should cap outcome at BLOCKED/left-open unless the marker postdates the last verify step; or the harness metric should require evidence beyond the status field.

## 5. P2 — status enum drift: `pending` orphaned (FIXED)

One task (`6464c923-…`, "[ops] Linuxbox: update dashboard with new feature (TBD)") had `status: "pending"`. Picker (`agent-cycle-think-tick.sh`) and has-work (`agent-cycle-has-work.py`) both filtered `== "open"` only → invisible to the lane forever. **Fix:** both now accept `("open", "pending")` (deployed). No state edit needed — the task is now pickable.

## 6. P2 — incident-cleanup recursion (FIXED)

`inc-clean-2a7fa8da548f` title: "[ops] Think incident cleanup: timeout_124 ×1 — **[ops] Think incident cleanup: timeout_124 ×…**" — the rollup (`think-incident-form.py`) mints cleanup tasks from `blurb_sample`, which can itself be a prior cleanup task's title. **Fix:** rollup now skips any recurrence whose blurb starts with `[ops] Think incident cleanup` (deployed).

## 7. P2 — attempt-capped boards jam (no escalation path)

Top of `think-incident-recurrence.json` (63 keys): "all boxes over attempt cap" — dashboard backlog **×56**, progress-hunter **×17**, tableslop-progress **×16** (last seen today), system-integrity **×13**, nyc **×11**. Anti-thrash cap (`THINK_MAX_LANE_ATTEMPTS=3`) correctly skips too-big items — but then nothing splits them or asks the human, so boards stall and `think-continuous-rr.json` hasn't advanced since 2026-08-04T11:58Z (13h+). **Fix direction:** on cap-hit, auto-append "(needs splitting)" to the board item + one inbox question per board per week, or let a tick's one step be "split this item into two tick-sized boxes" (no LLM product work).

## 8. P2 — pod & lane config drift

- `agent-pods.manifest.json` still lists `spacequest` (archived 2026-07-24), `nyc-mafia-dnd`, `ponytail-cleanup` at `every 5m`; `pod-scheduler.json` last_run: spacequest **Jul 15**, nyc **Jul 18**, ponytail-cleanup **Jul 26**, `fast` **Jul 26** (lane removed Aug 1). hunter-reckoning + tropic-gooner run fine (00:25–00:33Z today, exit 0, intent_ok). Manifest vs reality — cosmetic but confusing; either annotate pods `paused`/`archived` or trim.
- `swarm-dispatch.sh --once` runs every sync minute; `swarm-runs.jsonl` last entry Jul 5; queue empty. Vestigial; harmless (~ms), but either wire it or drop the call.
- `think-lane-attempts.json` last entries **Jul 25** — lane-attempt tracking only advances on board-lane picks; user-task picks bypass it (user-tasks have no attempt cap — a stuck one can re-pick indefinitely; see §4 for the flip side).

## 9. P3 — inbox: healthy

`agents/state/human-inbox.json`: `open: 0`, `answered: 69`; `open ∩ answered = ∅`; 33 seeds, no duplicate ids; 10 seeds∩answered correctly stay closed (answered ≠ consumed, honored); no unanswered thin-context seeds; `agents/human-inbox.json` → symlink to state ✓. Cap (max 1 new item/cycle) is prompt-enforced only — acceptable today. `human-inbox-normalize.py` dedups/merges by id on every sync minute.

## 10. P3 — papercuts: exists, light adoption

`agents/papercuts.md` live (3 entries since Aug 1): zenmux-403 (fixed), regions-ui drift (fixed), think-exit124-supply-chain (**open** — reproduced tonight, §4). Format + docs (`docs/agents/papercuts.md`) wired into CLAUDE.md. Lanes use it when reminded; consider prompting a `pc-*` entry in the tick template when a tick hits the same failure twice.

## 11. P3 — Cursor Auto lane: clean

No cursor-agent processes (no orphans; Aug 2 euro PID 2229628 + black-map runs exited 0). `agents/state/cursor-prompts/` holds 7 one-shot prompt records (newest Aug 2) — retained as audit trail, fine. `cursor-agent-run.sh` default `CURSOR_AGENT_TIMEOUT_SEC=300` — short for coding; Hub passes explicit overrides (3600 s used Aug 2). Cosmetic: `/mnt/archive/logs/cursor-agent/euro-adventure-${STAMP}.log` — literal unexpanded var in log filename from the Aug 2 export run.

## 12. P3 — meta-harness / think reports: landing fresh, but Hub-blind

- Think tick reports: `/mnt/archive/logs/think-reports/2026/08/` (forms through 19:57Z today) + `reports/think-ticks/LATEST.md` (23:52Z run) ✓ fresh.
- Meta-harness: `agents/meta-harness/runs/{think,hunter-reckoning,tropic-gooner}` written **20:43Z today**; `reports/meta-harness/campaign-*.json` every ~30 min through 00:26Z + `campaign-latest.json` + `summary-latest.txt` ✓ fresh.
- **But** `linuxbox-status-server.js` has **zero** references to meta-harness, think-ticks, or think-reports — Hub reads only `think-focus.json`, `think-last.log`, `pod-scheduler.json`. If Meta tab is meant to surface harness scores / tick forms, that wiring does not exist.

## Fixes applied this session (all trivial-safe, deployed to potato)

| Fix | File(s) | Verify |
|-----|---------|--------|
| Deploy think tick `8505df2` forward (restores 429 false-block fix + goal-control) | `agent-cycle-think-tick.sh` | 1956 lines, 8 markers, `bash -n` OK |
| Picker + has-work accept `pending` | tick + `agent-cycle-has-work.py` | `py_compile` OK; pending task now pickable |
| Incident rollup recursion guard | `think-incident-form.py` | `py_compile` OK |
| Timestamp clamp (>10 min future → now) in sync tick + one-off clamp (43 stamps) | `agent-cycle-sync.sh` | `clamped: 43`; runs every minute via cron |

Deploy method: scp to `/tmp`, syntax check, atomic `mv` (running bash keeps old inode); pre-fix tick backed up at `/tmp/pre-fix-think-tick.sh.bak`. No protected runtime paths touched (regions-ui / chat-threads / chars-registry / inbox untouched).

## Recommended follow-ups (GM decisions)

1. Adopt feature-marker check in `verify-runtime-state.sh` for the think tick (prevents §1 class — same pattern as GM-border guards).
2. Change C4 contract: agent ends with marker only; enforce-status owns the JSON write (kills §2 root cause). 
3. Supply-chain rotation success metric = fresh report artifact on disk; enforce-status requires artifact for `tb-supply-chain-*` (§3+§4 together).
4. Attempt-cap escalation: split-or-inbox on cap-hit (§7).
5. Manifest hygiene: mark spacequest archived / drop swarm-dispatch call (§8).
6. Wire meta-harness `summary-latest.txt` into Hub Meta tab (§12).
7. Evaluate hunter-reckoning gateway D-state (watchdog restart policy for Discord gateway).
