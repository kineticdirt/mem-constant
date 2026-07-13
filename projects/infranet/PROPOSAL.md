# Infranet — Formal Proposal: Compute Tokens, Exchange, and Service Layer

**Status:** Proposal (design direction; not implemented as described here)  
**Date:** 2026-07-12  
**Project:** `projects/infranet/` · project id `infranet`  
**Related docs:** [README.md](./README.md), [AGENT-CHARTER.md](./AGENT-CHARTER.md), [PLANNING.md](./PLANNING.md), [COMPUTE_REWARDS.md](./COMPUTE_REWARDS.md), [BLOCKCHAIN_PLATFORM.md](./BLOCKCHAIN_PLATFORM.md), [COST_ANALYSIS.md](./COST_ANALYSIS.md)

This document is a **formal product/architecture proposal**. It builds on existing Infranet R&D (identity, storage, verification rewards) and focuses on what those pieces are *for*: a **compute-backed token economy** and the **services people actually pay for**—especially LLM and agent work—without requiring every transaction to go through cash.

It does **not** claim a live network, audited token, or production marketplace. Existing demos and tests under this folder are research spikes; treat this proposal as the directional north star for discussion and phased build-out.

---

## 1. Problem

### 1.1 What is broken today

Useful digital work—especially **inference, agents, verification, and coordination**—is gated by:

1. **Cash-first markets.** You buy GPU time or API credits with a card. People who *have* spare compute (a home GPU, idle servers, a fleet of phones) and people who *need* compute rarely meet without a company in the middle taking cut and setting terms.
2. **Opaque units.** “Credits,” “tokens,” and “API keys” are vendor-specific. They do not transfer cleanly between providers, and they do not represent a shared, checkable claim on work done.
3. **Services stuck to platforms.** Social apps, todo tools, funding platforms, and on-road data services each invent their own billing. There is no shared settlement layer that says: *this payment buys this kind of work, from whoever can prove they did it.*
4. **Trust without receipts.** When someone runs a model or relays a packet for you, proving *what* was delivered (and paying fairly) usually means trusting a vendor dashboard—not cryptographic or attested evidence.

### 1.2 What we already started (this repo)

Infranet’s earlier docs already sketch:

- Decentralized **identity** and **black-box verification** ([PLANNING.md](./PLANNING.md))
- A **compute marketplace** and **reward tokens** for verification/crypto work ([COMPUTE_REWARDS.md](./COMPUTE_REWARDS.md))
- A programmable **contract layer** aimed at real utility ([BLOCKCHAIN_PLATFORM.md](./BLOCKCHAIN_PLATFORM.md))

Those pieces answer *how nodes earn for network work*. This proposal answers the next question: **how compute becomes a currency people and services can trade**, and **how new apps settle against that currency**—including when nobody wants to involve a bank for every hop.

---

## 2. Goals

### 2.1 Primary goals

| ID | Goal | Success looks like |
|----|------|--------------------|
| G1 | **Define compute tokens cryptographically** | A token (or token classes) whose issuance and spend are tied to *attested compute or verified network work*, not to an unbacked marketing claim |
| G2 | **Trade without mandatory cash** | Consumers and producers can settle in compute tokens (earn by providing work; spend by consuming work). Cash on/off-ramps are optional, not the default path |
| G3 | **Service layer on the token** | Apps (starting with LLM/agent services) price and settle in the same unit |
| G4 | **User-defined paid services** | Anyone can publish a service that accepts (and/or pays in) tokens under clear terms—social, mobility, tools, arts funding, and later categories |

### 2.2 Non-goals (for this proposal)

- Replacing the global financial system or “killing banks”
- Guaranteeing free unlimited LLM access
- Shipping a new L1 tomorrow; we prefer a **phased** path (see §9)
- Hard-coding only the example apps in §7; the architecture must stay **extensible**

### 2.3 Design principles (human terms)

1. **Work backs value.** Tokens should track *useful attested work* (compute, storage, verification, relay)—not vibes.
2. **Cash is a bridge, not the product.** Fiat helps bootstrap and exit; the daily loop is token ↔ work.
3. **Receipts over promises.** Prefer signed job specs, attested results, and dispute rules over “trust our SaaS.”
4. **Ponytail growth.** Smallest working settlement loop first; identity/FHE ambitions from older docs stay available but are not blockers for a first marketplace spike.
5. **Honest limits.** Latency, hardware variance, and model quality differ by node. Pricing and SLAs must admit that.

---

## 3. Core idea (one paragraph)

**Infranet is a settlement and marketplace layer where the unit of account is *attested compute* (and related network work).** Producers earn tokens by performing verified jobs; consumers spend tokens to buy jobs (especially LLM inference and agent tasks); services built on top accept those tokens as payment so people can exchange *useful capacity* without every hop requiring cash. Crypto is used to **define, mint, transfer, and prove** those claims—not as decoration.

---

## 4. Architecture

### 4.1 Layers (what talks to what)

```
┌─────────────────────────────────────────────────────────────┐
│  Service apps (LLM gateway, social, mobility, tools, arts…) │
│  — publish offers, take payment in compute tokens           │
└───────────────────────────┬─────────────────────────────────┘
                            │ job specs + payments
┌───────────────────────────▼─────────────────────────────────┐
│  Exchange & marketplace                                      │
│  — match consumer ↔ producer; escrow; dispute; reputation    │
└───────────────────────────┬─────────────────────────────────┘
                            │ settle / mint / burn / transfer
┌───────────────────────────▼─────────────────────────────────┐
│  Token & attestation layer                                   │
│  — compute token(s); proofs of work/result; identity hooks   │
└───────────────────────────┬─────────────────────────────────┘
                            │ run jobs / report capacity
┌───────────────────────────▼─────────────────────────────────┐
│  Producer nodes (GPU/CPU, storage, short-range radios, …)    │
└─────────────────────────────────────────────────────────────┘
```

**Optional cash bridges** sit *beside* the exchange (buy tokens with fiat; sell tokens for fiat)—not inside every service call.

### 4.2 Actors

| Actor | Role |
|-------|------|
| **Consumer** | Needs work done (inference, storage, relay, funding pledge settlement, etc.) |
| **Producer** | Offers capacity (GPU, CPU, bandwidth, local sensors/radios, human curation time if attested) |
| **Service operator** | Builds an app that prices features in tokens and uses the marketplace under the hood |
| **Verifier / attestor** | Checks that a job result meets the job spec (can be other nodes, TEE attestation, spot-checks, or cryptographic proofs—depending on job class) |
| **Treasury / protocol** | Rules for minting, fees, and dispute—implemented as code + governance, not a black-box company account |

### 4.3 Job as the atomic object

Everything settles around a **job**:

1. **Offer** — producer advertises capacity (e.g. “Llama-class inference, ~X tokens/sec, region Y”)
2. **Request** — consumer (or service) posts a job spec (model/task, max price, deadline, privacy tier)
3. **Match** — marketplace matches or consumer picks
4. **Escrow** — consumer tokens locked
5. **Execute** — producer runs work; returns result + attestation
6. **Settle** — on accept (or timeout rules): tokens released to producer; optional fee to protocol/verifiers
7. **Dispute** — narrow window; verifiers or replay rules decide; reputation updates

This is the same spirit as [COMPUTE_REWARDS.md](./COMPUTE_REWARDS.md)’s marketplace, generalized from “verification nodes” to **any attested work class**, with LLM inference as the first high-demand class.

### 4.4 Relationship to existing Infranet docs

| Existing doc | Role relative to this proposal |
|--------------|--------------------------------|
| PLANNING / identity | Optional stronger identity for high-trust jobs and governance; not required for every anonymous cheap job |
| COMPUTE_REWARDS | Mechanically closest ancestor—rewards, resource ads, reputation |
| BLOCKCHAIN_PLATFORM | Candidate execution/settlement substrate (or replaceable with a thinner ledger in early phases) |
| COST_ANALYSIS | Engineering cost of crypto ops; keep separate from *market* prices of GPU time |

---

## 5. Token economics — defining compute tokens with crypto

### 5.1 What the token represents

**Working definition:** A **compute token** is a transferable claim that can be:

- **Earned** by completing attested jobs (or by protocol-approved issuance tied to staking/capacity proofs), and
- **Spent** to purchase jobs or service features that settle on the same ledger.

We deliberately allow **more than one token class** if needed (see §5.3), but the product story should feel like one currency: *you earn capacity, you spend capacity.*

### 5.2 Why “crypto” here (plain language)

Cryptography and a shared ledger are used for four boring, necessary jobs:

1. **Minting rules** — who can create tokens, and under what proof
2. **Ownership** — who can spend which balance
3. **Escrow** — lock payment until delivery conditions are met
4. **Auditability** — others can verify settlement history without trusting one company’s database

They are **not** used for hype cycles, memecoins, or “number go up” narratives. If a design choice only exists for speculation, it does not belong in Infranet’s core.

### 5.3 Token classes (directional)

| Class | Backing / issuance | Use |
|-------|--------------------|-----|
| **Work tokens (primary)** | Minted or unlocked when attested jobs complete (or prepaid escrow converts to producer balance) | Day-to-day pay for inference, storage, relay |
| **Stake / bond tokens** | Locked by producers (and maybe services) as skin-in-the-game | Slash on fraud; priority in matching |
| **Service vouchers (optional)** | Issued by a service for prepaid packages | UX sugar (e.g. “100 agent runs”) redeemable into work tokens or direct jobs |

Early phases can collapse this to **one fungible work token** plus simple stake locks. Split classes only when a real abuse case forces it.

### 5.4 Measuring “compute” without fake precision

Do **not** pretend one universal FLOP unit prices every job fairly. Prefer:

1. **Job-class meters** — e.g. for LLM: input/output token counts × model id × hardware tier; for storage: GB-month; for radio relay: packet-bytes × uptime.
2. **Posted prices** — producers name a rate in work tokens; market clears.
3. **Attestation suited to the class** — TEE quote, signed hash of outputs, random re-execution by verifiers, ZK where it actually pays for itself (identity/verification jobs from PLANNING), not ZK-for-everything.

Protocol fees and reward formulas in [COMPUTE_REWARDS.md](./COMPUTE_REWARDS.md) remain useful for *network-internal* verification work; marketplace jobs use **escrowed consumer payment** as the main economic signal.

### 5.5 Cash bridges (optional)

- **On-ramp:** fiat → work tokens (regulated entity or peer OTC—policy choice, out of scope for core protocol design).
- **Off-ramp:** work tokens → fiat.
- **Barter path (default story):** Producer earns tokens from jobs → spends tokens on LLM service / social boosts / tool subscriptions → those services pay *their* producers in tokens.

Cash never needs to touch a social like or a todo sync if both sides hold tokens.

### 5.6 Fees and sinks

Keep fee policy simple and explicit:

- Small **protocol fee** on settled jobs (funds verifiers, public goods, abuse response)
- Optional **burn** on spammy job posts or failed stake-slash events
- No hidden inflation: if the protocol mints, document *why* and *caps*

Exact percentages are **TBD** (open question §10); do not invent “guaranteed APY.”

---

## 6. Trading without cash — consumer ↔ producer loop

### 6.1 Happy path

1. Alice runs a GPU node; she stakes a bond and advertises inference capacity.
2. Bob’s note-taking agent needs a summarization job; his app escrows work tokens.
3. Alice’s node runs the job; attestation passes; escrow releases to Alice.
4. Alice later spends those tokens on a decentralized social feature or on more agent tools—**no card swipe**.

### 6.2 Matching modes

| Mode | When |
|------|------|
| **Spot market** | One-off jobs; price discovery |
| **Subscriptions / retainers** | Consumer locks tokens for recurring capacity from a producer or pool |
| **Pools** | Many small producers behind one service endpoint (LLM gateway pattern) |
| **Direct peer** | Known counterparties; marketplace only settles |

### 6.3 Reputation and quality

Cashless markets fail if quality is unpriced. Carry forward COMPUTE_REWARDS ideas:

- On-chain or gossip **reputation** from completed jobs and dispute outcomes
- **Bonds** that slash on proven fraud (wrong attestation, data theft policies, etc.)
- Service-level **tags** (latency tier, privacy tier, model allowlist)—consumers filter; not one global “trust score” theater

### 6.4 Privacy tiers (directional)

| Tier | Meaning |
|------|---------|
| **Public** | Job metadata and maybe outputs may be visible to network observers |
| **Encrypted transit** | Payload encrypted to producer; settlement still public |
| **Confidential compute** | Prefer TEE / MPC / similar when the job class justifies the cost |

LLM prompts often need at least encrypted transit; full FHE for every inference is usually the wrong first bet.

---

## 7. Service layer — especially LLM services

### 7.1 First-class service: LLM / agent gateway

**Why first:** Clear unit of work, huge demand, natural fit for spare GPU, and this workspace already cares about free-vs-paid model routing and correctness.

**Responsibilities of an Infranet LLM service:**

- Accept payment in work tokens (and optionally cash on-ramp for newcomers)
- Translate user requests into **job specs** (model, context limits, max price, privacy tier)
- Route to producers (local pool, home lab, or remote nodes)
- Return results with attestation sufficient for the chosen tier
- Expose both **human chat** and **agent/tool** APIs

**What it is not (initially):** a promise to beat every cloud provider on price, or a single global model monopoly.

### 7.2 How other services plug in

Any service that can define:

1. a **SKU** (what the user buys),
2. a **fulfillment job** (what producers do), and
3. **acceptance rules** (when escrow releases),

…can settle on Infranet. The token and exchange stay shared; apps stay independent.

### 7.3 Example services (illustrative, not exhaustive)

These are **directional product sketches** to pressure-test the settlement design—not a commitment to build all of them.

#### A. Decentralized social media

- **User pays with tokens for:** boosted reach, private group hosting, media storage, moderation labor pools, “run my feed ranking model.”
- **Producers earn by:** storing media, running ranking/moderation models, hosting relays.
- **Cashless angle:** creators earn tokens from tips/boosts → spend on hosting and agent mods.

#### B. On-road short-range comms (assist autonomy / awareness)

- **Idea:** vehicles (or roadside nodes) exchange short-range messages—hazard flags, congestion, presence of enforcement/emergency units—*as a decentralized mesh*, not a single corporate feed.
- **User pays with tokens for:** priority relay, authenticated alerts, map-layer subscriptions.
- **Producers earn by:** running radios/edge boxes, validating/relaying packets, providing attested sensor summaries.
- **Constraints (must be designed in):** legal compliance by jurisdiction, anti-harassment, no facilitation of violence or evasion of lawful process, strong anti-spoofing. Treat this as a **high-risk** vertical that needs policy and safety review before any prototype that touches public roads.
- **Architecture fit:** same job/escrow pattern; job class = “relay N authenticated packets with latency bound L.”

#### C. Todo apps / agent-powered tools

- **User pays with tokens for:** recurring agent runs (prioritize inbox, research a task, bookkeeping helpers), private sync storage, shared household agents.
- **Producers earn by:** running scheduled agent jobs and storing encrypted task graphs.
- **Cashless angle:** a student with a GPU earns tokens at night; spends them on daytime agent help.

#### D. Crowdsourcing arts funding

- **Patrons lock tokens** toward a project milestone; release on attested delivery (file hash, multisig accept, or curator vote).
- **Artists spend tokens** on compute for rendering, distribution storage, or commission agent outreach.
- **Cashless angle:** a digital artist earns from one piece → funds the next without converting to fiat each time.

#### E. More to come (extensibility)

Leave a deliberate **service registry** pattern:

- Manifest: name, SKU schema, job-class ids, payment addresses, policy URLs
- Versioned interfaces so new verticals do not fork the token
- Allow experimental services on testnets / home-stack first (this repo’s charter: R&D, not surprise production deploys)

---

## 8. Risks and mitigations

| Risk | Why it matters | Mitigation direction |
|------|----------------|----------------------|
| **Speculation dominates utility** | Token stops meaning “work” | Tie primary issuance to jobs; discourage empty mint; no yield theater in core docs |
| **Quality fraud** | Garbage inference, fake relays | Bonds, spot re-execution, reputation, service allowlists |
| **Privacy leaks** | Prompts and location data are sensitive | Privacy tiers; minimize metadata; encrypt payloads |
| **Regulatory / legal (esp. mobility)** | Road-safety and surveillance laws | Jurisdiction gates; delay public-road pilots; human review |
| **Complexity explosion** | FHE + custom L1 + social + cars at once | Ponytail phases (§9); reuse existing demos only as lessons |
| **Centralization of producers** | A few big GPU farms capture all jobs | Matching preferences for diversity; pool protocols; local-first defaults for home stack |
| **UX failure** | Users bounce if wallets/jobs feel hostile | Services hide ledger details; “balance = compute credit” metaphors |
| **Dispute griefing** | Endless challenges | Short windows, bonds to challenge, clear evidence rules per job class |

---

## 9. Phased roadmap

Honest sequencing. Dates are order-of-work, not promises.

### Phase 0 — Align & spike (now)

- Keep this proposal as the **service-economy** north star
- Reconcile with AGENT-CHARTER scope (network R&D vs agent-architecture side docs remain separate tracks unless merged later)
- One **smallest** settlement spike: local producer + consumer + escrow mock (even single-process) that moves a balance when a fake “inference job” completes—leave one runnable check

### Phase 1 — Work token + escrow MVP

- Fungible work token on a **chosen substrate** (existing Infranet chain sketch, or a thinner ledger—decide in open questions)
- Job spec schema for **LLM inference only**
- Escrow + settle + basic reputation file
- Optional: cash on-ramp as a manual/admin path for testers only

### Phase 2 — LLM service gateway

- HTTP/API gateway priced in tokens
- Producer daemon for home GPU / lab machines
- Attestation v1 (signed results + optional TEE if available)
- Feed lessons back into COMPUTE_REWARDS formulas

### Phase 3 — Second service vertical

- Pick **one** of: agent-todo tools, arts escrow, or social media storage/boost—whichever has a clear owner and test users
- Prove the registry/SKU pattern works for a non-LLM job class

### Phase 4 — Harder verticals & stronger crypto

- Stronger identity / black-box verification where the job class needs it (PLANNING.md track)
- Mobility / short-range mesh only after legal/safety review
- Multi-class tokens only if Phase 1–3 show a real need

### Phase 5 — Scale & governance

- Fee finalization, treasury rules, producer diversity incentives
- External audit of settlement and attestation assumptions
- Production promotion is **explicit**—per charter, not accidental

---

## 10. Open questions

Decide these before large implementation bets:

1. **Substrate:** custom chain from BLOCKCHAIN_PLATFORM vs existing public chain vs application-specific ledger for MVP?
2. **One token or many** at Phase 1?
3. **Attestation minimum** for paid LLM jobs (signature only vs TEE vs redundant execution)?
4. **Who runs cash on/off-ramps**, and in which jurisdictions?
5. **Governance:** who changes fee rates and job-class rules?
6. **Default privacy** for prompts and for location/mobility data?
7. **Naming in UX:** “compute credits” vs on-chain token jargon for end users?
8. **Scope merge:** how firmly this proposal supersedes older “identity-first” marketing in README vs remaining a parallel track?

---

## 11. What to review next (for humans)

When reading this proposal, please mark:

- [ ] Core idea (compute as tradable attested work) — agree / revise
- [ ] Cashless consumer↔producer loop — agree / revise
- [ ] LLM gateway as first service — agree / revise
- [ ] Example verticals (social, mobility, todos, arts) — keep / drop / re-prioritize
- [ ] Phase 0–1 spike shape — agree / propose different smallest slice

Feedback can land as ledger lines in `AI_GROUPCHAT.md` or as follow-up tasks under project id `infranet` in `agents/user-tasks.json`.

---

## 12. Document control

| Field | Value |
|-------|-------|
| Title | Infranet — Formal Proposal: Compute Tokens, Exchange, and Service Layer |
| Path | `projects/infranet/PROPOSAL.md` |
| Supersedes | Nothing (complements COMPUTE_REWARDS / PLANNING; does not delete them) |
| Implementation status | **Proposal only** |
