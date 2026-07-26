# Continuous lanes — campaign · project · research · education

Canonical think-picker SoT: `scripts/linuxbox/agent-cycle-think-tick.sh`  
Has-work markers: `scripts/linuxbox/agent-cycle-has-work.py` (`THINK_MARKERS`)  
Human-facing rotation prose: `agents/CURRENT_TASK.md` · linuxbox how-to: `CLAUDE.md`

This stack has **four continuous content lanes** plus ops/meta. When `[ops]` is quiet, think keeps rotating work instead of IDLEing.

## The four lanes

| Lane | Purpose | Progress / task files | Deliverables |
|------|---------|------------------------|--------------|
| **campaign** | RP / worldbuilding (tropic, nyc, …) | `campaigns/*/reports/progress.md` · specs `*_TASK.md` | campaign reports / sheets |
| **project** | Product build (tableslop, pixi, portfolio) | `agents/tableslop-progress.md` · `PIXI_RP_PROGRESS.md` · `portfolio-progress.md` | map/UI/staging artifacts |
| **research** | Agent studies, model benches, topic research | `agents/research-studies-progress.md` · `RESEARCH_STUDIES_TASK.md` | `reports/research/` |
| **education** | Human improvement: math, speech, **engineering management styles**, teaching | `agents/self-improvement-progress.md` · `SELF_IMPROVEMENT_TASK.md` (education naming; keep `si-*` ids) | `reports/self-improvement/` and/or `reports/education/` · Inbox `si-*` / `edu-*` |

**Not the same as:** AI-stack self-improve (`SELF_IMPROVE_PROGRESS.md` S1–S3) · X bookmarks (`RESEARCH_BOOKMARKS_TASK.md`) · Hunter pod (dedicated, not product/campaign RR).

## Think pick order (quiet → busy)

1. **`[ops]` / Fix-this** user-tasks — always first.
2. **Same tier RR — campaign ≡ project** — `CONTINUOUS_LANES` in think-tick + state `agents/state/think-continuous-rr.json`. Neither starves the other.
3. Other product user-tasks, then remaining user-tasks.
4. Other meta markers (dashboard backlog, maintenance, integrity, ponytail, …) via has-work reason.
5. **Education** — `self-improvement-progress.md` (human drills; free-first).
6. **Research** — `research-studies-progress.md` (**after education, before IDLE**; free-only).
7. Else **IDLE**.

Documented idle order: **education → research** (not RR between them). Education teaches the human; research is agent quiet-time study. Sibling owns the research board — extend, never wipe.

## Why this split

- **Campaign ≡ project** keeps story and product moving on the same cadence after ops.
- **Education** forces human growth when the machine would otherwise sit idle (math, speech, EM styles applied to learning/teaching).
- **Research** fills remaining quiet ticks with measurable studies (e.g. free-model benches) without competing with human drills.

## Education notes (EM styles)

Engineering management styles on the education board are **applied to learning/teaching**, not corporate fluff: servant leadership, situational leadership, OKRs-for-learning, feedback loops, psychological safety, etc. Tick boxes live on `agents/self-improvement-progress.md` (`si-edu-em-*`). One tick → one short report under `reports/education/em-styles-*.md` (preferred) or `reports/self-improvement/`, and/or one Inbox drill (`si-*` or `edu-*`; anti-spam: never a second open education item).

## Verify a quiet tick can pick education

```bash
# on potato
grep -E '^\s*[-*]\s*\[\s\]' ~/agent-dump/agents/self-improvement-progress.md | head
python3 ~/bin/agent-cycle-has-work.py --lane think --repo ~/agent-dump
# When only education/research remain, reason should end with self-improvement-progress.md
# (or research-studies if SI empty).
```
