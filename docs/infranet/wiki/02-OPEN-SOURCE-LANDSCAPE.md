---
title: Open-source landscape
kind: investigation
tags: [infranet, open-source, landscape]
status: draft
---

# 02 — Open-source landscape (reuse, don’t reinvent)

Honest inventory for V1. **Verified** = checked against live project pages / GitHub around 2026-07-27 or already cited in the canonical brief with stable URLs. **Unknown / needs re-check** = do not treat as committed dependency.

## A. Isolation & sandboxes (highest leverage)

| Project | What it is | Fit for Infranet | Status |
|---|---|---|---|
| [Firecracker](https://github.com/firecracker-microvm/firecracker) | AWS micro-VM VMM (KVM); Lambda/Fargate class | Primary isolation candidate for Linux volunteer hosts | **Verified** (Apache-2.0; active 2026 releases) |
| [Cloud Hypervisor](https://github.com/cloud-hypervisor/cloud-hypervisor) | LF/rust-vmm VMM; KVM (+ MSHV) | Alt / broader device model; Kata often pairs with it | **Verified** (active 2026) |
| [Kata Containers](https://katacontainers.io/) | Containers inside VMs | Packaging story: OCI image → micro-VM | **Cited widely**; integrate only after Firecracker/CH spike |
| [gVisor](https://gvisor.dev/) | Userspace kernel intercept | Weaker than VM for “stranger on home PC”; maybe restricted tier | Exists; **not** primary airgap |
| QEMU / KVM | Full VMM | Too heavy for part-time nodes as default | Baseline tech under micro-VMs |
| Docker / containerd alone | Namespace isolation | **Rejected as primary** (shared host kernel) — OK inside guest | Known |

**Windows:** Hyper-V isolation differs; treat as port after Linux reference path works (ARCHITECTURE).

## B. Orchestration / agent (keep light)

| Project | Fit | Status |
|---|---|---|
| Kubernetes / k3s | Too heavy for 2 GB / gaming-PC spare | **Avoid as control plane** for v1 volunteer nodes |
| Nomad | Lighter than K8s | **Candidate to evaluate** — unknown if thin enough; mark spike |
| Custom thin agent + one coordinator | Matches brief / homelab pattern | **Likely v1** (build minimal) |
| systemd / supervisord | Host supervision of agent | Commodity; use |

## C. Metering & accounting

| Approach | Fit | Status |
|---|---|---|
| cgroup v2 cpu.stat / memory | Host-side CPU/mem for Linux guests | **Standard**; spike required |
| Hypervisor metrics (Firecracker/CH) | Authoritative guest runtime | Tied to VMM choice |
| OpenTelemetry / Prometheus | Observability, not billing SoT | Optional later |
| Double-entry ledger (SQLite) | PoC already does this | **In-repo:** `projects/infranet/poc/` |
| Bitcoin/ETH “compute tokens” | Conflicts with “do not mint” | **Out of scope** for V1 |

## D. Prior art / marketplaces (learn failure modes; don’t copy blindly)

| Project | Model | Lesson | Status |
|---|---|---|---|
| BOINC / SETI@home / Folding@home | Volunteer science | Altruism ceiling | Historical — brief table |
| Golem | Token raw compute | Thin demand for generic FLOPs | Brief + Arkhai analyses |
| Render Network | GPU render niche | Niche demand works | Brief |
| Akash / io.net et al. | Token cloud/GPU | Heterogeneous supply loses to DC on reliability | Brief cites field writeups |
| [fly.io](https://fly.io/) / [Railway](https://railway.app/) etc. | Paid PaaS (not OSS marketplace) | Demand shape for small apps — competitors/analogs on *demand* side | Commercial; not reuse |

## E. Payment / settlement rails (piggyback)

| Rail | Role | Status |
|---|---|---|
| [Skyfire](https://skyfire.xyz) / [KYAPay A2A](https://github.com/skyfire-xyz/kyapay_a2a) | Agent spend + identity-linked auth | Brief cites; **integration not started** |
| Google **AP2** | Signed payment mandates | Brief cites 2025+ ecosystem |
| OpenAI/Stripe **ACP** | Agentic checkout tokens | Brief cites; surface still moving |
| Stablecoin HTTP pay (x402-class) | M2M settlement experiments | Context only — re-verify before build |
| Custena [agent-payment-protocols](https://github.com/custena/agent-payment-protocols) survey | Landscape map | Useful index |

Do **not** invent a ledger coin because OSS “DePIN” templates exist.

## F. Networking & policy

| Tooling | Fit | Status |
|---|---|---|
| Linux bridge / tap / nftables / WireGuard | Guest egress control, overlay | Commodity |
| Cilium / Calico | K8s-shaped — likely overkill | Skip unless coordinator becomes K8s |
| Headscale / Tailscale | Operator admin network ≠ guest path | Homelab ops only |

Exact sandbox egress policy still **open** (ARCHITECTURE §3).

## G. Screening / malware

| Class | Fit | Status |
|---|---|---|
| ClamAV / YARA | Signature layer | Commodity; high FN |
| Static analyzers / sandboxed detonation | Pre-dispatch | Needs dedicated scan workers (eat tokens) |
| “Restricted numeric ISA” dispatcher | Near-zero attack surface tier | Design idea — **no known drop-in product** marked; would be custom |

## H. In-repo today (reuse first)

| Path | What | Reuse? |
|---|---|---|
| `projects/infranet/poc/` | Job → process sandbox → CPU/wall meter → SQLite ledger + smoke | **Yes** — inner loop SoT |
| `projects/infranet/ARCHITECTURE.md` | Isolation/threat/zones notes | Yes |
| Older `demo.py` / in-memory “blockchain” / Rust skeleton | Placeholders (BASELINE era) | **Do not** treat as product |
| `PLANNING.md` / FHE/MPC/ZKP | V2 identity research | Shelf until V2 |

## I. Explicit unknowns (do not claim)

- A production-ready **open-source “ebay for compute”** that already matches this V1 design — **not identified**; prior art failed for reasons above.
- Whether **Nomad** or a custom agent wins on 2 GB ARM — **untested**.
- Maturity of **hardware attestation** for anti-Sybil producers — **unknown**.
- Which wallet rail wins in US vs EU for producer payouts — **unknown**; design assumes adapter layer.
- Firecracker on **nested virt / consumer Windows** paths — **unknown / likely painful**; Linux hosts first.

## Pointers

- Problems: [[01-PROBLEMS-TO-SOLVE]]
- Try spikes: [[03-TRY-IT-EXAMPLES]]
- Canonical brief sources section lists URLs for wallet + prior-art writeups
