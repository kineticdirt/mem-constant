# Operations Runbook

This runbook defines how autonomous memory operations execute with exception-only human involvement.

## Operating Modes

- `normal`: fully autonomous cycles.
- `degraded`: autonomous with retries and reduced action scope.
- `override`: operator-invoked controls for corrective action.

## Trigger Matrix

### Event-Driven Triggers

- `boundary:new_chat` -> sync + summarize previous conversation.
- `boundary:new_agent` -> context handoff extraction + sync.
- `boundary:end_milestone` -> promotion-heavy reconciliation run.
- `handoff` keyword -> emit global handoff output format.

### Scheduled Triggers

- hourly: lightweight sync and conflict checks.
- nightly: prune/compaction cycle.
- daily: standup report generation.

## Failure And Retry

- Each job includes:
  - idempotency key
  - retry budget
  - backoff strategy
- On persistent failure:
  - mark degraded mode
  - skip destructive actions
  - include alert in daily standup

## Control Commands

- `force_sync`
- `force_gc`
- `pause_destructive_ops`
- `resume_normal_mode`
- `rollback_gc_run <gc_run_id>`

## Safety Protocol

- No destructive action without checkpoint.
- No silent conflict overwrite on decisions/facts.
- No hard delete for unresolved high-confidence records.

## Readiness Checklist

1. Schema and scoring spec available.
2. Routing thresholds configured.
3. GC policy configured with retention windows.
4. Scheduler triggers and retries configured.
5. Daily standup output verified.
6. Handoff template generation verified.
7. Rollback procedure tested.
