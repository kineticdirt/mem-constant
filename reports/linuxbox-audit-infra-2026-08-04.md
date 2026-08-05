# Linuxbox infra audit — 2026-08-04

- **Scope:** systemd services, cron/agent-cycle, disk, network, keys, processes/swap.
- **Method:** SSH `potato-lan`, read-only diagnostics. No runtime state touched (regions-ui / chat-threads / registry / inbox untouched). No fixes applied — nothing qualified as a trivial-safe win; all items reported below.
- **Box state at audit:** up 9 days, load avg 1.66/2.23/2.55 (elevated, explained below), RAM 1.1G/1.9G used + 1.0G/2.0G swap, `/` 34% used, `/mnt/archive` 18%.

## Green (verified healthy)

- All 8 local ports respond: `:3000` portfolio 200, `:8765` tableslop 200, `:8767` pixi-rp 200, `:8768` campaigns-avail 200, `:8780` origin proxy 200, `:8790` dashboard 200, `:13000` gitea 200, `:13001` kuma 302 (normal redirect).
- All 4 public edges through Cloudflare: `map.tableslop.org`, `campaigns.tableslop.org`, `abhinavall.net`, `abhinavall.net/Intel/` → 200.
- Services active with `NRestarts=0`: linuxbox-status, linuxbox-tableslop, linuxbox-campaigns-avail (system); hermes-gateway, hermes-gateway-hunter-reckoning, linuxbox-pixi-rp (user); cloudflared-abhinavall + cloudflared-tableslop (up since Jul 26, v2026.6.1 current). Docker: uptime-kuma (healthy), gitea — both up 9 days.
- Zero err-priority journal lines in last 24h for hermes-gateway, linuxbox-status, linuxbox-tableslop, both cloudflared units.
- Hermes `state.db` healthy: 1.8 MB (history of bloat → D-state hangs not present).
- Keys present, perms 600, sane lengths: OpenRouter + ZenMux + Firecrawl in `~/.hermes/.env`; separate OpenRouter key in `~/.linuxbox-pixi/deckard-local.env`; `DISCORD_BOT_TOKEN` in hunter profile + tropic `.env`; **no** active `DISCORD_BOT_TOKEN` in ops `~/.hermes/.env` (matches the crash-loop avoidance rule).
- Timers live: swarm-dispatch (60s), hermes-gateway-watchdog (~2min), meta-harness-rollup, agent-intent-gate.
- Multitask locks: only one file, `chars-registry__tropic-gooner.json`, and it is a clean `status: done` / `released_at` record from Aug 1 — no lock held.

## P1 — recurring / performance-impacting

### P1-1. Think-tick exit124 spike today: 41 timeouts vs 72 ok (36%); yesterday was 0/154

Evidence:

- `/mnt/archive/logs/think-reports/2026/08/`: `form-20260804*` = **41 × exit124, 72 × exit0**; `form-20260803*` = 0 × exit124, 154 × exit0. August total: 75 × exit124 vs 466 × exit0 — over half the month's timeouts are today.
- Tick budget: `agent-cycle-think-tick.sh` lines 22-23 — `THINK_TIMEOUT_DEFAULT=240`, `THINK_TIMEOUT_OPS=300`; line 744 runs hermes under `timeout $THINK_TIMEOUT_SEC`.
- Latest exit124 (`form-20260804T235201Z-dashboard-ru`): died mid `run-dashboard-ui-smoke.sh` at 55.9s into the smoke — the LLM work before it had already burned the 300s ops budget; the smoke never finished (KeyboardInterrupt traceback in log tail).
- Free-pool 429 churn inside a single tick (`agents/runs/think-last.log`): 46 "429" hits — `poolside/laguna-xs-2.1:free is temporarily rate-limited upstream`, later `openai/gpt-oss-20b:free ... rate-limited`. Rotation works but each hop burns tick seconds.
- Box I/O stalls compound it: repeated sightings of tick-spawned `find`/`grep` children in **D-state** (`find /home/abhinav -name characters-registry.json`, `find /home -type d -name E`) — SD/btrfs I/O wait while ticks scan large trees.

Mechanism: UI-lane tasks (dashboard 'Running now' panel etc.) require C6 Playwright smokes (~60-120s on this loaded box) on top of multi-turn LLM work, inside a 300s ceiling, while free models 429-rotate and disk I/O stalls. Timeout kills the tick mid-verify → task left open → next tick redoes the work → more pressure.

Minimal fix suggestion (one of):
- Raise `THINK_TIMEOUT_OPS` 300 → 420 in the crontab env line (one-line change), or
- Move the C6 smoke out of the LLM-timeout window: tick writes "needs smoke" marker, `agent-cycle-sync.sh` (deterministic, no LLM) runs the smoke next minute and records evidence, or
- Cap dashboard/UI tasks to code-edit-only per tick and let the smoke lane close them (prevents redo loop).

### P1-2. Swap pressure: 1.0 GiB of 2.0 GiB swap in use, 77 MiB RAM free

Evidence: `free -h` — Mem 1.1G used / 77Mi free / 783Mi available; Swap 1.0Gi used. Top swapped processes: hunter-reckoning gateway python 165 MB, ops hermes-gateway 157 MB, uptime-kuma node 102 MB, `server/server.js` node 88 MB, pixi `unified_rp_server.py` 68 MB. `vm.swappiness=60`.

Impact: gateway wake-ups and tick bursts fault pages back in from SD swap → latency spikes on every lane. Not an emergency; on a 2 GB board some swap use is expected.

Minimal fix suggestion: none applied. Options: a weekly scheduled restart of the two hermes-gateway units (they are at 7 days uptime), or accept-and-monitor. Do **not** drop caches/rewite swap on a production box without a window.

### P1-3. hunter-reckoning gateway: 177h cumulative CPU in 7 days, flapping in/out of D-state

Evidence: pid 633720, started Jul 28, `TIME 177:37` (≈ a full core 24/7 for its entire uptime); live sampling 5-10% CPU with state flipping `D ↔ S` across samples (I/O waits, likely Discord gateway writes/state.db).

Currently not hot, but the lifetime profile says it spun hard historically. Worth one investigation cycle: check its event loop / heartbeat config, or schedule a restart and watch whether cumulative CPU growth returns to sane (<1h/day).

## P2 — hygiene

1. **Stray vite dev server, 9 days old** — pid 1882 `node .../rebased/Rebased_Website/node_modules/.bin/vite dev`, VIRT 9.9 GB, 12h08m cumulative CPU, 39 MB swapped. A dev server should not be a permanent resident on a 2 GB box. Suggest stopping it (ask first — may be a deliberate preview).
2. **Pi-hole is gone** — `docker ps -a` shows only uptime-kuma + gitea; nothing listens on 127.0.0.1:53 (`dig @127.0.0.1` times out). `/etc/resolv.conf` now points at Tailscale MagicDNS (`100.100.100.100`), which works for the box itself. If any LAN clients still use `192.168.4.59` as DNS they are silently broken. Verify intent (retired vs accidental loss).
3. **`/tmp` bloat on SD**: 181 MB, 897 top-level entries — hundreds of empty hash-named Hermes session dirs accumulating since Jul 26. systemd-tmpfiles-clean runs daily; consider pruning hash dirs older than 7d.
4. **Journal + /var/log**: journal 1.0 GB on disk; `/var/log` 1.3 GB (`syslog.1` 56 MB, `daemon.log.1` 51 MB). journald was sighted in transient D-state (one `systemctl status` call hung ~50s during heavy tick I/O). Suggest `SystemMaxUse=200M` in journald.conf. Disk overall at 34%, so not urgent.
5. **`/mnt/archive/logs` = 7.9 GB**, including six archived `hermes-state-db-2026-07-*` snapshots from the July bloat era. Archive disk is only 18% used — report only, cleanup candidate.
6. **`FIRECRAWL_API_KEY` duplicated** (two identical lines) in both `~/.hermes/.env` and the hunter-reckoning profile `.env`. Harmless (last wins); tidy on next edit of those files.
7. **Dashboard services restarted tonight**: linuxbox-status 20:07 EDT, linuxbox-tableslop 20:08 EDT (both `NRestarts=0` since, no journal errors). Coincides with tonight's hygiene sweep / deploy activity — noting for awareness only.
8. **PERSONAL USB shows 1.1 GB used** while workspace facts describe it as main working storage (ebooks + agent-work + projects + exports). Mount mapping is correct by UUID (`sdb1`↔PERSONAL, `sda1`↔/mnt/archive — letters swapped vs the facts, normal enumeration drift). Verify PERSONAL contents are as expected; not necessarily data loss.
9. **`agent-pod-scheduler.timer` not boot-enabled + anomalous state** — `systemctl status` shows `disabled` (started manually Jul 28) so the 30s pod scheduler will **not come back after a reboot**. It also reports `Active: active (running)` with `Trigger: n/a` — yet `list-timers` showed a firing 44s prior, so it works now; the display anomaly warrants a config look (`OnUnitActiveSec` vs `OnCalendar`). Suggest `sudo systemctl enable agent-pod-scheduler.timer` (needs sudo → report-only here). Contrast: `agent-intent-gate.timer` is `enabled` and `active (waiting)` with a proper next trigger.
10. **Timeout-killed ticks can orphan in-flight shell children briefly** — the `timeout 300` wraps only the hermes parent; its `find`/`grep` grandchildren were observed alive (D-state) after a tick died. They finish quickly, but on a slow-SD box they add I/O load to the *next* tick. If P1-1 is addressed this mostly goes away; otherwise consider `timeout --kill-after` / process-group kill in the tick script.

## Not broken (checked, no action)

- No 429 storm at the account level — rotation across the free pool is functioning; C8 paid gates armed via crontab env (`THINK_PAID_ON_FREE_EXHAUSTED=1`, `THINK_PAID_ON_VERIFIED_FREE_FAIL=1`).
- No failed systemd units; no service flapping (all `NRestarts=0` over multi-day uptimes).
- No DNS/tunnel faults; MagicDNS resolves; all three Cloudflare hostnames serve 200.
- Tailscale healthy: box `100.122.108.94` offers exit node; desktop direct-connected.
- No stale locks, no D-state hermes hang, no state.db bloat.

## Fixes applied during this audit

None. No trivial-safe win qualified (nothing dead to restart, no missing logrotate, no bad perms). All items above are report-only per scope; the largest lever is P1-1 (think timeout budget vs Playwright-smoke reality).

- **Post-audit addendum (fix pass, 2026-08-05):** Pi-hole left unchanged (no DNS edits); box resolves via Tailscale MagicDNS (`100.100.100.100`). Any LAN client still pointing at `192.168.4.59` for DNS needs manual review — owner decision pending.
