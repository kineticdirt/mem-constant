# Ponytail cleanup board

Agent (**`ponytail-cleanup`** pod, **`code`** profile) takes **one** unchecked **Backlog** card per tick.
Spec: **`agents/PONYTAIL_CLEANUP_TASK.md`** · Rule: **fix/refine in place — no file deletions.**

Human may add cards here or on USB mirror: `PERSONAL/agent-work/agent-dump/ponytail-board.md`

## Backlog

- [ ] **Goal pass (tableslop map):** read `.mem-constant/tableslop-map-goal.md` + `reports/tableslop-errors/LATEST.json`; one-line: which open error blocks the goal; smallest correct next step (no inventing border verts). Verify: error-collect still runs on sync tick.
- [ ] **Ponytail justify sample:** pick one file under `scripts/linuxbox/tableslop-*.sh` you touch this week; write a 4-line Goal/Feature/Keep/Verify note into Done (or board comment); no behavior change required unless a one-line guard is clearly missing.
- [ ] **export_discord_lore.py (tropic-gooner):** add `from __future__ import annotations` at top so `Path | None` annotations run on linuxbox Python 3.9; verify `python3 -m py_compile export_discord_lore.py`
- [x] **Discord token helper:** extract shared `_discord_token()` from `list-discord-category-channels.py` + `configure-hermes-discord-hunter.sh` (+ euro/nyc configure scripts) into `scripts/linuxbox/discord_token.py` (stdlib + dotenv); callers import it — no behavior change. **Daily deslop dd-02.** Done 2026-08-10.
- [ ] **Daily deslop link:** after any refine, append one line to `agents/git-regression-memory.md` if you rediscover a wipe/boot class — keep prevention column filled
- [ ] **Docs drift:** `CLAUDE.md` lane table still says `agent-cycle-think` — align with live cron name `agent-cycle` where that is what runs on box (edit in place, note both names if transitional)
- [ ] **install-*.sh CRLF:** add one shared comment block at top of `scripts/linuxbox/README.md` (or existing linuxbox doc) documenting `sed -i 's/\r$//'` before first run on box — stop duplicating long CRLF paragraphs in each installer
- [ ] **intel-feed-health.py:** confirm maintenance report path is writable on box; if probe timeout is magic `15`, add `ponytail:` comment naming ceiling (no config file)
- [ ] **configure-hermes-discord-hunter.sh:** on channel discovery failure, print actionable checklist (token 401 vs missing guild vs bot not in server) without echoing secrets
- [ ] **user-tasks.json / human-inbox:** document in `USER_TASKS_TASK.md` one sentence that ponytail lane never deletes files (cross-link board) — reduces agent confusion

## In progress

_(agent moves one Backlog line here while working)_

## Blocked

_(needs human — no deletes, no guess)_

## Done

- [x] **agent-pod-scheduler.sh:** explicit `ponytail-cleanup` prompt branch (ponytail rules + board path + Goal/Feature/Keep/Verify) instead of generic task_spec — daily-deslop **dd-04**, 2026-08-10
- [x] **Board + lane scaffold** — `PONYTAIL_CLEANUP_BOARD.md`, `PONYTAIL_CLEANUP_TASK.md`, pod manifest entry, USB sync script, docs — 2026-06-30
