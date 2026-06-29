# User tasks lane (ad-hoc work queue)

**Profile:** `think` — one item per tick when `agents/user-tasks.json` has `status: "open"`.

## Goal

Work **human-created tasks** grouped under optional **projects** (`agents/user-tasks.json` → `projects[]` + `tasks[]`). Tasks are independent of campaign `progress.md` lanes. Tasks may link a `project_id`, tags, and optional campaign/story context.

## One tick

1. Read `agents/user-tasks.json` — pick the **oldest** task with `status: "open"`.
2. If `project_id` set, read project row + skim `charter_path` (e.g. `projects/infranet/README.md`).
3. If `context.story_path` set, skim that markdown under `campaigns/`.
4. Do **one** concrete step toward completing the task (patch, doc, config, verify).
5. Set status to `done` or leave `open` with a note in `body` if blocked; update `updated_at`.
6. Append one line to `AI_GROUPCHAT.md`, stop.

## Do not

- Auto-close tasks without verification when the ask was “fix X on live dashboard”.
- Merge user tasks into campaign `progress.md` unless the task explicitly asks for it.

## UI

Humans create tasks on `/Linuxbox/` **Tasks** tab or link them as chat context on **Stories** / **Chat**.
