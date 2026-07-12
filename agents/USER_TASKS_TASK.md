# User tasks lane (ad-hoc work queue)

**Profile:** `think` — one item per tick when `agents/user-tasks.json` has `status: "open"`.

## Goal

Work **human-created tasks** grouped under optional **projects** (`agents/user-tasks.json` → `projects[]` + `tasks[]`). Tasks are independent of campaign `progress.md` lanes. Tasks may link a `project_id`, tags, and optional campaign/story context.

## One tick

1. Read `agents/user-tasks.json` — pick the **oldest** task with `status: "open"`.
   **Priority within this lane:** (1) Hub **Fix this** tasks — title starts with `[ops]` or body starts with `## Fix this`, especially `Urgency: soon`; (2) `project_id: tableslop` when present; (3) otherwise oldest open.
2. If `project_id` set, read project row + skim `charter_path` (e.g. `projects/infranet/README.md`).
3. If `context.story_path` set, skim that markdown under `campaigns/`.
4. If `context.chat_thread_id` set, read `agents/state/chat-threads/{id}.json` — use recent turns as research brief (thread is gitignored runtime state; do not delete it).
5. Do **one** concrete step toward completing the task (patch, doc, config, verify).
6. Set status to `done` or leave `open` with a note in `body` if blocked; update `updated_at`.
7. Append one line to `AI_GROUPCHAT.md`, stop.

## Human-decision routing (so the agent is "in charge" without guessing)

Some tasks hinge on a decision only the human can make — **which physical thing they own,
budget, buy/no-buy, taste/preference, anything irreversible**. For these:

1. **Check first, don't spam:** if `agents/state/human-inbox.json` `open[]` already holds an
   equivalent question for this task, that task is **awaiting the human** — skip it and pick the
   **next open task in this lane** that still has actionable (non-blocked) work. Only if **every**
   open user task is awaiting a human answer should you fall through to the next lane. Do **not**
   re-ask every tick.
2. Otherwise do the **research you safely can** (gather options, cite sources, draft the
   reversible parts), then post **one** concise question to `agents/state/human-inbox.json` `open[]`
   (`{ "id", "question", "context", "option_help" (if choice), "task_id", "created_at" }`) and **leave the task `open`**
   with a one-line note in `body`.
3. **Never guess** a preference or an irreversible/spend decision to force a task closed.
   Answers arrive on the `/Linuxbox/` **Inbox** tab and flow back via `agents/state/human-inbox.json`.

**Inbox copy:** `context` must explain what you are asking and why (2–4 sentences). Include a lore pointer path when applicable (e.g. `campaigns/tropic-gooner/reports/organizations/stevens-co.md` or `reports/faction-registry.md` PRI row) so the GM can answer without hunting files. For choice questions, add `option_help` parallel to `options[]`. Never post bare acronyms (PRI-####, CRT, etc.) without a plain-language summary in `context`.

## Do not

- Auto-close tasks without verification when the ask was “fix X on live dashboard”.
- Merge user tasks into campaign `progress.md` unless the task explicitly asks for it.
- **Re-do work owned by a deterministic cron** (e.g. Mazda3 price checks are owned by the
  `mazda3-price-monitor` cron — never re-scrape prices with paid model calls from this lane).
- **Re-ask** a question already sitting in `agents/state/human-inbox.json` `open[]`.

## UI

Humans create tasks on `/Linuxbox/` **Tasks** tab, link them as chat context on **Stories** / **Chat**, or use **+ Promote to task** on an existing chat thread (copies last ~8 turns into task body + `context.chat_thread_id`).

**Hub → Fix this** (ops meta, separate from Chat): structured form queues an open user-task with title `[ops] …`, `project_id: linuxbox`, tags `bugfix`+`maintenance`, and a body starting with `## Fix this` (where / urgency / repro). Prefer these when picking the next open task (see One tick). Phase 2 (not v1): optional immediate Hermes think tick — today the normal user-tasks lane is the dispatch.
