# Hermes task inbox — linuxbox agent cycles

**Status:** active — **`[ops]` first**, then continuous **project + campaign** (same-tier RR), then meta markers, then quiet **education → research**, then IDLE.

**Four continuous lanes:** **campaign · project · research · education** — research = studies/benchmarks (`research-studies-progress.md`); education = human SI (`self-improvement-progress.md`). Both only when ops + project/campaign are quiet. Full arch: `docs/agents/continuous-lanes.md`.

## Profiles (cron split)

| Cron | Profile | Schedule | Role |
|------|---------|----------|------|
| `agent-cycle-think` | **think** | crontab **1m**; LLM **~8m** (`THINK_INTERVAL_SEC=480`) | sync (deterministic) + **one** lane step |

**Sync (no LLM):** `agent-cycle-sync.sh` at start of each think tick — inbox normalize, git bundle/pull, consume-inbox-answers, swarm-dispatch. **Fast lane removed** 2026-08-01.

**Setup injection:** `think-setup-context.py` prepends `CLAUDE.md` + lane SoT into Hermes prompt (see `agents/think-agent-setup.md`).

**Parallel engines (2026-08-01)** — SoT `docs/plans/hermes-parallel-lanes-2026-08-01.md`:
| Lane | Engine | When |
|------|--------|------|
| **Agent 1** | Hermes **think/chat** via OpenRouter + ZenMux (free-first / C8) | Cron + Hub non-Cursor chat — must keep running while Cursor is busy. **Single** think flock (`/tmp/agent-cycle-think.lock`). |
| **Agent 2** | Potato **Cursor SDK Auto** (`cursor:auto`, `CURSOR_SDK_AUTO_ONLY=1`) | Explicit Hub Agent-coding / SSH `cursor-agent-run.sh` (nohup OK). **Not** on 1m think cron. **Not** a second OR think flock / Discord bot. |

Hub Chat runs Cursor and Hermes on **separate workers** (do not serialize). Think flock is think-only — never waits on Cursor. Multitask disk locks only for shared protected files (chars-registry etc.), not for “Cursor vs Hermes”. Hunter Discord gateway stays singular.

**Ops note (NYC FOCUS — 2026-08-01 gear `nyc-wb-gear-change`):** Stop prioritizing Tableslop **map draw** for agents (borders sacred / GM-owned pause). **Cursor Auto ∥ Hermes** focus **NYC Mafia × D&D worldbuilding** — boroughs + campaign parts. Phase F done; **Phase G** open in `campaigns/nyc-mafia-dnd/worldbuilding/progress.md`. GM questions: `worldbuilding/drip/2026-08-01-boroughs-gm-questions.md`. Cursor Auto drafts `draft-dependent` borough stroke stubs only for unlocked forks — do not invent locks.

Human questions → `agents/state/human-inbox.json` · answers via `/Linuxbox/` **Inbox** tab.

**Papercuts:** lane friction (repeated 429s, unclear env, bad UX, regressions) → log to `agents/papercuts.md` (`docs/agents/papercuts.md`); resolve autonomously when safe.

## Lane rotation (`agent-cycle-think` only)

**Picker (code SoT):** `scripts/linuxbox/agent-cycle-think-tick.sh` — not this prose. Order:

1. **Repo sync (do not block on this).** Sync tick (`agent-cycle-sync.sh` at think start) runs `apply-git-bundle.sh` + `git-pull-and-deploy.sh`. Think must **not** run `git pull` / `git pull --ff-only` via the terminal tool. If the tree is dirty or HTTPS pull would fail (private `Linuxbox` repo — sync is PC→box **git bundle**), **skip sync and continue** to the next lane. **Never** open an inbox question solely for git pull / "terminal safety guard". Optional read-only: `git status -sb`.
2. **Urgent `[ops]` / Fix-this** user-tasks — Hub Fix this first (`agents/USER_TASKS_TASK.md`).
3. **SAME TIER — product boards + campaign progress (round-robin)** — pick **one** open `[ ]` from continuous boards (state: `agents/state/think-continuous-rr.json`), flip `[ ]`→`[x]` + Done line (enforce-lane safety net):
   - **Product:** `agents/tableslop-progress.md` · `agents/PIXI_RP_PROGRESS.md` · `agents/portfolio-progress.md` (free-first; portfolio preview-only)
   - **Campaign (ops think):** `campaigns/nyc-mafia-dnd/reports/progress.md` · `campaigns/nyc-mafia-dnd/worldbuilding/progress.md` (Phase G open) · `campaigns/tropic-gooner/reports/progress.md`
   - ~~**SpaceQuest**~~ — **ARCHIVED** 2026-07-24. Skip.
   - **Hunter: The Reckoning** — dedicated pod `hunter-reckoning` / `progress-hunter.md` — **not** this RR (still in has-work markers).
4. **Other product user-tasks** (`tableslop` / `pixi-rp` / `abhinavall-portfolio`) when continuous boards are empty.
5. **Remaining open user-tasks** (mazda3, infranet, linuxbox non-ops, …).
6. **Other markers (after product+campaign)** — dashboard backlog, maintenance, system integrity, ponytail, deepsec (if enabled), nousagent — one `[ ]` via has-work reason.
7. **Education (quiet continuous)** — `agents/self-improvement-progress.md` / `SELF_IMPROVEMENT_TASK.md` — human drills (math, speech, tech, **EM styles → teaching**) → `reports/self-improvement/` and/or `reports/education/` and/or one Hub Inbox `si-*`/`edu-*` (free-first; distinct from AI-stack `SELF_IMPROVE_PROGRESS.md`). Arch: `docs/agents/continuous-lanes.md`.
8. **Research (quiet continuous)** — `agents/research-studies-progress.md` / `RESEARCH_STUDIES_TASK.md` — **after education, before IDLE**. Studies / free-model evals → `reports/research/`. Free-only (`agents/research-studies-models.json`; default Nemotron-super). Not education; not X **research-bookmarks**. Sibling-owned — do not wipe.
9. **Research bookmarks** — open `research-bookmarks` user-tasks / `agents/RESEARCH_BOOKMARKS_TASK.md` (usually via user-tasks). **No** X API.

Specs: tableslop → `TABLESLOP_PROJECT_TASK.md`; pixi → `PIXI_RP_TASK.md`; portfolio → `PORTFOLIO_REDESIGN_TASK.md` / `BLOG_AI_LANE_TASK.md`; nyc → `NYC_MAFIA_DND_TASK.md`; tropic → `TROPIC_GOONER_TASK.md`; dashboard → `LINUXBOX_DASHBOARD_TASK.md`; education → `SELF_IMPROVEMENT_TASK.md`; research → `RESEARCH_STUDIES_TASK.md`.

If nothing unchecked → reply **IDLE** only.

When a lane finishes all checkboxes → skip it until human adds work.

## Campaign quick refs

| Lane | Spec | Progress |
|------|------|----------|
| ~~**SpaceQuest**~~ | ARCHIVED on USB PERSONAL | see `campaigns/SPACE QUEST-ARCHIVED.md` |
| **Hunter: The Reckoning** | `agents/HUNTER_RECKONING_TASK.md` (pod `hunter-reckoning`, RP $5) | `campaigns/tropic-gooner/reports/progress-hunter.md` |
| **Tropic Gooner** (island/map) | `agents/TROPIC_GOONER_TASK.md` (RP pod) | `campaigns/tropic-gooner/reports/progress.md` |
| **NYC Mafia × D&D** | `agents/NYC_MAFIA_DND_TASK.md` | `campaigns/nyc-mafia-dnd/worldbuilding/progress.md` |
| **Dashboard** | `agents/LINUXBOX_DASHBOARD_TASK.md` | `agents/LINUXBOX_DASHBOARD_BACKLOG.md` |
| **Daily deslop** | `agents/DAILY_DESLOP_TASK.md` (∥ ponytail) | `agents/daily-deslop-progress.md` |
| **Systems design** | — | `agents/SYSTEMS_DESIGN_BOARD.md` |
| **Lane sync / Meta philosophy** | skill + inject | `agents/META_LANE_SYNC.md` · `.cursor/skills/lane-sync` · agent `.cursor/agents/lane-sync.md` |
| **System integrity** | `agents/SYSTEM_INTEGRITY_TASK.md` | `agents/system-integrity-progress.md` |
| **Ponytail cleanup** | `agents/PONYTAIL_CLEANUP_TASK.md` | `agents/PONYTAIL_CLEANUP_BOARD.md` |
| **tableslop (map / v1)** | `agents/TABLESLOP_PROJECT_TASK.md` | `agents/tableslop-progress.md` (+ `projects/tableslop/manifest.json`) |
| **Pixi RP** | `agents/PIXI_RP_TASK.md` | `agents/PIXI_RP_PROGRESS.md` |
| **Portfolio / blog (continuous)** | `agents/PORTFOLIO_REDESIGN_TASK.md` / `BLOG_AI_LANE_TASK.md` | `agents/portfolio-progress.md` |
| **Education (human SI)** | `agents/SELF_IMPROVEMENT_TASK.md` | `agents/self-improvement-progress.md` → `reports/self-improvement/` + `reports/education/` |
| **Research (studies / benchmarks)** | `agents/RESEARCH_STUDIES_TASK.md` | `agents/research-studies-progress.md` → `reports/research/` (models: `research-studies-models.json`) |
| **Security (deepsec, optional)** | `agents/SECURITY_CODE_AUDIT_TASK.md` | `agents/security-code-audit-progress.md` + `agents/deepsec-config.json` |

## Legacy lanes (USB)

| Lane | Spec | Progress |
|------|------|----------|
| Portfolio | `agents/PORTFOLIO_OVERNIGHT_TASK.md` | USB `…/portfolio-redesign/progress.md` |
| Blog | `agents/BLOG_AI_LANE_TASK.md` | USB `…/v8-brutalist-map/blog/progress.md` |
| NousAgent | `agents/NOUSAGENT_ITERATION_TASK.md` | `agents/nousagent-progress.md` |

**Activated 2026-06-07 (PC):** SpaceQuest corpus on linuxbox; NYC campaign seed added.
