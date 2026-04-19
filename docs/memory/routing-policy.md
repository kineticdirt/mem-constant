# Promotion Routing Policy

This policy controls routing from extracted candidates into `WorkingCache`, `MemPalace`, or `Quarantine`.

## Inputs

- `memory_type`
- `confidence_score`
- `importance_score`
- `retention_class`
- `reference_count`
- conflict status
- duplicate status

## Primary Routes

## Route A: MemPalace (Canonical Archive)

Send to `MemPalace` when all are true:

- `retention_class in {durable, archival}`
- `confidence_score >= 0.75`
- no unresolved contradiction with newer higher-confidence records

Priority memory types:

- high-confidence `decision`
- durable `fact`
- milestone `episode-summary`

## Route B: WorkingCache (Short-Horizon Context)

Send to `WorkingCache` when:

- `retention_class in {ephemeral, operational}`
- confidence is medium/high but not durable-ready
- useful for active thread continuity

## Route C: Quarantine (Uncertain Or Noisy)

Send to `Quarantine` when any are true:

- `confidence_score < 0.45`
- contradiction unresolved
- duplicate uncertainty unresolved
- extraction confidence low with sparse source support

## Conflict Rules

- Prefer latest high-confidence decision by scope.
- Mark older conflicting items as `superseded`, do not delete immediately.
- For conflicting facts, keep both with dispute metadata until resolved.

## Routing Audits

Each routed item should log:

- route destination
- applied thresholds
- reason codes
- related IDs (if deduped/superseded)

## Default Tunables

- `mempalace_confidence_threshold = 0.75`
- `quarantine_confidence_threshold = 0.45`
- `high_importance_threshold = 0.70`
- `duplicate_similarity_threshold = 0.88` (initial target, tune after telemetry)
