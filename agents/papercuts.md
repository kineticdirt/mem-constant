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
