# Hermes task inbox — linuxbox agent cycles

**Status:** active — **dashboard meta lane (priority)** + campaign worldbuilding when dashboard backlog clear

## Profiles (cron split)

| Cron | Profile | Schedule | Role |
|------|---------|----------|------|
| `agent-cycle-fast` | **fast** (Qwen free) | every **~30s** (user crontab + flock; Hermes min is 1m) | deterministic sync + inbox ack, IDLE |
| `agent-cycle-think` | **think** (owl-alpha) | every **1m** | **one** step below |

Human questions → `agents/state/human-inbox.json` · answers via `/Linuxbox/` **Inbox** tab.

## Lane rotation (`agent-cycle-think` only)

1. **Repo sync (do not block on this).** Fast tick already runs `apply-git-bundle.sh` + `git-pull-and-deploy.sh`. Think must **not** run `git pull` / `git pull --ff-only` via the terminal tool. If the tree is dirty or HTTPS pull would fail (private `Linuxbox` repo — sync is PC→box **git bundle**), **skip sync and continue** to the next lane. **Never** open an inbox question solely for git pull / "terminal safety guard". Optional read-only: `git status -sb`.
2. **Dashboard meta lane (priority)** — if `agents/LINUXBOX_DASHBOARD_BACKLOG.md` has unchecked `[ ]` in **Open** → read **`agents/LINUXBOX_DASHBOARD_TASK.md`**, implement **one** item, verify `:8790`, restart `linuxbox-status` if server JS changed, mark done, **stop**.
3. **Daily maintenance lane** — if `agents/maintenance-progress.md` has unchecked `[ ]` → read **`agents/DAILY_MAINTENANCE_TASK.md`**, fix **one** item (Intel feeds, GitHub-sourced RSS alternatives), verify `/Intel/`, mark done, **stop**.
3b. **System integrity lane** — if `agents/system-integrity-progress.md` has unchecked `[ ]` in **Open — build** → read **`agents/SYSTEM_INTEGRITY_TASK.md`**, complete **one** checkbox, verify per task, mark done, **stop**. (After build: daily cron runs `system-integrity-check.sh`; think lane only if progress has follow-up items.)
4. **Ponytail cleanup lane** — if `agents/PONYTAIL_CLEANUP_BOARD.md` has unchecked `[ ]` in **Backlog** → read **`agents/PONYTAIL_CLEANUP_TASK.md`**, complete **one** card (fix/refine only — **no file deletions**), verify, mark Done, **stop**.
5. **User tasks lane** — if `agents/user-tasks.json` has any task with `status: "open"` → read **`agents/USER_TASKS_TASK.md`**, complete **one** step, update task status, **stop**. **Priority:** Hub **Fix this** (`[ops]` / `## Fix this`) first, then `project_id: tableslop`, else oldest open (see USER_TASKS_TASK.md).
5b. **Security code audit (optional, deepsec)** — if `agents/deepsec-config.json` has `"enabled": true` **and** `agents/security-code-audit-progress.md` has unchecked `[ ]` in **Open** → read **`agents/SECURITY_CODE_AUDIT_TASK.md`**, run **`bash scripts/linuxbox/deepsec-scan.sh`** (scan-only, no `process`), **stop**. Default: `enabled: false` — lane skipped.
6. **Campaign lanes (alternate each tick)** — **ops pod only**; RP campaigns run on **dedicated RP pods** (see `agents/agent-pods.manifest.json`):
   - **SpaceQuest** — if `campaigns/spacequest/reports/progress.md` has unchecked `[ ]` → read **`agents/SPACEQUEST_WORLDBUILDING_TASK.md`**, complete **one** item, stop.
   - **NYC Mafia × D&D** — else if `campaigns/nyc-mafia-dnd/reports/progress.md` has unchecked `[ ]` → read **`agents/NYC_MAFIA_DND_TASK.md`**, complete **one** item, stop.
   - **Tropic Gooner** (island/map/orgs — **not** Hunter layer) — else if `campaigns/tropic-gooner/reports/progress.md` has unchecked `[ ]` → read **`agents/TROPIC_GOONER_TASK.md`**, complete **one** item, stop.

   **Hunter: The Reckoning** runs on profile **`hunter-reckoning`** (RP **$5/day** pool), cron **`pod-hunter-reckoning`**, spec **`agents/HUNTER_RECKONING_TASK.md`**, progress **`campaigns/tropic-gooner/reports/progress-hunter.md`** — **not** this ops rotation.
6. **Portfolio lane** — if USB mounted + `agents/PORTFOLIO_OVERNIGHT_TASK.md` has unchecked items → one portfolio step.
7. **Blog lane** — else if USB `v8-brutalist-map/blog/progress.md` has unchecked items → **`agents/BLOG_AI_LANE_TASK.md`**, one step.
8. **NousAgent lane** — else **`agents/NOUSAGENT_ITERATION_TASK.md`**, one step.

If nothing unchecked → reply **IDLE** only.

When a lane finishes all checkboxes → skip it until human adds work.

## Campaign quick refs

| Lane | Spec | Progress |
|------|------|----------|
| **SpaceQuest** | `agents/SPACEQUEST_WORLDBUILDING_TASK.md` | `campaigns/spacequest/reports/progress.md` |
| **Hunter: The Reckoning** | `agents/HUNTER_RECKONING_TASK.md` (pod `hunter-reckoning`, RP $5) | `campaigns/tropic-gooner/reports/progress-hunter.md` |
| **Tropic Gooner** (island/map) | `agents/TROPIC_GOONER_TASK.md` (RP pod) | `campaigns/tropic-gooner/reports/progress.md` |
| **NYC Mafia × D&D** | `agents/NYC_MAFIA_DND_TASK.md` | `campaigns/nyc-mafia-dnd/reports/progress.md` |
| **Dashboard** | `agents/LINUXBOX_DASHBOARD_TASK.md` | `agents/LINUXBOX_DASHBOARD_BACKLOG.md` |
| **System integrity** | `agents/SYSTEM_INTEGRITY_TASK.md` | `agents/system-integrity-progress.md` |
| **Ponytail cleanup** | `agents/PONYTAIL_CLEANUP_TASK.md` | `agents/PONYTAIL_CLEANUP_BOARD.md` |
| **Security (deepsec, optional)** | `agents/SECURITY_CODE_AUDIT_TASK.md` | `agents/security-code-audit-progress.md` + `agents/deepsec-config.json` |

## Legacy lanes (USB)

| Lane | Spec | Progress |
|------|------|----------|
| Portfolio | `agents/PORTFOLIO_OVERNIGHT_TASK.md` | USB `…/portfolio-redesign/progress.md` |
| Blog | `agents/BLOG_AI_LANE_TASK.md` | USB `…/v8-brutalist-map/blog/progress.md` |
| NousAgent | `agents/NOUSAGENT_ITERATION_TASK.md` | `agents/nousagent-progress.md` |

**Activated 2026-06-07 (PC):** SpaceQuest corpus on linuxbox; NYC campaign seed added.
