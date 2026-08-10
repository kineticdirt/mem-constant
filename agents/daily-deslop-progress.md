# Daily deslop progress

**Lane:** `agents/DAILY_DESLOP_TASK.md` · **Pair:** ponytail (no deletions) · **Memory:** `agents/git-regression-memory.md`  
**Systems map:** `agents/SYSTEMS_DESIGN_BOARD.md`

Tick-sized only. When today’s Open children are `[x]`, archive under Done and seed the next day’s desk (one item).

## Open — 2026-08-10 desk

- [x] **dd-01** Seed git-regression-memory rows for recent map failures (blank-map `const profile`, pin/border PIP mismatch, regions-ui wipe class) — docs only (2026-08-10)
- [x] **dd-02** Ponytail board already has Discord token helper card — implement that card (extract shared helper); verify `bash -n` / `py_compile` when done (2026-08-10)
- [x] **dd-03** Systems design board v0 + Meta API/UI card + dashboard backlog **Meta-sys** for follow-up polish (2026-08-10)

## Open — continued desk (seeded 2026-08-09 night)

- [x] **dd-06** Demote dead `inclusionai/ling-3.0-flash:free` from live free chains/catalogs (404 noted 2026-08-09; already in think-free-swap `_do_not_readd`) — keep on route_watchlist; do not hard-delete option until ≥7 daily probe misses. Touch: hermes-model-registry, install-hermes-profiles, think-tick fallback, status-server sunset set, chat-catalog demote, pc-bonsai, research-studies. Verify: `rg` no live-chain hit outside sunset/watchlist/`_do_not_readd`.
- [x] **dd-07** Harden apply-git-bundle `+x` leftovers: after chmod, fail-loud if `linuxbox-status-watchdog.sh` (and hermes watchdog) not executable — soft `|| true` on chmod already leaves 203/EXEC risk (pc-2026-08-09-gateway-watchdog / hub-8790). Verify: `bash -n apply-git-bundle.sh`.
- [x] **dd-08** Papercut `pc-2026-08-08-push-linuxbox-misses-lint-config`: add `.cursor/rules/anti-slop.mdc`, `ai-bad-habits.mdc`, and `check_article.py` to `push-linuxbox.sh` PATHS + deploy manifest `paths_hint`. Verify: paths exist + dry-list includes them.
- [x] **dd-09** Systems board open question: document Discord token helper (`scripts/linuxbox/discord_token.py`) one-liner in `SYSTEMS_DESIGN_BOARD.md` Shared primitives + close design checkbox. Docs only. (2026-08-09)
- [x] **dd-10** `CLAUDE.md` cron names: live potato `# agent-cycle-think-1m` / think-tick; legacy Hermes bare `agent-cycle` paused (install-agent-cycle-think-only). Ponytail Docs drift closed. Docs only. (2026-08-09)

## Open — 2026-08-10 night desk (seeded after dd-10)

- [x] **dd-11** Ponytail: shared CRLF note for `install-*.sh` — one comment block in `scripts/linuxbox/README.md` documenting strip-CR before first run on box (`sed` remove CR); stop duplicating long CRLF paragraphs in each installer. Docs only. (2026-08-09)
- [x] **dd-12** Papercut prevention (bin-shadow): fold `cp -f` repo→`~/bin` refresh for `agent-cycle-think-tick.sh` + `agent-cycle-sync.sh` into `push-linuxbox.sh --finished` or sync tick so `~/bin` shadows cannot drift. Verify: after push, potato `~/bin` matches repo (or installer re-run note). (2026-08-09)
- [x] **dd-13** Dashboard backlog **Hub-c**: Hub lane chips render last sync + think (+ SSH duration) from `/api/agent` `lane_sync` payload; Meta live lanes include SSH. Verify: curl `lane_sync.ssh_sessions` + dash_build pair. (2026-08-10)

## Open — 2026-08-10 desk clear after dd-13

- [x] **dd-14** Shared `scripts/linuxbox/bump-dash-build.sh`: write `<meta dash-build>` + `DASH_BUILD` to the same id (`--check` / `--self-check`). Prevention for pc-2026-08-08-dash-build-pair-drift (SCP/html≠js). Document in SYSTEMS_DESIGN_BOARD + runtime-state-protection. Verify: `bash -n` + `--self-check`.
- [x] **dd-15** Deploy PATHS require-scan guard: fail-loud when `linuxbox-status-server.js` local `require('./…')` files are missing from `push-linuxbox.sh` DASHBOARD_PATHS (pc-2026-08-05-deploy-list-new-file-miss longer-term). Verify: listed OK; synthetic missing → fail.
- [x] **dd-16** Pin-freeze bundle settle: on pin-freeze FAIL in `verify-runtime-state` during/after `apply-git-bundle`, sleep+re-check once before FAIL/inbox (pc-2026-08-10-pin-freeze-verify-false-fail). Never auto-`--accept`. Verify: `bash -n`. (2026-08-10)
- [ ] **dd-17** Hub `:8790` probe retry: in `verify-runtime-state.sh`, retry dashboard curl 2–3× with short backoff before FAIL (pc-2026-08-09-hub-8790 D-state false VERIFY). Verify: `bash -n`.

## Done

- [x] **dd-16** pin-freeze settle+re-check once under `bundle-apply` in verify-runtime-state (no auto-accept) — 2026-08-10
- [x] **dd-15** `check-dashboard-require-paths.sh` (+ `--self-check`); wired into `push-linuxbox.sh` --dashboard/--finished; 8 local requires covered — 2026-08-10
- [x] **dd-14** `bump-dash-build.sh` (`--check`/`--self-check`); SYSTEMS_DESIGN_BOARD + runtime-state-protection + regression memory; push PATHS — 2026-08-10
- [x] **dd-13** Hub-c lane chips + SSH duration from `lane_sync`; dash_build `db_20260810-hub-c-ssh-chips-r1` — 2026-08-10
- [x] **dd-12** push-linuxbox `--finished` + push_tarball + apply-git-bundle refresh `~/bin` shadows (sync tick already); self_check OK — 2026-08-09
- [x] **dd-11** scripts/linuxbox/README.md shared CRLF note (`sed` strip CR); installer prose points here — 2026-08-09
- [x] **dd-10** CLAUDE.md cron names aligned to live `agent-cycle-think-1m` (+ legacy Hermes `agent-cycle` noted) — 2026-08-09
- [x] **dd-09** Discord token helper documented in SYSTEMS_DESIGN_BOARD Shared primitives + design checkbox closed — 2026-08-09
- [x] **dd-08** push-linuxbox PATHS + manifest paths_hint for anti-slop/ai-bad-habits/check_article — 2026-08-09
- [x] **dd-07** apply-git-bundle / fix-sh-crlf / push-bundle fail-loud if hermes+status watchdogs not +x — 2026-08-09
- [x] **dd-06** Ling free demoted from live rotate; sunset/watchlist/offline catalog kept — 2026-08-09
- [x] **dd-05** `export_discord_lore.py` already had `from __future__ import annotations`; `python3 -m py_compile` OK — 2026-08-10
- [x] **dd-04** `agent-pod-scheduler.sh` `ponytail-cleanup` prompt branch: board path + Goal/Feature/Keep/Verify (not generic task_spec); `bash -n` — 2026-08-10
- [x] **dd-02** `scripts/linuxbox/discord_token.py` shared resolver; euro/nyc configure + nyc ingest + pepper use it; list/probe/hunter already imported — 2026-08-10
- [x] **dd-01** git-regression-memory seeded — 2026-08-10
- [x] **dd-03** SYSTEMS_DESIGN_BOARD + Meta systems card — 2026-08-10
- [x] **Lane scaffold** — DAILY_DESLOP_TASK + progress + docs; wired into maintenance + think boards list — 2026-08-10
