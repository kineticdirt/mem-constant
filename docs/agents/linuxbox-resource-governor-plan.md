# Linuxbox resource governor — understanding → plan → implementation

**Status:** Phase 1 in progress (2026-07-06)  
**Hardware:** ARM SBC, **~1.9 GiB RAM**, 4 cores, BTRFS SD root, `/mnt/archive` HDD  
**Policy (GM):** 2 GiB is the hard envelope; **slow swap is OK**; scheduler should **predict** pod schedules and **spin resources up/down** to saturate CPU without OOM.

---

## 1. Understanding

### 1.1 What runs on the box

| Layer | Components | Typical RSS | Always-on? |
|-------|------------|-------------|------------|
| **Agents** | `agent-pod-scheduler` (30s timer) → one `hermes chat` worker | +150–200 MiB peak per tick | Bursty |
| **Hermes gateways** | ops `hermes-gateway` + `hermes-gateway-hunter-reckoning` | ~126 + ~112 MiB | Yes (today) |
| **Site / dashboard** | `node` (portfolio `:3000`, linuxbox-status `:8790`) | ~100 MiB each | Yes |
| **Tunnels** | `cloudflared-abhinavall`, `cloudflared-tableslop` | ~25–30 MiB each | Yes |
| **Network** | `tailscaled` | ~65 MiB | Yes |
| **OS / cache** | kernel, buffers | remainder | — |

**Manifest pods** (`agents/agent-pods.manifest.json`):

| Pod | Pool | Schedule | Purpose |
|-----|------|----------|---------|
| `fast` | free | 30s | Inbox ack, IDLE |
| `think` | ops | 1m | Dashboard backlog, maintenance, user tasks |
| `hunter-reckoning` | rp | 5m | Hunter RP layer |
| `spacequest` | rp | 5m (+120s offset) | SpaceQuest worldbuilding |
| `nyc-mafia-dnd` | rp | 5m (+240s offset) | NYC Mafia campaign |
| `tropic-gooner` | rp | 10m (+360s offset) | Island / map / orgs |
| `ponytail-cleanup` | ops | 15m (+480s offset) | Code fix/refine board |

**Concurrency law:** `max_simultaneous_workers: 1` — only one LLM call at a time.

### 1.2 Measured state (2026-07-05 ~21:52 EDT, SSH evidence)

| Signal | Value | Interpretation |
|--------|-------|----------------|
| Load avg | 2.08 / 2.50 / 2.92 (4 cores) | ~50–75% average — **CPU copes** |
| MemAvailable | ~649 MiB | Tight headroom for worker + gateway |
| Swap | **100 MiB total, 100% used** | **Exhaustion**, not “slow overflow” |
| I/O wait | ~15% (prior sample) | SD + swap thrash |
| Scheduler | `agent-pod-scheduler.timer` active, 30s | Runs continuously |
| Gateways | Both ops + hunter **active** | ~240 MiB baseline; hunter gateway optional per manifest |

### 1.3 Failure modes observed

1. **Think monopolization** — `think` (pri 1) always beat RP pods (pri 2); long think ticks blocked worldbuilding for 10+ min.
2. **Swap cliff** — 100 MiB swap fills instantly; kernel swaps aggressively on SD → latency spikes, not graceful deferral.
3. **Gateway bloat** — Hunter Discord gateway runs 24×7 though manifest says `gateway: false` for RP pods; ~110 MiB reclaimable when hunter idle.
4. **RP churn** — Four RP pods + think + fast = constant timer wakeups; only one runs, but **queue depth** grows (all overdue).
5. **Doc vs reality** — `linuxbox-hermes-owl-alpha.md` documents **2 GiB** `/var/swap`; box still has **100 MiB** file from Jun 13.

### 1.4 What “predictive compiler” means here

The **manifest + offsets + last_run state** are the compile-time schedule. The **resource governor** is the runtime linker:

- **Inputs:** `/proc/meminfo`, manifest schedules, `pod-scheduler.json`, `resource-governor.json`
- **Outputs:** admit / defer, candidate ranking, gateway spin-up/down, telemetry
- **Goal:** One worker at a time, **RP prioritized when ops recently ran**, ops deferred under swap pressure, optional services stopped when not due within horizon.

### 1.5 Already shipped (pre-this-doc)

- `agents/resource-governor.json` — budget + gateway spin policy
- `scripts/linuxbox/resource_governor.py` — planner
- `agent-pod-scheduler.sh` — calls `plan_tick`, logs `RESOURCE …` lines
- `G-RESOURCE` in `agents/intent/agent-loops.json`

---

## 2. Plan (strategy)

### 2.1 Design principles

1. **RAM is the bottleneck, not CPU** — saturate one worker; defer before OOM.
2. **Swap = overflow, not working set** — target **512 MiB–2 GiB** swap on SD so deferral works; slowness acceptable.
3. **Compiled schedule drives spin** — gateways and heavy services start **≤5 min before** pod due; stop after **15 min idle**.
4. **Focus lanes** — active work (Tropic Gooner / think dashboard) gets priority; inactive RP pods **paused** via config flag, not deleted.
5. **Observe before tune** — persist telemetry each tick; Hub readout in Phase 3.
6. **PC vs linuxbox split** — worldbuilding **text** on PC; linuxbox runs **ticks** only at manifest cadence.

### 2.2 Target architecture

```text
┌─────────────────────────────────────────────────────────┐
│  agent-pod-scheduler.timer (30s)                        │
│    └─ resource_governor.plan_tick()                     │
│         ├─ mem/swap telemetry → resource-telemetry.json │
│         ├─ gateway spin (systemctl user)                │
│         ├─ rank due pods (RP > ops if think cooldown)   │
│         └─ admit first candidate with headroom          │
│              └─ hermes chat (1 worker) → intent gate    │
└─────────────────────────────────────────────────────────┘
```

### 2.3 Success criteria

| Check | Target |
|-------|--------|
| Swap used | <90% typical; never pegged 100% for >30 min |
| Think vs RP | RP runs at least once per 15m when overdue during active worldbuilding |
| Hunter gateway | Stopped when hunter paused/idle; up ≤5m before due |
| Hub / logs | `RESOURCE` line + `resource-telemetry.json` readable |
| No OOM kills | `dmesg` clean over 24h |

---

## 3. Implementation plan (phased)

### Phase 1 — Memory headroom + governor hardening *(now)*

| # | Task | Verify |
|---|------|--------|
| 1.1 | Idempotent `ensure-linuxbox-swap.sh` (2 GiB, BTRFS NOCOW) | `cat /proc/swaps` shows ~2G |
| 1.2 | `paused_pods` in `resource-governor.json` (spacequest, nyc-mafia-dnd) | Planner skips them |
| 1.3 | Persist `agents/state/resource-telemetry.json` each scheduler tick | File updates every 30s |
| 1.4 | Self-check in `resource_governor.py` (`--self-check`) | Exit 0 on linuxbox |
| 1.5 | Deploy scripts to linuxbox (scp) | Dry-run planner OK |

### Phase 2 — Observability *(next)*

| # | Task | Verify |
|---|------|--------|
| 2.1 | `GET /api/resource` on dashboard reads telemetry | curl :8790 |
| 2.2 | Hub Meta tab: avail MiB, swap %, last pod, next due | Screenshot |
| 2.3 | Alert line in Hub when swap >95% for 10m | Manual |

### Phase 3 — Schedule tuning *(after 24h telemetry)*

| # | Task | Verify |
|---|------|--------|
| 3.1 | `think` 1m → 3m if dashboard backlog <3 open | progress check |
| 3.2 | `fast` 30s → 2m | Timer still acks inbox |
| 3.3 | `tropic-gooner` stays 10m; hunter 5m or 10m per GM | RP ticks in logs |
| 3.4 | Re-enable paused pods one at a time | spacequest log |

### Phase 4 — Optional upgrades *(human gate)*

- Hermes kanban dispatcher (post SAFE upgrade)
- Local Chromium only on-demand
- Move swap to dedicated file on archive HDD (if SD wear concern)

---

## 4. Implementation log

| Date | Phase | Done |
|------|-------|------|
| 2026-07-06 | 1 | Plan doc; governor + scheduler wired (prior session) |
| 2026-07-06 | 1 | `paused_pods`, telemetry persist, `--self-check`, `ensure-linuxbox-swap.sh` |
| 2026-07-06 | 1 | **Swap 100 MiB → 2 GiB** on linuxbox (`/var/swap`, 0 used after expand) |

---

*Cross-ref:* `agents/resource-governor.json`, `scripts/linuxbox/resource_governor.py`, `docs/agents/hermes-agent-pods-linuxbox.md`, `docs/agents/linuxbox-hermes-owl-alpha.md` § swap
