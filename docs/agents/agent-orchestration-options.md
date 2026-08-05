# Agent orchestration options — linuxbox, laptop, Rust

**Date:** 2026-06-29  
**Context:** Multi Hermes agent “pods” (Hunter RP, ops, etc.) on **~2 GB ARM linuxbox**, optional **Windows laptop**, $5 RP + $5 ops OpenRouter pools.

**Canonical pod design:** `docs/agents/hermes-agent-pods-linuxbox.md` · `agents/agent-pods.manifest.json`

---

## TL;DR recommendation

| Option | On linuxbox (2 GB) | Verdict |
|--------|-------------------|---------|
| **Hermes profiles + crons/kanban** | ✅ Yes | **Default** — already designed |
| **k3s / Kubernetes** | ⚠️ Tight / risky | **Not recommended** as control plane on the box |
| **Docker Compose per agent** | ⚠️ Heavy | **No** — Hermes isn’t one-container-per-agent; adds overhead without isolation win |
| **systemd + flock + manifest** | ✅ Yes | **Good upgrade** — tiny “scheduler” without k8s |
| **Rust scheduler daemon** | ✅ Yes | **Phase 2** if bash scheduler outgrows you (~5–15 MB RSS) |
| **Windows laptop as worker** | ✅ When awake | **Burst node** — extra RP/ops pods via WSL Hermes + Tailscale, not 24×7 primary |

**k3s is already the “cheap Kubernetes”** (vs full k8s). There isn’t a smaller *real* k8s distro that saves enough RAM to matter on 2 GB. The lighter paths are **not Kubernetes**: Hermes scheduler, systemd, or a small Rust/bash runner.

---

## Why not k3s on linuxbox?

**Current RAM consumers (order of magnitude):**

| Process | ~RSS |
|---------|------|
| Hermes gateway | ~200 MB |
| Gitea + Uptime Kuma (Docker) | ~300–600 MB combined |
| linuxbox-status, cloudflared, tunnel proxy | ~50–100 MB |
| **k3s server (control plane)** | **~512 MB–1 GB+** |
| One Hermes worker (`hermes chat`) | ~200 MB spike |

**2 GB total** + 2 GB swap already documented in `CLAUDE.md`. Adding k3s means something else gets OOM-killed (usually the agent worker or Docker).

**What k3s would give you:** CronJob YAML, declarative replicas, namespaces.  
**What you already have:** Hermes crons, profiles as namespaces, manifest JSON, OpenRouter quotas.

**Mapping Hermes → k8s doesn’t reduce RAM** — each Job still runs a full Python Hermes process. k3s adds a control plane *on top*.

**When k3s *could* make sense on linuxbox:**

- RAM upgrade (≥4 GB) **or** Gitea/Kuma moved to laptop/NAS
- You need many non-Hermes containers with uniform scheduling
- You’re already running k3s for other homelab services

**Lighter than k3s on the same box:** keep Docker Compose for infra (`scripts/linuxbox/homelab/docker-compose.yml`) and **do not** add k3s.

---

## k3s on the laptop (Windows)

**Possible, not default.**

| Pros | Cons |
|------|------|
| More RAM/CPU when laptop is plugged in | Laptop **not always-on** (conflicts with Hunter 24×7 goal) |
| Could run k3s in WSL2 or Linux dual-boot | WSL2 k3s + Hermes + Docker is fiddly on Windows |
| Burst RP sessions while traveling | Split brain: which machine owns `agent-dump`? |

**Practical laptop pattern (no k3s):**

1. Clone/sync `agent-dump` (USB kit or git).
2. WSL Hermes + same profiles (`hunter-reckoning`, etc.).
3. When laptop is on tailnet: run **manual or scheduled** `hunter-reckoning chat` for long RP sessions.
4. linuxbox stays **canonical** for crons, dashboard, tunnel — laptop is **overflow**, not primary.

**k3s on laptop as control plane + linuxbox as agent node** is theoretically valid but operationally heavy for one user: join tokens, firewall, sync volumes, `$HOME/.hermes` paths across ARM/AMD. Not worth it until you outgrow Hermes kanban.

---

## Docker Compose “agent pods”

Tempting because Gitea/Kuma already use Compose. **Poor fit for Hermes:**

- Each “pod” needs `HERMES_HOME=~/.hermes/profiles/<name>`, host git checkout, SSH keys, Firecrawl env — bind-mount spaghetti.
- Container per cron tick = startup cost; Hermes worker is a **host process**, not a long-lived container service.
- **Compose is right for** Gitea, monitoring, static apps — **not** for spawning LLM agents every 5 minutes.

---

## Alternative: tiny scheduler (bash → Rust)

**Goal:** Kubernetes-*like* semantics without k8s RAM.

### Phase 1 — Bash + manifest (ponytail)

`scripts/linuxbox/agent-pod-scheduler.sh`:

- Read `agents/agent-pods.manifest.json`
- `flock` global lock (max 1 worker on 2 GB)
- Due schedules → `hermes -p <name> chat -q "$(cat agents/…)"`
- Log JSONL to `agents/runs/pod-*.jsonl`
- Skip RP pods if OpenRouter returns 402/429 and pool tag = rp

Runs under **systemd timer** every 30s (cheaper than k3s).

### Phase 2 — Rust `agent-runner` (optional)

Same manifest schema; ~5–15 MB daemon; SQLite queue for kanban-like tasks; subprocess spawn. Good if you want:

- Persistent queue across reboots
- Backpressure / “RP budget exhausted” state machine
- HTTP hook from dashboard (“run hunter pod now”)

**Not needed until** bash scheduler proves insufficient.

---

## Multi-machine without k8s

```text
linuxbox (always-on)          laptop (burst, Tailscale)
├── hermes-gateway (think)    ├── WSL Hermes (optional)
├── RP crons / scheduler      ├── Long RP session when traveling
├── dashboard :8790           └── scp/git sync agent-dump
├── cloudflared
└── agent-pods.manifest.json  ← single source of truth (git/scp)
```

**Coordination:** `AI_GROUPCHAT.md` + git/scp — same as today. No cluster required.

**Wake laptop from linuxbox:** existing `~/bin/wake-desktop.sh` (WoL) — could trigger **PC** for heavy coding, not necessarily laptop Hermes.

---

## Decision matrix

| Need | Use |
|------|-----|
| 24×7 Hunter + ops agents | **linuxbox** Hermes pods + scheduler |
| Declarative pod list | **`agent-pods.manifest.json`** |
| $5 RP / $5 ops isolation | Two OpenRouter keys in profile `.env` files |
| Multi-step parallel work | Hermes **kanban** after upgrade (max 1–2 workers) |
| More CPU/RAM for one session | **Laptop WSL** manual/burst |
| Infra containers (git, uptime) | **Docker Compose** (existing) |
| Full cluster orchestration | **Defer** until ≥4 GB box or dedicated NUC |

---

## Suggested path

1. **Now:** `install-hermes-agent-pods.sh` + two OpenRouter $5 limits — no k3s.
2. **Next:** bash `agent-pod-scheduler.sh` + systemd timer (if crons overlap or need central mutex).
3. **Later:** Hermes kanban dispatcher (Phase B in pod doc).
4. **Only if needed:** Rust runner or k3s on **larger** hardware — not on 2 GB linuxbox.

---

## See also

- `docs/agents/hermes-agent-pods-linuxbox.md`
- `docs/agents/hermes-swarm-keys-investigation.md`
- `scripts/linuxbox/homelab/docker-compose.yml` (infra only)
- `pi-agents-plan.md` § Hardware/port budget
