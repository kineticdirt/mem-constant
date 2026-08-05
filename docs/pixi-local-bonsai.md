# PC local Bonsai + potato failover

**PC only** loads the GGUF on GPU. **linuxbox (potato)** probes the desktop over Tailscale/LAN and switches Hermes `think` between local Bonsai and OpenRouter — never loads weights locally.

**Pixi RP is OpenRouter-only** (Send, NSFW routing, repairs, opener AI). Bonsai `:8000` stays up for **Hermes think** and **background maintenance** (canon, retro, sheets) — not player-visible prose.

## Hardware / quant choice

| Item | Value |
|------|--------|
| GPU | RTX 5070 Ti (~16 GB VRAM) |
| Loaded file | `Bonsai-27B-Q1_0.gguf` (~3.9 GB weights) |
| **Not used** | `Bonsai-27B-dspark-bf16.gguf` — that is the optional DSpark **drafter** (~7.3 GB), not the main LM; full bf16 (~54 GB) cannot fit 16 GB VRAM |

Bonsai requires the **PrismML** llama.cpp fork (Q1_0_g128 kernels). Standard ggml-org builds cannot load this pack.

## Pixi vs Hermes (routing split)

| Surface | Inference | Config |
|---------|-----------|--------|
| **Pixi RP** (`:8767` Send / regen / repairs) | **OpenRouter only** | `CHAT_UI_RP_OPENROUTER_ONLY=1`, `CHAT_UI_NSFW_ROUTE_LOCAL=0` in `ObsidianWriterStack/deckard-local.env` |
| **Pixi vision** | Grok 4.5 via OpenRouter | `vision_openrouter_model` in `/api/config` |
| **Pixi BG jobs** (canon, retro, sheets) | Local Bonsai `:8000` | `WRITER_BOT_BACKEND`, `WRITER_BOT_DEFAULT_MODEL` unchanged |
| **Hermes think lane** (potato) | Bonsai when PC up, else OpenRouter | `scripts/linuxbox/pc-bonsai-failover.sh` + `agents/pc-bonsai-routing.json` |

Default Pixi foreground model: `CHAT_UI_FG_OPENROUTER_MODEL` → **`openrouter/deepseek/deepseek-v4-flash`**.

## PC setup (one-time)

From **agent-dump** (downloads + patches `ObsidianWriterStack/deckard-local.env` — does not print secrets):

```bash
python scripts/pc/setup-bonsai-local.py
```

Weights land in `ObsidianWriterStack/models-bonsai-27b/`. Prism `llama-server.exe` in `ObsidianWriterStack/.local/llama-prism-b9591-cuda-12.4/`.

Gateway env (see script): `GEMMA_GGUF_PATH`, `WRITER_BOT_BACKEND=http://0.0.0.0:8000/v1`. Pixi flags: `CHAT_UI_NSFW_ROUTE_LOCAL=0`, `CHAT_UI_RP_OPENROUTER_ONLY=1`.

## Start stacks (PC)

**Two processes** — gateway for Hermes/BG; Pixi UI does not route Send to `:8000`:

```bash
python scripts/pc/start-bonsai-gateway.py
python scripts/pc/start-bonsai-pixi-stack.py
```

| Service | URL | Used by |
|---------|-----|---------|
| Inference (OpenAI /v1) | `http://127.0.0.1:8000/v1` (also `0.0.0.0:8000` for tailnet) | Hermes think, BG maintenance |
| Pixi RP UI | `http://127.0.0.1:8767` | OpenRouter prose only |
| Health probe | `GET /v1/models` | `pc-bonsai-failover.sh` |
| **Context (-c)** | **262144** slots | Bonsai gateway only |

Verify GPU:

```bash
nvidia-smi
python scripts/pc/probe-pc-bonsai-health.py
```

Smoke (Pixi config — no local preset, OR-only):

```bash
curl -s http://127.0.0.1:8767/api/config
```

Expect `rp_openrouter_only: true`, `nsfw_route_local: false`, `model_presets` with no `Bonsai-27B` / `.gguf` rows.

## Potato dynamic switch (Hermes only)

Config: `agents/pc-bonsai-routing.json` (`desktop-igqesd4`, port `8000`, model id `Bonsai-27B-Q1_0.gguf`).

On **linuxbox**:

```bash
bash scripts/linuxbox/pc-bonsai-failover.sh
bash scripts/linuxbox/pc-bonsai-failover.sh --dry-run   # probe only
```

When PC `/v1/models` responds → patches `~/.hermes/profiles/think/config.yaml` to `base_url: http://desktop-igqesd4:8000/v1`, model `Bonsai-27B-Q1_0.gguf`, provider `custom` (Hermes OpenAI-compatible local). Dashboard Chat uses Hermes profile **`chat`** (OpenRouter only — never Bonsai). When down → restores OpenRouter chain from registry.

**Pixi is decoupled** — failover does not change Pixi routing; potato browser at `http://desktop-igqesd4:8767/` still hits OpenRouter for Send.

State: `agents/state/pc-bonsai-routing.json`.

**Test from potato:**

```bash
curl -s -o /dev/null -w '%{http_code}' http://desktop-igqesd4:8000/v1/models
bash scripts/linuxbox/pc-bonsai-failover.sh
```

Stop PC llama-server briefly → re-run failover → think profile should return to OpenRouter. Pixi `/api/config` unchanged.

## Windows firewall

Allow inbound **TCP 8000** and **8767** on Private networks (Tailscale adapter) so potato can reach the desktop. Tailscale only — do not expose publicly.

## Always-on Pixi on linuxbox (OpenRouter-only)

Potato runs a **lean** unified stack (`linuxbox-pixi-rp` user systemd) at **`:8767`** with **no GGUF / no `:8000`**. RP + BG jobs use OpenRouter. Tree lives at `~/pixi-rp/ObsidianWriterStack`; secrets in `~/.linuxbox-pixi/deckard-local.env` (chmod 600).

```bash
# From PC (Git Bash):
bash scripts/pc/deploy-pixi-linuxbox.sh

# On potato (reinstall / restart only):
bash ~/agent-dump/scripts/linuxbox/install-linuxbox-pixi-rp.sh
```

| Surface | URL | Notes |
|---------|-----|--------|
| **Pixi RP (potato)** | `http://127.0.0.1:8767/` or `http://potato:8767/` | Canonical always-on RP |
| **Config smoke** | `GET /api/config` | `rp_openrouter_only:true`, `default_model` is OpenRouter (not `.gguf`) |
| **Hub → Machines** | `/Linuxbox/` | `local_pixi` = potato `:8767`; `pc_pixi` = optional desktop stack |

## HTTPS for Pixi (Tailscale Serve — tailnet-only, not public)

Plain `http://potato:8767/` trips mobile browser mixed-content / Secure-Context warnings (PWA install, some
JS APIs). Fix = **`tailscale serve`**, which terminates real Tailscale-issued TLS (Let's Encrypt-backed
`*.ts.net` cert, trusted by every OS with no manual cert install) in front of the local `:8767` app. This is
**tailnet-private** — distinct from **Funnel**, which would expose it to the public internet; we do not use
Funnel here.

```bash
bash scripts/linuxbox/enable-pixi-tailnet-https.sh   # idempotent, on potato
```

**Status (2026-07-17): blocked on two one-time tailnet-admin clicks** (this tailnet has neither feature
enabled yet — confirmed via SSH, not assumed):

1. **Enable Serve for this node** — open (as the tailnet admin) and approve:
   `https://login.tailscale.com/f/serve?node=nWnqYHjsCB11CNTRL`
2. **Enable HTTPS Certificates (tailnet-wide)** — [DNS admin page](https://login.tailscale.com/admin/dns) →
   toggle **"HTTPS Certificates"** on.

After both, re-run the script above; final URL will be `https://raspbian-bullseye-aml-s905x-cc.tail666f7c.ts.net/`
(port 443, no `:8767` needed — same box, same app, only the transport changes). No `app.js` / client changes
needed: the UI only ever calls relative `/api/...` paths, so the existing Send pipeline is unaffected.

**Caveat:** `tailscale serve --bg` has been observed to hang indefinitely (not fail fast) when Serve isn't
yet enabled for the node (v1.98.4) — the script wraps every call in `timeout` so a blocked run can't pile up
processes on the 2 GB box. If you ever see stray `tailscale serve --bg` processes in `ps aux`, `kill -9` them
by PID (not `pkill -f "tailscale serve"` — that pattern also matches the SSH command line invoking it).

## Use from linuxbox (potato) — optional PC desktop stack

| Surface | URL (from potato browser) | What runs where |
|---------|---------------------------|-----------------|
| **Pixi RP UI (potato)** | `http://127.0.0.1:8767/` | Always-on OR-only on box |
| **Pixi RP UI (desktop)** | `http://desktop-igqesd4:8767/` | Optional PC UI; Send → **OpenRouter** |
| **Bonsai API probe** | `http://desktop-igqesd4:8000/v1/models` | **PC** Prism llama-server (Hermes think) |
| **Dashboard Hub → Machines** | `/Linuxbox/` Machines panel | Potato probes local Pixi + desktop Pixi/Bonsai |
| **Hermes think lane** | (automatic) | `pc-bonsai-failover.sh` patches think → desktop `:8000` when probe OK |

**Tonight checklist (potato):**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://desktop-igqesd4:8000/v1/models
curl -s -o /dev/null -w '%{http_code}\n' http://desktop-igqesd4:8767/
bash scripts/linuxbox/pc-bonsai-failover.sh --dry-run
```

Expect **200** on both curls when the PC stack is up. Hard-refresh Pixi UI after deploy (`Ctrl+Shift+R` — cache bust `app.js?v=20260716-openrouter-only`).

## Related paths

- **Continuity SoT (Send inject / observed_world / sheets):** [`docs/pixi/CONTINUITY.md`](pixi/CONTINUITY.md) — age lock + established-facts inject live (`age-identity-v1`)
- ObsidianWriterStack: `scripts/start_local_full_stack.py`, `deckard-local.env`; deeper runtime map `ObsidianWriterStack/docs/pixi/RUNTIME_CODEBASE.md`
- agent-dump ledger: `AI_GROUPCHAT.md` `[PC]` lines
- Prior Pixi tailnet kit: `scripts/pixi-tailnet-interconnect/` (Moonlight / `:8767` on laptop)
