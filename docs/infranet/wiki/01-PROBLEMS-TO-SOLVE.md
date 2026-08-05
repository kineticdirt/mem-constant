---
title: Problems to solve
kind: investigation
tags: [infranet, problems, threat-model]
status: draft
---

# 01 — Problems to solve

Problems the V1 marketplace must confront. Split into **theoretical** (design/econ) and **practical** (build/ops). Severity = how hard it kills the product if wrong.

## A. Theoretical / market

| # | Problem | Why it matters | Working answer (brief) | Open? |
|---|---|---|---|---|
| T1 | **Cold start** (no producers ↔ no consumers) | Graveyard of BOINC-charity + Golem/Akash “list FLOPs and wait” | First-party services as demand; recruit homelab supply; launch one latency domain at a time | Yes — exit criteria in PoC v1 |
| T2 | **Wrong product: commodity FLOPs vs AWS** | Datacenters win on reliability/SLA | Sell what garage delivers: small apps, batch, replicated storage | Design discipline ongoing |
| T3 | **Altruism ceiling** | Volunteer science saturates | Pay in tokens / cash-out rails; not charity | Depends on settlement rails maturing |
| T4 | **Outcome vs metering disputes** | “Model hallucinated — refund?” | Meter runtime only; apps own quality budgets | Policy templates needed |
| T5 | **Adverse selection of supply** | Flaky / malicious / underspec’d hosts | Replication, reputation, benchmark tiers, deposits | Not built |
| T6 | **Adverse selection of demand** | Paid malware / crypto miners / spam | Screen + VM + funded accounts + restricted tier | Partially designed; unbuilt |
| T7 | **Liquidity per zone** | Global “market” with empty metros fails interactive work | Zone-local markets first | Ops plan only |
| T8 | **Power / heat / neighbor politics** | Real cost floors; social friction | Electricity-visible pricing; opt-in schedules | Soft — product UX |
| T9 | **Regulatory / tax / KYC at cash edges** | Tokens→money triggers rails & law | Piggyback regulated wallets; no mint | Legal review gate |
| T10 | **V1/V2 confusion** | Identity digression kills marketplace focus | V2 deferred by charter | Process |

## B. Practical / engineering

| # | Problem | Why it matters | Working answer | Open? |
|---|---|---|---|---|
| P1 | **Isolation on volunteer hardware** | Without VM airgap, no honest volunteer pitch | Firecracker / Cloud Hypervisor class micro-VMs; Linux-first | PoC still process-only |
| P2 | **Windows hosts** | Huge gaming-PC supply | Hyper-V path is a *port*, not v1 reference | Deferred |
| P3 | **Host-side metering** | In-guest meters lie / miss crashes | cgroup / hypervisor stats from outside guest | PoC gap |
| P4 | **Sandbox network policy** | Default-allow = abuse highway; default-deny = breaks apps | Routed egress; priced connectivity tier undecided | Explicit open item in ARCHITECTURE |
| P5 | **Payload pre-screen cost & FN** | Screening burns compute; malware will slip | Layer with VM; don’t trust alone | Unbuilt |
| P6 | **Image / warm pool / cold start latency** | micro-VM boot + pull overhead | Snapshots / warm pools for services; batch amortizes | Unbuilt |
| P7 | **Scheduler under churn** | Boxes sleep, reboot, leave Wi‑Fi | Replication + light coordinator (not full K8s) | Unbuilt |
| P8 | **Privacy vs latency maps** | Fine RTT history ≈ location | Coarse zones + aggregates only | Policy wording needed |
| P9 | **Benchmark tiers across CPUs/GPUs** | Fair tokens for different silicon | Spec suite → tier multipliers | Unbuilt |
| P10 | **Ledger ↔ wallet settlement** | Tokens must cash in/out without inventing a coin | Skyfire / AP2 / ACP at edges | Intro path noted; no integration |
| P11 | **ARM SBC / thin hosts** (e.g. 2 GB potato) | Real supply class in this homelab | Workloads must fit; coordinator stays light | Lived evidence exists; product not yet |
| P12 | **Multi-household trust + support** | When a job fails, who debugs? | Statements + job IDs + clear SLA “best effort + replicate” | Support playbook missing |

## C. Abuse cases (short list)

1. **Pay-to-botnet** — primary threat model (ARCHITECTURE §2)
2. **Meter fraud** — guest under-reports CPU; host over-claims — host-side meter + spot checks
3. **Data exfil from jobs** — guest sees only its workload; still need egress policy + customer data contracts
4. **Freeloading / unpaid capacity hogging** — funded accounts, deposits, rate limits
5. **Sybil producers** — fake nodes farming tokens — identity-lite at payment edge; hardware attestation later (unknown maturity)

## D. What “solved” means for PoC v1

From the brief — exit when:

1. Every workload survives **any single machine offline**
2. Statements reconcile with observed runtime within a few percent
3. At least one participant **pays or contributes** for a second month

Until then, treat marketplace claims as **hypothesis under test**, not product truth.

## Pointers

- How it works: [[00-HOW-IT-WORKS]]
- OSS to reuse: [[02-OPEN-SOURCE-LANDSCAPE]]
- Try spikes: [[03-TRY-IT-EXAMPLES]]
