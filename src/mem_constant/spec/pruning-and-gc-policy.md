# Pruning And GC Policy

This policy keeps memory stores healthy while preserving durable knowledge and reversibility.

## Policy Mode

- Mode: `semi-auto`
- Principle: automate low-risk cleanup, quarantine uncertain candidates, preserve durable high-confidence memory.
- Recommended default profile: `balanced`
- Optional profile: `aggressive` (higher prune cadence, stricter save gates, lower tolerance for stale low-signal memory)

## Tuning Profiles

### Balanced (default)

- cadence: daily
- save gate: medium confidence floor
- quarantine first, hard-delete only when stale + unreferenced + low confidence
- prioritize retention of active tasks and medium-signal context

### Aggressive (opt-in)

- cadence: daily or faster
- stronger save gate (fewer memories retained by default)
- lower per-item tolerance for stale/unreferenced content
- use when memory bloat is causing noisy recall or token pressure

## Prune Lifecycle

1. `snapshot`
   - Create a run-scoped backup/checkpoint.
   - Emit immutable `gc_run_id`.
2. `candidate_selection`
   - Identify candidates using age, confidence, reference count, and duplicate score.
3. `action_execution`
   - dedupe merge
   - compaction summary
   - quarantine move
   - hard delete only for high-certainty low-value stale entries
4. `post_validation`
   - verify store integrity and retrieval smoke checks.
5. `reporting`
   - include metrics and rollback pointer in daily standup.

## Candidate Selection Rules

- Low confidence: `< 0.45`
- Stale window: no access for configured duration (default 30 days for ephemeral)
- Unreferenced: `reference_count == 0`
- Near duplicates: semantic similarity above dedupe threshold

Candidates must satisfy at least two of the above unless explicitly operator-marked.

### Goal-change recontext trigger

When goals materially change, force a recontext pass before normal prune selection:

1. snapshot current working context
2. keep only items directly linked to current goals
3. downgrade or quarantine stale goal branches
4. emit a handoff summary for what was dropped and why

## Action Rules

### Dedupe Merge

- Keep canonical record with highest combined confidence/importance.
- Preserve lineage by attaching merged IDs in metadata.

### Compaction

- Bundle many low-signal records into one `episode-summary`.
- Keep source references for traceability.

### Quarantine

- Move uncertain or potentially contradictory entries to quarantine before delete.
- Quarantine retention window defaults to 14 days.

### Hard Delete

- Allowed only when:
  - backed up in current run
  - low confidence
  - stale beyond policy window
  - no references
  - not `durable` or unresolved `decision`

## Retention Guards

- Never auto-delete active high-confidence decisions.
- Never auto-delete durable facts unless explicitly superseded and stale.
- Keep recent operational tasks even when confidence is medium.

## Rollback

- Rollback by `gc_run_id`.
- Restore from checkpoint snapshot.
- Replay non-destructive updates if needed.
- Record rollback reason in next daily standup.

## Health KPIs

- duplicate density
- stale item growth
- quarantine inflow/outflow
- prune action distribution
- rollback frequency
