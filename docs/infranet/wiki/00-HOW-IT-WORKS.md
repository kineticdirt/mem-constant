---
title: How Infranet works (V1)
kind: investigation
tags: [infranet, marketplace, compute-tokens]
status: draft
---

# 00 — How it works (V1 marketplace)

*Source of truth: `docs/infranet/INFRANET-COMBINED-BRIEF.md` + `projects/infranet/ARCHITECTURE.md`. This page is a Docs-facing digest, not a second pitch.*

## One-sentence model

**Infranet is eBay for spare compute** — machine owners list idle capacity; small services and households buy it; the platform matches, meters, settles, and takes a fee. It does **not** own the machines, and it is **not** an LLM hosting product.

## Four participants

| Role | What they do |
|---|---|
| **Producers** (machine owners) | Run an agent; offer spare CPU/GPU/storage; earn **compute tokens** for work delivered |
| **Consumers** (buyers) | Spend tokens on hosted apps, backup, batch jobs — tokens earned from hardware or bought with money at the edge |
| **Service builders** | Package workloads priced in tokens (company first-party services seed demand; third parties later) |
| **Platform** | Scheduling, metering, settlement, trust/support — fee on settled volume |

```text
machine owners ──contribute──►  compute marketplace  ──runs──► services & workloads
      ▲                              │ metered in                     │
      └────────── earn tokens ◄──────┘ compute tokens ◄─── pay ───────┘
                     (sell / spend)          (buy with ordinary money at the edge)
```

## Compute tokens ≠ LLM tokens

| | Compute token (Infranet) | LLM token |
|---|---|---|
| Measures | Machine work delivered (runtime, normalized by hardware tier) | Text fragments in/out of a model |
| Analogy | Watt-hour | Word-count billing unit |
| Neutrality | Meter does **not** judge output quality | Often tied to model API pricing |

**Storage** and **bandwidth** sit beside runtime in native units (GB-month, GB transferred). Rate in today’s PoC: 1 token ≈ 1 CPU-millisecond (integer; min charge 1) — production adds benchmark tiers so a slow core-hour ≠ a fast one.

Why runtime metering:

1. Rewards efficient software (less work → lower price).
2. Keeps the platform outcome-neutral (bad prompts / wasted loops are the app’s problem — budgets, caps, reputation).
3. Makes heterogeneous garage hardware priceable instead of fatal.

## What runs on the network (V1 workloads)

Chosen to match garage hardware honesty (replication OK; five-nines SLA not sold):

- **Small-app hosting** — club sites, booking pages, light game servers
- **Household services** — photo/file backup across family boxes + network
- **Automation / batch** — scrapers, transcodes, scheduled workers (tolerate churn)

First-party services are **seed demand** so early producers have a real buyer before third parties show up.

## Isolation: VM airgap, not containers

Third-party jobs run in a **VM** on the volunteer host (micro-VM class: Firecracker / Cloud Hypervisor). Containers share the host kernel → rejected as the *primary* boundary. Containers remain fine *inside* the guest for packaging.

Threat model in one line: **“pay someone to run your virus”** (botnet-as-a-service with a receipt). Defense in depth:

1. Requester-side pre-screen (raises cost; will miss)
2. VM airgap (blast radius = guest)
3. Funded/identified accounts + deposit burn on abuse
4. Optional **restricted tier** — pure math / whitelisted kernels only (safest supply)

Guest egress is routed host-side (policy throttle/deny) — exact default-deny vs priced connectivity is still an open design item.

## Geography: latency domains

Match supply/demand inside **AZ-like latency domains** by default; cross-domain only for batch. Fine-grained RTT maps are location-sensitive telemetry → prefer coarse zones + aggregates.

## Money: piggyback, do not mint

Compute tokens are an **internal metering ledger**, not a crypto product. Cash enters/exits via agentic-commerce rails (whichever wins per geography):

- **Skyfire** / KYAPay — identity-linked spend authorization for agents
- **Google AP2** — signed intent/cart/payment mandates
- **OpenAI/Stripe ACP** — checkout / shared payment tokens
- Stablecoin M2M rails (e.g. x402-class) as optional settlement context

No public token sale; no inventing a currency. Whether the ledger ever needs a chain is a later engineering choice — SQLite/DB first.

## What exists today vs roadmap

| Layer | Today | Next (PoC v1) |
|---|---|---|
| Job → meter → ledger | `projects/infranet/poc/` on one machine | 3–5 machines, 3 workloads, monthly statements |
| Isolation | Process sandbox (`python -I`) | Micro-VM airgap |
| Metering | Self-reported inside sandbox | Host-side (cgroup/hypervisor) |
| Network / zones | None | Latency domains + replication |
| Settlement to money | None | Wallet-rail pilot (Skyfire conversation when ready) |

V2 (identity + age-gated communities) is deliberately **after** the marketplace works — see brief V2 section.

## How this solves the stated problems

| Problem | Mechanism |
|---|---|
| Idle PCs vs overpriced tiny workloads | Marketplace matches spare supply to small demand |
| Hyperscale billing / lock-in for small apps | Garage-shaped workloads + token prepaid feel |
| “Shared compute never became a business” | First-party demand + honest workload selection (not fake-AWS FLOPs) |
| Strangers’ code on home machines | Micro-VM + screening + accountability (not trust) |
| Settlement / payout invention | Ride Skyfire/AP2/ACP instead of minting a coin |

Cold start remains the historical killer — mitigated, not wished away: launch **one latency domain at a time**, company as customer #1, recruit homelab supply.
