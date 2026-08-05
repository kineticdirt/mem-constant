# Think incident form + recurrence (2026-07-29)

**Why you're asking:** Hub keeps showing the same think failures (`progress-hunter`, stale “free exhausted → paid”, stuck `preparing terminal…`) as one-off firefights. You want failures to leave a durable form, cluster into recurrence, and promote cleanup work — plus an honest answer for how Cursor Auto attaches to the linuxbox/Hermes stack without double-spend.

**Holder:** `think-incident-form`

---

## 0. Clarifying assumptions (confirm if wrong)

1. **Goal is ops hygiene**, not a second Meta-Harness eval product — incident rows feed cleanup priority.
2. **Forms are machine-written** on tick fail (exit ≠ 0 / trap), not Hermes inventing prose mid-tick.
3. **Cleanup tasks are important** — recurrence-promoted `[ops]` user-tasks should outrank casual product fluff when severity is high.
4. **Cursor Auto** means Cursor cloud/Auto agents + optional potato Cursor CLI — not replacing Hermes crons.

---

## 1. Cursor Auto vs Hermes lanes (honest)

| Lane | Who pays | Where | Role |
|------|----------|-------|------|
| **Hermes `think` / `fast`** | Free-first OpenRouter (paid last-resort only) | potato always-on | Minute ticks, lane pick, soft-close, forms |
| **Cursor IDE (this PC)** | Cursor plan | PC workspace | Plans, code, deploy scripts, one-shot potato SSH verify |
| **Cursor Auto / cloud agents** | Cursor plan (paid) | cloud VM / branch | Parallel away work on *cleanup* or *feature* branches |
| **Cursor CLI on potato** (`agent -p`) | Cursor API key | potato, **manual only** | Headless coding when human invokes — **never cron** |

**How Auto attaches without double-spend**

1. Hermes owns the clock: detect fail → append incident → rollup → optional `user-tasks.json` seed.
2. Cursor Auto/cloud picks **open high-severity cleanup tasks** (or a dedicated `[ops] think-incident` tag) — implements once, deploys, marks done.
3. Do **not** point Auto at the same live think tick Hermes is running (same board, same flock) — that races `progress*.md` / paid last-resort.
4. Do **not** install Cursor CLI into Hermes crons; AGENTS already: CLI = paid/manual, Hermes = free always-on.

**Short answer for Auto on this system:** use Hermes for always-on detection + forms; use Cursor Auto/IDE for the cleanup *fixes* those forms promote. Same stack, split roles.

---

## 2. What already exists (survey)

| Artifact | Role today | Gap vs this plan |
|----------|------------|------------------|
| `scripts/linuxbox/think-shell-access-form.py` | C1 shell audit: open/close JSON + `/mnt/archive/logs/think-reports/` MD + `reports/think-ticks/LATEST.md` | Access trail, **not** categorized incident / recurrence |
| `scripts/meta-harness/record_tick.py` + `score_tick.py` | Per-tick INTENT_OK/FAIL + exit score under `agents/meta-harness/runs/think/` | Binary score; no category, no recurrence→user-task |
| Think reports archive | Rich log tails on fail | Human-readable; no structured enum / rollup |
| `reports/agent-mistake-patterns-2026-07-26.md` | One-shot postmortem | Not live ingestion |
| `human-inbox.json` / seeds | Human Q&A | Wrong tool for recurring think thrash |
| `user-tasks.json` | Ad-hoc + `[ops]` work | No auto-seed from think fail clusters |
| Think-tick soft-close / thrash skips | Evidence + `THRASH_*` patterns | `progress-hunter` Discord HOLD wording still re-opens |

Screenshot classes already seen in ledger: `timeout_124`, stale `free_exhausted`, `progress-hunter` / Discord HOLD thrash, `preparing terminal…` hangs.

---

## 3. Incident form schema

Append-only JSONL: **`agents/state/think-incidents.jsonl`** (gitignored runtime; potato-owned).

```json
{
  "id": "inc-20260729T143200Z-a1b2",
  "at": "2026-07-29T14:32:00Z",
  "task_id": "lane:tropic-gooner/progress-hunter.md",
  "blurb": "Discord ingest runbook or HOLD …",
  "exit_code": 124,
  "category": "timeout_124",
  "paid_last_resort": true,
  "model": "deepseek/deepseek-v4-flash",
  "form_path": "agents/state/shell-access-forms/form-….json",
  "report_path": "/mnt/archive/logs/think-reports/…/form-…-exit124.md",
  "log_tail_hash": "sha256:…16",
  "notes": "auto: KeyboardInterrupt / preparing terminal",
  "recurrence_key": "timeout_124|lane:tropic-gooner/progress-hunter.md|discord-ingest"
}
```

### Category enum

| Category | Detect (heuristic, order matters) |
|----------|-----------------------------------|
| `timeout_124` | `exit_code == 124` |
| `free_exhausted_stale` | focus/tail mentions free exhaust / 0 free tried / paid after blocklist (even if pool live) |
| `terminal_prep` | log/tail matches `preparing terminal` / stuck prepare |
| `discord_hold` | blurb/task matches Discord export/ingest HOLD |
| `thrash_progress` | same `task_id`+normalized blurb failed ≥2× recently (set on rollup pass; write-time may use `other` then upgrade) |
| `status_patch_after_done` | enforce-status patched done/blocked after Hermes claimed done but left open |
| `other` | fallback |

Machine fills the form **before sleep / on EXIT trap** when `exit_code != 0` (and optionally on enforce-status patches).

---

## 4. Recurrence rollup

Script: `scripts/linuxbox/think-incident-form.py rollup`

**Recurrence key** = `category|normalize(task_id)|normalize(blurb[:80])`  
Normalize: lower, collapse whitespace, strip punctuation noise, drop timestamps.

**Rollup store:** `agents/state/think-incident-recurrence.json`

```json
{
  "updated_at": "…",
  "items": {
    "<recurrence_key>": {
      "count": 5,
      "first_seen": "…",
      "last_seen": "…",
      "category": "timeout_124",
      "task_id": "…",
      "blurb_sample": "…",
      "severity": 42,
      "flagged_review": true,
      "user_task_id": "inc-clean-…"
    }
  }
}
```

### Severity score (deterministic)

```
severity =
  10 * count
  + 15 if category in (timeout_124, free_exhausted_stale, terminal_prep)
  + 10 if paid_last_resort seen on any row
  + 8  if category == discord_hold
  + 5  if thrash_progress / status_patch_after_done
  + min(20, hours_open / 6)   # age since first_seen
```

**Flags**

- `count >= 2` → `flagged_review: true` (Hub later; Phase 1)
- `count >= N` (default **3**) **or** `severity >= 50` → promote/open `[ops]` cleanup user-task if none open for this key

Cleanup task shape:

- `id`: `inc-clean-<hash12>`
- `title`: `[ops] Think incident cleanup: <category> ×<count> — <blurb_sample>`
- `tags`: `["ops", "think-incident", category]`
- `project_id`: `linuxbox`
- `status`: `open`
- `priority` / notes: severity + recurrence_key + pointer to JSONL

---

## 5. Hook (think-tick)

In `agent-cycle-think-tick.sh`, **after** `think-shell-access-form.py close` and focus failed/done, when `rc != 0` (and on cleanup trap):

```bash
python3 scripts/linuxbox/think-incident-form.py append \
  --exit-code "$rc" --task-id "…" --blurb "…" \
  --model "…" --paid-last-resort 0|1 \
  --report-path "$(cat /tmp/think-report-path.txt)" \
  --log "$LOG"
python3 scripts/linuxbox/think-incident-form.py rollup --promote-threshold 3
```

Must run **before** the 480s sleeper. Best-effort (`set +e`); never block the tick on form I/O failure.

---

## 6. Soft-close: `progress-hunter` Discord HOLD

Evidence: PC board still has open Discord ingest/export HOLD boxes; potato think cannot finish guild export → timeout / paid thrash.

Phase 0:

1. Widen `THRASH_DISCORD_HOLD` to match hunter wording (`Discord ingest runbook or HOLD`, `First export or HOLD`).
2. Soft-close in reconcile **and** skip in `open_boxes` (same as tableslop thrash).
3. Optionally stamp HOLD note into `discord-ingest-runbook.md` if missing (do not invent export data).

---

## 7. Phases

| Phase | Scope | Status |
|-------|--------|--------|
| **0** | Plan + `think-incident-form.py` append/rollup/promote + think-tick hook + hunter Discord HOLD soft-close/skip; deploy; verify one row | **this session** |
| **1** | Hub panel (Systems/Meta): last incidents + flagged recurrence | later |
| **2** | Feed Meta-Harness score dimensions from category; Auto prompt pack for cleanup tasks | later |

---

## 8. Success criteria (Phase 0)

1. Plan path exists (this file).
2. Fake or real fail on potato appends one JSONL row with a category enum.
3. Rollup updates recurrence JSON; threshold promotes at most one open user-task per key.
4. `progress-hunter` Discord HOLD boxes soft-closed / skipped by picker.
5. Ledger Result + no secrets.

---

## 9. Non-goals (YAGNI)

- Hub UI in Phase 0
- Replacing shell-access forms or Meta-Harness traces
- Auto-cron Cursor CLI
- Deleting incident history (append-only; trim later if disk)
