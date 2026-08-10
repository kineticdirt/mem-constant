# Daily maintenance lane

**Profile:** `think` (one fix per tick when backlog has `[ ]` items).  
**Cron:** `intel-feed-health` **07:00 UTC** (probe); optional agent tick after report if failures exist.

## Goal

When Intel/dashboard feeds, stocks, or other recurring probes fail (e.g. Reddit **HTTP 429**), the system should **self-heal**: retry, use fallbacks, patch config, redeploy, verify on `/Intel/`, log to `AI_GROUPCHAT.md`.

**Daily checkup pair (same ops tier):** after intel items are clear, pick an open **`agents/daily-deslop-progress.md`** item (`agents/DAILY_DESLOP_TASK.md`) — deslop + **ponytail** (no deletions; reuse helpers; read `agents/git-regression-memory.md` first). Systems map: `agents/SYSTEMS_DESIGN_BOARD.md`.

## One tick = one maintenance item

1. Read `agents/maintenance-progress.md` — pick the **first** unchecked `[ ]` line. If none, read `agents/daily-deslop-progress.md` and take its first `[ ]`.
2. Read `reports/maintenance/LATEST-INTEL-HEALTH.md` for context (intel items only).
3. **Diagnose** the named feed/service.
4. **Fix** (in order):
   - Confirm `agents/intel-trackers.json` uses `www.reddit.com` + `fallback_rss_urls` (Yahoo Finance headlines, Lobsters, etc.) for Reddit subs when rate-limited.
   - Clear stale cache if needed: `rm ~/.linuxbox-dashboard/rss-cache/<slug>.json`
   - Search **GitHub** (API or web) for maintained RSS proxies / alternate endpoints (e.g. `hnrss`, self-hosted reddit rss); prefer sources with recent activity.
   - Patch `intel-trackers.json` or `linuxbox-status-server.js` if a better URL/logic exists; **do not** commit secrets.
   - `sudo systemctl restart linuxbox-status` (and `abhinavall-origin-8780` if proxy changed).
5. **Verify:** `python3 scripts/linuxbox/intel-feed-health.py` exits 0, or `curl -s https://abhinavall.net/Intel/api/intel` shows social feeds without `HTTP 429`.
6. Mark the backlog line `[x]`, append one line to `AI_GROUPCHAT.md`, stop.

## Scope

- `agents/intel-trackers.json`, `scripts/linuxbox/linuxbox-status-server.js`, `scripts/linuxbox/tunnel-origin-proxy.js`
- `~/.linuxbox-dashboard/rss-cache/` (on box)
- `reports/maintenance/`
- `agents/maintenance-progress.md`

**Do not:** change production portfolio content, Cloudflare DNS, or `.env` secrets.

## Install cron (on linuxbox)

```bash
bash scripts/linuxbox/install-daily-maintenance-cron.sh
```

## Related

- `scripts/linuxbox/intel-feed-health.py` — daily probe + backlog seed
- `CLAUDE.md` lane rotation (maintenance after supply-chain gate)
