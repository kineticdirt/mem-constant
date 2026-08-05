---
title: Try-it examples
kind: investigation
tags: [infranet, poc, spikes]
status: draft
---

# 03 — Try-it examples (“run it, then see”)

Concrete spikes. Prefer **evidence on disk / terminal** over debate. No secrets; no production deploy of untrusted jobs onto volunteer PCs until isolation is a real VM.

## Spike 0 — PoC v0 loop (already in repo)

**Goal:** Feel compute tokens as metered work, not LLM tokens.

```bash
cd projects/infranet/poc
py -3 smoke_test.py
py -3 infranet_poc.py
```

**Look for:**

- Busy-loop billed for CPU-ms
- Sleeper billed almost nothing (wall ≠ CPU)
- Crasher still billed for runtime burned (“kettle boiled dry”)
- Ledger entries per job sum to zero; producer credit = consumer debit

**Maps to problems:** T4 (outcome vs meter), P3 (today’s meter is still in-guest — see README placeholders).

**Pass:** `smoke_test.py` exits 0. **Fail:** assert noise — fix before philosophizing.

## Spike 1 — Read the placeholder gaps aloud

**Goal:** Align mental model with honesty in `poc/README.md`.

Checklist while reading:

- [ ] Process ≠ security boundary
- [ ] Self-reported meter can lie / miss
- [ ] No multi-machine, no zones, no screening, no cash settlement

**Pass:** You can explain each gap without looking. Then open [[01-PROBLEMS-TO-SOLVE]].

## Spike 2 — Host-side meter sketch (Linux)

**Goal:** Close P3 on paper + tiny prototype (stdlib / `/sys/fs/cgroup`).

1. Run a known busy process under a cgroup
2. Read `cpu.stat` before/after
3. Compare to PoC’s in-process `process_time` reading

**Pass:** Within ~10–20% on a quiet machine for a multi-second busy loop. **Unknown on Windows** — document and stop; don’t fake parity.

## Spike 3 — Micro-VM hello (Firecracker or Cloud Hypervisor)

**Goal:** Touch P1 for real on a Linux box with KVM (`/dev/kvm`).

1. Follow upstream getting-started for Firecracker **or** Cloud Hypervisor (pick one)
2. Boot a minimal rootfs; run `echo hello` in guest
3. Time cold boot; note RAM overhead

**Pass:** Guest runs; host files untouched; boot time written down. **Fail / blocked:** no KVM on potato nested? — record blocker; try desktop Linux VM instead. Do **not** claim isolation solved until this lands.

*ARM SBC note:* Firecracker supports Arm, but 2 GB hosts need tiny guests — measure before promising potato as producer.

## Spike 4 — Two-machine ledger (household LAN)

**Goal:** Smallest multi-host loop toward PoC v1 (still trusted code only).

1. Machine A = coordinator + ledger (extend PoC or thin HTTP)
2. Machine B = worker agent; pulls job, runs **same** process sandbox, returns meter
3. Kill B mid-job; confirm A marks failure and does not double-pay

**Pass:** One job settles once; kill-test documented. Still **not** untrusted isolation.

## Spike 5 — Workload realism (first-party seeds)

**Goal:** Prove demand shape, not FLOPs cosplay.

Pick one and run on existing homelab hardware (potato / PC):

| Workload | Success signal |
|---|---|
| Static/small Node site | Survives reboot with systemd; monthly “runtime hours” estimate |
| Folder backup sync | Second copy on another box; restore drill once |
| Batch ffmpeg / zip job | Completes off-peak; wall vs CPU logged |

**Pass:** One page in `reports/` or this wiki with hours + failure modes. Ties to T2 / first-party demand thesis.

## Spike 6 — Wallet rail paper spike (no money)

**Goal:** P10 without spending.

1. Skim Skyfire KYAPay A2A README + one AP2 merchant explainer (links in brief Sources)
2. Write a half-page: *where compute-token debit would attach to a mandate / JWT*
3. List blockers (KYC, geography, producer payout)

**Pass:** Half-page checked into `docs/infranet/wiki/` or `reports/infranet/`. **No** API keys in repo.

## Spike 7 — Restricted-tier toy

**Goal:** Taste T6/P5 alternative.

Implement a dispatcher that only accepts a tiny AST (e.g. add/mul/map on arrays) — no `os`, no network. Bill by operation count or CPU.

**Pass:** Malicious `os.system` rejected; honest matmul runs. Shows why this tier is safe but small.

## Suggested order

```text
0 → 1 → 5 (demand) → 2 (meter) → 4 (two machines) → 3 (micro-VM) → 6 (money) → 7 (restricted)
```

Do **not** put strangers’ payloads on household machines until Spike 3 is green and network policy (ARCHITECTURE §3) has a written default.

## Pointers

- How it works: [[00-HOW-IT-WORKS]]
- Landscape: [[02-OPEN-SOURCE-LANDSCAPE]]
- Pack index: [[INDEX]]
