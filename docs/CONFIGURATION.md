# mem-constant.yaml

After **`mem-constant init`**, your project root contains **`mem-constant.yaml`**. It is **documentation-first**: humans and tools read the same file. The CLI does **not** require PyYAML; optional fields are commented in the generated file.

## Top-level keys

### `version`

Integer schema version. Currently **`1`**.

### `package_version`

String copied from the installed **`mem-constant`** package when **`init`** ran. Helps you know which bundled spec revision matches **`docs/mem-constant/`**.

### `routing`

Numeric thresholds aligned with [memory/routing-policy.md](memory/routing-policy.md):

| Key | Default | Meaning |
|-----|---------|---------|
| **`mempalace_min_confidence`** | `0.75` | Minimum confidence to treat a candidate as archive-ready (see spec § Route A). |
| **`quarantine_max_confidence`** | `0.45` | Values at or below this align with quarantine / uncertain handling in the spec. |

Tweak these per project when you automate routing.

### `mempalace_palace_path` (optional)

If set, your **own tooling** (or a future mem-constant release) can point automation at a MemPalace palace directory. The MemPalace project documents **`mempalace init`** and palace layout; see [INTEGRATION-MEMPALACE.md](INTEGRATION-MEMPALACE.md).

### `boundaries.sync_triggers`

List of named boundaries when you should **reconcile** archive vs working cache (see [memory/autonomous-memory-architecture.md](memory/autonomous-memory-architecture.md)):

- **`new_chat`**
- **`new_agent`**
- **`end_milestone`**

These are **policy hints** for humans and agents, not scheduled jobs by themselves.

### `pruning`

Balanced-by-default knobs for how aggressively low-value memory is trimmed:

| Key | Default | Meaning |
|-----|---------|---------|
| **`mode`** | `balanced` | `balanced` for safer retention, `aggressive` for faster cleanup and stricter save gating. |
| **`cadence`** | `daily` | Scheduler hint for prune passes. |
| **`max_items_per_run`** | `40` | Upper bound for irreversible actions per prune run. |
| **`save_gate_min_confidence`** | `0.55` | Keep-by-default threshold; candidates below this are more likely to be compacted/quarantined. |
| **`quarantine_days`** | `14` | Minimum quarantine retention before hard-delete eligibility. |

Use `aggressive` mode only when your workflow prefers strong forgetting pressure over broad recall.

### `recontextualization`

Controls for refreshing active context when goals shift:

| Key | Default | Meaning |
|-----|---------|---------|
| **`on_goal_change`** | `true` | Trigger recontext pass when current goals materially change. |
| **`goal_change_threshold`** | `0.20` | Minimum goal-delta score to trigger automatic recontext pass. |
| **`cadence`** | `weekly` | Time-based refresh hint even without explicit goal changes. |

Recontextualization should prune stale thread-local context and keep only currently relevant work.

### `knowledge_graph` (optional)

When you add a **derived graph layer** (typed edges, provenance paths) alongside vectors, declare it here. The CLI does not connect to a database; this block is for **your** adapters and jobs.

| Key | Meaning |
|-----|---------|
| **`enabled`** | `true` / `false` — whether projection jobs run. |
| **`backend`** | Opaque string your tooling understands (graph DB product or “rdf”, “jsonld-file”, …). |
| **`connection`** | Connection string or path; keep secrets out of git (env substitution in your runner). |
| **`ontology_profile`** | URI or path to a shared **ontology** (controlled classes + relations) so agents map text to the same predicates. |

### `projection` (optional)

Child of `knowledge_graph` in the scaffolded template. Tunes which memories become edges (for example minimum confidence and allowed `memory_type` values). Full design discussion: [memory/graph-ontology-and-customization.md](memory/graph-ontology-and-customization.md).

### `query_pipeline` (optional)

Declares the **default** retrieval pattern when both vectors and a knowledge graph exist. This is a **hint** for your application; the CLI does not execute retrieval.

| Value | Meaning |
|-------|---------|
| **`vector_then_graph`** | **Graph behind vectors**: embedding ANN first, then graph filter/rerank/path attach (recommended default for broad RAG). |
| **`graph_then_vector`** | **Graph in front of vectors**: expand seeds in the graph, then score with vectors inside that set (good for milestone- or decision-scoped questions). |
| **`parallel`** | Both contribute ranked lists; your ranker fuses them. |

In `query_pipeline`, **"graph" defaults to the curatorial graph (L5)** — the typed-relation layer derived from promoted MemPalace records. If your stack also runs a **structural graph (L1)** like Graphify, declare it separately so retrieval code does not silently mix domains:

#### `query_pipeline.structural_graph` (optional)

| Value | Meaning |
|-------|---------|
| **`none`** (default) | No L1 structural graph participates in retrieval. |
| **`graphify`** | A Graphify-built code graph is available for path/structural queries. Treat its results as candidates, not as memory writes. |
| **`custom`** | Some other structural code graph adapter your tooling understands. |

L1 results are **derived candidates**: they may seed retrieval or annotate paths, but promotion to MemPalace still requires the routing thresholds in [memory/routing-policy.md](memory/routing-policy.md). See [INTEGRATION-GRAPHIFY.md](INTEGRATION-GRAPHIFY.md) § Layer position and [memory/graph-ontology-and-customization.md](memory/graph-ontology-and-customization.md) § Scope.

See [memory/graph-ontology-and-customization.md](memory/graph-ontology-and-customization.md) § “Behind vs in front”. For how this repo is built, see [BUILD-PHILOSOPHY.md](BUILD-PHILOSOPHY.md).

## Parsing in Python (optional)

```bash
pip install pyyaml
```

```python
import yaml
from pathlib import Path
cfg = yaml.safe_load(Path("mem-constant.yaml").read_text(encoding="utf-8"))
```

## Relationship to Markdown specs

**`mem-constant.yaml`** is the **knob panel** for a project. **`docs/mem-constant/*.md`** (from **`init`**) are the **full design**. If they disagree during development, **update the YAML** to match the spec you intend to follow, or fork the spec text for your org.
