# Investigation: Hermes agent swarms with separate API keys

**Date:** 2026-06-29  
**Status:** Investigation only — no install/mutations yet.  
**Machine:** linuxbox primary target (2 GB RAM, always-on).  
**Upstream:** [Hermes profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles), [Kanban](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban), [Credential pools](https://hermes-agent.nousresearch.com/docs/user-guide/features/credential-pools).

---

## Question

Can we run a **swarm** of Hermes agents on linuxbox, each with its **own OpenRouter (or other) API key**, for budget isolation, parallel lanes, and rate-limit headroom?

**Short answer:** Yes — Hermes supports this natively via **profiles** (separate `HERMES_HOME`, `.env`, crons, gateways) and, on newer builds, **Kanban dispatcher + `hermes kanban swarm`**. Our box is on **v0.14.0 (745 commits behind)** and today uses **one shared key** across all profiles and **one gateway on `default`**.

---

## Current state (linuxbox evidence, 2026-06-29)

| Item | Observed |
|------|----------|
| Hermes version | **v0.14.0** — update available (745 commits) |
| Gateway | **Single** `hermes-gateway.service` on **`default`** (~210 MB RSS) |
| Profiles | `default`, `fast`, `think`, `meta` — **fast/think/meta gateways stopped** |
| OpenRouter key | **Same key prefix** in `~/.hermes/.env` and each `profiles/*/.env` (clone copied one key) |
| Crons | Monolithic **`agent-cycle`** every 1m on **default** (not split fast/think from `install-hermes-agent-crons.sh`) |
| Fast lane | User crontab `agent-cycle-fast-tick.sh` → `fast chat` (30s flock) — separate from Hermes cron |
| Workdir | Shared `/home/abhinav/agent-dump` (not a git repo; scp-synced) |
| Coordination | `agents/CURRENT_TASK.md`, `AI_GROUPCHAT.md`, `human-inbox.json` |

**Gap:** Profiles exist for **model routing**, not **key isolation** or **parallel workers**. The install script’s intent (fast/think crons with `--profile`) was never fully applied on the live box.

---

## Hermes primitives (what “swarm” can mean)

### 1. Profile = separate agent identity

Each profile is `~/.hermes/profiles/<name>/` with its own:

- `config.yaml` (model, provider, toolsets)
- `.env` (**`OPENROUTER_API_KEY` per profile**)
- `SOUL.md`, sessions, memories, skills
- **Cron jobs** (scoped to that profile’s gateway)
- Optional **own gateway process** (`think gateway install` → `hermes-gateway-think`)

```bash
hermes profile create campaign-sq --clone --description "SpaceQuest worldbuilding only"
# Edit key only in the new profile:
nano ~/.hermes/profiles/campaign-sq/.env   # OPENROUTER_API_KEY=sk-or-v2-...
campaign-sq config set model.default nousresearch/hermes-4-70b
```

CLI wrappers: `campaign-sq chat`, `campaign-sq cron create ...`

### 2. Kanban swarm (multi-process, shared board)

On **current upstream** (not on our v0.14):

- Shared SQLite board: `~/.hermes/kanban.db` (all profiles)
- **Dispatcher** claims `ready` tasks, spawns **`hermes -p <assignee> chat`** per worker
- **`hermes kanban swarm`** builds a graph: parallel worker cards → verifier → synthesizer
- Workers get `HERMES_KANBAN_TASK` + `kanban_*` tools; orchestrator profile decomposes work

Each worker profile can use a **different key** in its `.env` → spend and rate limits are per-account.

**Caveat (community / upstream notes):** `kanban.db` and OAuth `auth.json` may be **shared** at `~/.hermes/` unless overridden (`HERMES_KANBAN_DB`). Sessions/memories stay per-profile.

### 3. Credential pool (same profile, multiple keys)

`config.yaml`:

```yaml
credential_pool_strategies:
  openrouter: round_robin   # or least_used, fill_first, random
```

Multiple keys in env or provider config — **rotates within one agent**, not separate personalities/crons. Good for **429 relief**, not lane isolation.

### 4. Delegation / subagents

Main profile can spawn subagents (may share parent key unless `delegation.base_url` + separate `api_key`). In-process — lighter than OS-process kanban workers, but less isolation and easier to blow context/RAM on 2 GB.

---

## Swarm patterns (ranked for linuxbox)

### Pattern A — **Budget lanes** (lowest risk)

**What:** One profile per spend bucket; sequential crons, no parallel gateway explosion.

| Profile | Key | Model | Cron / trigger |
|---------|-----|-------|----------------|
| `fast` | Key A (free-tier only) | Qwen free | 30s shell tick (existing) |
| `think` | Key B (**ops $5/day**) | hermes-4-70b | 1m `agent-cycle-think` |
| `hunter-reckoning` | Key A (**RP $5/day**) | hermes-4-70b | 5m `pod-hunter-reckoning` |
| `code` / `meta` | ops pool | `z-ai/glm-5.2` | on-demand / kanban |

**Pros:** Matches resource-governance (free vs paid); minimal RAM (one LLM call at a time).  
**Cons:** Not true parallelism; still one `CURRENT_TASK.md` rotation unless split per profile.

**Repo glue:** Each profile `terminal.cwd: /home/abhinav/agent-dump`; profile-specific prompt points at `agents/TROPIC_GOONER_TASK.md` vs `SPACEQUEST_*`. **Mutex:** `flock` on git pull / inbox writes (already on fast tick).

### Pattern B — **Kanban worker fleet** (true swarm)

**What:** One **orchestrator** profile (Key O, cheap decomposer model) + N **worker** profiles (Keys W1..Wn). Dispatcher runs workers as separate processes.

```bash
# After hermes update + kanban enabled:
hermes kanban swarm \
  --goal "Advance SpaceQuest phase-2: one open thread from progress.md" \
  --worker think:SpaceQuest-step \
  --worker meta:Dashboard-quick-fix \
  --verifier think \
  --synthesizer think
```

**Pros:** Parallel lanes; upstream-supported; blackboard on board.  
**Cons:** Needs **Hermes upgrade** (supply-chain SAFE gate); 2 GB RAM limits **concurrent** workers (plan **max 1–2**); shared `agent-dump` writes need **workspace pinning** + kanban task workspaces.

### Pattern C — **Key pool only** (smallest change)

**What:** Stay on one profile/gateway; add 2–3 OpenRouter keys with `round_robin`.

**Pros:** Tiny diff; helps 429 on free/paid tiers.  
**Cons:** No per-lane budgets; no separate SOUL/crons; doesn’t match “swarm of agents.”

---

## Coordination with this repo (non-Hermes)

Hermes will not solve multi-agent **git races** or **ledger** conflicts alone:

| Shared resource | Risk | Mitigation |
|-----------------|------|------------|
| `AI_GROUPCHAT.md` | Append collisions | Keep append-only; optional `flock` wrapper in cron scripts |
| `agents/human-inbox.json` | JSON clobber | Read-merge-write in fast lane only; or inbox API via dashboard |
| `user-tasks.json` / campaign `progress.md` | Double checkbox ticks | One assignee per campaign profile; kanban task = one checkbox |
| `~/agent-dump` git | N/A today (scp) | If git restored: `flock` on pull; branch per worker task |
| OpenRouter spend | Silent drain | **$5 RP + $5 ops** per account; RP pods must IDLE when RP pool exhausted |

---

## RAM / process budget (2 GB)

| Component | Rough cost |
|-----------|------------|
| `hermes-gateway` (default) | ~200–210 MB observed |
| Each extra gateway | Similar order — **avoid** N gateways on 2 GB |
| Kanban worker (no gateway) | Spawns `hermes chat` process for task duration — **1 worker ≈ one gateway-sized spike** |
| Safe concurrent workers | **1** (maybe **2** with swap; measure first) |

**Recommendation:** Prefer **one gateway** (default or `think`) + **kanban workers without per-profile gateways** for campaign bursts. Fast lane stays **shell + `fast chat`** (no gateway).

---

## Implementation phases (proposed)

### Phase 0 — Measure & align (no new keys)

1. Run supply-chain check on `hermes-agent` → SAFE → `hermes update` on linuxbox (or pin to known-good tag).
2. Verify `hermes kanban --help` / `hermes kanban swarm --help` exist post-update.
3. Apply **`install-hermes-agent-crons.sh`** for real: pause monolithic `agent-cycle`, enable fast+think crons with `--profile`.
4. Document live profile ↔ cron map in `docs/agents/linuxbox-hermes-owl-alpha.md`.

### Phase 1 — Key isolation (2 keys minimum)

1. **Key A:** free-only (`fast` profile) — existing or dedicated free account.
2. **Key B (ops):** `OPENROUTER_API_KEY_OPS` — **$5/day** — think/code/meta/dashboard.
3. **Key A (RP):** `OPENROUTER_API_KEY_RP` — **$5/day** — hunter-reckoning, spacequest, nyc-mafia, tropic-gooner.
3. Script: `scripts/linuxbox/set-profile-openrouter-key.sh <profile> <keyfile>` — writes **only** `~/.hermes/profiles/<profile>/.env`, never root unless intended.
4. Smoke: `fast chat -q ok` (free), `think chat -q ok` (paid), confirm different usage in OpenRouter dashboard.

### Phase 2 — Lane profiles (optional 3rd key)

Create purpose profiles with `--description` for kanban routing:

- `lane-infra` — maintenance, Intel, Mazda3 cron scripts (no-agent preferred)
- `lane-campaign` — `CURRENT_TASK.md` rotation
- `lane-meta` — dashboard backlog

Each: own `.env`, `terminal.cwd`, trimmed `SOUL.md`, cron or kanban assignee only.

### Phase 3 — Kanban swarm pilot

1. Enable kanban dispatcher (gateway config / `hermes kanban` docs post-update).
2. Pilot: **one** swarm with **two** workers max, goal = single campaign checkbox.
3. Measure RSS peak, task duration, failure modes (unknown assignee, claim TTL).
4. Integrate with dashboard: optional “Spawn swarm” → API runs `hermes kanban swarm` with approved worker list.

---

## Open decisions (need human)

1. **Two OpenRouter accounts** with **$5/day** each (RP + ops) — set in dashboard; paste keys into `~/.hermes/.env`.
2. **Parallelism budget:** 0 (sequential lanes only) vs 1–2 concurrent kanban workers?
3. **Upgrade Hermes now?** Kanban swarm needs newer than v0.14; trade vs supply-chain + regression risk on 2 GB box.
4. **Swarm scope:** campaign worldbuilding only, or include user-tasks + dashboard meta?
5. **Gateway count:** keep **one** shared gateway vs per-profile (not recommended on 2 GB).

---

## Model lock: `z-ai/glm-5.2` (coding + UI)

**Slug:** `z-ai/glm-5.2` on OpenRouter — hosted inference only (no local weights on 2 GB ARM).

| Profile | Model | Use |
|---------|-------|-----|
| `fast` | Qwen free | IDLE, git pull, inbox ack |
| `think` | `nousresearch/hermes-4-70b` | Campaigns, digests, narrative |
| `code` | **`z-ai/glm-5.2`** | Server/JS, refactors, tool loops |
| `meta` | **`z-ai/glm-5.2`** | Dashboard UI backlog, human-legible UI |

Installer: `scripts/linuxbox/install-hermes-profiles.sh` sets `reasoning_effort: high` on `code`/`meta`.

### OpenRouter provider routing (your screenshot)

Same model, many backends. For an always-on linuxbox harness:

| Strategy | When |
|----------|------|
| **Balanced** (OpenRouter default) | Day-to-day — price + speed + failover across providers |
| **Avoid DekaLLM** | ~$0.94/M but **~89% uptime** — bad for unattended crons |
| **Prefer for reliability** | DeepInfra (~$0.95, ~0.9s latency, ~98% uptime) or AtlasCloud (~99.7% uptime) |
| **Nitro** | Interactive dashboard chat only — fastest, costs more |
| **Exacto** | Pin one provider when you have measured a winner |

**Key-limit reality:** Separate OpenRouter keys do **not** bypass per-provider rate limits on the same model — they isolate **budget caps** and **account-level** throttles. OpenRouter’s multi-provider routing is the main lever for throughput when one backend is saturated. Optional: `credential_pool_strategies: openrouter: round_robin` across 2+ keys on the **same** profile.

**Cost note:** GLM-5.2 is ~$1–1.40/M input on most providers — reserve it for `code`/`meta` ticks only; never point `fast` cron at it.

### UI verification (human-legible)

After `meta`/`code` changes HTML/CSS:

1. `curl -sf http://127.0.0.1:8790/` → 200
2. Playwright smoke (existing pattern under `.staging/portfolio-redesign/_screenshots/` or a thin `scripts/linuxbox/dashboard-ui-smoke.mjs`) — assert tab labels, contrast, no empty panes
3. Optional: loopback screenshot to `reports/dashboard-ui/` for human glance on `/Linuxbox/`

All runs on linuxbox; no local Chromium farm — one headless pass per deploy.

### Source harness (“AGI-lite” on 2 GB)

Deterministic ingest **before** LLM (no swarm RAM):

| Source | Path | Lane |
|--------|------|------|
| RSS/Atom | `agents/intel-trackers.json` | `situation-rss`, code-discovery |
| GitHub API | same | `CODE_DISCOVERY_TASK.md` |
| Firecrawl cloud | `FIRECRAWL_API_KEY` in `~/.hermes/.env` | Hermes `web` tools on **think** only |
| URL dump file | `agents/source-queue.json` (proposed) | Human/agent appends links; **fast** cron scrapes via Firecrawl, writes `reports/sources/` |

Hermes **think** reads digests + `reports/sources/` when doing tasks; **code** implements; **human-inbox** only for irreversible choices. “Fun” tasks: optional `agents/fun-queue.json` — low-priority checkboxes the agent may pick when all lanes IDLE.

---

## References

- Local: `scripts/linuxbox/install-hermes-profiles.sh`, `install-hermes-agent-crons.sh`, `agent-cycle-fast-tick.sh`
- Local: `docs/agents/linuxbox-hermes-owl-alpha.md`, `CLAUDE.md` (model routing)
- Upstream: [Profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles), [Kanban](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban), [Kanban worker lanes](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban-worker-lanes), [Credential pools](https://hermes-agent.nousresearch.com/docs/user-guide/features/credential-pools)
