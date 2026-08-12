# Domain Spec: Linuxbox Hermes agent harnesses

**Framework:** [Meta-Harness](https://arxiv.org/abs/2603.28052) — search over harness code, not base models.  
**Onboarding source:** [stanford-iris-lab/meta-harness ONBOARDING.md](https://github.com/stanford-iris-lab/meta-harness/blob/main/ONBOARDING.md)  
**Status:** Phase 0 — bootstrap + trace filesystem; full search loop on PC only.

---

## Domain Summary

**What we improve:** The **harness** around fixed Hermes/OpenRouter models on linuxbox — pod prompts, env bootstrap, context injection, scheduler cadence, and post-run verification hooks — not the LLM weights.

**Role-agent cluster (live):** `agents/meta-harness/role-agents/catalog.json` is injected every think tick (`think-setup-context.py`) and Cursor run (`role-agents-inject.py` → `cursor-agent-run.sh`). Agents: `.cursor/agents/role-*.md` · `project-*.md`. Upstream: `kineticdirt/agent-role-cluster`. New lanes: `role-new-project`. Phone: `role-android-pixel3a`.

**Unit of evaluation:** One **pod tick** — a single `agent-pod-scheduler` invocation running one pod (fast, think, hunter-reckoning, ponytail-cleanup, etc.) against its task spec + progress file.

**Fixed:**
- Base models per profile (`fast` = Qwen free, `think` = Hermes 70B, `code`/`meta` = GLM, RP pods = Hermes 70B on RP key)
- `agents/intent/agent-loops.json` laws (Meta-Harness may **propose** law changes; human approves via Inbox)
- mem-constant memory authority + ponytail implementation ladder
- linuxbox ~2 GB RAM budget (resource governor)

**Allowed to change (search targets):**
- `read_task_prompt()` text in `agent-pod-scheduler.sh`
- `scripts/linuxbox/hermes-env-bootstrap.sh` snapshot fields
- Pod-specific preamble in `install-hermes-agent-pods.sh` / cron prompts
- Optional harness modules under `agents/meta-harness/candidates/<id>/`
- Dashboard/run logging shape in `agents/meta-harness/runs/`

**Out of scope for harness search:**
- Swapping base models without human sign-off
- Disabling `verify_agent_intent.py` or resource governor
- Production DNS / Cloudflare / tunnel credentials
- Deleting files (ponytail-cleanup law)

**Optimization budget (initial):**
- **Search set:** 20 pod ticks across think + fast + one RP pod (mixed lanes)
- **Held-out:** 10 ticks on disjoint task items (unchecked boxes never used in search)
- **Candidates:** 10 iterations × 2 proposals = 20 harness variants max per search campaign
- **Wall clock:** PC-side proposer only; ~30 min/candidate eval on linuxbox (one pod run + verify)
- **Dollars:** OpenRouter ops pool cap $5/day — search runs manual/off-cron

---

## Harness and Search Plan

**Harness interface (candidate must implement):**

```text
Input:  pod manifest entry + repo snapshot paths
Output: prompt_prefix string appended before Hermes chat -q
Side:   optional post_run hook (JSON metadata only)
```

**Baselines:**
1. **Current** — scheduler `read_task_prompt()` only (no bootstrap)
2. **Bootstrap** — current + `hermes-env-bootstrap.sh` (Phase 0 shipped)
3. **TBench2-inspired** — bootstrap + explicit “read intent + progress before edit” ordering (already partial)
4. **mem-constant rewind** — bootstrap + pointer to `last-session.md` carryover when present

**Strongest current harness:** think pod prompt + intent gate + resource governor (composite).

**Reusable helpers:**
- `scripts/linuxbox/hermes-env-bootstrap.sh`
- `scripts/linuxbox/verify_agent_intent.py`
- `scripts/linuxbox/resource_governor.py`
- mem-constant `rewind` skill (PC); claude-mem MCP (session)

**Search loop (PC, Phase 2+):**
1. Clone [meta-harness](https://github.com/stanford-iris-lab/meta-harness) on PC (`uv sync` in `reference_examples/` or custom domain dir).
2. Proposer reads `agents/meta-harness/runs/` filesystem (full traces, not summaries).
3. Proposer writes candidate to `agents/meta-harness/candidates/<iter>/`.
4. Deploy candidate via `push-linuxbox.sh --agent-config`; run N eval ticks; log scores.
5. Human promotes winner into `agent-pod-scheduler.sh` after inbox review.

**Proposer agent:** Cursor agent or Hermes `meta` profile on PC — adapt `claude_wrapper.py` pattern from upstream.

---

## Evaluation Plan

| Metric | Definition |
|--------|------------|
| **Primary** | Task checkbox advanced OR valid `IDLE` with no `INTENT_FAIL` |
| **Secondary** | No human-inbox regression; swap peak &lt; 85%; pod duration &lt; 600s |
| **Anti** | `INTENT_FAIL`, duplicate inbox questions, tunnel/service restart needed |

**Search set:** Synthetic + live — use `agents/meta-harness/eval-tasks.json` (to create Phase 1) listing pod + progress file + expected outcome class.

**Held-out:** Unchecked items in `agents/CURRENT_TASK.md` and one campaign progress file not referenced in search prompts.

**Noise:** High (LLM stochastic). Mitigate with 2 runs per candidate on cheap tasks only.

**Leakage risk:** Using production `CURRENT_TASK.md` for both search and test — mitigate by holding out explicit line ranges / task IDs in eval-tasks.json.

**Cheap validation:** `bash scripts/linuxbox/hermes-env-bootstrap.sh`; `python3 scripts/linuxbox/verify_agent_intent.py --self-check`; dry-run prompt length &lt; 8k chars.

---

## Experience and Logging

**Offline traces:**
- `agents/state/intent-violations.jsonl`
- `agents/state/run-index.jsonl` + `/mnt/archive/logs/` bodies
- `agents/state/resource-telemetry.json`
- Prior Meta-Harness paper + [demo](https://yoonholee.com/meta-harness/)

**Online (per tick) — `agents/meta-harness/runs/<pod>/<iso>.json`:**
```json
{
  "pod": "think",
  "at": "2026-07-07T…",
  "prompt_hash": "…",
  "bootstrap": true,
  "exit_code": 0,
  "intent": "INTENT_OK",
  "log_path": "/mnt/archive/logs/…",
  "harness_candidate": null
}
```

**High-signal debug artifacts:** pod log stdout/stderr, before/after intent snapshot diff, resource line from scheduler.

**CLI (Phase 1):** `scripts/meta-harness/query_runs.py last --pod think --n 5`

---

## Integration with mem-constant + ponytail

| Layer | Role |
|-------|------|
| **Meta-Harness** | Optimizes *what the agent sees and does first* (harness code) |
| **mem-constant** | Durable memory, workflow skills, carryover |
| **ponytail** | How harness *implementations* are written (minimal diff) |
| **agent-loops intent** | Hard laws; harness search proposes, human ratifies |

---

## Open Questions

- [ ] Run first PC-side search campaign on **think pod only** or **fast + think**?
- [ ] Adopt Harbor/Terminus from [tbench2 artifact](https://github.com/stanford-iris-lab/meta-harness-tbench2-artifact) for eval, or stay shell+Hermes-native?
- [ ] Budget: allow paid proposer (Claude) on PC while eval ticks use free fast lane?

---

## References

- Paper: https://arxiv.org/abs/2603.28052  
- Framework: https://github.com/stanford-iris-lab/meta-harness  
- TBench2 harness artifact: https://github.com/stanford-iris-lab/meta-harness-tbench2-artifact  
- Demo: https://yoonholee.com/meta-harness/
