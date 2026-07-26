# Think parallelism vs OpenRouter keys (2026-07-26)

**Question:** Hub Active Now shows Recent Pod Ticks as sequential `think` runs — do we need multiple OpenRouter keys for parallel think/work?

**Verdict:** No. Think is **intentionally single-flight**. Extra keys alone will not make Hub show parallel think ticks. Keys help **budget/account isolation** (ops vs Pixi RP), not concurrent think workers.

---

## Evidence (potato + repo)

### 1. How many think processes can run at once?

**Exactly one.**

| Mechanism | Evidence |
|-----------|----------|
| Disk flock | `scripts/linuxbox/agent-cycle-think-tick.sh` → `LOCK=/tmp/agent-cycle-think.lock`; `flock -n 200 \|\| exit 0` |
| Live potato | 2026-07-26 ~00:33 EDT: lock held by PIDs `1849479`/`1849480`; one `agent-cycle-think-tick.sh` + one `hermes -p think chat` |
| Cadence | Cron fires every **1m**; LLM gated by `THINK_INTERVAL_SEC` default **480** (~8m) via `think-llm.last` |
| Lane design | Prompt / CLAUDE: **one concrete step per tick**, then stop |

Overlapping cron fires while a tick is running **exit 0 immediately** (no queue of parallel Hermeses).

### 2. What blocks parallelism?

| Candidate | Blocks parallel think? | Notes |
|-----------|------------------------|-------|
| Single crontab line | Soft | `* * * * * …/agent-cycle-think-tick.sh` — many fires/hour, but flock collapses them |
| **flock** | **Yes (hard)** | Second instance never starts Hermes |
| One Hermes `think` profile | Soft | Profile is model/env routing; concurrency is flock, not profile count |
| Model rate limits (429) | Throughput | Serial rotate/paid last-resort; does not create parallel workers |
| **Intentional serial design** | **Yes** | ~2 GB RAM; shared `agent-dump` / inbox / focus JSON; one-step-per-cycle |

**Not a bug:** Hub “Recent Pod Ticks” listing think → think → think is the designed timeline of **one worker finishing before the next starts**.

### 3. Do multiple OpenRouter keys enable parallel LLM calls?

**Only if the architecture spawns multiple workers that each call OR.** Keys do not override flock.

Live potato keys (fingerprints only, no secrets):

| Location | Var | sha256[:12] |
|----------|-----|-------------|
| `~/.hermes/.env` | `OPENROUTER_API_KEY` | `3f76e2d1290a` (ops) |
| `~/.linuxbox-pixi/deckard-local.env` | `OPENROUTER_API_KEY` / `WRITER_BOT_…` | `1b6be9121ccd` (Pixi RP) |

- **No** `OPENROUTER_API_KEY_OPS` / `_RP` in live Hermes `.env` (install-pods script expects them for profile isolation; not wired on box today).
- Hermes think uses the **single** ops key.
- Pixi already has a **separate** key — that parallelizes **RP vs ops**, not two think ticks.
- Optional Hermes `credential_pool` round-robin = rotate keys **inside one agent** (429 relief), still one process.

Prior write-up: `docs/agents/hermes-swarm-keys-investigation.md` (2026-06-29) — same conclusion.

### 4. What DOES parallelize already?

| Lane | Parallel with think? | How |
|------|----------------------|-----|
| **fast** tick | Yes (separate lock) | `/tmp/agent-cycle-fast.lock` vs think lock; crontab both `* * * * *` |
| **Pixi RP** `:8767` | Yes | Separate systemd + separate OR key |
| **Cursor multitask (PC)** | Yes | Desktop agents; not potato Hermes |
| **swarm-dispatch** | Designed MoE, **idle** | Timer active; `max_concurrent: 1`; potato **missing** `agents/swarm-queue.json` |
| Hermes gateway / Discord hunter | Separate process | Not a second think tick |

### 5. Honest bottom line

- Hub sequential think list ≠ missing keys.
- **Architecture is single-flight think** (flock + 8m LLM throttle + one-step policy + 2 GB RAM).
- Extra OpenRouter keys: useful for **ops vs RP budget** and optional credential-pool 429 headroom — **not** for parallel think workers unless we deliberately remove/raise flock and add multi-worker orchestration (swarm/Kanban) with shared-state locks.

**No architecture change in this report** — diagnosis only.

---

## Verify commands (potato)

```bash
grep -E 'LOCK|flock|INTERVAL_SEC' ~/bin/agent-cycle-think-tick.sh | head
fuser /tmp/agent-cycle-think.lock
pgrep -af 'agent-cycle-think|hermes.*think'
crontab -l | grep agent-cycle
# key names only:
grep -E '^OPENROUTER' ~/.hermes/.env | cut -d= -f1
```
