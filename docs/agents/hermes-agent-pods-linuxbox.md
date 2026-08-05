# Hermes agent pods — linuxbox (K8s-like, no Kubernetes)

**Status:** Architecture + manifest (2026-06-29). **Target:** 2 GB ARM always-on linuxbox.  
**Manifest:** `agents/agent-pods.manifest.json`  
**Budget:** **$5/day RP** + **$5/day ops** (two OpenRouter accounts/keys).

Real Kubernetes on this box is out of scope (RAM, ops burden). Hermes **profiles** + **scheduler** give the same *logical* shape: isolated agents, separate secrets, staggered work, one control plane.

---

## K8s analogy (what we actually run)

| Kubernetes | linuxbox Hermes |
|------------|-----------------|
| **Namespace** | Budget pool — `rp` ($5) vs `ops` ($5) vs `free` |
| **Pod** | One-shot `hermes -p <profile> chat -q "…"` worker process |
| **Deployment** | Hermes cron **or** kanban task with `assignee: <profile>` |
| **Control plane** | Single `hermes-gateway` (ops `think` profile) + kanban dispatcher (post-upgrade) |
| **ConfigMap** | `agents/*_TASK.md`, `CURRENT_TASK.md`, campaign `progress*.md` |
| **Secret** | `~/.hermes/profiles/<pod>/.env` → `OPENROUTER_API_KEY_RP` or `_OPS` |
| **Service** | Dashboard `:8790`, human inbox, `AI_GROUPCHAT.md` |
| **Resource quota** | OpenRouter daily limit per account; **max 1 concurrent worker** on 2 GB; **`agents/resource-governor.json`** + `scripts/linuxbox/resource_governor.py` (mem/swap admit, gateway spin, think cooldown) |

We do **not** run one gateway per pod on 2 GB (~200 MB each). RP pods use **cron-spawned workers** only; only **ops `think`** keeps the persistent gateway for chat/crons.

---

## Budget pools

| Pool | OpenRouter limit | Env var (per RP/ops profile `.env`) | Profiles |
|------|------------------|-------------------------------------|----------|
| **RP** | **$5/day** | `OPENROUTER_API_KEY_RP` | `hunter-reckoning`, `spacequest`, `nyc-mafia-dnd`, `tropic-gooner` |
| **Ops** | **$5/day** | `OPENROUTER_API_KEY_OPS` | `think`, `code`, `meta` |
| **Free** | $0 | (none or shared free tier) | `fast` |

Create **two OpenRouter keys** (or two sub-accounts), each with **$5/day** hard limit in the OpenRouter dashboard. Installer copies the right key into each profile’s `.env`.

When RP pool is exhausted, RP pods **IDLE** and log to `AI_GROUPCHAT.md` — they must not fall through to the ops key.

---

## Hunter: The Reckoning — dedicated pod

**Profile name:** `hunter-reckoning`  
**Why separate:** RP voice, Hunter threat roster, Discord ingest, and session memory must not share context with dashboard coding or Mazda3 tasks.

| Field | Value |
|-------|--------|
| Data | `campaigns/tropic-gooner/` (one chronicle; Hunter **agent** is separate from island **agent**) |
| Task spec | `agents/HUNTER_RECKONING_TASK.md` |
| Progress | `campaigns/tropic-gooner/reports/progress-hunter.md` |
| Model | `nousresearch/hermes-4-70b` (RP pool) — swap to cheaper RP model if $5 tight |
| Schedule | `every 5m` cron, `--profile hunter-reckoning` |
| SOUL | WoD Hunter, Isla Primavera, no infra paths, drafts only under `reports/` |

**Sibling RP pods:** `spacequest`, `nyc-mafia-dnd`, `tropic-gooner` (geography/map/orgs). Stagger schedules (5m / 5m / 10m) so only one RP worker runs at a time.

---

## Control plane options

### Phase A — Cron scheduler (works on Hermes v0.14 today)

```
fast (30s, free)     → inbox + git pull
think (1m, ops $5)   → CURRENT_TASK ops rotation
hunter (5m, RP $5)   → one Hunter checkbox
spacequest (5m, RP)  → alternate minute offset :02
nyc-mafia (5m, RP)   → offset :04
tropic (10m, RP)     → island/map only
```

Mutex: `flock /tmp/hermes-rp-worker.lock` wrapper so RP crons never overlap ops `think` if both fire.

### Phase B — Kanban dispatcher (after `hermes update` + SAFE)

- Shared board: `~/.hermes/kanban.db`
- Tasks carry `assignee: hunter-reckoning` etc.
- Dispatcher spawns workers — same pods, cleaner orchestration
- `hermes kanban swarm` for multi-step RP arcs (still **max 1 worker** on 2 GB)

---

## Install (linuxbox)

```bash
# 1. Two keys in ~/.hermes/.env (chmod 600) — never commit
OPENROUTER_API_KEY_RP=sk-or-v1-...
OPENROUTER_API_KEY_OPS=sk-or-v1-...

# 2. Create profiles + wire keys + crons
bash ~/agent-dump/scripts/linuxbox/install-hermes-agent-pods.sh

# 3. Smoke
hunter-reckoning chat -q "Reply: hunter-pod-ok"
code chat -q "Reply: ops-code-ok"
```

---

## UI / human legibility

Ops **`meta`** / **`code`** pods (GLM-5.2, ops $5): after dashboard HTML/JS changes → `curl :8790` + Playwright smoke (see swarm investigation doc). RP pods do not deploy UI.

---

## Source harness (ops pod, cheap)

Deterministic ingest stays **off** RP budget: RSS/GitHub (`intel-trackers.json`), Firecrawl (`FIRECRAWL_API_KEY`), future `agents/source-queue.json`. Ops `think` reads cached `reports/` when executing tasks.

---

## Open items

1. Paste **two** OpenRouter keys into linuxbox `~/.hermes/.env` and set **$5/day** on each account.
2. Approve Hermes upgrade for kanban control plane (Phase B).
3. Confirm RP schedule: Hunter every **5m** OK, or slower to stretch $5?

---

## See also

- `docs/agents/hermes-swarm-keys-investigation.md`
- **`docs/agents/agent-orchestration-options.md`** — k3s vs laptop vs Rust scheduler (why not k8s on 2 GB)
- `scripts/linuxbox/install-hermes-profiles.sh` (base profiles)
- `scripts/linuxbox/install-hermes-agent-pods.sh` (pod installer)
