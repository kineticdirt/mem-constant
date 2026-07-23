# Self-improve lane (S4 pack) — progress

Human lock 2026-07-23: do **all three in order**. Prefer free models for ticks; paid OK for planning/complex impl.

## Open — build

- [x] **S1** — Hermes profile `state.db` size guard + auto-archive (`scripts/linuxbox/hermes-profile-db-guard.sh`; hooked from think tick + gateway watchdog). Threshold default 200 MiB.
- [ ] **S2** — Agent coding that can **patch + smoke-test** on allowlisted paths (dashboard/scripts), not propose-only.
- [ ] **S3** — Meta-Harness score/promote loop wired to a real pod after S2 exists.

## Ops notes

- Ticks re-enabled **adaptive**: think crontab 1m, throttle 5m quiet / 1m if ≥4 open user-tasks; light fast 1m.
- Keep `agent-pod-scheduler.timer` **disabled** until dual-fire redesigned.
