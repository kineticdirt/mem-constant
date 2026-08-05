# Inbox answers + user tasks — audit (2026-07-07)

## Your answers are not lost

They are stored on **linuxbox** at:

`agents/state/human-inbox.json` (gitignored runtime file)

**Confirmed on box (SSH):** 5 items in `answered[]`, 1 in `open[]` (white wheels pick).

| ID | Your answer (summary) |
|----|------------------------|
| `wb-tg-rules` | WoD 20th |
| `wb-tg-date` | ~2012–2018 give or take 10 years |
| `ponytail-root-docs-prefix-20260705` | Option B — reassign to think pod |
| `mazda3-ev-swap-gonogo-20260706` | Semi real — feasibility first, you want it |
| `mazda3-chassis-20260705` | Bilstein + Eibach Pro-Kit (did not pick Mazda 3 vs CX-30) |

**Still open:** `mazda3-white-wheels-20260706` — pick Konig Hexaform / ESR APX01 / Konig Oversteer.

View in UI: **`/Linuxbox/` → Inbox tab → Recent answers** (admin only; not on public `/Intel/`).

## Why it felt like answers disappeared

1. **Runtime vs git** — Answers never commit to git. PC repo `agents/human-inbox.json` shows empty `answered[]` and a stale `questions[]` schema (meta-harness only).
2. **Public Intel** — Viewer role hides Inbox; you only see News/Docs.
3. **Hub doesn't list answers** — Only the Inbox tab loads `answered[]` via `/api/inbox`.

## Are user tasks properly implemented?

**Partially on linuxbox; PC git is behind.**

| Task | PC git | Linuxbox box | Notes |
|------|--------|--------------|-------|
| Mazda chassis | `open` | **`done`** | Closed without resolving 3 vs CX-30; your answer changed parts preference |
| EV swap scope | `open` | **`done`** | Agent drafted README + got your semi-real answer |
| White wheels | `open` | `open` | Waiting on your inbox pick |
| Price monitor | `done` | `done` | Cron-owned |
| Infranet (3) | `open` | `open` | Not started |
| tableslop manifest | `open` | `open` | Regular lane |

Box counts: **2 open**, **6 done** user tasks.

## Gaps blocking agents from acting on answers

1. **Path split** — Dashboard writes `agents/state/human-inbox.json`; fast/think tick prompts still say `agents/human-inbox.json`. Files happen to match on box today but can drift.
2. **No inbox → task bridge** — Answering does not auto-update `user-tasks.json` or project files.
3. **No `task_id` on agent-posted questions** — Hard to match answers to tasks.
4. **Tropic-gooner seeds** — 27 seeds in `inbox-seeds.json`; only **2 answered**; 25 still show as open when you open Inbox.

## Minimal fixes (recommended, not implemented in Phase 0)

1. Symlink `agents/human-inbox.json` → `agents/state/human-inbox.json` on linuxbox **or** update all tick prompts to state path.
2. Add `task_id` when posting inbox questions from user-tasks lane.
3. Sync PC `user-tasks.json` from box after agent closes tasks.
4. Re-open or follow-up chassis question (Bilstein/Eibach still needs Mazda 3 vs CX-30 for fitment).
