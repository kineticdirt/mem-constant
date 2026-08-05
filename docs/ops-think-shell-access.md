# Think tick shell access (ops)

## Problem

`hermes chat -q` always sets `HERMES_INTERACTIVE=1`. That forces **manual** approvals with a **60s** timeout → Hub shows `Timeout — denying command` / `User denied…` even when `approvals.cron_mode=approve` and `HERMES_CRON_SESSION=1`.

The agent cannot work on itself if every `systemctl --user` / piped shell waits for a human who is not there.

Rigid prompt bans (“never Firecrawl / never git / never …”) stranded work: the model said BLOCKED in prose but left `status=open` → infinite re-pick.

## Policy — security **checks**, not walls

Canonical teaching doc injected by the think prompt:

**`agents/THINK_SECURITY_CHECKS.md`** (C0–C5)

| Gate | Behavior |
|------|----------|
| **C0** Catastrophic | Hard deny (Hermes hardline + deny globs: wipe/shutdown/force-push/hard-reset/secret dump) |
| **C1** Elevated ops | Pass = tick already opened logged form; shell via `--yolo`. Need sudo → `status=blocked` + inbox |
| **C2** Risky-but-needed | Allowed on form: curl loopback, logs, `systemctl --user` status/restart, safe git read, smokes |
| **C3** Network / Hermes browser | Prefer curl for API; Firecrawl **cloud** for external web; **no** Hermes `browser_navigate` (hangs) |
| **C4** Task status | Must set `done`\|`blocked`; tick `enforce-status` safety-nets if log says BLOCKED/DONE but task still open |
| **C5** Git sync | Soft: avoid pull thrash on private repo; PC git-bundle is the sync path |
| **C6** UI verification | One-shot Playwright: `run-chat-ui-smoke.sh` / `run-dashboard-ui-smoke.sh` — not curl-only when human reports UI fail |
| **C7** Turn budget | Soft finish ~12; hard ceiling **18** default / **24** ops-UI (not a goal — finish early) |

| Layer | Behavior |
|-------|----------|
| Think tick shell | Allowed via `hermes chat --yolo` for that tick only |
| Access form | Written **before** Hermes: `agents/state/shell-access-forms/form-*.json` |
| Report | Written **after**: `/mnt/archive/logs/think-reports/YYYY/MM/*.md` (fallback `reports/think-ticks/`) + `reports/think-ticks/LATEST.md` |
| Hardline | Hermes hardline still blocks wipe disk / shutdown / etc. under `--yolo` |
| Status enforce | `think-shell-access-form.py enforce-status` after close |

## Reverse-engineer a break

1. Hub Worker log / `agents/runs/think-last.log`
2. Latest form under `agents/state/shell-access-forms/`
3. Matching markdown under archive or `reports/think-ticks/LATEST.md`
4. Git / potato backups for code rollback

## Tools on ticks

Hermes browser / computer_use toolsets stay **off** (C3). Navigating via Hermes
browser hangs ~60s then outer `timeout` 124. For **API**: curl. For **UI**:
Playwright one-shot (`run-chat-ui-smoke.sh`, timeout ~90s) — headless Chromium
via existing deps under `.staging/portfolio-redesign/_screenshots/`, not Hermes
browser. Firecrawl **cloud** for external pages only.

Tick invokes (adaptive turns — see C7):

```bash
# default ~18 turns / 210s; [ops]|UI|Fix-this ~24 / 270s
hermes -p think chat --yolo --max-turns "${THINK_MAX_TURNS}" \
  -t terminal,file,code_execution,skills,memory,todo -q '…'
```

`GET /api/chat/status` is a **job poll** (`?job_id=`), not “is Chat up” — use
`/api/chat/threads` / `/api/agent`.
