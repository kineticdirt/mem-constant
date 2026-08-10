# Daily deslop lane (paired with ponytail)

**Profile:** `think` (free-first) when `agents/daily-deslop-progress.md` has unchecked `[ ]`, or as part of daily maintenance after intel probes.  
**Pair:** `.cursor/rules/ponytail.mdc` + `agents/PONYTAIL_CLEANUP_TASK.md` — **no file deletions**; refine / extract / reuse.  
**Deslop focus:** AI code slop (extra comments, abnormal try/catch, `any` casts, deep nesting) — same spirit as Cursor `deslop` skill, but **daily ops**, not only PR diffs.

## Why

Code accumulates one-off patches (map blank, pin overrides, Hub hangs). Daily pass should:

1. **Remember** where git/runtime reversions already burned us (`agents/git-regression-memory.md`).
2. **Atomize** by **function + goal** (small reusable helpers, not a new framework).
3. **Reuse** existing scripts/helpers before inventing a parallel path.

## One tick = one progress item

1. Read **`agents/daily-deslop-progress.md`** — first unchecked `[ ]`.
2. Read **`agents/git-regression-memory.md`** — do not reintroduce listed failure modes.
3. State Goal / Feature / Keep? / Verify (ponytail card format).
4. Smallest correct refine (extract helper, dedupe, `ponytail:` ceiling comment, kill dead duplicate path).
5. Verify one concrete check (`node --check`, `bash -n`, `py_compile`, smoke).
6. Flip `[ ]`→`[x]` + Done line; append `[LINUX]`/`[PC]` to `AI_GROUPCHAT.md`. Stop.

## Cadence

- **Daily seed:** when the dated “daily desk” section has no open `[ ]`, seed **one** new tick from: papercuts, ponytail backlog, git-regression “prevention still thin”, or duplicate helpers under `scripts/linuxbox/`.
- Prefer **free** models; paid only under C8 / genuine capability gap.

## Do not

- Delete files or wipe runtime SoT (`regions-ui`, registries, chat-threads).
- Broad refactors “while here”.
- Invent second copies of helpers that already exist (grep first).

## Related

| Artifact | Path |
|----------|------|
| Progress board | `agents/daily-deslop-progress.md` |
| Git / revert memory | `agents/git-regression-memory.md` |
| Ponytail board | `agents/PONYTAIL_CLEANUP_BOARD.md` |
| Systems map | `agents/SYSTEMS_DESIGN_BOARD.md` |
| Daily maintenance | `agents/DAILY_MAINTENANCE_TASK.md` |
| Procedure | `docs/agents/daily-deslop.md` |
