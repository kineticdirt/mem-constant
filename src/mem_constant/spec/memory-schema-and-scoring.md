# Memory Schema And Scoring

This specification defines canonical memory objects, required metadata, and scoring logic used for promotion and pruning.

## Canonical Memory Types

- `fact`: stable descriptive information.
- `decision`: an agreed choice with rationale and scope.
- `task`: actionable work item with owner and status.
- `context-note`: transient context that helps continuity.
- `episode-summary`: compressed summary of a bounded conversation slice.

## Base Schema

All memory objects should include:

- `memory_id`: globally unique ID.
- `memory_type`: one of canonical types.
- `content`: concise text payload.
- `source_refs`: source event IDs or transcript references.
- `created_at_utc`
- `last_seen_at_utc`
- `session_id`
- `agent_id`
- `confidence_score`: `0.0..1.0`
- `importance_score`: `0.0..1.0`
- `reference_count`: number of retrieval hits or explicit mentions.
- `retention_class`: `ephemeral | operational | durable | archival`
- `status`: `active | superseded | quarantined | deleted`
- `supersedes`: optional previous memory IDs.
- `tags`: optional taxonomy labels.

## Type-Specific Fields

### `decision`

- `decision_scope`: where the decision applies.
- `why`: short rationale.
- `effective_from_utc`
- `superseded_by` (optional)

### `task`

- `task_state`: `pending | in_progress | blocked | done`
- `next_action`
- `owner` (optional)
- `due_date_utc` (optional)

### `fact`

- `fact_scope`: system or domain area.
- `verification_state`: `asserted | verified | disputed`

## Scoring Model (Initial)

`confidence_score` inputs:

- extraction certainty
- source quality
- contradiction checks
- repetition consistency

`importance_score` inputs:

- memory type weight (`decision` and durable `fact` weighted highest)
- reuse probability
- operational relevance
- explicit user emphasis

Suggested blended priority:

`priority = (0.45 * confidence) + (0.35 * importance) + (0.20 * normalized_reference_count)`

## Retention Class Assignment

- `ephemeral`: temporary notes, scratch context.
- `operational`: medium-lived context and active tasks.
- `durable`: stable facts and active decisions.
- `archival`: historical summaries retained for audit/recall.

## Default Routing Thresholds

- Promote to `MemPalace` if:
  - `retention_class in {durable, archival}` and `confidence_score >= 0.75`
- Keep in `WorkingCache` if:
  - `retention_class in {ephemeral, operational}` and not noisy
- Send to `Quarantine` if:
  - `confidence_score < 0.45`, contradiction unresolved, or duplicate uncertainty high

## Conflict Handling

- Prefer newest high-confidence `decision` over older conflicting decisions.
- Mark replaced records `superseded`, never silently overwrite history.
- For disputed facts, keep both with `verification_state` until resolved.
