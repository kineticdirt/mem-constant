# Meta-Harness × linuxbox Hermes — integration plan

**Goal:** Apply [Meta-Harness](https://yoonholee.com/meta-harness/) (harness *search*, not model tuning) alongside **mem-constant**, **ponytail**, and **agent-loops intent** — without breaking production services.

**Upstream:**
- [stanford-iris-lab/meta-harness](https://github.com/stanford-iris-lab/meta-harness) — framework + `ONBOARDING.md`
- [meta-harness-tbench2-artifact](https://github.com/stanford-iris-lab/meta-harness-tbench2-artifact) — evolved Terminal-Bench agent (env bootstrap pattern)

---

## What Meta-Harness is (and isn't)

| Is | Isn't |
|----|-------|
| Search loop over **harness code** (prompts, context, tool scaffolding) | A pip package you `import` into Hermes |
| Proposer reads **full trace filesystem** (~10M tok context in paper) | Replacing mem-constant or ponytail |
| Evaluates candidates on a **fixed base model** | Running on linuxbox 2 GB for proposer search |
| Best for repeated tasks with measurable success | Magic autonomy fix |

**Key idea from the paper:** prior optimizers compress history to summaries; Meta-Harness gives the proposer `grep`/`cat` over all prior candidate source + logs + scores. See comparison table on [yoonholee.com/meta-harness](https://yoonholee.com/meta-harness/).

---

## Fit with our stack

```text
┌─────────────────────────────────────────────────────────┐
│ Meta-Harness (PC) — propose harness candidates          │
│   reads agents/meta-harness/runs/ + candidates/         │
└───────────────────────────┬─────────────────────────────┘
                            │ deploy winner
┌───────────────────────────▼─────────────────────────────┐
│ agent-pod-scheduler + Hermes profiles (linuxbox)        │
│   prompt = task + intent + env bootstrap + candidate    │
└───────────────────────────┬─────────────────────────────┘
                            │ after tick
┌───────────────────────────▼─────────────────────────────┐
│ verify_agent_intent + resource_governor + run JSON log  │
└─────────────────────────────────────────────────────────┘
         mem-constant (memory) │ ponytail (impl style)
         agent-loops.json (laws, human ratifies changes)
```

---

## Phases

### Phase 0 — Shipped in this pass ✅

| Deliverable | Path |
|-------------|------|
| Domain spec | `agents/meta-harness/domain_spec.md` |
| Env bootstrap (TBench2-inspired) | `scripts/linuxbox/hermes-env-bootstrap.sh` |
| Scheduler injects bootstrap | `agent-pod-scheduler.sh` |
| Per-tick trace JSON | `agents/meta-harness/runs/<pod>/` |
| This plan | `docs/plans/meta-harness-linuxbox-integration.md` |

**Verify:**
```bash
bash scripts/linuxbox/hermes-env-bootstrap.sh
bash scripts/verify_repo_layout.sh
# After deploy to box: one pod tick → new file under agents/meta-harness/runs/
```

### Phase 1 — Eval harness (PC + box) ✅

- [x] `agents/meta-harness/eval-tasks.json` — 8 labeled tasks (search vs held-out)
- [x] `scripts/meta-harness/score_tick.py` — intent + exit + outcome scoring; `--campaign`, `--self-check`
- [x] `scripts/meta-harness/query_runs.py` — `last`, `failed`, `summary`, `show`
- [x] `scripts/meta-harness/tests/test_score_tick.py` — 6 pytest cases
- [ ] Dashboard Meta tab link to architecture doc (optional)

**Gate:** 10 manual scored ticks with bootstrap ON; compare to 10 historical logs without bootstrap.

### Phase 2 — Upstream framework on PC

- [x] PC scaffold shipped: `scripts/meta-harness/setup-pc.sh` (clone outside repo), `propose_harness.py` (local analyzer stub), `agents/meta-harness/candidates/README.md`
- [x] Clone meta-harness sibling dir — `C:/Users/abhinav/Desktop/MAIN_PROGRAMMING_FILES/meta-harness` via `setup-pc.sh`
- [x] `uv sync` in upstream `reference_examples/text_classification/` (smoke: Phase 0 baselines OK; Windows console Unicode on iteration print — set `PYTHONIOENCODING=utf-8` for full run)
- [x] `run_pc_loop.sh` — propose locally + remote rollup via SSH
- [x] Linuxbox `meta-harness-rollup.timer` (30m) → `reports/meta-harness/campaign-latest.json`
- [x] Per-tick auto-score embedded in `agent-pod-scheduler.sh` (`score` field on run JSON)
- [ ] Custom linuxbox domain folder mirroring `reference_examples/text_classification/`
- [ ] Adapt `claude_wrapper.py` → Cursor CLI or Hermes `meta` on PC
- [ ] Proposer reads `~/agent-dump/agents/meta-harness/` as filesystem root (stub reads `runs/` today)

**Not on linuxbox:** proposer + multi-candidate search (RAM/$$).

### Phase 3 — First search campaign ✅ (PC offline)

- [x] 5 iterations × 2 candidates on **think pod prompt only** — `run_think_campaign.py` (rule proposer + local sim; `--claude` optional)
- [x] Winner staged: **iter2-b** score 34 → `agents/meta-harness/active/think-prompt.md.staged`
- [x] Scheduler hook: reads `agents/meta-harness/active/think-prompt.md` when present
- [x] Inbox promotion question added (`meta-harness-001-*`)
- [ ] Human promotes winner → push `--scripts-linuxbox` when linuxbox is back
- [x] Documented in `agents/meta-harness/campaigns/001-think-prompt/`

### Phase 4 — Optional: TBench2 patterns

Harbor + Docker from [tbench2 artifact](https://github.com/stanford-iris-lab/meta-harness-tbench2-artifact) is **heavy** for ARM 2 GB. Options:
- Run Terminal-Bench eval on **PC only** for dashboard/server harness candidates
- Port only `_gather_env_snapshot` ideas (done in Phase 0 bash script)

---

## Safety gates (always)

1. **No harness change** deploys without `verify_repo_layout.sh` + linuxbox curl checks
2. **Intent laws** — candidate must pass `verify_agent_intent.py`; violations → discard candidate
3. **ponytail** — harness diffs stay minimal; no new deps without supply-chain SAFE
4. **Human inbox** — law changes in `agent-loops.json` require explicit approval
5. **Resource governor** — search eval ticks respect memory admission (no parallel pods)

---

## What we are NOT doing yet

- Installing `harbor` on linuxbox for full Terminal-Bench loop
- Pointing crons at paid models for automated search
- Replacing Hermes with Terminus-KIRA agent.py wholesale
- Auto-merging proposer harness changes without human review

---

## Sign-off

```
[x] Phase 0 deployed to linuxbox (bootstrap + trace logging)
[x] Phase 1 eval tasks + scoring
[~] Phase 2 clone meta-harness on PC (reference smoke OK; domain adapt pending)
[~] Phase 3 first search campaign (winner staged; deploy when box back)
```

**Human notes:**

```text

```
