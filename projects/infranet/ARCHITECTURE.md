# Infranet — V1 Platform Architecture Notes

*Engineering working notes for the V1 compute marketplace. Distilled from founder/engineering
discussion, 2026-07; technical conclusions paraphrased. Pitch-depth summary lives in
`docs/infranet/INFRANET-COMBINED-BRIEF.md` ("Running strangers' code…" section); this file
carries the fuller reasoning. The older `PLANNING.md` in this folder is the identity-layer
architecture (FHE/MPC/ZKP, NFC) and is **V2 material** — kept, not merged here.*

## 1. Execution isolation: VM airgap, not containers

**Working choice: every third-party job runs inside a virtual machine on the volunteer
host.** The VM boundary is the one isolation primitive strong enough to justify telling a
machine owner "a stranger's workload cannot touch your files, your browser sessions, or
your LAN." The real-world direction for making that affordable is **micro-VMs** —
Firecracker / Cloud Hypervisor class VMMs that boot minimal guests in hundreds of
milliseconds with a few MB of overhead, built for exactly this multi-tenant-on-thin-hardware
problem (Firecracker is what AWS runs Lambda on).

**Containers were considered and rejected as the primary isolation.** They are lighter and
operationally friendlier, but namespace-level isolation shares the host kernel: one kernel
exploit and the payload owns the box. Containers remain fine *inside* the trust boundary —
packaging first-party services, structuring the guest image — just not as the wall between
a stranger's code and a volunteer's home machine.

**Kubernetes** was noted as the obvious orchestration answer and set aside: its control
plane and per-node agents assume datacenter-class nodes. A 2 GB single-board computer or a
part-time gaming PC cannot carry that overhead; the scheduler here must be much lighter
(the homelab pattern — one coordinator, thin agents — extends further than expected).

Practical consequences to design for:

- **Per-job overhead is bounded but real** (guest kernel + image pull + boot). Batch and
  service workloads amortize it; sub-second one-shot jobs may not. Micro-VM snapshots and
  warm pools are the standard mitigations.
- **Windows volunteer hosts** are the awkward case (Hyper-V isolation differs from
  KVM-based micro-VMs). Linux hosts are the reference target for v1 supply; Windows
  support is a port, not a redesign.

## 2. Threat model: "pay someone to run your virus"

The defining abuse case of an open compute marketplace: the attacker is not stealing
compute, they are **paying, honestly, to have their malware executed on thousands of other
people's machines**. Botnet-as-a-service with a receipt. Everything else (meter fraud,
freeloading, data exfil from jobs) is secondary to this.

Defense is layered — **defense-in-depth all the way through**, no single mechanism trusted:

1. **Requester-side pre-screening ("forward security").** Scan and classify the payload
   *before dispatch* — static analysis, known-bad signatures, behavioral heuristics,
   anomaly scoring on the job graph. Honest accounting: screening costs compute (an
   overhead the platform itself must meter and eat), and it **will** have false negatives.
   It is a filter that raises attacker cost, not a guarantee.
2. **The VM airgap as backstop.** When screening fails — assume it does — the payload
   detonates inside a guest with no host filesystem, no host credentials, and a policed
   network path (§3). The blast radius is the VM, not the volunteer's machine.
3. **Accountability rails around the market.** Jobs arrive through funded, identified
   accounts (payment identity, not personal identity); dispatch history is attributable;
   abusive requesters are cut off and their deposits burned. This does not stop the first
   strike, but it makes repeat abuse expensive.

**Constrained tier — restricted instruction sets.** A variant discussed and worth keeping
on the shelf: a dispatcher that refuses arbitrary code entirely and ships only **pure math
operations** — a whitelisted numeric instruction set (matrix ops, map/reduce kernels,
signal-processing primitives), no syscalls, no I/O beyond operands and results. The attack
surface collapses to near zero; so does the addressable market, since most real workloads
are not expressible. Position: a possible *tier* of the platform (safest supply, e.g.
first-time volunteer machines, could accept only this tier), not the platform itself.

## 3. VM networking: routed egress, policy open

Guest traffic does not exit straight from the VM to the internet. The path is
**requester → platform → resource host → VM**, and the guest's return/egress path is
**routed back through the host-side network layer** (tap/bridge + NAT or a userspace
proxy), where policy applies. That placement is what makes egress controllable at all:
the host can throttle, log, allowlist, or null-route guest traffic without the guest's
cooperation.

**Open design item — sandbox network policy.** Undecided questions, recorded rather than
hand-waved: default-deny vs default-allow egress for general jobs; whether "no network at
all" is the default tier (pure batch) with connectivity as an opt-in, priced capability;
DNS handling inside guests; and how much egress logging is compatible with the privacy
posture volunteers are promised. v0 of the PoC sidesteps this entirely (its sandbox
simply has no network story); the decision is needed before any untrusted job touches a
volunteer machine.

## 4. Geography and latency: availability-zone-style groups

Cross-region round trips are brutal for interactive work — a scheduler that pairs a
consumer in India with a producer in the US has already failed that user, whatever the
price. The working answer is the **Amazon availability-zone analogy**: partition supply
and demand into **latency domains** (region/metro-scale groups), match within a domain by
default, and cross domains only for latency-insensitive batch work or explicit overflow.

Zone assignment can start crude (geo-IP + coarse RTT probes to a handful of anchors).
**Latency prediction from observed network history** — building an RTT map from real
traffic to place workloads better — is feasible and genuinely useful, but it is
**location-sensitive telemetry**: a good latency map of a volunteer's connection is also a
partial map of where that volunteer is. That tradeoff gets flagged now, in design, not
discovered later: collect the minimum (coarse zone labels, aggregated percentiles, no
per-host fine-grained latency history retained), and say so in the volunteer agreement.

## 5. Cold start: the historical killer

A marketplace with no producers has nothing to sell; with no consumers, nothing to earn.
Every prior distributed-compute attempt hit this (see prior-art table in the brief —
BOINC saturated at altruism's limits, Golem/Akash launched supply and waited for demand
that stayed thin). **Critical mass of producers is a prerequisite, not a growth metric.**

The V1 plan attacks it from both sides: **first-party services are the anchor demand**
(the company is customer #1 for its own marketplace, so early producers get paid from day
one), and early supply is recruited from the population that already runs always-on
hardware for fun (homelab/self-hosting communities). The eBay shape matters here too:
eBay did not manufacture the Beanie Babies — but it did have to make the first thousand
sellers feel liquidity fast. Zones (§4) make this harder: liquidity must exist *per
latency domain*, which argues for launching one metro at a time rather than thinly
everywhere.

## 6. What the PoC exercises today

`poc/` implements the marketplace's inner loop at v0 fidelity on one machine: payload →
sandboxed subprocess (process boundary standing in for the VM airgap) → CPU/wall metering
→ double-entry SQLite token ledger, with an assert-based smoke test on the metering and
ledger math. Known v0 gaps that map to the sections above: isolation is a process not a VM
(§1), metering is self-reported from inside the sandbox (§2 — production meters from the
host side), there is no network policy because there is no network (§3), and one machine
means no zones (§4). See `poc/README.md` for the exact real/placeholder split.

## Related documents

- `docs/infranet/INFRANET-COMBINED-BRIEF.md` — canonical pitch (V1 marketplace, V2 roadmap)
- `poc/` — runnable v0 loop + smoke test
- `COMPUTE_REWARDS.md`, `COST_ANALYSIS.md` — earlier marketplace/reward and cost sketches
- `PLANNING.md`, `RESEARCH.md`, `BLOCKCHAIN_PLATFORM.md` — identity-layer research (V2)
