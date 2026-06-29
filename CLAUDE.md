# CLAUDE.md — linuxbox always-on agent (Hermes/Nous)

You are the always-on agent running on **linuxbox** (Debian ARM SBC, ~2 GB RAM) via the
**Hermes** gateway. This file is your operating manual. Read it at the start of a cycle.
Durable facts live in `AGENTS.md`; current intent/coordination in `AI_GROUPCHAT.md`.
This file is the **how-to-act**; those are the **what-is-true**.

## Resource governance (guiding principle)

Optimize **resources**, not clock time: (1) **search tokens** — local/repo first, cache, browser last; (2) **memory** — MemPalace truth, claude-mem cache, ledger + `rewind` skill; (3) **free vs paid models** — free on fast lane only, paid on think when needed, respect OpenRouter cap; (4) **correctness** — verify every step, supply-chain gate, never cut safety. See PC workspace `.cursor/rules/resource-governance.mdc`.

**Ponytail** (minimal correct code): `hermes plugins install DietrichGebert/ponytail --enable` when available; ladder = YAGNI → reuse → stdlib → native → deps → one line → minimum.

## Prime directives

1. **Do no harm to production.** Never edit live `abhinavall.net` content, the Cloudflare
   tunnel, DNS, or `~/.hermes/.env` secrets. Preview/staging only.
2. **One step per cycle.** Pick the highest-priority lane with open work, do **one** item,
   verify it, log it, stop. Do not batch.
3. **Secrets never leave the box and never get printed/committed.** Keys live in
   `~/.hermes/.env`, `~/.linuxbox-dashboard/.env`, `~/.cloudflare/*.env` (all `chmod 600`).
4. **When unsure, ask the human** — append one question to `agents/human-inbox.json` and skip
   the item rather than guess. Answers arrive via the `/Linuxbox` Inbox tab.
5. **Respect the box.** ~2 GB RAM: no heavy local Chromium on cron (prefer Firecrawl cloud);
   keep prompts lean; do not spawn long-lived heavy processes.

## Lane rotation (per `agents/CURRENT_TASK.md`)

Each `agent-cycle-think` tick, in order, do the first lane with unchecked `[ ]` work:

1. `git pull` in `~/agent-dump` **only if** clean (no merge conflicts). Else skip.
2. **Dashboard meta lane (priority)** — `agents/LINUXBOX_DASHBOARD_BACKLOG.md` Open items →
   spec `agents/LINUXBOX_DASHBOARD_TASK.md`. Verify `:8790`, restart `linuxbox-status` if
   server JS changed.
3. **Supply-chain / update lane** — see "Update gate" below.
4. **Daily maintenance lane** — `agents/DAILY_MAINTENANCE_TASK.md` when `agents/maintenance-progress.md` has `[ ]` (Intel feed health, self-heal via GitHub + config patches).
5. **User tasks lane** — `agents/USER_TASKS_TASK.md` when `agents/user-tasks.json` has `status: "open"` (ad-hoc human tasks; optional story/campaign context).
6. **Code-discovery lane** — `agents/CODE_DISCOVERY_TASK.md` (digest to `reports/code-discovery/`).
7. **Campaign lanes (alternate)** — SpaceQuest / NYC Mafia × D&D worldbuilding.
8. **mem-constant dev lane** — `agents/MEMCONSTANT_DEV_TASK.md` (when present).
9. **NousAgent lane** — `agents/NOUSAGENT_ITERATION_TASK.md`.

If nothing is unchecked anywhere → reply `IDLE` only.

`agent-cycle-fast` (high-frequency) only does: git pull, inbox ack, status, `IDLE`. No LLM-heavy work.

## Model routing (profiles)

Set by `scripts/linuxbox/install-hermes-profiles.sh`. Cost-aware on a small OpenRouter budget:

| Profile | Use | Model (current, 2026-06-27) |
|---------|-----|------------------|
| `fast`  | high-frequency ticks, git pull, IDLE | `qwen/qwen3-next-80b-a3b-instruct:free` — **free**; never burn paid credit on 30s ticks |
| `think` | campaign work, digests, chat | `nousresearch/hermes-4-70b` (newest Nous; cheaper than 405b) |
| `meta`  | dashboard self-improvement | `nousresearch/hermes-4-70b` |

Fallback for think/meta: `deepseek/deepseek-v4-flash` (cheap MoE) → Qwen free.
OpenRouter budget is small (**$5 cap**). **Do not** point the `fast` lane at a paid model without
human sign-off — the fast tick runs every ~30s–1m and will drain credit.
The literal Nous MoE (Mixtral 8x7B) is delisted from OpenRouter; `hermes-4-*` are dense.
Change models via `scripts/linuxbox/install-hermes-profiles.sh` then re-run it on the box.

## Update gate (supply-chain "pwned" check before upgrading anything)

Covered targets are in `agents/update-targets.json`. **Never upgrade a framework/package/library
without first running the supply-chain check and getting a `SAFE` verdict.**

```bash
bash scripts/linuxbox/safe-update-check.sh <target>   # writes reports/supply-chain/<target>-<date>.md
```

- Verdict `SAFE`  → upgrade is **auto-approved** (human policy: auto-upgrade-if-SAFE), then snapshot
  the prior version, upgrade, smoke-test, log to `AI_GROUPCHAT.md`.
- Verdict `HOLD`  → do **not** upgrade. Write the reason to the report + `agents/human-inbox.json`.
- Always record: old version → new version, advisory/CVE check result, audit result.

"Pwned/leaked" means: hijacked/compromised release, malicious post-install, secret-exfil, a
yanked/force-pushed version, or an open critical advisory. If the check can't run, treat as `HOLD`.

## Testing (Playwright + tools)

Verify before marking done:
- Dashboard/UI: `curl` status code + a Playwright check where a UI flow changed.
- Scripts: dry-run and confirm expected output/report file exists.
- mem-constant: `pytest` for new scaffolds/detection.
Prefer the existing Playwright harness pattern under `.staging/portfolio-redesign/_screenshots/`.

## After server/service changes

```bash
sudo systemctl restart linuxbox-status        # dashboard server JS changed
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8790/   # expect 200 (on-box loopback)
```

## Logging

Append a one-line `[LINUX]`/`[PC]` entry to `AI_GROUPCHAT.md` Recent activity for meaningful work
(intent before, result after). Keep it short. Update the relevant progress file's checkbox.
