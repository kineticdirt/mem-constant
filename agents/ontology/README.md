# Ops ontology (potato stand-in)

Not a full OWL reasoner. JSON rules + `scripts/linuxbox/ontology-ledger-check.py`.

- SoT: `ops-v1.json`
- Musing: `docs/musings/2026-08-08-agentic-ontologies-coyle.md`
- Plan: `docs/plans/hermes-neuro-symbolic-ontology-2026-08-08.md`

## Ledger (semantics / transitions)

```bash
python3 scripts/linuxbox/ontology-ledger-check.py --self-check
```

## Door (payload shape before disk write)

Specs live under `door` in `ops-v1.json`. Validator:

```bash
python3 scripts/linuxbox/door-validate.py --self-check
python3 scripts/linuxbox/door-validate.py --spec inbox_seed_append --json '{"id":"x-1","type":"text","question":"...","context":"...(>=40 chars)..."}'
```

Wired: `lane-failover.py record` validates `lane_failover_record` before mutating state/tasks;
`user-tasks-store.py` wraps door+ledger for status writes; `consume-inbox-answers.close_user_task`
uses the store; `linuxbox-status-server.js` reads status enum from `ops-v1.json` (no silent `blocked` drop).

