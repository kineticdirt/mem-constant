# Meta · lane sync (injectable)

**Audience:** Hermes think / Cursor Auto / Hub agents. Cap-friendly. Full skill: `.cursor/skills/lane-sync/SKILL.md`.

## Philosophy

Prefer clear silos over Tasks soup. System sees everything. Correctness over thrash. Lanes share the box — sync before write. Observability (papercuts · meta-harness · backlog) improves the process; Hub Meta shows live sync; Hub System shows those three.

## Pick order (quiet → busy)

1. `[ops]` / Fix-this  
2. campaign ≡ project (RR)  
3. other user-tasks / meta markers  
4. education → research → IDLE  

## Conflict rules (skip these)

| Resource | Writers | Skip |
|----------|---------|------|
| chars-registry / portraits | Chars UI · world ingest · locked GM Cursor | Blind SCP / hard-delete |
| regions-ui.json | GM Draw only | Agent digitize / ellipse stubs |
| human-inbox answered[] | normalize · consume · Hub reply | Bare-array overwrite / re-seed answered |
| chat-threads | Hub Chat | Deploy wipe |
| think flock | think-tick | Sync holding lock past wall |
| Hermes ∥ Cursor | twin OK | Same file without lock + ledger Intent |

## Observability triad

- Papercuts → `agents/papercuts.md` (`docs/agents/papercuts.md`)
- Meta-Harness → `GET /api/meta-harness` · runs under `agents/meta-harness/runs/`
- Backlog → `agents/LINUXBOX_DASHBOARD_BACKLOG.md` (one item per tick)

## Board

`agents/SYSTEMS_DESIGN_BOARD.md` — reuse catalog before inventing helpers.
