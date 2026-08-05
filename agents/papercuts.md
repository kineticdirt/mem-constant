# Papercuts — agent friction log

Models/lanes log **paper cuts** here — small frictions, smells, and recurring annoyances that slow agent work — instead of only mentioning them in chat. Find problems quickly, resolve autonomously when safe.

- **Usage:** `docs/agents/papercuts.md`
- **List open:** `bash scripts/linuxbox/papercuts-list.sh` (on potato: `bash ~/agent-dump/scripts/linuxbox/papercuts-list.sh`)

**Entry format** (newest first, one line per field — add entries directly below the `---`):

```markdown
## pc-YYYY-MM-DD-<slug>
- **Date:** YYYY-MM-DD
- **Lane:** think | cursor-auto | hub | tableslop | pixi | nyc | euro | tropic | ops
- **Area:** file/path or subsystem
- **Severity:** paper cut | annoying | blocking
- **Complaint:** 1–3 sentences — what rubbed and why it costs time/tokens
- **Proposed fix:** smallest concrete change
- **Status:** open | in-progress | fixed
```

---

## pc-2026-08-05-deploy-list-new-file-miss
- **Date:** 2026-08-05
- **Lane:** ops | hub
- **Area:** `scripts/pc/push-linuxbox.sh` PATHS lists
- **Severity:** annoying
- **Complaint:** New repo files ride `--finished` only if hand-added to `DASHBOARD_PATHS`/`SCRIPTS_LINUXBOX` lists; a missing entry = deployed server requires a module that never ships → crash loop (`Cannot find module './chars-registry-read-cache'` at 18:22, plus tick would have failed on missing `lib/think-log-classify.sh`).
- **Proposed fix:** added the 5 missing entries (done); longer-term generate the lists from `require()`/`source` scan or a git-diff check in push.
- **Status:** fixed 2026-08-05 — `chars-registry-read-cache.js` (dashboard), `refresh-bin-shadows.sh`, `lib/think-log-classify.sh`, `think-continuity-seed.py`, `resource_governor.py` (scripts) added; manifest paths_hint synced.

## pc-2026-08-05-hub-exit-mmap-8790-wedge
- **Date:** 2026-08-05
- **Lane:** hub | ops
- **Area:** `linuxbox-status.service` / `:8790`
- **Severity:** blocking
- **Complaint:** Hub node (PID since 04:29) stuck in `exit_mmap` D-state → zombie + orphan LISTEN on `:8790` (~394 CLOSE_WAIT). systemd unit wedged `deactivating/final-sigkill` (MainPID=0); restarts hit EADDRINUSE. CF returned **524**. SIGKILL/cgroup.kill cannot finish `exit_mmap`. Only clean fix is reboot (or temp port hop 8791).
- **Proposed fix:** Add a Hub health watchdog (curl `:8790` fail + unit stuck deactivating >2m → `systemctl reset-failed` + reboot-or-port-hop) next to `hermes-gateway-watchdog`. Log papercut on trip. Also prefer `KillMode=mixed` + shorter stop so children don't leave orphan listens.
- **Status:** in-progress 2026-08-05 (holder `hub-watchdog-audit`, PC) — built `scripts/linuxbox/linuxbox-status-watchdog.sh` (+ installer, `--self-check`), covers Hub/origin-proxy/cloudflared: D-state, hung-listener (probe 000), wedged-deactivating >120s → reset-failed+start, else `failed_needs_reboot` (auto-reboot opt-in `HUB_WATCHDOG_REBOOT=1`, default off). Also: `--max-time 10` on alert-check :8790 curl, `hub_down`/`hub_hung` checks in `agents/linuxbox-alerts.json`. **Pending:** potato deploy (`push-linuxbox.sh --finished`) + run installer + live verify. KillMode=mixed deferred — would not clear an `exit_mmap` kernel wedge, and control-group already kills orphan children harder.

## pc-2026-08-05-think-tick-stale-bin-shadow
- **Date:** 2026-08-05
- **Lane:** think
- **Area:** `~/bin/agent-cycle-think-tick.sh` (installed copy) vs `scripts/linuxbox/agent-cycle-think-tick.sh` (repo)
- **Severity:** blocking
- **Complaint:** The repo tick re-execs `~/bin/agent-cycle-think-tick.sh` when executable (`SELF` prefers it), and nothing re-ran `install-agent-cycle-think-only.sh` after Aug 1 — the live tick ran the stale copy with `THINK_TIMEOUT_OPS=300`, silently defeating the repo-side 600s fix (and any other repo edit since Aug 1).
- **Proposed fix:** Refresh the installed copy after every repo change (`cp -f` + chmod, per installer lines 41-43); ideally fold into the deploy path.
- **Status:** fixed 2026-08-05 — `cp -f` repo→`~/bin` for tick (600 verified live) and `agent-cycle-sync.sh` (17-line Jul-31 shadow missing GM-borders autorestore + error-collect + free-models-health; sync was dormant-stale, repo path preferred). **Prevention proposal (GM):** add the `cp -f ~/bin` refresh to `push-linuxbox.sh --finished` or the sync tick so shadows can never drift again.

## pc-2026-08-05-pod-scheduler-missing-profile
- **Date:** 2026-08-05
- **Lane:** ops
- **Area:** `scripts/linuxbox/agent-pod-scheduler.sh` + `agents/agent-pods.manifest.json`
- **Severity:** annoying
- **Complaint:** Manifest lists pods (`tropic-gooner`, `spacequest`, `nyc-mafia-dnd`) whose Hermes profiles were never installed on the box — every due pick died exit 1 ("Profile does not exist"), a fail loop in run-index every ~16 min with zero work done.
- **Proposed fix:** Skip pods whose profile dir is absent (`~/.hermes/profiles/<name>`); record the skip, don't fail.
- **Status:** fixed 2026-08-05 — profile-existence guard in scheduler (updates last_run, run-index SKIP line, exit 0). Profiles stay uninstalled; GM decides whether `tropic-gooner` should get one (`hermes profile create`) or leave the skip.

## pc-2026-08-04-think-exit124-supply-chain-timeout
- **Date:** 2026-08-04
- **Lane:** think
- **Area:** `scripts/linuxbox/agent-cycle-think-tick.sh` → supply-chain check (`safe-update-check.sh` / `hermes update`)
- **Severity:** annoying
- **Complaint:** Think tick dies with exit 124 when the supply-chain check hits its 180s timeout, and lane-enforce still marks the board item done — the tick burns its LLM window and the board claims progress although nothing actually ran.
- **Proposed fix:** Run the supply-chain check async/off-tick (or raise its timeout); never let lane-enforce mark done on a 124.
- **Status:** fixed 2026-08-05 — three parts landed: (1) `THINK_TIMEOUT_OPS` 300→600 (28 ops turns + ~60s Playwright smoke on a paid model never fit 300s; observed 4× paid 124s in ~1h); (2) enforce-status/enforce-lane now take `--exit-code` and refuse to flip boards on a 124 unless the log shows smoke-PASS + mark-done evidence (gate tested with synthetic logs); (3) still-open proposal: move the supply-chain check fully off-tick (async daily cron writing reports/supply-chain/) so the LLM never invokes it in-tick — needs GM sign-off on lane change.

## pc-2026-08-01-zenmux-profile-primary-403
- **Date:** 2026-08-01
- **Lane:** hub
- **Area:** Hermes profiles (`scripts/linuxbox/install-hermes-profiles.sh`) → ZenMux provider
- **Severity:** annoying
- **Complaint:** Pointing a Hermes profile primary at ZenMux silently resolves the provider as `custom`, drops `ZENMUX_API_KEY`, and 403s — chat fails with no obvious reason and each retry burns a hop.
- **Proposed fix:** Keep ZenMux out of profile primaries; select it only via dashboard/manual `zenmux:<slug>` (`add-zenmux-provider.sh` wires the keyed providers map).
- **Status:** fixed 2026-08-01 — documented in AGENTS.md / CLAUDE.md; ZenMux works via the `zenmux:<slug>` prefix.

## pc-2026-08-02-regions-ui-drift-clobber
- **Date:** 2026-08-02
- **Lane:** tableslop
- **Area:** `campaigns/tropic-gooner/map/regions-ui.json` + `apply-git-bundle.sh` / sync tick
- **Severity:** blocking
- **Complaint:** GM-drawn borders lived only in the potato working tree while git HEAD held v2 ellipse stubs — every bundle apply / hard reset replayed stubs over GM polys (repeated wipes Aug 1–3, RCA `reports/tableslop-regions-ui-wipe-rca-2026-08-02.md`).
- **Proposed fix:** Treat `regions-ui.json` as potato-owned runtime: skip-worktree + `.gitignore` + autorestore hook + deploy gates.
- **Status:** fixed 2026-08-04 — skip-worktree on potato+PC, `tableslop-gm-borders-autorestore.sh` after bundle, guard PASS v19/371 (holder `tableslop-regions-ui-protect`).

## pc-2026-08-05-swap-gate-not-in-tick
- **Date:** 2026-08-05
- **Lane:** think / ops
- **Area:** `scripts/linuxbox/resource_governor.py` + `agent-pod-scheduler.sh` (NOT `agent-cycle-think-tick.sh`)
- **Severity:** annoying
- **Complaint:** Runbooks and task prompts describe the think swap defer gate as living in `agent-cycle-think-tick.sh` ("defers ticks when swap usage >= 38%"). It does not — the tick has no memory/swap gate at all (its only early exits are flock, has-work IDLE, and the THINK_INTERVAL_SEC throttle). The real gate is `resource_governor.admit()` with `swap_defer_ops_pct: 38` from `agents/resource-governor.json`, reached via `agent-pod-scheduler.timer`. Relatedly, `think-continuity-seed.py` never seeded `supply-chain-check-run` user-tasks — those were created by the LLM in-tick (all done 2026-08-05); agents kept grepping the seed script for logic that was never there.
- **Proposed fix:** Name `resource_governor.py` + `agent-pod-scheduler.sh` as the gate home in docs/prompts; supply-chain freshness now owned by `supply-chain-daily.sh` cron (04:20), not in-tick tasks.
- **Status:** fixed 2026-08-05 — gate made zram-aware (disk-only via /proc/swaps parse) in governor; offload hook in scheduler; holder `mem-fix-swap-flush`.

## pc-2026-08-05-zram-tools-install-race
- **Date:** 2026-08-05
- **Lane:** ops
- **Area:** potato apt — `zram-tools` 0.3.3.1 (Debian 11 bullseye)
- **Severity:** annoying
- **Complaint:** `apt-get install zram-tools` postinst auto-starts `zramswap.service` with built-in DEFAULTS (256MiB) before `/etc/default/zramswap` can be written — box ran a 256MiB zram until `systemctl restart zramswap` picked up the real config (1G lz4 prio 100). Also `dpkg` was found interrupted on potato (needed `sudo dpkg --configure -a` before any apt install).
- **Proposed fix:** After installing zram-tools, always write config THEN `systemctl restart zramswap` (not just enable --now); check dpkg health first on this box.
- **Status:** fixed 2026-08-05 — restart post-config; live state verified (zramctl 1G lz4 [SWAP], /proc/swaps prio 100 vs disk 10).
