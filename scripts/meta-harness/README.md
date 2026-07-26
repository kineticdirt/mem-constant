# Meta-Harness (PC-side search)

Upstream: [stanford-iris-lab/meta-harness](https://github.com/stanford-iris-lab/meta-harness)

This folder holds **linuxbox-specific** helpers. The full Meta-Harness search framework is **not vendored** in-repo yet (Phase 2).

## Quick start (PC)

```bash
# One-time clone (outside or as integrations/meta-harness submodule)
git clone https://github.com/stanford-iris-lab/meta-harness.git /path/to/meta-harness
cd /path/to/meta-harness/reference_examples/text_classification
uv sync
python scripts/meta-harness/run_think_campaign.py          # Phase 3 (rule proposer, fast)
python scripts/meta-harness/run_think_campaign.py --claude  # + Claude CLI if available
```

Read `agents/meta-harness/domain_spec.md` before adapting to Hermes pods.

## Linuxbox helpers (this repo)

| Script | Role |
|--------|------|
| `../linuxbox/hermes-env-bootstrap.sh` | Env snapshot injected into pod prompts |
| `record_tick.py` | Write `runs/<pod>/<stamp>.json` + call `score_tick` (think-tick + pod-scheduler) |
| `query_runs.py` | Inspect `agents/meta-harness/runs/` |
| `score_tick.py` | Score a pod tick (`--campaign`, `--self-check`) |
| `propose_harness.py` | Local analyzer stub → `candidates/<stamp>/proposal.md` |
| `run_think_campaign.py` | Phase 3 think-pod search (5×2 default); `--claude` for LLM proposer |
| `run_pc_loop.sh` | Propose + remote rollup (when linuxbox up) |

### `query_runs.py`

Reads per-pod JSON under `agents/meta-harness/runs/<pod>/*.json` (written by `record_tick.py` from think-tick / pod-scheduler).

```bash
# Latest 5 think-pod runs (human table)
python3 scripts/meta-harness/query_runs.py last --pod think -n 5

# Same, machine-readable
python3 scripts/meta-harness/query_runs.py --json last --pod think -n 5

# All failed runs (INTENT_FAIL or exit_code != 0)
python3 scripts/meta-harness/query_runs.py failed

# Per-pod summary: count, ok%, avg exit_code
python3 scripts/meta-harness/query_runs.py summary

# One run + tail of linked log (if log_path exists on this machine)
python3 scripts/meta-harness/query_runs.py show agents/meta-harness/runs/think/20260707-012345.json
```

Optional `--repo PATH` overrides repo root (default: `AGENT_DUMP` env or walk up from script).

## Terminal-Bench artifact

The optimized coding agent: [meta-harness-tbench2-artifact](https://github.com/stanford-iris-lab/meta-harness-tbench2-artifact) — requires `harbor`, Docker, Anthropic API. Use on PC for coding-harness experiments, not on linuxbox ARM.
