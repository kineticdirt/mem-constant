# Daily Standup Spec

This document defines the single required human-facing report for autonomous memory operations.

## Purpose

- Provide one concise daily digest.
- Confirm autonomous cycles completed normally.
- Surface anomalies requiring optional intervention.

## Cadence

- Exactly one digest every 24 hours in local project timezone.
- Optional out-of-band alert only on anomaly threshold breach.

## Required Sections

1. `Summary`
   - cycle count
   - autonomy rate
   - overall health status
2. `Promotions`
   - records promoted to `MemPalace` by type
3. `Cache Maintenance`
   - dedupe merges
   - compactions
   - cache size delta
4. `Pruning`
   - quarantined count
   - hard deletes count
   - rollback pointer (`gc_run_id`)
5. `Anomalies`
   - threshold breaches and recommended action
6. `Next Window`
   - scheduled runs and watch items

## Report Schema (JSON Envelope)

- `report_id`
- `period_start_utc`
- `period_end_utc`
- `autonomy_rate`
- `cycles_total`
- `promotions_by_type`
- `cache_delta`
- `prune_metrics`
- `anomalies`
- `latest_gc_run_id`
- `generated_at_utc`

## KPI Thresholds

- Autonomy rate target: `>= 0.95`
- Prune spike threshold: >2x 7-day median hard deletes
- Confidence drift threshold: >0.10 mean confidence drop in 24h
- Growth acceleration threshold: >1.5x 7-day storage growth baseline

## Escalation Rules

- If no anomalies: no action required.
- If anomaly present:
  - include one recommended response
  - include exact subsystem and run IDs
  - keep recommendations reversible-first
