# Autonomous Memory Architecture

This document defines a model-agnostic memory architecture where `MemPalace` is the canonical long-term archive and a lightweight working cache handles short-horizon context.

## Objectives

- Run memory operations autonomously in normal conditions.
- Minimize manual touchpoints to one daily standup review.
- Keep a reversible safety path for prune/compaction actions.
- Decouple working-memory summarization from any single model vendor.

## System Components

1. `MemoryIngestService`
   - Collects chat events, boundary events, and explicit memory commands.
   - Normalizes raw inputs into structured memory candidates.
2. `ModelAgnosticSummarizer`
   - Produces concise summaries and extraction payloads.
   - Uses a provider adapter interface (`local`, `openrouter`, `gemini`, or future providers).
3. `ClassifierAndScorer`
   - Tags candidates as `fact`, `decision`, `task`, `context-note`, or `episode-summary`.
   - Assigns confidence/importance and retention class.
4. `PromotionRouter`
   - Routes candidates to `WorkingCache`, `MemPalace`, or `Quarantine`.
5. `PruneAndCompactionEngine`
   - Performs dedupe, decay checks, compaction, quarantine transitions, and reversible deletes.
6. `AutonomousScheduler`
   - Runs event-driven and periodic jobs.
7. `DailyStandupReporter`
   - Produces one daily digest for human oversight.

## Data Flow

1. New content arrives from chat events.
2. Ingest normalizes and enriches metadata (session, source, timestamps).
3. Summarizer extracts structured candidates.
4. Classifier/scorer computes confidence and retention class.
5. Router writes:
   - short-horizon or uncertain context to `WorkingCache`
   - durable/high-confidence decisions and facts to `MemPalace`
   - low-confidence noisy items to `Quarantine`
6. Prune/compaction cycle enforces storage health policies.
7. Daily digest publishes key metrics and exceptions.

## Autonomy Contract

- Default mode is fully autonomous.
- Manual intervention is exception-only:
  - anomaly thresholds crossed
  - integrity failures
  - explicit operator override
- All destructive operations require:
  - run-scoped checkpoint
  - reversible run ID
  - audit trail entry

## Control Plane Signals

- `boundary:new_chat`
- `boundary:new_agent`
- `boundary:end_milestone`
- `control:force_sync`
- `control:force_gc`
- `control:override`

## SLO Targets

- >=95% of memory cycles complete without human action.
- Exactly one daily standup digest in normal operations.
- Duplicate density and stale-memory growth trend downward week-over-week.
- Every destructive prune action remains reversible.

## Non-Goals (Current Phase)

- Full host-specific deployment wiring.
- Replacing MemPalace storage engine internals.
- Building a UI dashboard beyond the daily standup artifact.

## Optional extensions (customization)

Some deployments will want **hybrid retrieval**: vectors for similarity plus a **knowledge graph** for typed relations, provenance paths, and standup “how it fits together” views. Prefer an **engineering ontology** (versioned classes and predicates) for interchange; philosophical clarity supports identity and revision edge cases. The graph sits **on top of** the vector layer (derived structure, optional query order **behind** or **in front of** vectors—see that doc). Not required for v1 autonomy; when you adopt it, start from [graph-ontology-and-customization.md](graph-ontology-and-customization.md). Repo build habits: [../BUILD-PHILOSOPHY.md](../BUILD-PHILOSOPHY.md).
