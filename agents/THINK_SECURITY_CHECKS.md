# Think-lane security checks (passable gates)

Unattended think ticks grant shell via a **logged access form** + Hermes `--yolo`.
These are **ordered checks**, not a wall that strands work. Pass each gate; only
**C0** is an absolute deny.

## C0 — Catastrophic (HARD DENY)

Never do these. Hermes hardline / deny globs also block many of them:

- Wipe disk / `rm -rf /` / `mkfs` / shred live data mounts
- `shutdown` / `reboot` / poweroff
- `git push --force` / `git reset --hard` / `git clean -f` on tracked trees
- Print or exfiltrate secrets (`.env`, tokens, keys)
- Blind-overwrite `characters-registry.json` / wipe `agents/state/chat-threads/`

If the task *requires* C0 → set task `status=blocked` + rich inbox ask. Stop.

## C1 — Elevated ops (CHECK + LOG) — how to pass

Tick **already opens** `agents/state/shell-access-forms/form-*.json` before Hermes.
You pass C1 by working inside that tick (shell is allowed). Prefer reversible edits.

- **OK:** edit repo files under `~/agent-dump`, run scripts, write reports
- **OK:** `systemctl --user status|restart` for known units (`linuxbox-status`,
  `linuxbox-pixi-rp`, …) when diagnosing/fixing
- **Need sudo?** Do **not** invent workarounds that break policy. Set
  `status=blocked`, append one inbox question with context, end `BLOCKED:`.

## C2 — Risky-but-needed (ALLOWED on think form)

Pass automatically when the form is open (this tick):

- `curl` loopback (`127.0.0.1:8790`, `:8767`, `:3000`, `:8780`)
- Read logs (`agents/runs/`, journalctl --user, think-last.log)
- `git status|diff|log|fetch|rev-parse` (read-only / safe)
- Python/node smoke tests, small patches, dashboard smoke scripts

## C3 — Network / Hermes browser (CHECK with safe path)

| Path | Verdict |
|------|---------|
| `curl` / `wget` to loopback or known APIs | **Pass** for API/health only |
| Firecrawl **cloud** — `python3 scripts/linuxbox/firecrawl-fetch.py <url>` (key auto-read from `~/.hermes/.env`, no local Chromium) | **Pass** when the task truly needs live *external* web fetch — prefer over raw curl for paywalled / JS-rendered / bot-blocked pages |
| Hermes `browser_navigate` / `web_extract` / `computer_use` | **Fail this check** — hangs potato. Tools are not enabled on ticks. |

API OK ≠ UI OK. For dashboard/Chat UI complaints → **C6**, not “BLOCKED needs browser”.

## C4 — Task status (MUST PASS every tick)

Before you end, record completion for **this** work:

- **User-task** (tick gave you a `task_id`): update `agents/user-tasks.json` for that id —
  finished/verified → `status=done`; needs human/sudo/secrets/true C0 → `status=blocked`.
- **Lane work** (tick handed you an item from a progress `.md`, no `task_id`): when the item
  is genuinely done, flip its `[ ]`→`[x]` in that file and append a dated one-liner under `## Done`.
- **Never** leave a box unchecked / status `open` after saying done or blocked in prose
  (open = infinite re-pick — this is the #1 thrash bug).

The tick runs an `enforce-status` / `enforce-lane` safety net that patches the exact item you
were given if you end `DONE:`/`BLOCKED:` but forget — but do it yourself; don't rely on it.

End the reply with exactly one of: `DONE:` / `BLOCKED:` / `IDLE:` plus one line why.

## C5 — Git sync (soft)

Private repo: potato often **cannot** `git pull` HTTPS. Prefer working on the tree
you have. Need newer code → note it under `BLOCKED:` or rely on PC git-bundle push.
Do not thrash on failed pulls.

## C6 — UI verification (Playwright one-shot) — how to pass

When the human reports a **UI** problem (Chat not running, tab blank, composer
missing) **or** curl/API looks fine but the complaint is still UI-side:

1. **Do not** use Hermes `browser_navigate` (C3 fail / hang).
2. Run the timeout-bounded Playwright script (headless Chromium, one-shot):

```bash
bash scripts/linuxbox/run-chat-ui-smoke.sh
# broader tab walk (heavier):
bash scripts/linuxbox/run-dashboard-ui-smoke.sh
```

3. Read evidence:
   - Chat: `reports/chat-ui-smoke/LATEST.md` + `latest.json` + `screenshots/`
   - Full: `reports/dashboard-ui-smoke/latest.json`
4. **PASS smoke** → set task `status=done` (or fix then done) and cite screenshot path.
5. **FAIL smoke** → fix if obvious one-liner; else `status=blocked` with fail lines + screenshot path in the task/inbox — **not** “blocked because no browser”.

| When | Tool |
|------|------|
| API/health only | `curl` (C2) |
| Dashboard/Chat UI look/behavior | Playwright scripts above (C6) |
| External live page research | `python3 scripts/linuxbox/firecrawl-fetch.py <url>` (Firecrawl cloud, C3) — not raw curl |
| Hermes browser_* | Never on think ticks |

Potato RAM: one smoke per tick max; default chat smoke timeout **120s**. Do not install
extra browsers or leave Chromium running. First Chromium install is one-time heavy;
subsequent smokes reuse `~/.cache/ms-playwright/`.

## C7 — Turn budget (soft target + hard ceiling)

`--max-turns` is a **stuck-tool ceiling**, not a goal. Prefer finishing early.

| Lane | Soft target | Hard ceiling | Wall-clock |
|------|-------------|--------------|------------|
| Default think | ~14 tool steps | **20** | ~240s |
| `[ops]` / Fix-this / UI / Chat / smoke / lane-implement | ~16–22 | **28** | ~300s |

When you have enough evidence: set `status=done|blocked`, end `DONE:`/`BLOCKED:`, **stop**.
Do not keep grepping to fill the budget. Hitting the hard ceiling is a miss — shrink scope.

Env overrides: `THINK_MAX_TURNS`, `THINK_MAX_TURNS_DEFAULT`, `THINK_MAX_TURNS_OPS`,
`THINK_TIMEOUT_SEC` / `THINK_TIMEOUT_DEFAULT` / `THINK_TIMEOUT_OPS`.
Hermes shell tool: tick sets `TERMINAL_TIMEOUT` ≥240 (default 240) so C6 Playwright smokes
are not killed at profile `TERMINAL_TIMEOUT=60`; outer wall-clock stays `THINK_TIMEOUT_*`.

## C8 — Paid model spend (HARD GATE for Hermes/ops key)

**Free-first.** Ops OpenRouter paid models (`THINK_PAID_MODEL`, default
`deepseek/deepseek-v4-flash`) are allowed in **exactly two** scenarios. Not vibes.
Not “model said it failed.” Pixi `CHAT_UI_ALLOW_PAID_FALLBACK` is a separate key — out of scope.

### Scenario 1 — Free pool exhausted

Entire live free swap (`agents/model-budget/think-free-swap.json`) is 429/unavailable
for this UTC day window (after mid-day re-probe). Then:

1. **Prefer Cursor Auto** (`THINK_CURSOR_BEFORE_PAID=1`, default) when
   `~/.cursor-agent.env` has a non-empty `CURSOR_API_KEY` (Agent 2). Think
   **skips paid Hermes** and dispatches a Cursor twin via
   `scripts/linuxbox/cursor-twin-dispatch.sh` — order is always
   **free OpenRouter → `cursor:auto` → paid Hermes**. Never burn paid (DeepSeek /
   405B-class) while Cursor Auto is idle/available.
2. Only then (no Cursor key, or explicit hermes-only assign): one paid last-resort
   attempt (`THINK_PAID_MODEL`, default DeepSeek — not 405B).

| Env | Default | Meaning |
|-----|---------|---------|
| `THINK_PAID_ON_FREE_EXHAUSTED` | `1` | Allow scenario 1 |
| `THINK_ALLOW_PAID_LAST_RESORT` | *(alias)* | Same as above (back-compat); set either to `0` to skip Hermes when free exhausted |
| `THINK_CURSOR_BEFORE_PAID` | `1` | Prefer Cursor Auto twin; skip paid Hermes when key present |
| `CURSOR_PARALLEL` | `1` | Dispatch Cursor twin with same task when Hermes starts |
| `THINK_PAID_MODEL` | `deepseek/deepseek-v4-flash` | Paid id for both scenarios |

### Scenario 2 — Verified free failure

Paid only when **all** of these hold:

1. **Explicit success metric** for this tick (user-task `status=done|blocked`, progress
   checkbox closed, or prompt line `DONE when …` / `VERIFY: …`).
2. **≥ N free attempts** that actually ran (not 429 skip) and **failed harness verify**
   (`THINK_PAID_FREE_FAIL_N`, default **2**). State: `agents/state/think-paid-escalate.json`.
3. **Verification is concrete** — script exit 0, curl 200 + marker, file exists, checklist
   `[x]` / task status flipped — **not** model self-claim in prose.
4. Then **one** paid attempt; tick log must name metric + verify check + free fail count.

| Env | Default | Meaning |
|-----|---------|---------|
| `THINK_PAID_ON_VERIFIED_FREE_FAIL` | `1` | Allow scenario 2 |
| `THINK_PAID_FREE_FAIL_N` | `2` | Free verify-fails before one paid try |

**Never pay for:** research-studies lane (free-only), primary-only 429 while backups remain,
or a model ending `FAILED:` / `BLOCKED:` without the harness verify failing.

**Every tick must state:** success metric + verify command (injected by think-setup /
tick prompt). End `DONE:` / `BLOCKED:` / `IDLE:` only after the verify matches.

## Inbox ask copy (when C1/C4/C6 block → human)

If you append to `agents/state/human-inbox.json`, follow **`agents/INBOX_PROSE.md`**:
direct question, 2–4 sentence context with real paths/ids, one concrete consequence,
plain option labels. Ban antithesis templates (“It’s not X or Y, it’s Z”), fast-paced
boilerplate, stacked em-dashes, fake certainty. Style policy only — not research claims.

## Quick diagnose map

- Dashboard health: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8790/`
- Chat API: `/api/chat/threads` or `/api/agent` — **not** `/api/chat/status` (job poll; needs `?job_id=`)
- Chat **UI**: `bash scripts/linuxbox/run-chat-ui-smoke.sh` → `reports/chat-ui-smoke/`
- Worker trail: `agents/runs/think-last.log` + `reports/think-ticks/LATEST.md`
