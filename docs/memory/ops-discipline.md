# Ops discipline — understand why, then prevent recurrence

**Status:** core mem-constant policy (v1)  
**Audience:** agents and humans closing a failure, regression, or “something wrong” ticket.

## Rule

Whenever something is **wrong** (bug, silent revert, bad deploy, false UI state, data wipe):

1. **Understand why it was wrong** — root cause with **evidence** (logs, diffs, served vs expected, machine). Name the *mechanism* that allowed it. Symptom-only patches are unfinished.
2. **Make sure we don’t do it again** — before closing, leave a **durable prevention** that a future agent will hit: guard/assert/smoke, watermark, deploy-pair marker, layout/CSS invariant, lock, ledger lesson, or a short note under **`.mem-constant/`** / specs. A fix without prevention is unfinished.

## When it applies

- User reports a regression or broken UI/API
- Agent discovers PC ≠ potato skew, silent git/reset clobber, or deploy drift
- A “fixed” item returns (same class of failure)

## Close-out checklist

| Step | Done when |
|------|-----------|
| Why | One-sentence mechanism + where evidence lives |
| Prevention | Concrete artifact (script check, CSS invariant, lock, watermark, smoke) |
| Memory | Lesson in handoff / `.mem-constant/` pointer / MemPalace if durable across projects |
| Verify | One runnable check that fails if the bug returns |

## Project pointers (optional)

Repos may keep a short always-on note:

- **`.mem-constant/ops-discipline.md`** — project-local pointer + recent lessons
- Spec copy after `mem-constant init`: **`docs/mem-constant/ops-discipline.md`**

## Handoff

When recording a failure in a handoff, include **Why wrong** and **Prevention left** (see [global-handoff-template.md](global-handoff-template.md)).
