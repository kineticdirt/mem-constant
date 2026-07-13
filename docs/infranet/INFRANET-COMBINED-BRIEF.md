# Infranet — Combined Formal Brief

**Design · business feasibility · phased rollout — single canonical document**

| Field | Value |
|-------|-------|
| **Document type** | Combined formal brief (design + founder/business evaluation) |
| **Status** | Draft for human review — **not** a live product, fundraising deck, or implemented network |
| **Date** | 2026-07-12 (combined / reconciled 2026-07-13) |
| **Canonical path** | `docs/infranet/INFRANET-COMBINED-BRIEF.md` |
| **PDF** | `docs/infranet/INFRANET-COMBINED-BRIEF.pdf` (when generated) |
| **R&D tree** | `projects/infranet/` (demos + earlier architecture notes — **not deleted**) |
| **Project id** | `infranet` (`agents/user-tasks.json`) |
| **Audience** | Founder, advisors, multi-agent coordination |
| **Supersedes** | `INFRANET-DESIGN-PROPOSAL.md`, `INFRANET-BUSINESS-BRIEF.md` (stubs only) |

**How to read labels**

| Label | Meaning |
|-------|---------|
| **Decided** | Already true in this workspace / prior signed-off charter |
| **Proposed** | Design or policy choice for review; may change before any build |
| **Assumption** | Stated explicitly; change it and the conclusion may move |
| **Estimate** | Order-of-magnitude only; not audited market research |
| **Example** | Illustrative only — not a commitment to ship that product |
| **Demo-only** | From `COST_ANALYSIS.md` / in-repo spikes — not market GPU prices |

**Document map**

| Part | Contents |
|------|----------|
| **Verdict** | Recommendation up front |
| **I** | How it works (design: tokens, marketplace, services, architecture) |
| **II** | Business / market / unit economics / risks / rollout |
| **III** | Shared glossary, reconciled assumptions, recommendation checklist |
| **Appendix** | Sources, reconciliation notes, COST_ANALYSIS caveat |

---

## Verdict (read this first)

**Recommendation: Proceed-with-conditions** on founder time and R&D — **not** yet on external capital or a public network launch.

Infranet’s core thesis is sound as a *platform economics* story: monetize **coordination** (match, escrow, settlement, support) while **capacity stays on other people’s idle machines**, and grow by recruiting supply rather than buying a GPU fleet. That is a real structural advantage versus cloud CAPEX — *if* attestation, quality, and cold-start demand can be solved for at least one narrow job class (**LLM inference** is the strongest first bet).

It is **not** yet investable as a scaled marketplace: demos are placeholders, idle-hardware quality is uneven, regulation around tokens/on-ramps is non-trivial, and chicken-egg supply/demand will dominate the first 12–24 months. Conditions to continue are in Part III.

Demos under `projects/infranet/` are research spikes. Homelab pieces (linuxbox Hermes, free-first model routing, resource governance) are **related practice**, not the product itself.

---

# Part I — How Infranet works (design)

## I.1 One-sentence pitch

**Infranet** is a settlement and marketplace layer whose unit of account is **attested compute** (and related network work: storage, verification, relay). Producers earn by completing verified jobs on **hardware they already own**; consumers and apps spend those claims to buy work—especially **LLM and agent jobs**—so useful capacity can circulate **without every hop requiring cash**. The platform takes a **thin skim** for coordination; optional fiat on/off-ramps sit beside the exchange, not inside every service call.

## I.2 Business model in four moves

```text
1. SUPPLY     People (and labs) contribute unused/underused CPU/GPU/storage
              overnight or off-peak → producers earn compute tokens.

2. DEMAND     Users and apps buy work (esp. LLM/agent jobs) priced in tokens.
              Newcomers may buy tokens with cash (on-ramp); daily loop can stay
              token ↔ work without a card swipe each call.

3. APPS       Independent services (social, tools, funding, meshes…) pay a
              modest entry fee to list on the registry, then settle SKUs in tokens.

4. PLATFORM   Infranet Corp / founder operates coordination: matching, escrow,
              dispute, identity hooks, support, optional regulated on/off-ramps —
              funded by a small % of settled volume + app entry fees.
```

**Idle-hardware thesis (Assumption / Proposed):** the company does **not** buy a large hardware fleet. Scaling = more idle capacity online + better matching. Company spend is software, ops, compliance, and thin always-on coordination (which can itself start on a homelab).

## I.3 Actors

| Actor | What they do | How they pay / earn |
|-------|----------------|---------------------|
| **Producer** | Offers idle GPU/CPU/storage; runs jobs; posts attestation | Earns work tokens (minus slash risk on fraud) |
| **Consumer** | Buys inference, storage, agent runs, app features | Spends tokens (or cash → tokens once) |
| **App builder** | Publishes a paid service (SKU + fulfillment + acceptance rules) | Pays **entry fee**; settles in tokens; may take their own app margin |
| **Platform (Infranet)** | Match, escrow, dispute, registry, support, optional ramps | Skim on volume + entry fees + (later) premium support tiers |
| **Verifier** (optional) | Spot-checks / re-executes / attest rules | Small share of fees or protocol rewards |

## I.4 Problem / motivation

Useful digital work—especially inference, agents, verification, and coordination—is gated by:

1. **Cash-first markets.** Spare compute and demand rarely meet without a company in the middle taking a cut and setting terms.
2. **Opaque units.** Vendor “credits,” API keys, and platform points do not transfer cleanly.
3. **Services stuck to platforms.** Each app reinvent billing; no shared settlement that says *this payment buys this kind of attested work*.
4. **Trust without receipts.** Proving delivery usually means trusting a vendor dashboard.

This workspace already struggles productively with **resource governance** (search tokens, memory, free vs paid models, correctness). That experience is evidence of the *need*—not proof that Infranet already exists as a network.

| Prior material | What it covers | Status |
|----------------|----------------|--------|
| `projects/infranet/PLANNING.md` / `README.md` | Identity, black-box verification (FHE/MPC/ZKP sketch), NFC/mobile | Earlier architecture notes |
| `projects/infranet/COMPUTE_REWARDS.md` | Marketplace, rewards, reputation, network-internal tokenomics | **Closest ancestor** |
| `projects/infranet/BLOCKCHAIN_PLATFORM.md` | IVM / InfranetScript sketch | Sketch |
| `projects/infranet/COST_ANALYSIS.md` | Gas/compute-unit cost models for crypto ops | **Demo-only** ≠ market GPU price |
| Python/Rust demos & tests | In-memory blockchain, identity, marketplace lifecycle | **Placeholders**, not real FHE |
| Potato `BASELINE.md` (SSH-verified 2026-07-12) | Source-trace of demo behavior | Confirms no live crypto |

## I.5 Vision and goals

> You should be able to **earn** compute by offering capacity you already own, **spend** it on LLM/agents and other services, and **build new paid apps** on the same unit—without forcing a card swipe for every like, relay, or agent run—while the platform takes only a thin coordination skim.

| ID | Goal | Success looks like |
|----|------|--------------------|
| G1 | **Crypto-defined compute tokens** | Issuance and spend tied to attested compute / verified network work |
| G2 | **Cashless trade** | Consumer ↔ producer settle in tokens; fiat bridges optional |
| G3 | **Service layer** | Apps (esp. LLM/agent) price and settle in the same unit |
| G4 | **User-defined paid services** | Publish a service that accepts/pays tokens under clear terms |

**Non-goals:** replacing banks; guaranteeing free unlimited LLM; shipping a new L1 tomorrow; hard-coding only the example apps; treating linuxbox/Hermes as production Infranet.

**Design principles**

1. **Work backs value.** Tokens track useful attested work—not vibes.
2. **Cash is a bridge, not the product.** Daily loop is token ↔ work.
3. **Receipts over promises.** Signed job specs, attested results, dispute rules.
4. **Ponytail growth.** Smallest working settlement first; FHE/identity ambitions stay available but are not MVP blockers.
5. **Honest limits.** Hardware, latency, and model quality vary; pricing must admit that.

**Decided** near-term honesty: ship the smallest settlement loop that moves a balance when a real or mocked inference job completes. Per `AGENT-CHARTER.md`, this remains R&D until explicitly promoted.

---

## I.6 Pillar 1 — Crypto-defined compute tokens

### Working definition (**Proposed**)

A **compute token** is a transferable claim that can be:

- **Earned** by completing attested jobs (or by protocol-approved issuance tied to staking / capacity proofs), and
- **Spent** to purchase jobs or service features that settle on the same ledger.

| It is | It is not |
|-------|-----------|
| A ledger claim usable to buy attested work | A memecoin or “number go up” product |
| Earned primarily by doing (or escrowing for) real jobs | A promise of free unlimited LLM access |
| Bridged to cash at the edge when users need it | Mandatory cash on every micro-action |

### What cryptography is for

| Job | Why crypto / ledger |
|-----|---------------------|
| **Minting rules** | Who can create tokens, under what proof |
| **Ownership** | Who can spend which balance |
| **Escrow** | Lock payment until delivery conditions are met |
| **Auditability** | Settlement history without trusting one company’s database |
| **Attestation hooks** | Tie release of funds to evidence of work |

### Issuance, mint, burn (**Proposed** — reconciled)

Two issuance modes can coexist; Phase 1 picks one primary story:

1. **Escrow-transfer model (preferred for marketplace):** Consumer locks tokens → producer delivers attested work → escrow releases. Net supply unchanged; tokens move consumer → producer (minus platform skim).
2. **Work-mint model (protocol bootstrap):** Protocol mints a capped amount to producers on attested *network-internal* work (verification, consensus, storage integrity)—spirit of `COMPUTE_REWARDS.md` §3–§6.

**Burn / sinks:** small **platform skim** on settled jobs (see Part II / reconciled fee table); optional burn on spam or slash events. No hidden inflation.

**Reconciled:** the historical `COMPUTE_REWARDS.md` §6.1 split (**40/30/15/10/5**) applies only to *network-internal* reward sketches — **not** locked for the service marketplace or corporate P&L.

### Token classes (**Proposed**; Phase 1 may collapse)

| Class | Backing / issuance | Use |
|-------|--------------------|-----|
| **Work tokens (primary)** | Minted/unlocked on attested completion, or escrow → producer | Day-to-day pay for inference, storage, relay |
| **Stake / bond** | Locked by producers (and maybe services) | Slash on fraud; matching priority |
| **Service vouchers (optional)** | Issued by a service for prepaid packages | UX sugar redeemable into work tokens or jobs |

**Proposed MVP:** one fungible work token + simple stake locks.

### Measuring “compute” without fake precision (**Proposed**)

Do **not** pretend one universal FLOP unit prices every job fairly. Prefer:

1. **Job-class meters** — LLM: input/output tokens × model id × hardware tier; storage: GB-month; relay: packet-bytes × uptime.
2. **Posted prices** — producers name a rate; market clears.
3. **Attestation suited to the class** — signed result hash, TEE, random re-execution, ZK where it pays.

### Wallets and cash bridges (**Proposed**)

- Ledger accounts (keypair-backed) for balances and escrow.
- Services may hold treasury / payout accounts.
- UX may hide chain jargon (“compute credits”) while the ledger records ownership.
- **Decided:** no secrets, private keys, or seed phrases in repo docs or git.
- **On-ramp / off-ramp:** optional; regulated entity or peer OTC — policy choice. Default story: earn overnight → spend daytime → cash only when someone wants fiat.

---

## I.7 Pillar 2 — Trading without mandatory cash

### Atomic transaction (happy path)

1. Producer stakes a bond and advertises capacity (model tier, latency, privacy).
2. Consumer or app **escrows** work tokens against a job spec.
3. Producer executes; returns result + attestation.
4. Escrow **releases** to producer; platform skim and optional verifier fee peel off.
5. Producer spends tokens on other apps / agent tools — **cash optional**.

Same pattern for every vertical: only the **job class** and **acceptance rules** change.

### Job as the atomic object (**Proposed**)

Offer → Request → Match → Escrow → Execute → Settle → Dispute (short window; reputation updates).

### Matching modes (**Proposed**)

| Mode | When |
|------|------|
| Spot market | One-off jobs; price discovery |
| Subscriptions / retainers | Locked tokens for recurring capacity |
| Pools | Many small producers behind one gateway (LLM pattern) |
| Direct peer (P2P) | Known counterparties; marketplace only settles |

### Reputation, privacy, cashless peer exchange (**Proposed**)

- Reputation from completed jobs and dispute outcomes; bonds that slash on fraud.
- Privacy tiers: Public → Encrypted transit → Confidential compute (TEE/MPC when priced in). LLM prompts usually need at least encrypted transit; full FHE for every inference is the wrong first bet.
- Work ↔ work, OTC, and service-mediated flows need **no** fiat conversion API per trade.

---

## I.8 Pillar 3 — Services on the token (especially LLM)

### First product: LLM / agent gateway (**Proposed**)

**Why first:** Clear unit of work, huge demand, natural fit for spare GPU, dogfoodable on this stack.

**Gateway responsibilities:** accept payment in work tokens; translate to job specs; route to producers; return attested results; expose human chat and agent/tool APIs.

**What it is not (initially):** a promise to beat every cloud provider on price, or a single global model monopoly.

**Analogy (not product):** Hermes free-first → paid fallback is a *routing policy*. Infranet would turn “who gets paid for which inference” into a **settled job** with a token balance.

| Element | Detail |
|---------|--------|
| SKU examples | Chat completion, embed batch, agent tool loop (max N steps) |
| Meter | Tokens in/out × model id × tier |
| Producer | Home GPU daemon, lab box, or pool operator |
| Settlement | Escrow → attest → release |
| Failover | Next producer on SLA miss; partial refund rules per SKU |

Any service that defines a **SKU**, a **fulfillment job**, and **acceptance rules** can settle on Infranet.

**Adjacent examples:** encrypted storage (GB-month); verification labor; relay/bandwidth for mesh apps.

---

## I.9 Pillar 4 — User-defined paid services

Illustrative verticals—**Examples**, not a commitment to build all of them.

| Vertical | Pay tokens for | Earn by | Notes |
|----------|----------------|---------|-------|
| Decentralized social | Boosts, hosting, media store, mod labor, ranking runs | Store/relay/moderate | Cashless tips → hosting |
| Road / short-range mesh | Priority relay, authenticated alerts, map layers | Radios/edge boxes, attested sensors | **High-risk** — legal/safety before any public-road pilot |
| Todo / agent tools | Recurring agent runs, private sync | Scheduled jobs + encrypted storage | Earn night / spend day |
| Arts crowdfunding | Milestone locks | Render, distribution, outreach | Escrow on attested delivery |

### Service registry (**Proposed**)

- Manifest: name, SKU schema, job-class ids, payment addresses, policy URLs
- Versioned interfaces so new verticals do not fork the token
- **Paid entry fee** (cheap, not free-subsidized)—filters spam; early platform oxygen
- **Reconciled timing:** charge entry fees only after the LLM gateway has real external usage (Phase 3) — do not subsidize a ghost registry (see Part III conditions)

```text
User wallet ──escrow──► Service treasury / job escrow
                              │
                              ▼
                     Producer executes + attests
                              │
                              ▼
                     Settle → producer wallet (+ optional fees)
```

---

## I.10 Architecture sketch

```mermaid
flowchart TB
  subgraph apps [Service apps]
    LLM[LLM / agent gateway]
    Social[Social / media]
    Road[Road / mesh relay]
    Todo[Todo / agents]
    Arts[Arts escrow]
    More[Future services…]
  end

  subgraph market [Exchange and marketplace]
    Match[Match / pools]
    Escrow[Escrow]
    Dispute[Dispute / reputation]
  end

  subgraph token [Token and attestation]
    WorkTok[Work tokens]
    Stake[Stake / bonds]
    Attest[Attestation rules]
  end

  subgraph nodes [Producer capacity]
    GPU[GPU / CPU inference]
    Store[Storage]
    Radio[Short-range radios]
    Verify[Verifiers / attestors]
  end

  Cash[Optional fiat on/off-ramp]

  apps --> Match
  Match --> Escrow
  Escrow --> WorkTok
  Escrow --> Attest
  Attest --> nodes
  nodes --> Escrow
  Stake --> Match
  Cash -.-> WorkTok
  Dispute --> Stake
  Dispute --> WorkTok
```

| Layer | Prior docs | This brief |
|-------|------------|------------|
| Identity / black-box verify | PLANNING, RESEARCH | Optional strength for high-trust jobs |
| Programmable substrate | BLOCKCHAIN_PLATFORM (IVM sketch) | One substrate option among several (**open question**) |
| Network-internal rewards | COMPUTE_REWARDS | Feeds issuance/reputation; marketplace payment is consumer escrow |
| Service economy | *(this doc)* | North star for *why* tokens exist |

---

## I.11 Trust, security, and abuse (**Proposed**)

| Threat | Direction |
|--------|-----------|
| Fake work / garbage inference | Bonds, spot re-execution, allowlists, reputation |
| Spam job posts | Posting deposits / burns; rate limits |
| Sybil producers | Stake, identity for high-trust tiers, diversity-aware matching |
| Griefing disputes | Short windows; bond to challenge; clear evidence rules |
| Speculation-first token | Tie primary issuance to jobs; no yield theater in core |
| Double-spend | Single ledger; escrow locks before work; settlement is source of truth |
| Centralization of supply | Diversity-aware matching; small-producer pools; honest UX |
| Mobility / surveillance | Delay public-road pilots; jurisdiction gates; no evasion tooling |

Carry forward abuse list from `COMPUTE_REWARDS.md` §8 (Sybil, collusion, free-riding, result manipulation, resource inflation).

---

## I.12 Open design questions

1. **Substrate:** custom chain vs public chain vs thin application ledger for MVP?
2. **One token or many** at Phase 1?
3. **Attestation minimum** for paid LLM jobs (signature only vs TEE vs redundant execution)?
4. **Who runs cash on/off-ramps**, and where?
5. **Governance:** who changes fees and job-class rules?
6. **Default privacy** for prompts and for location/mobility data?
7. **UX naming:** “compute credits” vs on-chain jargon?
8. **Scope merge:** does compute-as-currency supersede identity-first README marketing, or stay parallel? (`user-tasks.json` asks for charter reconcile.)
9. **First spike owner:** PC lab vs potato always-on vs both?

---

# Part II — Business, market, feasibility, and rollout

## II.1 Market opportunity

### Problem the market already feels

1. Spare capacity is wasted (consumer/prosumer GPUs idle nights/weekends).
2. Demand for inference is surging — cash-gated via cloud vendors and API aggregators.
3. Billing is opaque and non-portable.
4. Building a paid app means reinventing payment + infra every time.

Infranet attacks (3)+(4) with shared settlement, and (1)+(2) by matching idle supply to inference demand without company-owned fleets.

### Market framing (**Estimate** / **Assumption**)

Figures are order-of-magnitude planning bands — not a commissioned TAM study.

| Layer | Scope | Estimate band | Notes |
|-------|--------|---------------|-------|
| **TAM (loose)** | Global cloud + GPU rental + decentralized compute + LLM API spend | **High tens of billions USD/year** | Ceiling only |
| **SAM** | Spot / flexible GPU inference + peer compute markets + indie LLM gateway spend | **Low–mid single-digit billions USD/year** | Overlaps Render/Akash/Golem/cloud spot and OpenRouter-like gateways |
| **SOM (5-year, conditional)** | Attested idle-GPU inference + a handful of token-settled apps in reachable communities | **$1M–$30M/year GMV** settled; platform revenue = skim + entry fees → likely **well under $1M** early | Cold-start capped; not a Series-A fantasy |

**Assumption:** SOM assumes successful Phase 0–2 and **does not** assume winning against AWS/GCP on enterprise SLA.

## II.2 Competitive landscape

| Player / pattern | What they optimize | Overlap | Differentiation to claim |
|------------------|--------------------|---------|---------------------------|
| Hyperscale cloud GPU | CapEx fleets, enterprise SLA | Reliable inference | No fleet CAPEX; cashless micro-settlement across apps |
| GPU rental / render nets | Artists & batch GPU | Idle GPUs | General **job escrow + multi-app currency** |
| Decentralized compute (Akash, Golem, …) | Container/VM markets | Closest cousins | **Service registry + user-defined paid apps**; LLM gateway as first product story |
| Storage / data markets | Storage proofs | Adjacent capacity | Later job class; not the first wedge |
| LLM gateways (OpenRouter-style) | Model routing, API UX | Demand-side UX | Portable compute claims; producers can be homes |
| Points / credits inside SaaS | Lock-in billing | Psychological competitor | Portability + open app registry |

**Positioning (**Proposed**):** Infranet is not “cheaper AWS.” It is a **thin settlement OS for attested work**, with idle hardware as the supply engine and paid apps as the demand engine.

**Platform test:** Infranet is a *platform* when a third-party app can (1) pay entry fee, (2) define SKUs + job classes, (3) settle without forking the token, (4) rely on shared producers. Until (4) holds for ≥2 apps, call it a **product with platform ambition**. If only one LLM gateway ever works, the platform thesis fails (narrow product may still be worth pursuing under a smaller ambition).

## II.3 Value proposition by stakeholder

| Stakeholder | Value |
|-------------|--------|
| **Producers** | Monetize machines already bought; overnight earnings; spend in-ecosystem without cashing out |
| **Consumers** | Potentially cheaper/flexible inference; portable balance across apps; cash optional after on-ramp |
| **App builders** | Skip reinventing wallets/escrow; paid entry keeps spam down; SKUs in one currency |
| **Platform** | Asset-light growth; revenue from skim + entry fees; alignment with volume rather than owning GPUs |

## II.4 Unit economics (**Proposed** — reconciled)

### Reconciled fee / token policy (single source of truth)

| Parameter | Working band | Status | Rationale |
|-----------|--------------|--------|-----------|
| **Platform skim** on settled job volume | **0.05%–0.5%** | **Proposed** | Infrastructure cut; stay below painful 15–30% marketplace rents |
| Working point for illustrations | **~0.2%** | **Example** | Used only for sensitivity math below |
| Verifier / dispute share | Split from skim or tiny add-on | **Proposed** | Pay for integrity without bloating price |
| App registry **entry fee** | **Paid, not free** — **Example $50–$500** one-time or annual (or token-equivalent) | **Proposed** | Filters spam; early cash oxygen |
| When entry fees start | **Phase 3** — after gateway has real external usage | **Proposed / reconciled** | Do not subsidize a ghost registry |
| Network-internal reward split | 40/30/15/10/5 in `COMPUTE_REWARDS.md` | **Sketch only** | Not corporate P&L; not service-marketplace fees |
| Token ↔ compute pricing | Job-class meters + posted rates | **Proposed** | No fake universal FLOPs |
| `COST_ANALYSIS.md` (1 token ≈ $0.01, tasks ~$0.10–$1) | Demo ledger arithmetic | **Demo-only** | Not market GPU-hour or revenue forecast |

**Illustrative math (**Assumption**):**  
If annual settled GMV = $10M and skim = 0.2%, platform take ≈ **$20k/year** — too thin alone. Early viability **depends on app entry fees + focused gateway usage**, not skim. Skim becomes meaningful only at much larger GMV (**Assumption:** $500M+ GMV × 0.2% ≈ $1M — far beyond SOM without a breakout).

**Implication (reconciled):** treat skim as **alignment + long-term upside**; treat **entry fees + optional premium coordination** as **near-term oxygen**.

### When cash enters

1. App entry fee → corporate treasury (cash or prepaid tokens).  
2. Consumer on-ramp → tokens under policy.  
3. Producer off-ramp → tokens → fiat (compliance-gated).  
4. Volume skim → mostly tokens initially; convert for ops.  
5. Day-to-day job settle → **no** cash (token escrow → release).

### Company cost structure

| Cost | Nature |
|------|--------|
| Software (ledger, gateway, producer daemon, registry) | Primary build cost |
| Always-on coordination hosts | Small vs GPU fleets; can start on existing linuxbox/PC |
| Support, dispute ops | Scales with users |
| Compliance / legal (ramps, mobility) | Spiky; do not defer forever |
| Marketing | Needed for cold start; avoid burning cash on free app subsidies |

**Non-cost (by design):** owning and refreshing a large GPU fleet.

### Sensitivity

| If this is wrong… | Then… |
|-------------------|--------|
| Idle GPUs cannot meet quality/SLA | Gateway must blend pools + cloud fallback → margin compresses; thesis weakens |
| Users refuse any token UX | Product becomes “credits” UI over ledger — still OK if settlement stays portable |
| Skim stays tiny and apps refuse entry fees | No business — park or become pure open-source protocol |
| Only LLM gateway works | Narrow company, not platform — may still be worth a focused product |

## II.5 Risks and mitigations

| Risk | Why it matters | Mitigation direction |
|------|----------------|----------------------|
| **Cold start / chicken-egg** | No producers ↔ no jobs | Closed start: friends’ GPUs + one paid demand source; paid app entry only after gateway works |
| **Quality of idle hardware** | Throttling, flaky uptime, malware | Tiers, bonds, reputation, allowlists, spot re-execution; honest UX (not “enterprise SLA”) |
| **Fraud / fake work** | Garbage inference | Escrow + attestation ladder; slash stakes |
| **Trust & privacy** | Prompts on strangers’ PCs | Privacy tiers; encrypted transit default for LLM |
| **Regulation** | Token as security?, money transmission | Delay public ramps; legal review before public token sales |
| **Centralization of supply** | Farms capture matching | Diversity-aware matching; transparent capture metrics |
| **Speculation capture** | Token detaches from work | Issuance tied to jobs/escrow; no yield theater |
| **Road/mobility vertical** | Legal/safety landmine | Explicitly late; policy review before public-road pilot |
| **Founder bandwidth** | Competing live stack | Phase gates; one spike owner; R&D charter |

## II.6 Vertical priority

| Priority | Vertical | Why / why not |
|----------|----------|---------------|
| **P0** | LLM / agent gateway | Clear meter, huge demand, fits idle GPU, dogfoodable |
| **P1** | Agent-powered todos / household tools | Earn night / spend day; lower regulatory heat |
| **P1** | Arts crowdfunding + render | Escrow milestones + GPU; shared settlement vs Render-only |
| **P2** | Decentralized social | Network effects if settlement sticks; moderation hard |
| **P3** | Encrypted storage / verification labor | Complements identity track; slower consumer story |
| **Defer** | Road / short-range awareness mesh | High legal/safety risk — architecture-compatible, product-late |

## II.7 Phased roadmap (**Proposed** — reconciled design + GTM)

Dates are **order of work**, not calendar promises. Ponytail: smallest correct slice first.

| Phase | Name | Goals | Verify | GTM |
|-------|------|-------|--------|-----|
| **0** | Homelab truth (now) | Smallest settlement loop; optional meter one OpenRouter/local call against mock ledger; align this brief | One runnable check in `projects/infranet/` | None public — founder + agents |
| **1** | Friends & family supply | Work token + escrow on chosen substrate (thin ledger OK); LLM job class only; manual cash on-ramp for testers | 3–10 producer nodes; signed results | Invite-only Discord/Tailscale |
| **2** | Niche LLM gateway | HTTP/API gateway priced in tokens; installable producer daemon; attestation v1 + failure/refund rules | External test users finish real chats/agent loops | One niche (agent builders / dogfood); compete on portable settlement + idle supply — not GPT latency |
| **3** | First non-LLM app + paid entry | Pick **one**: agent-todo, arts escrow, or social storage/boost; charge entry fee; prove earn-night / spend-day path | Registry/SKU works; fee received; ≥1 real cashless cross-app path | Builders wanting paid features without Stripe-per-micro-action; **keep mobility out** |
| **4** | Harder verticals / stronger crypto | Identity/black-box where trust pays; multi-class tokens only if needed; mobility only after legal review | Policy gates cleared | Cautious |
| **5** | Scale & governance | Fee finalization, treasury rules, external audit, explicit production promotion per `AGENT-CHARTER.md` | Audit + promotion decision | Public cautious open |

```text
Homelab spike → Friends’ GPUs → Niche LLM gateway → Paid app #2 → Public cautious open
     ↑_______________ supply side growth (idle capacity) _______________|
```

**Homelab vs long-term:** Phases 0–2 can live on PC + linuxbox without claiming a public network. Phases 3–5 need deliberate promotion.

---

# Part III — Glossary, assumptions, recommendation

## III.1 Shared glossary

| Term | Meaning in this brief |
|------|------------------------|
| **Work token** | Fungible ledger claim used to buy attested jobs / service SKUs |
| **Escrow** | Tokens locked until acceptance rules say the job is done |
| **Attestation** | Evidence of work (signature, TEE quote, re-execution, ZK where justified) |
| **Platform skim** | Tiny % of settled volume paid to Infranet for coordination |
| **Entry fee** | Paid cost for an app to list on the service registry |
| **Job class** | Category of work with its own meter, attestation, and dispute rules |
| **SKU** | User-facing purchasable feature that creates one or more jobs |
| **Producer / consumer** | Supply node vs demand side (user or app) |
| **On/off-ramp** | Optional fiat ↔ token bridge at the edge |
| **Substrate** | Where the ledger lives (custom chain, public chain, or thin app ledger) |

## III.2 Reconciled assumptions (do not fork these)

| # | Assumption | Source of truth |
|---|------------|-----------------|
| A1 | Company does **not** CAPEX a large GPU fleet; growth = idle supply online | Parts I–II |
| A2 | Skim band **0.05%–0.5%** of settled job volume (illustrative mid **~0.2%**) | Part II.4 |
| A3 | Near-term oxygen = **entry fees + gateway usage**; skim is long-term alignment | Part II.4 |
| A4 | Entry fee **Example $50–$500**; charged from **Phase 3** after real gateway usage | Part II.4 / II.7 |
| A5 | MVP = **one work token** + simple stakes; escrow-transfer preferred over work-mint for marketplace | Part I.6 |
| A6 | `COMPUTE_REWARDS` 40/30/15/10/5 and `COST_ANALYSIS` $0.01/token math are **not** market or P&L policy | Part II.4 / Appendix B |
| A7 | First wedge = **LLM / agent gateway**; mobility deferred | Part II.6 |
| A8 | Demos / Hermes / resource-governance practice ≠ live Infranet product | Verdict / Part I.4 |
| A9 | TAM/SAM/SOM figures are **Estimate** bands for founder judgment | Part II.1 |
| A10 | Production requires **explicit** promotion per `AGENT-CHARTER.md` | Part II.7 Phase 5 |

## III.3 Recommendation

### Decision

| Option | Meaning | Choice |
|--------|---------|--------|
| **Proceed** | Full public build / raise now | No |
| **Proceed-with-conditions** | Continue R&D and Phase 0–2 under gates | **Yes** |
| **Park** | Stop until market/timing changes | No (not yet) |

### Conditions to keep going

1. **Ship Phase 0 settlement spike** with one runnable check (balance moves on job complete).  
2. **Pick substrate** for Phase 1 (thin app ledger vs public chain) — decide explicitly; do not boil the ocean on IVM first.  
3. **LLM-only** until escrow+attestation hold under friend-group load.  
4. **No public token sale / open on-ramp** until legal review.  
5. **Paid app entry** only after gateway has real external usage — do not subsidize a ghost registry.  
6. **Time-box founder hours** against higher-priority live stack work; Infranet stays charter R&D until promoted.  
7. Revisit go/no-go after Phase 2 with metrics: jobs settled, producer uptime distribution, dispute rate, willingness to pay entry fee.

### Would you invest time?

**Yes — bounded time.** The economics story (idle supply + thin coordination skim + paid apps on shared settlement) is a coherent platform bet and matches how this stack already thinks about metered compute. Worth a **ponytail R&D track** through Phase 0–1 and a harsh Phase 2 review.

**Not yet — unbounded time or capital.** Without quality attestation and a real demand wedge, this becomes another underused decentralized compute paper.

### Human review checklist

- [ ] Core idea (compute as tradable attested work) — agree / revise  
- [ ] Business model (idle supply + skim + entry fees) — agree / revise rates  
- [ ] Cashless consumer ↔ producer loop — agree / revise  
- [ ] LLM gateway as first wedge — agree / change  
- [ ] Example verticals (social, mobility, todos, arts) — keep / drop / re-prioritize  
- [ ] SOM honesty / competitive framing — agree / revise  
- [ ] Phase 0–1 spike shape — agree / propose different smallest slice  
- [ ] Proceed-with-conditions — accept / park / proceed harder  
- [ ] Phase 0 spike owner (PC vs potato vs both)

Feedback: `AI_GROUPCHAT.md` ledger lines, or project `infranet` in `agents/user-tasks.json`.

---

# Appendix A — Source map

| Path | Role |
|------|------|
| `docs/infranet/INFRANET-COMBINED-BRIEF.md` | **This document — canonical** |
| `docs/infranet/INFRANET-DESIGN-PROPOSAL.md` | Stub → combined |
| `docs/infranet/INFRANET-BUSINESS-BRIEF.md` | Stub → combined |
| `docs/infranet-proposal.md`, `projects/infranet/PROPOSAL.md` | Stubs → combined |
| `projects/infranet/COMPUTE_REWARDS.md` | Marketplace, reputation, historical token split |
| `projects/infranet/COST_ANALYSIS.md` | Demo gas/token cost shapes (**Demo-only**) |
| `projects/infranet/PLANNING.md` | Identity / FHE-MPC-ZKP ambition (optional strength) |
| `projects/infranet/BLOCKCHAIN_PLATFORM.md` | Substrate sketch (open question) |
| `projects/infranet/AGENT-CHARTER.md` | R&D vs production promotion |
| `projects/infranet/README.md` | Project overview (identity-first heritage + pointer here) |
| `.cursor/rules/resource-governance.mdc` | Related practice — not the product |

Research under `projects/infranet/` is **retained**; this brief does not delete it.

### Evidence notes (2026-07-12 research pass)

- PC `projects/infranet/` holds the full R&D tree; Desktop sibling `MAIN_PROGRAMMING_FILES/Infranet/` was transferred 2026-06-28.
- Potato SSH confirmed `BASELINE.md`: FHE/MPC/ZKP are type labels in Python demos, not implementations.
- No laptop-kit Infranet product brief found in searchable paths that session; do not invent laptop content.

---

# Appendix B — COST_ANALYSIS caveat (explicit)

`COST_ANALYSIS.md` examples (identity registration ≈ $0.02, simple transfer ≈ $0.21, FHE task rewards ≈ $0.10–$1.00 under **1 token = $0.01**) describe **demo ledger economics**, not:

- market price of an NVIDIA GPU-hour,  
- OpenRouter token prices, or  
- Infranet Corp revenue forecasts.

Use them to sanity-check that **protocol operations can be cheap relative to useful work** if the substrate cooperates — then price marketplace jobs from **posted producer rates**.

---

# Appendix C — Reconciliation log (design ↔ business)

| Topic | Design proposal said | Business brief said | Combined resolution |
|-------|----------------------|---------------------|---------------------|
| Platform skim | 0.05%–0.5% | 0.05%–0.5% | **Identical** — kept |
| Entry fee amount | “Cheap, not free” | Example $50–$500 | Adopt business band as **Example** |
| Entry fee timing | Implied at registry launch | Phase 3 after gateway usage; condition G.2.5 | **Business timing wins** |
| Idle hardware / CAPEX | No fleet; supply-side growth | Same | **Identical** |
| Token MVP | One work token + stakes; escrow preferred | Same | **Identical** |
| COMPUTE_REWARDS split | Historical sketch, not locked | Sketch only, not P&L | **Identical** — labeled Demo/sketch |
| Roadmap phases | 0–5 design slices | 0–5 with GTM verify columns | **Merged** into one phase table (II.7) |
| Recommendation | (design had review checkboxes only) | Proceed-with-conditions | **Business recommendation** is canonical |
| First product | LLM gateway | LLM gateway P0 | **Identical** |
| Mobility | Example vertical, high-risk late | Defer | **Defer** until legal/safety review |

---

## Document control

| Field | Value |
|-------|-------|
| Title | Infranet — Combined Formal Brief |
| Canonical path | `docs/infranet/INFRANET-COMBINED-BRIEF.md` |
| Supersedes | `INFRANET-DESIGN-PROPOSAL.md`, `INFRANET-BUSINESS-BRIEF.md` (now stubs) |
| Implementation status | **Proposal / brief only** |
| Recommendation | **Proceed-with-conditions** |
