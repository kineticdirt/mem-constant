# Validation Plan

This validation matrix checks whether autonomous memory behavior meets design goals.

## Test Scenarios

1. Noisy Session Burst
   - High volume, low signal notes and repetitive phrasing.
   - Expect dedupe and compaction to reduce noise.
2. Repetitive Similar Chats
   - Repeated facts across multiple sessions.
   - Expect high merge rate with lineage preserved.
3. Conflicting Facts
   - Introduce contradictory statements with mixed confidence.
   - Expect quarantine/dispute handling, no silent overwrite.
4. Decision Supersession
   - Older decision replaced by newer scoped decision.
   - Expect supersede links and durable promotion for latest decision.
5. Long Dormancy
   - Idle period followed by new session.
   - Expect stale ephemeral pruning and durable retention.
6. Anomaly Injection
   - Simulate prune spike and confidence drift.
   - Expect anomaly flags in daily standup and optional escalation.

## Acceptance Criteria

- Normal cycles require no manual action.
- Autonomy rate meets or exceeds 95%.
- Daily standup is sufficient for operator awareness.
- Durable recall precision remains high for facts/decisions.
- Duplicate density trends downward across validation windows.
- Every destructive prune action is reversible using `gc_run_id`.

## Metrics To Record

- total items ingested
- routed distribution (`MemPalace`, `WorkingCache`, `Quarantine`)
- dedupe merge count
- compaction count
- quarantine count
- hard delete count
- rollback count
- confidence distribution over time

## Exit Gate For Build Readiness

- All scenario tests pass expected outcomes.
- No integrity regression after prune cycles.
- Report payload includes all required sections and thresholds.
