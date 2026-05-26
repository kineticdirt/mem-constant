# Linuxbox Hermes + OpenRouter Owl Alpha

Always-on agent on **linuxbox** (`100.122.108.94`): **Hermes gateway** (user systemd + linger), **cron every 1m**, model **`openrouter/owl-alpha`** via OpenRouter.

## Prerequisites

- PC on tailnet; SSH key `~/.ssh/id_rsa_potato` (see [docs/ssh-le-potato-reference.md](../ssh-le-potato-reference.md)).
- **`OPENROUTER_API_KEY`** in `~/.hermes/.env` on linuxbox (not in git). WSL/PC template `.env` files often leave this commented — the agent will not call Owl Alpha until the key is set.

## Quick status (from PC)

```bash
tailscale ping -c 2 100.122.108.94
ssh -i ~/.ssh/id_rsa_potato -o IdentitiesOnly=yes abhinav@100.122.108.94 "systemctl --user is-active hermes-gateway"
ssh -i ~/.ssh/id_rsa_potato -o IdentitiesOnly=yes abhinav@100.122.108.94 "bash -lc 'source ~/.bashrc; hermes cron list'"
```

If SSH prints **Tailscale SSH requires an additional check**, run once:

```bash
bash scripts/tailscale-ssh-open-check-url.sh "hostname"
```

Optional (automation-friendly): on linuxbox, `sudo tailscale set --ssh=false` so key-based `BatchMode` SSH works over the tailnet IP.

## Install / upgrade Hermes (linuxbox)

```bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh -o /tmp/hermes-install.sh
bash /tmp/hermes-install.sh --skip-setup --skip-browser
source ~/.bashrc
hermes --version
```

## Model: Owl Alpha

Edit `~/.hermes/config.yaml` on linuxbox:

```yaml
model:
  default: "openrouter/owl-alpha"
  provider: "openrouter"
  base_url: "https://openrouter.ai/api/v1"
```

Set the key in `~/.hermes/.env`:

```bash
OPENROUTER_API_KEY=sk-or-v1-...
chmod 600 ~/.hermes/.env
```

Smoke test:

```bash
hermes chat -q "Reply with exactly: owl-alpha-ok"
```

## Gateway (survives SSH logout)

```bash
printf "Y\nY\n" | hermes gateway install
loginctl show-user "$USER" -p Linger   # expect Linger=yes
hermes gateway start
systemctl --user is-active hermes-gateway
```

Logs: `journalctl --user -u hermes-gateway -f`

## 60s agent cycle

Workdir: `/home/abhinav/agent-dump` (task inbox `agents/CURRENT_TASK.md`).

```bash
hermes cron create "every 1m" \
  "Read agents/CURRENT_TASK.md in the workdir. If it says idle or is empty, reply IDLE only. Otherwise advance the task in one small step; reply TASK_COMPLETE when fully done." \
  --workdir /home/abhinav/agent-dump \
  --name agent-cycle \
  --deliver local
```

Gateway ticks cron **every 60s**; `every 1m` jobs run on that scheduler.

Attach skills / GitHub capability repos later via `skills.external_dirs` in `config.yaml` or `hermes skills install`.

## 2 GB RAM + disk (linuxbox constraints)

| Resource | Reality |
|----------|---------|
| **RAM** | ~2 GB — always-on gateway + cron must stay lean |
| **Root disk** | ~60 GB BTRFS (`/`) — **45 GB free**; use for swap and caches |
| **USB `PERSONAL`** | ~232 GB vfat — good for bulk storage, **not** for Linux swap |

### Swap on disk (done 2026-05-25)

Old **100 MB** swap was **full**, which made the box feel stuck. Replaced with **2 GB** on `/var/swap` (BTRFS requires **NOCOW** before filling):

```bash
sudo rm -f /var/swap
sudo touch /var/swap
sudo chattr +C /var/swap
sudo dd if=/dev/zero of=/var/swap bs=1M count=2048 conv=fsync
sudo chmod 600 /var/swap
sudo mkswap /var/swap
sudo swapon /var/swap
free -m
```

`/etc/fstab` should contain: `/var/swap none swap sw 0 0`

Swap uses **disk** when RAM fills; it is **slower than RAM** but prevents hard OOM kills.

### Browser / internet on a 2 GB Pi

| Tier | RAM impact | Setup |
|------|------------|--------|
| **`web_search` / `web_extract`** | Low | Add **`FIRECRAWL_API_KEY`** or **`TAVILY_API_KEY`** to `~/.hermes/.env`; enable **`web`** toolset (`hermes tools` on the Pi, interactive) |
| **Cloud browser** (recommended) | Minimal on Pi | Same **Firecrawl** key, or **`BROWSERBASE_API_KEY`**; in `~/.hermes/config.yaml` set `browser.cloud_provider: firecrawl` (or `browserbase`) — browser runs in the cloud, not on the Pi |
| **Local Chromium** | High (hundreds of MB per session) | Only with swap + spare RAM; **do not** run on every **1m** cron tick; use for manual `hermes chat` when needed. Install later: re-run installer **without** `--skip-browser`, or `cd ~/.hermes/hermes-agent && npx playwright install chromium` |

**OpenRouter alone** does not power Hermes `web_search` or cloud browser — add a **web/browser provider key** in `~/.hermes/.env`.

**Cron `agent-cycle`:** keep **terminal + file + skills**; add **`web`** when a search key exists; add **`browser`** only for tasks that truly need clicks (not idle 1m polling).

### Firecrawl cloud (Path E — recommended single key)

Hermes uses **`FIRECRAWL_API_KEY`** in `~/.hermes/.env` only (never git). You do **not** need `npx firecrawl-cli init` on the Pi — that is for Cursor/PC agents; linuxbox uses Hermes native **`web`** + **`browser`** toolsets.

**On linuxbox (after key exists):**

```bash
# Interactive key paste (preferred — no key in shell history)
bash ~/agent-dump/scripts/linuxbox/paste-firecrawl-key.sh
bash ~/agent-dump/scripts/linuxbox/configure-firecrawl-hermes.sh
```

`configure-firecrawl-hermes.sh` sets `web.backend: firecrawl`, `browser.cloud_provider: firecrawl`, runs `hermes tools enable web browser`, and restarts **`hermes-gateway`**.

**Verify API from the Pi:**

```bash
python3 -c "import json,urllib.request,pathlib; k=[l for l in pathlib.Path.home().joinpath('.hermes/.env').read_text().splitlines() if l.startswith('FIRECRAWL_API_KEY=')][0].split('=',1)[1]; r=urllib.request.Request('https://api.firecrawl.dev/v2/scrape',data=json.dumps({'url':'https://firecrawl.dev'}).encode(),headers={'Authorization':'Bearer '+k,'Content-Type':'application/json'},method='POST'); print(urllib.request.urlopen(r,timeout=30).status)"
```

Expect **`200`**. Then: `hermes chat -q "Use web_search: one sentence about Firecrawl."`

**Security:** If the key was pasted into chat, screenshots, or onboarding copy, **rotate it** at [firecrawl.dev](https://firecrawl.dev) and re-run `paste-firecrawl-key.sh`.

## Tailscale stay-up

- **linuxbox:** `tailscaled` enabled at boot (`systemctl is-enabled tailscaled`).
- **PC:** Tailscale service **Automatic** (Windows).
- Optional watchdog: `scripts/linuxbox/ensure-tailscale-up.sh` (cron on Pi).

## Deployed state (2026-05-25)

| Item | Value |
|------|--------|
| Hermes | v0.14.0, `~/.hermes/hermes-agent` |
| Gateway | `hermes-gateway.service` (user), **active**, **linger=yes** |
| Cron job | `agent-cycle` id `e09a3740e708`, `every 1m`, workdir `/home/abhinav/agent-dump` |
| Model config | `openrouter/owl-alpha`, provider `openrouter` |
| API key | **User must set** `OPENROUTER_API_KEY` on linuxbox |
