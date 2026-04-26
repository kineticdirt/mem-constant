# Build philosophy (mem-constant)

This document explains **how we build** the mem-constant project and **how the pieces are meant to stack**, so contributors and forkers do not have to reverse-engineer intent from commits alone.

---

## What mem-constant is

- **Specs first** — Markdown under `docs/memory/` is the canonical design for autonomous memory (routing, schema, pruning, standup, handoff).
- **A thin CLI** — `mem-constant` scaffolds `mem-constant.yaml`, copies bundled specs into your repo, and optional Cursor rules. It is **not** a hosted service and **not** a mandatory runtime for your app.
- **Integration, not lock-in** — MemPalace, Claude Mem, vector stores, and optional **graphs** are **adapters** you own. We document contracts and layering; we avoid blessing one vendor.

---

## Layering model (conceptual bottom → top)

Think of memory capabilities as **layers**, not a single database. The numbering matches `L0…L5` used in [INTEGRATION-GRAPHIFY.md](INTEGRATION-GRAPHIFY.md) and [memory/graph-ontology-and-customization.md](memory/graph-ontology-and-customization.md):

- **L0 — Raw evidence** — transcripts, tool logs, commits, source code (your systems of record).
- **L1 — Structural graph (optional)** — a code/repo graph derived from raw code (e.g. [Graphify](INTEGRATION-GRAPHIFY.md)). Regenerable, low-authority, with an implicit ontology of calls/imports/modules. **Not a memory store** — it is a structural index.
- **L2 — Vector index** — similarity and recall over text you choose to embed (from cache, archive, or both).
- **L3 — Working cache** — short-horizon continuity (e.g. Claude Mem).
- **L4 — Archive** — MemPalace or equivalent: durable, high-trust **facts** and **decisions**. The authority layer.
- **L5 — Curatorial graph (optional)** — **on top of** vectors in the sense of [memory/graph-ontology-and-customization.md](memory/graph-ontology-and-customization.md): **derived from L4** as typed relations, ontology-governed predicates, query patterns **behind** or **in front of** vector hits depending on use case.

Lower layers do not disappear when you add upper ones. **L1 indexes code structure; L5 interprets durable knowledge.** The two graphs are distinct domains and are bridged only via the **evidence-anchor pattern** (L4 records may cite L1 node refs; the reverse is forbidden). Vectors **recall**; graphs **constrain and explain**.

---

## Engineering ontology before philosophy

We care about **philosophical** clarity for edge cases (identity, revision, what “counts” as a fact). We **ship** and **test** **engineering** artifacts: YAML keys, vendored specs, optional ontology profile pointers, and documented pipeline orders (`query_pipeline` in configuration).

Philosophy informs naming and supersession rules; **the ontology file** is what multiple agents must share.

---

## How we change the project

1. **Edit specs in `docs/memory/`** — new behavior starts as prose and tables.
2. **Run `python scripts/vendor_specs.py`** — copies specs into `src/mem_constant/spec/` for wheels (see [PACKAGING.md](PACKAGING.md)).
3. **Update `mem-constant.yaml` scaffold** in `src/mem_constant/init_scaffold.py` when new optional knobs are introduced.
4. **Document user-facing behavior** in `docs/*.md` and the root [README.md](../README.md).
5. **Keep the CLI small** — prefer new Markdown over new Python unless the command genuinely helps onboarding.
6. **Test what ships** — `pytest` for the CLI; anything more belongs in your application repo.

---

## Documentation map (build-centric)

| Doc | Role |
|-----|------|
| [PACKAGING.md](PACKAGING.md) | Releases, vendoring, version bumps |
| [INSTALL.md](INSTALL.md) | Install and scaffold |
| [CLI.md](CLI.md) | Commands |
| [CONFIGURATION.md](CONFIGURATION.md) | `mem-constant.yaml` |
| [memory/graph-ontology-and-customization.md](memory/graph-ontology-and-customization.md) | Curatorial graph (L5), ontology, pipeline order |
| [INTEGRATION-GRAPHIFY.md](INTEGRATION-GRAPHIFY.md) | Structural graph (L1), evidence-anchor pattern |

---

## What we deliberately do not do here

- Run your graph or vector infrastructure.
- Choose your embedding model or graph database.
- Replace upstream MemPalace or Claude Mem documentation — we **link** and **compose**.

---

## Summary

**Build philosophy:** specs and layering are explicit; the CLI is a **paperweight** that keeps repos aligned with those specs; **engineering ontology** is the interchange format for the **curatorial graph (L5)**; **vectors stay underneath**; an optional **structural graph (L1)** indexes code; the curatorial graph adds **typed structure on top of L4**; **behind vs in front** is a **pipeline order** choice, documented—not hard-coded—per deployment.
