# Infranet — Pitch Brief

**Garage compute, verified people, and the services built on both.**

*Draft for review · 2026-07-13 · a proposal, not a live product or an active fundraise. Canonical path `docs/infranet/INFRANET-COMBINED-BRIEF.md`; research tree at `projects/infranet/` (retained). This is a story-first rewrite of the earlier table-heavy brief, incorporating reviewer feedback.*

---

## The problem

The developed world is full of computers that do almost nothing. Gaming PCs that work hard four hours a week. Office desktops that sleep sixteen hours a day. Last generation's laptop in a drawer, the mini-PC bought for one project, the home server that finished its job years ago. Each of these machines is more capable than most of the cloud instances people actually rent, and each sits idle the overwhelming majority of the time.

Meanwhile, the same households and small groups pay rent to run tiny things. A club website. A forty-person game community. A family photo archive. The booking page for a two-chair barbershop. None of this needs a datacenter. Almost all of it ends up on one, because the alternatives are worse: hyperscale clouds are priced and designed for enterprises, with billing complexity and surprise invoices to match, and the "free" option means moving your community into an ad-funded platform that owns the rules, the data, and the exit.

There is a second problem sitting next to the first, and it is getting urgent. The internet still has no native way to prove that someone is a real, single human being of a certain age without photocopying their life for every website that asks. Regulators have stopped waiting. Australia's under-16 social media ban took effect on 10 December 2025, with penalties up to A$49.5 million for platforms that fail to keep children out ([eSafety Commissioner](https://www.esafety.gov.au/about-us/industry-regulation/social-media-age-restrictions)). UK services have had to run "highly effective" age assurance under the Online Safety Act since July 2025, and a wave of similar laws is moving through the US states, the EU, and elsewhere ([overview](https://en.wikipedia.org/wiki/Online_age_verification_laws_by_country)). Today every platform solves this alone, and badly: users upload identity documents and face scans to dozens of separate vendors, while small communities that want to be adults-only, or teens-safe, have no realistic way to check anyone at all.

Put together, this is one gap rather than three. Small services have nowhere cheap and neutral to live. Communities have no honest way to know who is at the door. And the compute that could host all of it is already bought, already plugged in, and doing nothing.

## The idea

Infranet pools leftover compute — decentralized garage compute — into a shared base layer that runs small services and applications efficiently. Usage is metered in **compute tokens**, a unit of machine work that behaves the way the watt-hour behaves for electricity. On top of that base sit two things: an **identity layer** that can prove "this is one real human, over 16, 18, or 21" without exposing anything else, and **communities** — walled gardens with real doors — built from both.

The company operating the network does not wait for third parties to make the platform useful. It develops the necessary services itself: community spaces with enforceable age gates, hosting for small apps, household backup, automation workers. Third-party builders come later, onto a platform that already works.

Two clarifications, because earlier drafts of this document got them wrong.

First, **Infranet is not an LLM platform.** Serving frontier language models takes dense, interconnected datacenter GPUs; attempting it on garage hardware would be emptying a lake with a spoon. An LLM provider could certainly become a *customer* of this platform, calling it to run tools, host applications, or verify users, and small local models will run on it where they genuinely fit. But LLM serving is not the point, and the earlier framing of an "LLM gateway wedge" is withdrawn.

Second, **the compute is not the goal.** The goal is the services the platform can provide once baseline compute is established across the network. The compute marketplace, and the buying and selling of compute tokens, is the foundation that makes those services cheap to run and honest to account for. The foundation is load-bearing and has to be built first. Nobody buys a house for the slab.

## How it works, in human terms

Four kinds of participant. **Machine owners** install an agent that offers spare capacity and earn compute tokens for work actually delivered. **Users and communities** consume services and pay in tokens, whether they earned them by contributing a machine or bought them with ordinary money. **Service builders** (the company first, third parties later) package software to run on the network and price it in tokens. **The company** operates coordination: scheduling, metering, settlement, identity issuance, support. It is funded by a fee on settled volume and by its own first-party services, and it does not buy a hardware fleet; supply is recruited, not purchased.

```text
machine owners ──contribute──►  base compute layer  ──runs──► services & communities
      ▲                              │ metered in                    │
      └────────── earn tokens ◄──────┘ compute tokens ◄── pay ───────┘
                     (sell / spend)          (buy with ordinary money at the edge)
```

### What a compute token measures

A compute token is a unit of *compute*. It is emphatically not an LLM token, the word fragment language models bill by; the name collision is unfortunate and worth killing early. The right analogy is the watt-hour. An electricity meter does not care whether the kettle boiled water for tea or boiled it dry; it charges for energy delivered. Infranet meters the same way: how much CPU or GPU runtime did this task consume, relative to the task, normalized across hardware by benchmark tier. A slow core-hour and a fast core-hour are different quantities of work, and the meter knows the difference. Storage and bandwidth are metered beside it in their own native units (GB-month, GB transferred).

Metering runtime does three useful things.

It **rewards computational efficiency**. An application that does the same job in a tenth of the cycles costs its users a tenth as much, so efficient software wins on price. Flat-rate cloud instances quietly reward the opposite: overprovisioning and waste.

It **keeps the platform neutral about outcomes**. The meter charges for work delivered; what the software did with that work is between the application and its users. The hallucination question this raises is answered head-on in the objections below.

It **makes hardware differences priceable instead of fatal**. Because value ties to metered runtime rather than to any particular outcome, machines of very different capability can participate at honest rates, and the producer's real marginal cost, electricity, sets a visible floor. One observation worth logging: where power generation is subsidized or off-peak surplus is real, garage compute gets structurally cheaper, so a government subsidizing power generation is, in passing, subsidizing distributed compute supply. That is an observation about tailwinds, not a plan.

### Earning and spending

A machine owner attaches a box; the agent advertises what it can do and when. The scheduler places replicated pieces of real services on it, meters what runs, and credits tokens. The owner spends those tokens on services their own family or community uses, or sells them to people who arrived with money instead of hardware. The daily loop should feel like a prepaid meter rather than a trading floor. Cash touches the system only at the edges, through payment rails covered below.

### Identity: proving a person without exposing one

The identity layer answers a narrow question well: *is this one real human, and are they over 16, 18, or 21?* Verification happens once, against strong evidence (document check, bank or carrier attestation, in-person options later), and issues a reusable credential. When a community asks, the credential answers yes or no. It does not hand over a name, a birthdate, or a passport scan. The cryptographic ambitions in the research tree (zero-knowledge proofs, multi-party computation, homomorphic encryption) all serve exactly this property and remain research; version one can deliver a useful weaker form with plain signed credentials from the verification service and upgrade the cryptography as it matures.

### Communities as walled gardens

Identity is what makes partitioning possible. A community on Infranet declares its door policy: verified humans only, 16+, 18+, 21+, invite-only, or open. The platform enforces the door and gates content accordingly. Inside, the community sets its own rules and owns its own data, running on compute its members may themselves be supplying. This is precisely the capability regulators are now forcing every platform to improvise separately, offered once, as infrastructure.

## What the company builds first

A platform with no services is a parking lot. The first-party lineup, chosen so each service has a small unit of work, tolerates heterogeneous hardware, and addresses someone who already feels the pain:

- **Community spaces with real doors.** Forums, chat, and media libraries for clubs, schools, and adult communities, with age-bracket enforcement built in rather than bolted on. This is the flagship, because the compliance wave gives it a reason to exist this year.
- **Small-app hosting.** The club site, the booking page, the game server, the newsletter. Boring, replicated, metered.
- **Household services.** Photo and file backup replicated across a family's own machines plus the network.
- **Automation workers.** Scheduled jobs, scrapers, agents, media transcodes: batch work that tolerates node churn gracefully and soaks up off-peak capacity.

## Money: piggyback, do not mint

Infranet should not invent a currency, and does not need to. Compute tokens are an internal metering unit, like prepaid credits. Where real money enters or leaves, the plan is to ride the agentic-commerce wallet rails that emerged in 2025–2026 instead of building payments from scratch:

- **Skyfire** operates payment infrastructure for AI agents around its KYAPay protocol: identity-linked, signed JWT tokens that carry both "who is this agent/party" and "what are they authorized to spend" ([skyfire.xyz](https://skyfire.xyz), [KYAPay for A2A](https://github.com/skyfire-xyz/kyapay_a2a)). Backers include a16z CSX and Coinbase Ventures ([eco.com guide](https://eco.com/support/en/articles/14839400-what-is-agentic-commerce-the-2026-guide)).
- **Google AP2** (Agent Payments Protocol), announced September 2025 with 60+ partners including Mastercard, PayPal, and American Express, handles authorization: three cryptographically signed mandates (intent, cart, payment) prove a human actually approved a transaction; governance has moved to the FIDO Alliance, and the protocol is payment-method agnostic across cards, bank transfers, and stablecoins ([comparison](https://www.crossmint.com/learn/agentic-payments-protocols-compared), [merchant guide](https://www.digitalapplied.com/blog/agentic-commerce-standards-ucp-acp-ap2-2026-merchant-guide)).
- **OpenAI/Stripe ACP** (Agentic Commerce Protocol) standardizes checkout inside AI surfaces using single-use, amount-bound Shared Payment Tokens. It shipped with Etsy in September 2025; OpenAI reworked its shopping surface in March 2026, a reminder that this layer is young and still moving ([landscape survey](https://github.com/custena/agent-payment-protocols)).
- **Dollar-pegged stablecoins** are being tested as machine-to-machine settlement right now (Coinbase's x402 pays in stablecoins over HTTP), which is the relevant context for paying thousands of small producers programmatically.

The strategy is to keep compute tokens as metering and settle at the edges through whichever of these rails wins in each geography. One practical asset: through professional work alongside the Skyfire team (via Cequence), the founder's family has a direct, warm introduction path when the settlement conversation starts.

There is also a deeper fit here. These protocols exist because payment networks need to know *which agent* is spending and *on whose authority*: identity attached to money. Infranet's identity layer is the same primitive attached to people. A network that can vouch "this is one verified adult human" composes naturally with payment rails built to ask exactly that kind of question.

## The objections, head-on

**"Pooling spare compute has been tried for twenty-five years and never became a business."** Mostly true, and the failure modes are instructive; the prior-art section below goes project by project. The short answer: every prior attempt sold *raw compute* as the product, either as charity (which saturates) or as a commodity market (which races to zero against the cloud on reliability terms it cannot meet). Infranet deliberately does not sell raw compute as the product. The compute market is plumbing that keeps supply funded and honestly accounted. The products are the services and the identity layer, which are judged on different axes entirely: cost per community per month, compliance, ownership, trust. On those axes, garage hardware is an advantage, because the marginal cost of a machine somebody already owns is roughly its electricity.

**"If a prompt is bad, or an LLM hallucinates and burns an hour of compute, who eats the cost?"** The meter does not adjudicate quality, by design. The power company charges for the kettle you boiled dry. Runtime consumed is runtime paid for; whether the output was worth it is the application layer's responsibility, handled the way software already handles it: budgets and caps, retries, refund policies, reputation. An application that routinely wastes its users' tokens loses its users, and the runtime meter is exactly what makes that waste visible enough to punish. This division of labor is also what keeps accounting stable across wildly different hardware and applications; the moment the meter starts judging outcomes, every dispute becomes a metaphysics seminar.

**"Why would anyone attach their PC?"** Because the hardware is already bought and the earnings are real, if modest: tokens that pay for the services their own household or community uses, or convert out through the payment rails. The seed population does this today for free; the self-hosting and homelab communities run exactly these services on exactly this hardware for the satisfaction of it. Offering them compensation and a coordination layer is an easier ask than inventing a behavior from nothing.

**"Is home hardware reliable enough?"** For the chosen workloads, with replication, yes. Small services, batch work, and storage tolerate individual machines vanishing; the scheduler's job is to make one flaky node a non-event. What garage hardware cannot honestly offer is five-nines, low-latency enterprise SLA, so Infranet does not sell that, and workload selection is a design discipline rather than an apology.

**"Is this a crypto scheme?"** No public token sale, no yield theater, no speculation machinery. The token is a metering unit. Money enters and exits through regulated wallet rails and stablecoin infrastructure built by others. Whether the internal ledger ever needs a blockchain is an engineering decision for the phase where third parties demand neutrality; a database serves until then.

**"Why bundle identity with hosting?"** Because a gated community needs both a place to run and a bouncer, and both have to trust the same fabric. Today those are two vendors, two integrations, and two privacy disasters. And the regulatory wave means every community above a trivial size will need the door check anyway; providing it as infrastructure is the difference between a compliance burden and a feature.

## Prior art, honestly, and why now

The graveyard is real, and anyone pitched this idea should ask about it.

| Project | Model | What happened |
|---|---|---|
| SETI@home / BOINC (1999–) | Volunteer science compute | Proved millions will donate cycles to a cause; participation saturates at the limits of altruism, and no market formed ([Arkhai](https://www.arkhai.io/blog/tokenizing-idle-compute)) |
| Folding@home | Volunteer science compute | Same lesson; surges on big moments, fades after |
| Golem (2016–) | Token marketplace for raw compute | Generic compute found thin demand and commoditized |
| Render Network | GPU marketplace for rendering | Found a real niche and stayed one |
| Akash, io.net, et al. | Token cloud/GPU marketplaces | Heterogeneous supply loses to datacenters on production reliability; price-sensitive short jobs dominate ([field evaluation](https://dev.to/roan911/why-gpu-marketplaces-fail-production-workloads-and-what-infrastructure-first-actually-means-5hle), [structural analysis](https://www.arkhai.io/blog/why-compute-marketplaces-broken)) |

What is different in this design, stated plainly:

1. **Raw compute is not the product.** Prior markets asked "who wants to buy FLOPs?" and found few takers who did not prefer AWS. Infranet asks "who wants a community with a real door, or hosting that costs almost nothing?" and uses the compute market only as the foundation underneath.
2. **Demand is first-party from day one.** The company builds the initial services itself, so baseline compute has a buyer before any third party shows up. Prior networks launched supply and waited.
3. **The missing rails now exist outside the project.** Agent-native wallets and identity-linked payment protocols (Skyfire, AP2, ACP) arrived in 2025–2026, so settlement and payout do not have to be invented in-house, which is where earlier token projects burned years.
4. **Regulation just minted demand for the identity half.** Age assurance went from nice-to-have to legally mandatory in major markets between July 2025 and December 2025, and small platforms have no good way to comply.

None of this guarantees the outcome. It changes which failure modes apply, and the proof-of-concept below is designed to test the new ones cheaply.

## Proof of concept: what exists, and the smallest real next step

Honesty first: there is no working network today. What exists in the research tree (`projects/infranet/`, mirrored on the home server) is design documentation (architecture, marketplace and reward sketches, cost models) plus **placeholder demos**: an in-memory Python blockchain, an identity registry that hashes and compares, and a simulated marketplace in which every task succeeds unconditionally. FHE, MPC, and ZKP appear as type labels rather than implementations, confirmed by a source-code trace (`BASELINE.md`). A Rust skeleton with real hashing and async libraries exists but is unbuilt. Investors and reviewers should treat all of it as sketches, and this document says so rather than hoping nobody runs the demo.

One adjacent thing is real, and it is the reason for conviction: the founder's homelab already runs a public website, admin dashboards, always-on agent processes, and a game-campaign platform on a 2 GB ARM single-board computer plus idle time on a desktop PC. That is daily, lived evidence that useful small services thrive on leftover hardware, along with the operational scar tissue of keeping such services alive.

**PoC v1** (one quarter, nights-and-weekends scale, existing hardware, roughly zero cash):

- Three to five volunteer machines across at least two households, running a supervision daemon and a simple scheduler.
- Three real services placed and replicated across them: one community space whose door is enforced by a signed age credential, one static site, one batch worker.
- Runtime metering per machine and a monthly settlement statement per owner, on a plain SQLite ledger. No blockchain, no token sale, nothing public.
- Exit criteria: a non-technical member joins the age-gated community in under five minutes; every service survives any single machine going offline; statements reconcile with observed runtime within a few percent; at least one participant chooses to pay money, or contribute capacity, for a second month.

Everything in the PoC is boring on purpose. The claims that are actually novel (runtime metering across heterogeneous boxes, identity-gated doors, garage supply) get tested; the speculative machinery (custom chains, exotic cryptography) stays on the shelf until something concrete needs it.

## Business model, briefly

Three revenue streams, in the order they arrive. **First-party service subscriptions**: communities and households pay monthly for spaces, hosting, and backup, in money or in contributed capacity. **Identity verification fees**: per-verification or per-seat pricing to communities that need enforceable doors. **A platform fee on settled token volume**: small, and meaningful only at scale, which is why it is listed last rather than first.

The cost side is software, coordination hosts (small; the current homelab pattern extends a long way), verification-partner costs, and support. Deliberately absent: a GPU fleet and its refresh cycle. Supply is recruited, machine by machine, and paid only for work delivered.

Sizing is stated honestly: small-service hosting, community platforms, and age-assurance compliance are each real and growing markets, but a credible bottom-up estimate of the reachable slice is post-PoC work. Early revenue is measured in thousands per month across tens of communities, and the plan treats that as the honest starting point rather than a footnote under a billion-dollar TAM slide.

## Roadmap and the ask

| Phase | Scope | Exit test |
|---|---|---|
| 0 — PoC (one quarter) | 3–5 machines, 3 services, metering + statements, credential-gated demo community | PoC criteria above, met and written up |
| 1 — Private beta | 20–50 machines from friends, family, homelab communities; flagship community service in daily use | ≥5 active communities, ≥1 paying |
| 2 — Identity GA + subscriptions | Verification-partner integration; wallet-rail settlement pilot (open the Skyfire conversation) | Compliance-grade age gate; first real-money settlement through an external rail |
| 3 — Third-party services | Registry + SDK so outside builders can price in tokens | ≥2 external services settling on the platform |

Two standing gates carry over from earlier review: no public token sale or open on-ramp without legal review, and nothing is promoted to production without explicit sign-off (`projects/infranet/AGENT-CHARTER.md`).

The ask, today, is three things. First, agreement on the corrected scope: garage compute as the foundation, services and identity as the product, LLM serving out. Second, a time-boxed lane to build PoC v1 on existing hardware. Third, two or three design-partner communities, and consent to use the Skyfire introduction when Phase 2 approaches. External capital is a Phase 1–2 conversation, and it should happen with PoC data in hand rather than with this document alone.

---

## Sources

Structure and pitch-memo form:

- Y Combinator Series A guide, investment memo template — via [visible.vc](https://visible.vc/blog/y-combinator-investment-memo/) and the [YC guide text](https://www.scribd.com/document/651223336/YC-Series-A-Guide-Investment-template)

Wallet protocols and agentic commerce:

- [Skyfire](https://skyfire.xyz) and [KYAPay A2A extension](https://github.com/skyfire-xyz/kyapay_a2a)
- [Agentic commerce standards: UCP vs ACP vs AP2 (2026 merchant guide)](https://www.digitalapplied.com/blog/agentic-commerce-standards-ucp-acp-ap2-2026-merchant-guide)
- [Agentic payments protocols compared (Crossmint)](https://www.crossmint.com/learn/agentic-payments-protocols-compared)
- [What is agentic commerce? The 2026 guide (eco.com)](https://eco.com/support/en/articles/14839400-what-is-agentic-commerce-the-2026-guide)
- [Agent payment protocols landscape survey (GitHub)](https://github.com/custena/agent-payment-protocols)

Prior art on shared/idle compute:

- [Tokenizing idle compute (Arkhai)](https://www.arkhai.io/blog/tokenizing-idle-compute)
- [Why current distributed compute marketplaces are broken (Arkhai)](https://www.arkhai.io/blog/why-compute-marketplaces-broken)
- [Why GPU marketplaces fail production workloads (dev.to)](https://dev.to/roan911/why-gpu-marketplaces-fail-production-workloads-and-what-infrastructure-first-actually-means-5hle)

Age-verification regulation:

- [Australia social media age restrictions (eSafety Commissioner)](https://www.esafety.gov.au/about-us/industry-regulation/social-media-age-restrictions)
- [Online age verification laws by country (Wikipedia)](https://en.wikipedia.org/wiki/Online_age_verification_laws_by_country)

Internal sources: `projects/infranet/` R&D tree (PLANNING, RESEARCH, COMPUTE_REWARDS, COST_ANALYSIS, BLOCKCHAIN_PLATFORM, DEMO), home-server `BASELINE.md` source trace (2026-07-11), and the prior combined brief (2026-07-12, superseded by this rewrite; its reconciled numbers survive in git history).

## Document control

| Field | Value |
|---|---|
| Title | Infranet — Pitch Brief (story-first rewrite) |
| Canonical path | `docs/infranet/INFRANET-COMBINED-BRIEF.md` |
| Supersedes | 2026-07-12 combined formal brief (this same path, prior revision); `INFRANET-DESIGN-PROPOSAL.md` and `INFRANET-BUSINESS-BRIEF.md` remain stubs |
| Status | Proposal / brief only; nothing described here is built beyond the placeholder demos noted above |
| Feedback | `AI_GROUPCHAT.md` ledger, or project `infranet` in `agents/user-tasks.json` |
