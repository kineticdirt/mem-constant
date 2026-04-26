# Integrating Graphify Without Breaking Memory Authority

Use [graphify](https://github.com/safishamsi/graphify) as a **derived graph/query layer**, not as your canonical memory store.

## Recommended role split

- **MemPalace**: durable archive and source of truth (**L4** in the layering model).
- **Claude Mem / carryover**: short-horizon working continuity (**L3**).
- **Graphify**: **structural graph (L1)** — code/repo map for path queries and architecture discovery.
- **mem-constant ontology graph**: **curatorial graph (L5)** — typed relations over promoted MemPalace records (decisions, evidence, supersession). See [memory/graph-ontology-and-customization.md](memory/graph-ontology-and-customization.md).

If these conflict, keep MemPalace + project policy authoritative and treat Graphify output as evidence to validate.

## Layer position: two graphs, one authority

The previous draft of this document underspecified where Graphify sits relative to the curatorial graph in [memory/graph-ontology-and-customization.md](memory/graph-ontology-and-customization.md). They are **two different graphs over different domains**:

```text
L0  Raw evidence ............ transcripts, code, commits, logs
L1  Structural graph ........ Graphify (read-only, regenerable, code-domain)
L2  Vector index ............ embeddings over selected text
L3  Working cache ........... Claude Mem / carryover (short horizon)
L4  Archive (authority) ..... MemPalace (durable facts + decisions)
L5  Curatorial graph ........ derived from L4 via mem-constant ontology
```

In this layering, **MemPalace genuinely sits "atop" Graphify** — but only in the limited sense that L4 records may **cite** L1 nodes as evidence. The reverse is forbidden: Graphify never writes back into MemPalace.

| Property | Structural graph (L1, Graphify) | Curatorial graph (L5, mem-constant) |
|----------|---------------------------------|--------------------------------------|
| Source | Parsed code/repo structure | Promoted MemPalace records |
| Lifecycle | Regenerable on demand | Durable, with supersession + provenance |
| Ontology | Implicit (calls, imports, modules) | Explicit `ontology_profile` (Decision, Evidence, `supersedes`, …) |
| Authority | Low (a derived index) | High (governs what counts as durable) |
| Question it answers | "How are components connected?" | "What is durable, and how does it depend / contradict / supersede?" |

The two graphs are not unified; they are **bridged** by typed evidence edges from L4 records into L1 nodes (see "Evidence-anchor pattern" below).

## Evidence-anchor pattern (recommended)

A MemPalace record can cite a stable Graphify node identifier as one of its evidence anchors. The bridge is one-way (L4 → L1) and read-only against Graphify.

Conceptual example (illustrative shape, not a wire format):

```yaml
record_id: D-0042
memory_type: decision
confidence: 0.82
summary: "Use vector_then_graph as default retrieval order in writer-stack."
evidence:
  - kind: graphify_node
    ref: "graphify://node/src/writer/router.py::resolve_pipeline"
    captured_at: "2026-04-26T00:00:00Z"
  - kind: commit
    ref: "git://abc123"
ontology_version: "mem-constant/1"
```

Rules of the bridge:

1. **One-way only.** L4 records may cite L1 node refs. L1 (Graphify) **never** writes back into L4 (MemPalace).
2. **Refs are evidence, not truth.** A Graphify node ref is corroboration; promotion to MemPalace still requires the routing thresholds in [memory/routing-policy.md](memory/routing-policy.md).
3. **Refs are regenerable.** If Graphify is regenerated and a node disappears, the L4 record stays — its anchor is marked stale, not deleted.
4. **No automatic promotion from Graphify queries.** Graph search results are inputs to a human or agent decision, not memory writes.

## Install and platform integration

Graphify publishes as `graphifyy` on PyPI:

```bash
pip install graphifyy
graphify --help
```

Install assistant-specific integrations only where needed:

- Cursor: `graphify cursor install`
- Claude Code: `graphify claude install`
- VS Code Copilot Chat: `graphify vscode install`

## Safe adoption pattern (this workspace)

1. Build graph artifacts locally:
   - `graphify .`
2. Keep graph outputs as derived artifacts:
   - prefer not to use `graph.json` as your memory authority
3. Use graph queries for discovery:
   - `graphify query "..."`
   - `graphify path "A" "B"`
4. Promote only validated durable facts/decisions into MemPalace.

## Conflict risks and mitigations

- **Risk: instruction collisions** from additional always-on rules/hooks.
  - Mitigation: keep Graphify instructions scoped; avoid replacing existing mem-constant rules.
- **Risk: inferred edges treated as truth**.
  - Mitigation: require corroboration before archive promotion. L1 edges never auto-promote into L4 or L5.
- **Risk: retrieval drift** (graph-first always).
  - Mitigation: follow project retrieval policy (`vector_then_graph` or `graph_then_vector`) intentionally. See [CONFIGURATION.md](CONFIGURATION.md) `query_pipeline` for how to disambiguate L1 vs L5 graphs in retrieval.
- **Risk: collapsing the two graphs** (treating Graphify's output as the curatorial graph).
  - Mitigation: keep [memory/graph-ontology-and-customization.md](memory/graph-ontology-and-customization.md) (L5) and Graphify (L1) as separate concerns; bridge only via the evidence-anchor pattern above.

## Practical policy for this repo

- Graphify (L1) helps answer: "How are components connected?"
- MemPalace (L4) answers: "What is durable and decision-grade?"
- Claude Mem/carryover (L3) answers: "What was the recent working context?"
- Curatorial graph (L5) answers: "How do durable items relate — depends on, supersedes, evidence for?"

This keeps recontextualization and pruning policy under `mem-constant` control while still benefiting from Graphify's structural search.
