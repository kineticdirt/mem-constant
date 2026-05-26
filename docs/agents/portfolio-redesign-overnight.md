# Portfolio redesign overnight

Hermes on **linuxbox** builds **3 separate portfolio websites** with a **preview hub** to toggle between them. Each version gets its own **`research.md`** (web_search ideas) before build. Full content inventory; not deployed to production.

## Start

```bash
ssh abhinav@100.122.108.94
cd ~/agent-dump
bash scripts/linuxbox/start-portfolio-overnight.sh
```

Requires **USB `PERSONAL` mounted**. **`agent-cycle`** (every 1m) advances one step per tick.

## Morning: review with toggle

```bash
bash scripts/website/portfolio_serve_preview.sh
```

Open **`http://100.122.108.94:8765/`** on Tailscale — hub tabs switch **v1-system | v2-editorial | v3-kinetic**.

```text
/media/abhinav/PERSONAL/agent-work/abhinavall-net/portfolio-redesign/
  index.html           # toggle hub
  v1-system/           # + research.md
  v2-editorial/
  v3-kinetic/
  comparison.md
```

## Stop / cancel

Set `agents/CURRENT_TASK.md` to **idle** on the Pi.

Spec: [`agents/PORTFOLIO_REDESIGN_TASK.md`](../../agents/PORTFOLIO_REDESIGN_TASK.md)
