# Grafana / observability for linuxbox agents

**Question:** use Grafana to see what’s running (lanes, pods, chat jobs) instead of (or in addition to) the dashboard **Active now** / **Running now** panels?

## Verdict (2026-07-11)

| Check | Result |
|-------|--------|
| Grafana on potato? | **No** — not in apt, systemd, or Docker |
| What’s running today | **Uptime Kuma** `:13001`, **Gitea** `:13000`, dashboard `:8790` |
| Free RAM (spot check) | ~**490–580 MiB** available, swap already heavy (~45%) |
| Agent “metrics” today | File-based: `run-index.jsonl`, `chat-jobs.json`, `pod-scheduler.json`, heartbeats — **not** Prometheus |

**Do not install Grafana (+ Prometheus) on the 2 GB linuxbox** without an explicit RAM budget. Grafana alone is often 200–500+ MiB; with Prometheus retention it competes with Hermes, Kuma, Gitea, and the portfolio.

**Active now / Running now on Tasks stay** — they answer “what’s in flight right now.” Grafana is for history/graphs if you want them later.

## What shipped (cheap first step)

1. **`GET /metrics`** on `linuxbox-status` (Prometheus text exposition).
   - Binds with the dashboard on **`127.0.0.1:8790`** — scrape via **SSH tunnel** or on-box curl.
   - Admin / loopback only (not on public `/Intel`).
   - Gauges: gateway up, chat jobs running/pending, pod in-flight, lane last-run, recent pod idle/work, mem/swap, open tasks/backlog.
2. **Active now links:** Uptime Kuma (default MagicDNS `:13001`) + optional Grafana URL + `/metrics`.
3. Env (in `~/.linuxbox-dashboard/.env`):
   - `OBSERVABILITY_KUMA_URL` (default `http://raspbian-bullseye-aml-s905x-cc:13001`)
   - `OBSERVABILITY_GRAFANA_URL` or `GRAFANA_URL` (empty = no Grafana link)

```bash
# on potato
curl -s http://127.0.0.1:8790/metrics | head
```

## Options (pick one later)

### A — Grafana on PC / laptop (recommended if you want graphs)

- Run Grafana (and optionally Prometheus) on a machine with RAM.
- Scrape potato via SSH local forward: `ssh -L 8790:127.0.0.1:8790 potato` then Prometheus target `http://127.0.0.1:8790/metrics`.
- Set `OBSERVABILITY_GRAFANA_URL=http://…` so Tasks links to it.

### B — Minimal Prometheus + Grafana on potato

- Only after you confirm **SAFE** supply-chain check **and** accept OOM risk.
- Prefer short retention, single scrape job, no Loki.
- Not auto-approved.

### C — Uptime Kuma only (already there)

- Heartbeats / HTTP checks for gateway, `:8790`, tunnels.
- Good for “is it up?” — weak for “which chat job / pod is mid-tick.”
- Link from Active now (shipped).

## Merge with dashboard UI

Keep **Running now** / **Active now** in the dashboard. Grafana (if any) is an out-link + scrape of `/metrics`, not a replacement for the Tasks strip.
