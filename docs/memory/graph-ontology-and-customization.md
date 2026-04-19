# Graph layer, ontology, and customization

This document extends the autonomous-memory model with an **optional graph** and an **engineering ontology** (controlled classes and relations). **Vectors stay the substrate** for similarity and broad recall; the **graph sits on top** as structure you derive or query for explanation, constraints, and audits.

The design stays **vendor-neutral**: no required graph database, no replacement for MemPalace or your vector index.

---

## Stack position: graph on top of vectors

**“On top”** means two things (both can be true):

1. **Data dependency** — embeddings and archived text exist first; graph **nodes and edges are projected** from promoted memories (and optional manual curation). The graph is not the source of raw evidence; it **indexes** what you already trust enough to route.
2. **Semantic layering** — vectors answer **similarity**; the graph answers **typed relationships** (depends on, supersedes, evidence for, scoped to). The ontology names those predicates so tools agree.

Vectors are **not removed**; the graph **adds** a relational view.

---

## “Behind” vs “in front” of vectors (query pipeline)

These phrases describe **order in a retrieval or synthesis pipeline**, not moral priority.

| Pattern | Order (informal) | When it helps |
|---------|------------------|---------------|
| **Graph behind vectors** (post-filter / rerank) | **Vector first** → candidate set → **graph** prunes, reranks, or attaches paths | Default **RAG-style** flow: cast a wide embedding net, then use the graph to drop nonsense, enforce scope, or boost items linked to verified decisions. |
| **Graph in front of vectors** (pre-expand) | **Graph first** → seed neighborhood or path → **vectors** score within that set | “Everything tied to **this milestone** or **this decision node**,” then rank by semantic fit inside the subgraph. |
| **Parallel merge** | Both produce ranked lists → **fusion** (learned or hand-weighted) | When you want neither pure similarity nor pure navigation to dominate. |

**Recommendation:** start with **graph behind vectors** for general recall; add **graph in front** for operator dashboards, standup “how we got here,” and scoped audits. Your `mem-constant.yaml` can record a declared default (see [../CONFIGURATION.md](../CONFIGURATION.md) optional `query_pipeline`).

There is no universal winner: **behind** preserves recall breadth; **in front** preserves structural truth when the question is inherently relational.

---

## Engineering ontology (primary)

This is what you **implement and version**: a machine-readable contract so agents, jobs, and UIs use the **same relation names** and **class boundaries**.

### Contents

- **Classes (types)** — e.g. `Decision`, `Task`, `Repository`, `Milestone`, `Evidence`, aligned where possible with [memory-schema-and-scoring.md](memory-schema-and-scoring.md) memory types.
- **Relations (predicates)** — e.g. `depends_on`, `supersedes`, `evidence_for`, `contradicts`, `scoped_to`, `authored_by`.
- **Constraints (optional)** — domain/range, cardinality, disjointness between classes.

### Representation

Choose what fits your stack: **JSON-LD** `@context`, **RDF/OWL**, **SKOS** for lightweight taxonomies, or a narrow internal JSON schema. The mem-constant contract is: **publish an `ontology_profile` URI or path** (see `mem-constant.yaml`) so projection and query code share one definition.

### Why it matters more than raw graph edges

Without an ontology, every agent invents edge labels (`related_to`, `links_to`, `about`) and the graph becomes **unqueryable soup**. Engineering ontology is how the graph stays **inspectable** across sessions and tools.

---

## Philosophical ontology (supporting, not driving)

Philosophical ontology asks what **exists** and how **identity** and **dependence** work across time. For this stack, it matters as **design hygiene**, not as implementation text:

- It reminds you to define when a **fact** is the **same** fact across sessions vs a **revision**.
- It backs the distinction between **ephemeral** noise and **durable** commitments already in your routing model.

Spec and code should follow the **engineering** ontology; philosophy informs **edge cases** (identity, supersession) you encode in predicates and constraints.

---

## Why add a graph if you already have vectors?

| Mechanism | Strength | Blind spot |
|-----------|----------|------------|
| **Vectors** | Similarity, paraphrase, “near this embedding” | Similarity is weak on **directed** structure (A caused B, B refutes A). |
| **Graph** | Typed edges, paths, scopes, provenance | Cold start; needs schema discipline; weak alone for fuzzy paraphrase. |

**Practical split:** vectors for **recall breadth**; graph for **structure, explanation, and policy**. Projection jobs (see phasing below) lift high-confidence records into the graph without replacing the archive.

---

## Customization axes (pluggable, not monolithic)

1. **Storage profile** — archive (MemPalace), cache, vector index, graph store: **separate adapters**, one interface per concern.
2. **Ontology profile** — versioned document mapping `memory_type`, `tags`, and fields to graph classes and predicates.
3. **Projection policy** — which routed rows become nodes/edges (thresholds, allowed types).
4. **Query surface** — “explain path,” neighborhood, or declarative queries over your chosen backend.

The graph remains **derived** unless you explicitly adopt a dual-write pattern (not required here).

---

## Suggested data shape (conceptual)

Extend the mental model from [memory-schema-and-scoring.md](memory-schema-and-scoring.md):

- **`graph_node_id`** (optional) — canonical node for a memory row.
- **`relations_out` / `relations_in`** (optional) — `{predicate, target_id, confidence}` in working cache before projection.
- **`ontology_version`** — profile identifier used to mint edges.

Reuse **confidence** and **contradiction** checks before promoting edges to the durable graph.

---

## Research directions (non-blocking)

- **Temporal graphs** — validity intervals; supersession as first-class edges.
- **Open-world vs closed-world** — agents open-world; milestones or human review **close** a scope when appropriate.
- **Upper ontology mapping** — small mappings (e.g. Dublin Core, PROV) instead of importing huge upper models wholesale.

---

## Phasing

| Phase | Outcome |
|-------|---------|
| **A** | Ontology profile + manual or scripted graph edits. |
| **B** | Automated **projection** from routed memories; vectors unchanged. |
| **C** | Router or ranker **uses graph signals** (e.g. hub of verified decisions). |

---

## Non-goals (for this document)

- Mandating a specific graph product.
- Replacing vector RAG; this is a **hybrid** extension.
- Treating philosophy as a substitute for an **engineering** ontology file.

---

## See also

- [../BUILD-PHILOSOPHY.md](../BUILD-PHILOSOPHY.md) — how this repo is built and how specs relate to code
- [autonomous-memory-architecture.md](autonomous-memory-architecture.md) — core components
- [routing-policy.md](routing-policy.md) — promotion thresholds
- [memory-schema-and-scoring.md](memory-schema-and-scoring.md) — record fields
