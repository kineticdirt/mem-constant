# Build philosophy (mem-constant)

This document explains **how we build** the mem-constant project and **how the pieces are meant to stack**, so contributors and forkers do not have to reverse-engineer intent from commits alone.

---

## What mem-constant is

- **Specs first** — Markdown under `docs/memory/` is the canonical design for autonomous memory (routing, schema, pruning, standup, handoff).
- **A thin CLI** — `mem-constant` scaffolds `mem-constant.yaml`, copies bundled specs into your repo, and optional Cursor rules. It is **not** a hosted service and **not** a mandatory runtime for your app.
- **Integration, not lock-in** — MemPalace, Claude Mem, vector stores, and optional **graphs** are **adapters** you own. We document contracts and layering; we avoid blessing one vendor.

---

## Layering model (conceptual bottom → top)

Think of memory capabilities as **layers**, not a single database:

1. **Raw evidence** — transcripts, tool logs, commits (your systems of record).
2. **Archive** — MemPalace or equivalent: durable, high-trust **facts** and **decisions**.
3. **Working cache** — short-horizon continuity (e.g. Claude Mem).
4. **Vector index** — similarity and recall over text you choose to embed (from cache, archive, or both).
5. **Graph (optional)** — **on top of** vectors in the sense of [memory/graph-ontology-and-customization.md](memory/graph-ontology-and-customization.md): **derived** typed relations, ontology-governed predicates, query patterns **behind** or **in front of** vector hits depending on use case.

Lower layers do not disappear when you add upper ones. The graph **interprets and constrains**; vectors **recall**.

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
| [memory/graph-ontology-and-customization.md](memory/graph-ontology-and-customization.md) | Graph on vectors, ontology, pipeline order |

---

## What we deliberately do not do here

- Run your graph or vector infrastructure.
- Choose your embedding model or graph database.
- Replace upstream MemPalace or Claude Mem documentation — we **link** and **compose**.

---

## Summary

**Build philosophy:** specs and layering are explicit; the CLI is a **paperweight** that keeps repos aligned with those specs; **engineering ontology** is the interchange format for graphs; **vectors stay underneath**; graphs add **structure on top**; **behind vs in front** is a **pipeline order** choice, documented—not hard-coded—per deployment.
