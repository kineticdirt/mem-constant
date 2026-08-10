# Papercuts — agent friction log

Models/lanes log **paper cuts** here — small frictions, smells, and recurring annoyances that slow agent work — instead of only mentioning them in chat. Find problems quickly, resolve autonomously when safe.

- **Usage:** `docs/agents/papercuts.md`
- **List open:** `bash scripts/linuxbox/papercuts-list.sh` (on potato: `bash ~/agent-dump/scripts/linuxbox/papercuts-list.sh`)

**Entry format** (newest first, one line per field — add entries directly below the `---`):

```markdown
## pc-2026-08-10-dashboard-scp-wiped-by-bundle
- **Date:** 2026-08-10
- **Lane:** hub | ops
- **Area:** `linuxbox-status/index.html` + `linuxbox-status-server.js` vs `apply-git-bundle.sh`
- **Severity:** blocking (UI “no changes” while API claimed new)
- **Complaint:** SCP’d Meta lane-sync HTML/JS then potato sync tick restored git HEAD old stub (`db_20260808…`). Agent claimed live; Hub still showed philosophy stub.
- **Proposed fix:** After dashboard edits: commit → `publish-linuxbox-repo.sh` / git-bundle OR `push-linuxbox.sh --dashboard` and verify served `dash-build` grep before Result.
- **Status:** fixed 2026-08-10 — holder `lane-sync-skill-run` (commit 971fc3b + --dashboard pair ok).

## pc-2026-08-09-gateway-watchdog-203-recur
- **Date:** 2026-08-09
- **Lane:** ops | hub
- **Area:** `hermes-gateway-watchdog.sh` + `scripts/linuxbox/*.sh` +x after bundle
- **Severity:** annoying (watchdog heal dead; gateway unit itself stayed active)
- **Complaint:** Recurred ~20:45 EDT — Hub red Gateway offline while `hermes-gateway` was active (Ssl since Aug 8). Watchdog oneshot `failed` **203/EXEC** Permission denied (mode `-rw-r--r--`). Health `journalctl` since ActiveEnterTimestamp can take 3–6s; under load Hub `/api/agent` also timed out → false DOWN. Think "fails" were pod `TIMEOUT` 600s on system-integrity intel feeds, not systemd gateway crash.
- **Proposed fix:** harden apply-git-bundle +x (already noted pc-2026-08-09-hub-8790…); health heartbeat scan use rolling 2h window not since-activation; Hub treat `gateway=unknown`+active systemctl as warn not offline.
- **Status:** mitigated 2026-08-09 — `chmod +x scripts/linuxbox/*.sh`; watchdog oneshot exit 0; think LLM re-fired Laguna. Bundle for deslop `9a89595` still needed (potato HEAD `6fe1dfd`). Holder `hermes-gateway-down-2045`.

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

## pc-2026-08-10-pin-freeze-verify-false-fail
- **Date:** 2026-08-10
- **Lane:** ops | tableslop
- **Area:** `tableslop-pin-coords-guard.sh` + `verify-runtime-state.sh` during git-bundle apply
- **Severity:** annoying (false VERIFY FAIL / inbox noise)
- **Complaint:** Bundle apply logged pin-freeze drift + inbox `runtime-verify-fail-20260810` right after policy-A pin moves. Live potato now: pin guard **PASS v1/14** matching post-A centroids; full `verify-runtime-state` PASS. Likely apply-time preserve vs freeze skew (or freeze not yet on disk mid-apply), not GM pin sabotage.
- **Proposed fix:** treat pin-freeze FAIL during bundle as re-check after apply settles; only `--accept` with explicit GM OK. Do not move pins to “fix” verify.
- **Status:** fixed 2026-08-10 — potato PASS; no pin moves; freeze SoT left as-is (matches live). Holder `daily-deslop-dd-02`.

## pc-2026-08-09-think-idle-gateway-false-down
- **Date:** 2026-08-09
- **Lane:** think | ops | hub
- **Area:** `agent-cycle-think.lock` + `agent-cycle-sync.sh` + `nousagent-health.sh` + Hub Next-due
- **Severity:** blocking
- **Complaint:** Hub showed think idle / “due now (~8m)” and sometimes GATEWAY DOWN while ops `hermes-gateway` was active for 1d+. Cron fired every 1m but `flock -n` exited silently when sync (borders/bundle/free-health) held the think flock for tens of minutes — `think-tick.last` froze. Separately `THINK_CURSOR_BEFORE_PAID` skipped paid Hermes on `[ops]` hub-backlog → Cursor twin NOOP, work stayed open. Hub GATEWAY DOWN: `nousagent-health.sh` journalctl’d since unit activation (~days) → collectHealth 15s timeout → `gateway=unknown`. Hub Next used tick `last_run`+480s not `think-llm.last`. Dead `inclusionai/ling-3.0-flash:free` (404) still in free swap.
- **Proposed fix:** timeout sync steps + think sync wall; flock_busy log; allow paid for `[ops]`/Fix-this; health journal 10m+timeout + collectHealth fallback to systemctl; Hub Next from think-llm.last; demote ling free.
- **Status:** fixed 2026-08-10 — holder `think-idle-stuck-fix` (coord `hermes-gateway-down-2045`; ops gateway left running, hunter Discord untouched).

## pc-2026-08-09-hub-8790-dstate-after-bundle
- **Date:** 2026-08-09
- **Lane:** ops | hub
- **Area:** `linuxbox-status` `:8790` + `scripts/linuxbox/*.sh` mode bits after git-bundle
- **Severity:** blocking
- **Complaint:** bundle-apply `verify-runtime-state` alerted dashboard `000000` + roster non-JSON. Hub node was LISTEN but hung (`STAT=D`, `wchan=folio_wait_bit_*`) under swap thrash (load ~15–20, iowait high) while Hermes think + Cursor twin + disk scans ran. Watchdogs were `failed` (**203/EXEC**) because bundle strip of `+x` on `*.sh` — no auto heal. Registry file was fine (v37/27; API 15 visible stubs).
- **Proposed fix:** (1) always `chmod +x scripts/linuxbox/*.sh` in apply-git-bundle / `fix-sh-crlf-remote.sh` and fail-loud if watchdog oneshot 203/EXEC; (2) after bundle verify, retry dashboard probe 2–3× with backoff before FAIL; (3) avoid stacking think+Cursor+bundle preserve on 2GB box when iowait already high.
- **Status:** fixed 2026-08-09 triage — SIGKILL+restart Hub → 200; `chmod +x` all linuxbox `*.sh`; watchdogs reset; `verify-runtime-state` PASS. Holder `runtime-verify-fail-triage`. Related: `pc-hub-watchdog-noexec-2026-08-09`, `pc-2026-08-05-hub-exit-mmap-8790-wedge`.

## pc-2026-08-08-cursor-agent-run-missing
- **Date:** 2026-08-08
- **Lane:** cursor-auto | ops
- **Area:** `scripts/linuxbox/cursor-agent-run.sh` (potato)
- **Severity:** blocking
- **Complaint:** After linuxbox reboot/outage, Cursor tick kept “dispatching” but logs were only `No such file or directory` for `cursor-agent-run.sh` (also missing `think-continuity-seed.py` / `cursor-lane-status.sh`). Hub looked idle despite blog+Hub backlog still open — boards not in pick queue until seeded.
- **Proposed fix:** SCP restore runner+seed+status; preflight in `agent-cycle-cursor-tick.sh` fail-loud + no success stamp if runner missing; keep blog board in `agent-cycle-has-work.py`; seed Cursor tasks from blog/Hub when queue empty.
- **Status:** fixed 2026-08-08 — runner restored; Cursor running on `[blog] bp-03`; tick guard added.

## pc-2026-08-08-dash-build-pair-drift
- **Date:** 2026-08-08
- **Lane:** hub | ops
- **Area:** `linuxbox-status/index.html` meta vs `linuxbox-status-server.js` DASH_BUILD
- **Severity:** annoying
- **Complaint:** On-box agent edits bump server.js `DASH_BUILD` but not index.html meta → verify-runtime marker-pair FAIL (`html≠js`) after deploy. Tripped 2026-08-08 (`hub-next-up-r1` vs `hub-edit-preserve-r1`).
- **Proposed fix:** on-box edits that bump DASH_BUILD must bump both files in the same change (single build-bump helper), or verify-runtime should not FAIL on forward-only drift where server is newer and meta is stale-by-one.
- **Status:** fixed 2026-08-08 — meta bumped forward to server build; verify PASS. **Prevention (dd-14, 2026-08-10):** `scripts/linuxbox/bump-dash-build.sh` writes both sides; `--check` / `--self-check`.

## pc-2026-08-08-push-linuxbox-misses-lint-config
- **Date:** 2026-08-08
- **Lane:** ops | hub
- **Area:** `scripts/pc/push-linuxbox.sh` PATHS + `agents/linuxbox-deploy-manifest.json`
- **Severity:** annoying
- **Complaint:** The STE linter config (`.cursor/rules/anti-slop.mdc`) and linter (`check_article.py`) are not in the deploy manifest — potato lacked `anti-slop.mdc` until hand-SCP'd. Same class as pc-2026-08-05: new files silently don't ship → crash/fail on box.
- **Proposed fix:** add `.cursor/rules/anti-slop.mdc`, `.cursor/rules/ai-bad-habits.mdc`, `.cursor/skills/write-source-analysis/check_article.py` to the manifest + push PATHS. Longer-term: generate lists from require/source scan (still open from pc-2026-08-05).
- **Status:** fixed 2026-08-09 — anti-slop.mdc, ai-bad-habits.mdc, check_article.py added to push AGENT_PATHS + agent-config paths_hint (dd-08).

## pc-2026-08-05-deploy-list-new-file-miss
- **Date:** 2026-08-05
- **Lane:** ops | hub
- **Area:** `scripts/pc/push-linuxbox.sh` PATHS lists
- **Severity:** annoying
- **Complaint:** New repo files ride `--finished` only if hand-added to `DASHBOARD_PATHS`/`SCRIPTS_LINUXBOX` lists; a missing entry = deployed server requires a module that never ships → crash loop (`Cannot find module './chars-registry-read-cache'` at 18:22, plus tick would have failed on missing `lib/think-log-classify.sh`).
- **Proposed fix:** added the 5 missing entries (done); longer-term generate the lists from `require()`/`source` scan or a git-diff check in push.
- **Status:** fixed 2026-08-05 — `chars-registry-read-cache.js` (dashboard), `refresh-bin-shadows.sh`, `lib/think-log-classify.sh`, `think-continuity-seed.py`, `resource_governor.py` (scripts) added; manifest paths_hint synced. **Prevention (dd-15, 2026-08-10):** `scripts/linuxbox/check-dashboard-require-paths.sh` scans `linuxbox-status-server.js` local `require('./…')` (BFS) vs `DASHBOARD_PATHS`; fail-loud on push `--dashboard`/`--finished`; `--self-check` proves synthetic missing fails.

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
- **Status:** fixed 2026-08-05 — `cp -f` repo→`~/bin` for tick/sync; `refresh-bin-shadows.sh` on sync tick. **Prevention (dd-12, 2026-08-09):** also refresh from `push-linuxbox.sh` push_tarball + `--finished` (cmp-verify tick+sync) and `apply-git-bundle.sh` post-apply — shadows cannot drift across SCP/bundle/cron.

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

### pc-hub-watchdog-noexec-2026-08-09
- **Area:** linuxbox Hub hang-watchdog (`linuxbox-status-watchdog.service`)
- **Severity:** high (when Hub hangs, auto-restart cannot run)
- **Complaint:** potato script `scripts/linuxbox/linuxbox-status-watchdog.sh` lost `+x` (`rw-r--r--`) → timer unit **203/EXEC** Permission denied; Hub stop-hangs + CF 502 windows had no auto recovery.
- **Proposed fix:** after git-bundle/SCP always `fix-sh-crlf-remote.sh` / `chmod +x scripts/linuxbox/*.sh`; watchdog oneshot should fail-loud to inbox if EXEC fails.
- **Status:** recurring 2026-08-09 — chmod +x re-applied after another bundle strip; oneshots SUCCESS; durable mode-bit gate: dd-07 fail-loud on hermes+status watchdogs in apply-git-bundle / fix-sh-crlf / push-bundle (2026-08-09).
