---
name: rewind
description: >-
  Reconstruct durable project context at session start or after a gap — ledger,
  AGENTS.md, project charter, tasks. Use when the user says rewind, /rewind,
  catch me up, or when resuming Infranet or multi-machine work without replaying
  the full chat.
---

# Rewind — durable context reconstruction

**Goal:** Orient from **durable artifacts**, not transcript replay.

Rewind is a **Cursor skill**, not a public URL. Infranet code and docs live under `projects/infranet/`.

## When to use

- New chat, new agent, or milestone boundary
- User invokes **rewind**, **/rewind**, or **catch me up**
- Before meaningful work on **Infranet** (`project_id: infranet`) or other named projects

## Procedure

1. **Sync** — `git pull` in the repo root (if clean).
2. **Ledger** — Read **Recent activity** in `AI_GROUPCHAT.md` (last ~15 lines). Note latest `[PC]` / `[LAPTOP]` / `[LINUX]` intent and results.
3. **mem-constant** — If `mem-constant.yaml` / `.mem-constant/` exist:
   - Read **`.mem-constant/last-session.md`** when non-empty (`mem-constant carryover show`).
   - Read **`.mem-constant/ops-discipline.md`** when present (why→prevention close-out).
   - Spec: `docs/memory/ops-discipline.md` (this package repo) or `docs/mem-constant/ops-discipline.md` after init elsewhere.
4. **Workspace prefs** — Skim `AGENTS.md` **Learned User Preferences** and **Learned Workspace Facts** when the task touches infra, remote access, or agent lanes.
5. **Project charter** (when Infranet or `project_id` given):
   - `projects/infranet/README.md` and `projects/infranet/AGENT-CHARTER.md`
   - `agents/user-tasks.json` — filter `projects[]` / `tasks[]` for the project
6. **Memory** (optional, high-signal only):
   - **claude-mem** — working referents for *this* thread
   - **MemPalace** — canonical facts if disambiguation needed (MemPalace wins on conflict after sync)
7. **Output** — One brief for the user:
   - **Intent** — what we are doing now (from ledger + user message)
   - **Locked** — decisions already made; do not re-litigate
   - **Open** — tasks, blockers, awaiting human
   - **Next step** — one concrete tick (per `CLAUDE.md` one-step discipline on linuxbox)

## Rules

- Do **not** claim Tailscale, SSH, or live service state without terminal evidence on the **right machine**.
- Before **new** meaningful work, append a one-line **`[PC]`** intent to `AI_GROUPCHAT.md` (pull first).
- Do **not** treat Rewind as a web route — there is no `/Rewind` public endpoint.

## Infranet pointers

| Artifact | Path |
|----------|------|
| Charter | `projects/infranet/AGENT-CHARTER.md` |
| Architecture / research | `PLANNING.md`, `RESEARCH.md`, `BLOCKCHAIN_PLATFORM.md` |
| Agent system plan | `claude-code-plan-kill-1.md` |
| Demos | `demo.py`, `DEMO.md` |
| Dashboard project | `agents/user-tasks.json` → `infranet` |
