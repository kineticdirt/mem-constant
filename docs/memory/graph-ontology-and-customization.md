# Graph layer, ontology, and customization

This document extends the autonomous-memory model beyond **vector-first** retrieval. It is **optional**: v1 can stay cache + archive + vectors. The goal is clearer **structure** (how parts relate) and **shared meaning** (what labels denote), without forcing a single database vendor.

---

## Why add a graph if you already have vectors?

| Mechanism | Strength | Blind spot |
|-----------|----------|------------|
| **Vectors** | Similarity, paraphrase, “near this embedding” | Symmetry of similarity hides **direction** (A caused B, B refutes A). |
| **Graph** | Typed edges, paths, scopes, provenance chains | Cold start and schema discipline; not a drop-in for fuzzy recall alone. |

**Practical split:** keep vectors for **recall** (“what looks like this?”) and add a graph for **explanation** (“how does this connect to that decision, person, repo, and milestone?”). A nightly or boundary job can **project** high-confidence `fact` / `decision` records into nodes and edges without replacing MemPalace.

---

## Ontology: two senses, one pipeline

### 1. Philosophical ontology (brief)

In philosophy, **ontology** asks what kinds of things exist and how they hang together (categories, dependence, identity over time). For agent memory, the useful import is **discipline about categories**:

- What **counts** as a `decision` vs a `context-note`?
- When is a “fact” the **same** fact across sessions (identity), vs a revised belief?

Your existing **memory types** and **routing policy** already encode a minimal ontology of *kinds of memory*. A graph layer makes that explicit as **classes** and **relations**.

### 2. Engineering ontology (what you implement)

In knowledge engineering, an **ontology** is a **controlled vocabulary** plus **axioms**:

- **Classes** (types): `Decision`, `Task`, `Concept`, `Person`, `Repository`, …
- **Relations**: `depends_on`, `supersedes`, `evidence_for`, `contradicts`, `scoped_to`
- **Constraints** (optional): disjointness, cardinality, domain/range

Formats like **RDF/OWL**, **SKOS** for taxonomies, or lighter **JSON-LD** `@context` blocks are implementation choices. The mem-constant contract is: **declare a profile** (URI or file) so different agents map extracted text to the **same** relation names.

---

## Customization axes (pluggable, not monolithic)

1. **Storage profile** — archive (MemPalace), cache (Claude Mem), vector index, **graph store** as separate adapters behind a small interface.
2. **Ontology profile** — versioned document: allowed classes, edges, and mapping rules from `memory_type` + `tags` into graph predicates.
3. **Projection policy** — which routed records become graph edges (e.g. only `confidence >= mempalace_min_confidence` decisions and durable facts).
4. **Query surface** — optional “explain path” API for UI or standup: shortest path, neighborhood, or SPARQL/Cypher depending on backend.

Nothing here requires replacing **MemPalace** internals; the graph can be a **derived** layer for insight and audits.

---

## Suggested data shape (conceptual)

Extend the mental model from [memory-schema-and-scoring.md](memory-schema-and-scoring.md):

- **`graph_node_id`** (optional) — link a memory row to a canonical node.
- **`relations_out` / `relations_in`** (optional) — small lists of `{predicate, target_id, confidence}` for working cache before projection.
- **`ontology_version`** — which profile produced the edge set.

Scoring can reuse **confidence** and **contradiction** checks before an edge is promoted to the durable graph.

---

## Research directions (non-blocking)

- **Temporal graphs** — decisions valid in `[t0, t1)`; supersession as first-class edges.
- **Open-world vs closed-world** — agents assume open world; human or nightly job **closes** a scope when a milestone completes.
- **Alignment with upper ontologies** — when you need interoperability (e.g. Dublin Core for document metadata, PROV for provenance), map your local predicates to a small upper layer rather than importing all of BFO or SUMO on day one.

---

## Phasing

| Phase | Outcome |
|-------|---------|
| **A** | Document-only: ontology profile file + manual graph edits for pilot projects. |
| **B** | Automated **projection** from routed memories to a graph; vectors unchanged. |
| **C** | **Biasing** router with graph signals (e.g. do not quarantine if node is hub of verified decisions). |

Phase boundaries belong in your implementation backlog; this spec stays **advisory** until you add concrete adapters.

---

## Non-goals (for this document)

- Picking a single graph database or cloud vendor.
- Replacing vector RAG; the design assumes **hybrid** where useful.
- Full philosophical treatment; use citations in your own reading list for deeper logic and metaphysics.

---

## See also

- [autonomous-memory-architecture.md](autonomous-memory-architecture.md) — core components
- [routing-policy.md](routing-policy.md) — promotion thresholds
- [memory-schema-and-scoring.md](memory-schema-and-scoring.md) — record fields
