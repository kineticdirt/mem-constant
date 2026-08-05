# Linuxbox — intent, architecture, and known gaps

**Purpose:** One readable guide for *what this system is for*, *how the pieces connect*, and *where it's broken or incomplete*.  
**Comment on this file:** append suggestions under [Feedback / your notes](#feedback--your-notes) or open a PR.

---

## 1. What we're building (intent)

Linuxbox is a **low-power always-on home server** (~2 GB RAM) that:

| Goal | How |
|------|-----|
| **Host your public site** | `abhinavall.net` → portfolio Node app on `:3000` |
| **Run campaign tools** | `map.tableslop.org` → Isla Primavera map on `:8765` |
| **Give you a phone-friendly ops surface** | `/Linuxbox/` Hub (Inbox, Systems, Reports, …) on `:8790` |
| **Run background agents** | Hermes pods (think, fast, Hunter, worldbuilding) on a schedule |
| **Stay cheap** | Free models on fast lane; paid only when needed; resource governor pauses heavy pods |

**Not the goal (yet):** a fully autonomous sysadmin that never breaks things. Agents are **assistants with guardrails** — they propose, you answer Inbox, they implement one step at a time.

---

## 2. High-level topology

```text
Internet
  │
  ├─ Cloudflare Tunnel: abhinavall.net
  │     cloudflared-abhinavall → :8780 (origin proxy)
  │       ├─ /Intel*     → :8790 public viewer
  │       ├─ /Linuxbox*  → :8790 admin Hub
  │       └─ /*          → :3000 portfolio (live site)
  │
  └─ Cloudflare Tunnel: map.tableslop.org
        cloudflared-tableslop → :8765 tableslop map

linuxbox (Debian ARM, Tailscale)
  ├─ abhinav-portfolio.service      :3000
  ├─ linuxbox-status.service        :8790  (Hub dashboard)
  ├─ abhinavall-origin-8780.service :8780  (path router)
  ├─ linuxbox-tableslop.service     :8765
  ├─ cloudflared-abhinavall / cloudflared-tableslop
  ├─ hermes-gateway (user)          ops / think / code
  ├─ agent-pod-scheduler.timer      30s pod rotation
  └─ ~/agent-dump                   git working tree + agent state
```

**PC vs linuxbox:** PC edits code and docs; linuxbox **runs** services. Sync via git bundle / SCP deploy scripts.

---

## 3. Component map (what each card in Systems means)

| Label | What it is | systemd unit | Health means |
|-------|------------|--------------|--------------|
| **abhinavall.net** | Cloudflare tunnel + edge path to your site | `cloudflared-abhinavall` | **Public** URL must return 200 — not just localhost |
| **map.tableslop.org** | Separate tunnel for the campaign map | `cloudflared-tableslop` | Same — public reachability matters |
| **abhinavall.net origin** | Node app serving the live portfolio HTML | `abhinav-portfolio` | Loopback `:3000` |
| **Linuxbox Hub** | Admin dashboard (this UI) | `linuxbox-status` | Loopback `:8790` |
| **tableslop server** | Map viewer + API | `linuxbox-tableslop` | Loopback `:8765` |
| **Hermes gateway** | LLM gateway for agent pods | `hermes-gateway` (user) | process active |
| **Agent scheduler** | Rotates think/fast/RP pods | `agent-pod-scheduler.timer` | timer active |

**Common confusion:** “Portfolio app” **is** the main website backend — not a separate project. The tunnel card and the `:3000` card are two layers of the same stack.

---

## 4. Agent model (how autonomy is supposed to work)

```text
agent-pod-scheduler (every 30s–8m)
  → picks one pod with open work (CURRENT_TASK, backlog, inbox ack, …)
  → Hermes chat with compiled intent (agents/intent/agent-loops.json)
  → ONE concrete step → verify → log → stop

Human loop:
  Agent blocked → agents/human-inbox.json (open[])
  You answer   → Hub Inbox → POST /api/inbox/reply
  Agent sees answer on next fast tick → continues
```

**Laws agents must obey:** path boundaries per pod, no secrets in git, supply-chain gate before upgrades, no production DNS edits.

**Why it feels low-initiative:** pods are intentionally **single-step** and **free-model-heavy** on fast lane to save RAM and API cost. Deeper work runs on `think` every ~8m when memory allows (resource governor).

---

## 5. Data that must survive git pull

| File | Location | Notes |
|------|----------|-------|
| Inbox answers | `agents/state/human-inbox.json` | **gitignored** — was losing answers when `git pull` stashed/merged `agents/human-inbox.json` |
| Resource telemetry | `agents/state/resource-telemetry.json` | governor |
| User tasks | `agents/user-tasks.json` | tracked; merge carefully |
| Campaign progress | `campaigns/*/reports/progress*.md` | tracked |

**Bug fixed 2026-07-06:** inbox runtime moved to `agents/state/` so answers survive `git-pull-and-deploy.sh`.

---

## 6. Known problems (honest)

### 6.1 Maps / tunnel “down” but Systems said OK

**Cause:** Health only probed **loopback** (`127.0.0.1`). Tunnel process could be `active` and origin `:8765` fine while **Cloudflare edge** failed (QUIC timeouts, Wi‑Fi blip, RAM pressure).

**Fix shipped:** Systems now probes **`public_url`** for tunnels. Status `warn` = local OK, public down.

**Remaining:** Intermittent QUIC drops on weak Wi‑Fi; box at ~40% swap makes it worse. Mitigations: resource governor, restart tunnel from Systems, alerts on `warn`.

### 6.2 Inbox questions reappearing

**Cause:** `human-inbox.json` was tracked in git; `git-pull-and-deploy` stash/pop could revert or conflict with your answers.

**Fix shipped:** runtime inbox → `agents/state/human-inbox.json` (gitignored).

### 6.3 Mobile UX

**Current:** Hub has viewport meta + bottom tab bar under 720px (2026-07-06). Map has side legend that stacks on narrow screens but is not a dedicated mobile layout.

**Planned:** PWA manifest, larger map controls, optional full-screen map mode on phone. See `agents/LINUXBOX_DASHBOARD_BACKLOG.md`.

### 6.4 “Breaking things”

Typical failure modes:

- Agent edits outside pod boundary → intent violation logged
- git pull deploy restarts services mid-session
- Tunnel/origin mismatch (wrong unit name in registry — e.g. `personal_portfolio` vs `abhinav-portfolio`)
- Empty or stale `human-inbox.json` in repo overwriting runtime state (fixed)

---

## 7. What you can control

| Surface | URL | Role |
|---------|-----|------|
| Hub (admin) | `https://abhinavall.net/Linuxbox/` | Inbox, Systems, Chat, Tasks |
| Intel (public) | `https://abhinavall.net/Intel/` | News/reports POC |
| Map | `https://map.tableslop.org/` | Campaign map (**not** `maps.` plural) |
| SSH | `ssh potato` / Tailscale | Full shell, Cursor Remote |

Systems tab: **RESTART** on `cloudflared-tableslop` or `linuxbox-tableslop` when map is down.

---

## 8. Roadmap (suggested priorities)

1. **Reliability** — public health alerts, auto-restart tunnel on sustained `warn` (timer script)
2. **Mobile** — Hub PWA + map touch UX pass
3. **Inbox** — agent must read answered IDs before re-asking (fast-lane prompt enforcement)
4. **Docs** — keep this file updated when architecture changes
5. **Split repo** — homelab → private `Linuxbox` repo (see `docs/repo-split-linuxbox-memconstant.md`)

---

## 9. Related docs

| Doc | Topic |
|-----|--------|
| `docs/dashboard-ui-architecture.md` | Hub UI structure, inbox form families |
| `docs/cloudflare-tunnels-linuxbox.md` | Tunnel install, split policy |
| `docs/agents/linuxbox-systems-panel.md` | Systems API, alerts setup |
| `docs/agents/linuxbox-resource-governor-plan.md` | RAM/swap governance |
| `docs/tableslop-linuxbox.md` | Map deploy |
| `CLAUDE.md` | Agent operating manual on box |
| `AGENTS.md` | Durable workspace facts |

---

## Feedback / your notes

_Add comments below (date + what you'd change). Agents: read this section before large architecture changes._

```
<!-- Example:
2026-07-06 [human] Want map mobile as default PWA on Pixel; Hub Inbox should email me when new Q.
-->
```
