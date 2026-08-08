# AI musing — Why Agentic Systems Need Ontologies (Frank Coyle)

**Talk:** Frank Coyle (UC Berkeley) @ AI Engineer Conference — *Why Agentic Systems Need Ontologies*  
**Date filed:** 2026-08-08  
**Stack mapping:** Hermes think / Cursor Auto / user-tasks / MemPalace / tableslop wiki  
**Companion plan:** `docs/plans/hermes-neuro-symbolic-ontology-2026-08-08.md`  
**Upgrade policy:** ≥**7 days** soak after release before Hermes / cloudflared / framework upgrades (`agents/update-targets.json` `min_release_age_days` + `safe-update-check.sh`).

---

## Executive take (for this repo)

Agent loops are Turing-complete (sequence + branch + iterate). That buys autonomy and also infinite loops, context drift, hallucinated tool args, and token runaways. Coyle’s fix is **neuro-symbolic**: keep the LLM probabilistic, but put **formal domain rules** beside the graph so side effects only land when constraints pass.

**Slogan we adopt:** *Pydantic at the door, ontology at the ledger.*

| Layer | Coyle | Our stack today | Gap |
|-------|-------|-----------------|-----|
| Door | Typed tool args before invoke | Ad-hoc shell/JSON; some schemas | Weak / inconsistent |
| Ledger | Reasoner before DB/state write | Disk JSON + multitask locks | Locks ≠ domain logic |
| Graph | Entities / relations / properties | MemPalace + `wiki/entities.json` + registry | Not enforced as OWL |
| Loop limits | Bound iteration | `--max-turns`, C8 paid gate, lane-failover | Good start; not ontological |

Hallucination as *creative feature* is fine for RP/Pixi prose. It is **not** fine for ops tool params (task status, `assigned_lane`, refund-style double actions, enum invents).

---

## Lineages (compressed)

1. **Agent AI (1956→)** — perceive / decide / act.  
2. **Symbolic / ontology (Aristotle → Gruber 1993)** — formal shared conceptualization.  
3. **Neuro-symbolic** — LLM proposes; ontology **admits or rejects** commits.

RDBMS vs graph: we already prefer JSON graphs (`entities.json`, registry edges) for flexible properties — same reason Coyle gives for not forcing schema migrations for every new fact.

Construction modes we already use:

- **Top-down:** campaign LOCKS, `wb-tg-factions`, THINK C0–C8.  
- **Bottom-up:** WORLD_DELTA, wiki entities from play.  
- **Standards:** Schema.org / FOAF / Dublin Core — optional later for public Intel; not potato-critical.

---

## OWL/RDFS constructs → potato-sized stand-ins

Full OWL reasoners on a 2 GB Le Potato are the wrong rung (ponytail). Map ideas to **cheap deterministic checks**:

| OWL idea | Example | Our stand-in |
|----------|---------|--------------|
| `rdfs:domain` / `range` | teaches → Teacher/Student | Tool args: `task_id` must exist in `user-tasks.json` |
| `owl:TransitiveProperty` | ancestorOf | Place containment / region→city (later) |
| `owl:FunctionalProperty` | hasFather uniqueness | One `assigned_lane` per open task; one owner Discord id |
| `owl:disjointWith` | Customer ⊥ SupportRep | `role` owner/admin/user mutually exclusive; hermes vs cursor lane handoff rules |
| `owl:oneOf` | status enum | `status ∈ {open, in_progress, done, blocked}` — never “probably done” |

**Failure matrix (ops):**

| Failure | Raw agent | Ontology/ledger check |
|---------|-----------|------------------------|
| Duplicate processing | Re-opens done task / double failover | Functional: one active handoff record |
| Role confusion | Cursor writes as if owner | Role disjoint + editGate |
| Enum invent | `status: "mostly-done"` | oneOf reject → re-prompt / block write |
| Runaway loop | 28/28 thrash | max-turns + lane-failover archive |

---

## Architecture we want for Hermes

```text
[ Think / Cursor prompt ]
        │
        ▼
[ Agent loop ] ── tool args ──► [ Door: JSON Schema / typed validators ]
        │                              │
        │                              ▼
        │                       [ Tool / script runs ]
        │                              │
        │                              ▼
        └──────── context ◄── [ Ledger: ontology-ledger-check ]
                                      │ invalid
                                      ▼
                               [ refuse write / Inbox / blocked ]
```

**Pure agents:** think must not “edit user-tasks by vibes” in prose — only via scripts that pass door + ledger (already the direction of `lane-failover.py`, `consume-inbox-answers`, multitask lock).

---

## What we will / will not do

**Will (phased):**

1. Codify an **ops ontology** (JSON) for user-tasks + lane handoff + inbox shape.  
2. `ontology-ledger-check.py` before status transitions (open→done/blocked).  
3. Document door validators for new Hermes-facing scripts.  
4. Optional: MemPalace / wiki entity kinds as soft ontology for Isla (places/quests).  
5. **Upgrade soak ≥7 days** after Hermes / cloudflared (and peers) release before SAFE-gated upgrade.

**Will not (yet):**

- Run Protege / full OWL reasoner on potato cron.  
- Block Pixi creative hallucination with OWL.  
- Instant-upgrade Hermes the day a release drops.

---

## Pedagogy note (Coyle / Sister Corita)

“Nothing is a mistake… only make.” For us: failed think ticks → papercut + failover + archive, not silent thrash. Handwriting advice is personal; we keep **ledger + musings** as the durable “make.”

**Refs:** codesupreme.ai · coyle@berkeley.edu · talk timestamps in source analysis ~00:00–00:21.
