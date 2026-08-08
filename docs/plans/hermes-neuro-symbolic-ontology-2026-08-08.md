# Hermes neuro-symbolic / ontology improvements (2026-08-08)

**Holder:** `hermes-ontology-ledger`  
**From:** `docs/musings/2026-08-08-agentic-ontologies-coyle.md` (Coyle)  
**Principle:** Pydantic-at-door · ontology-at-ledger · pure agents (no unvalidated side effects)

## Goal

Reduce Hermes think / Cursor thrash and illegal state writes by validating **domain rules** before mutating potato SoT (`user-tasks.json`, lane-failover, inbox).

## Non-goals

Full OWL on-box; Pixi creative constraint; upgrading Hermes same-day as release.

## Phases

### P0 — Soak gate (ship with this doc)

- `agents/update-targets.json`: `min_release_age_days: 7` (global)  
- `safe-update-check.sh`: HOLD if GitHub/npm/PyPI release published &lt; 7 days ago  
- Targets: **hermes**, **cloudflared** (new), peers  
- CLAUDE.md update-gate blurb

### P1 — Ops ontology + ledger check

- `agents/ontology/ops-v1.json` — classes, enums, disjoint roles, functional props  
- `scripts/linuxbox/ontology-ledger-check.py` — validate proposed task patch; `--self-check`  
- Wire: `lane-failover.py` archive/blocked path; optional think-tick before marking done

### P2 — Door validators

- Shared JSON Schema for tool-ish payloads (task id, status, assigned_lane)  
- New scripts refuse bad args before disk write

**Shipped (2026-08-08):** `door` section in `agents/ontology/ops-v1.json` + `scripts/linuxbox/door-validate.py` (stdlib, `--self-check`). Wired: `lane-failover.py record`; **shared store** `user-tasks-store.py` (door+ledger on every status write); `consume-inbox-answers.close_user_task` → store; dashboard `updateUserTask` reads status enum from `ops-v1.json` (keeps legacy `cancelled` until triage migrates). Deferred (audit): shell-heredoc dedupe in think-tick/sync, inbox write-time shape, chat threads.

### P3 — Isla soft ontology (World Editor)

- Reuse `wiki/entities.json` kinds as ledger for place/quest makers  
- Disjoint: former-PC ambient ≠ questgiver (`wb-tg-factions`)

### P4 — Optional later

- Lightweight transitive place containment  
- MemPalace room as long-term ontology archive (not runtime reasoner)

## Verify

```bash
python3 scripts/linuxbox/ontology-ledger-check.py --self-check
bash scripts/linuxbox/safe-update-check.sh hermes   # expect HOLD if release <7d even if clean
```

## Upgrade cadence reminder

Check releases **weekly**; upgrade only if **SAFE** **and** `published_at` ≥ 7 days ago. Do not same-day chase Hermes / cloudflared.
