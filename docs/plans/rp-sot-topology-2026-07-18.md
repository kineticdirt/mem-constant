# RP SoT topology — 2026-07-18

**Verified live (SSH `potato` Tailscale, 2026-07-18T19:52Z):**

| Surface | Value |
|---------|--------|
| Live checkout tip | `639dec6e2c43d9216e21c00d9ff062846c997168` (`639dec6`) |
| Rev | `20260718-time-fix-v1` (`chat_api_revision`) |
| Checkout | `~/pixi-rp/ObsidianWriterStack` on `pc/merge-onto-laptop` |
| `origin` | bare `~/repos/ObsidianWriterStack.git` (interim canonical) |
| Bare `main` / `pc/merge-onto-laptop` / `pc/orphan-time-fix` | all `639dec6` |
| Service | `linuxbox-pixi-rp` active; `:8767/api/config` → 200 |
| Sessions | 17 under `PixiApp/chat-ui/sessions` |
| Gitea `:13000` | **wizard done** (`INSTALL_LOCK=true`, Sign In OK, admin `username`) — migrate waits on `~/.gitea-migrate.env` password |

**Authority:** linuxbox bare (until migrate to Gitea). PC / laptop / GitHub are mirrors or dirty worktrees.  
**What Gitea is for:** local canonical git host for RP/Pixi (LAN+Tailscale) so deploys are `git pull`, not SCP forever. Not public.

---

## A. High-level — machines / hosts / dirty vs SoT

```mermaid
flowchart TB
  subgraph humans["Clients"]
    PC["PC Windows<br/>dev / Cursor / merge worktrees"]
    LAP["Laptop<br/>context plane / GitHub origin often"]
  end

  subgraph gh["GitHub mirror optional"]
    GH["kineticdirt/RP_TESTBED<br/>mirror / backup — not authority"]
  end

  subgraph potato["linuxbox potato — AUTHORITY"]
    BARE["bare SoT interim<br/>~/repos/ObsidianWriterStack.git<br/>main = 639dec6"]
    GITEA["Gitea :13000 / SSH :12222<br/>INSTALL_LOCK=true admin username<br/>repo not migrated yet"]
    LIVE["live checkout<br/>~/pixi-rp/ObsidianWriterStack<br/>@ 639dec6 / 20260718-time-fix-v1"]
    SVC["systemd --user<br/>linuxbox-pixi-rp"]
    PORT[":8767 OpenRouter-only Pixi"]
    SESS["sessions JSON ×17<br/>runtime SoT for chats"]
  end

  PC -->|"push/fetch optional"| BARE
  PC -->|"mirror push optional"| GH
  LAP -->|"often GitHub origin"| GH
  GH -.->|"optional sync"| BARE
  BARE -->|"git checkout / FF"| LIVE
  BARE -.->|"pending: migrate + password file"| GITEA
  GITEA -.->|"post-migrate: LIVE origin → Gitea"| LIVE
  LIVE --> SVC --> PORT
  LIVE --> SESS

  classDef sot fill:#1b5e20,stroke:#a5d6a7,color:#fff
  classDef mirror fill:#37474f,stroke:#90a4ae,color:#fff
  classDef dirty fill:#e65100,stroke:#ffcc80,color:#fff
  classDef pending fill:#e65100,stroke:#ffcc80,color:#fff
  class BARE,LIVE,SESS sot
  class GH,PC,LAP mirror
  class GITEA pending
```

**Legend**

| Role | What |
|------|------|
| **SoT** | bare `main` tip + live checkout at same SHA; session JSON is runtime SoT |
| **Mirror** | GitHub RP_TESTBED; PC/laptop clones |
| **Dirty** | PC local worktrees / bak trees (`*.bak.*`) — not authority |
| **Pending** | Gitea host ready; bare→Gitea migrate blocked on password file |

---

## B. Branch lineage — ancestor → lineages → tip `639dec6`

```mermaid
gitGraph
  commit id: "890f718" tag: "common ancestor"
  branch laptop_data_driven
  checkout laptop_data_driven
  commit id: "da392d8…9d6051c" tag: "laptop main line"
  commit id: "308ad0f" tag: "dead-code audit on laptop base"
  commit id: "7b27873" tag: "PC modules onto laptop"
  commit id: "f6a7b5d" tag: "guided merge P3"
  commit id: "6fae9e6" tag: "P5 wires"
  commit id: "639dec6" tag: "SoT tip time-fix-v1"

  checkout main
  branch pc_firefighting
  checkout pc_firefighting
  commit id: "3eafdb8…50c8bde" tag: "pc/dead-code-tooling"
  commit id: "dc47467" tag: "pc/wip-sheet-permanence SUPERSEDED"

  checkout laptop_data_driven
  branch orphan_time_fix
  checkout orphan_time_fix
  commit id: "639dec6b" tag: "pc/orphan-time-fix = tip ABSORBED"
```

Readable flowchart (same facts; prefer if gitGraph rendering is picky):

```mermaid
flowchart LR
  A["890f718<br/>common ancestor"] --> L["Lineage 1 — laptop / data-driven<br/>… → 9d6051c"]
  A --> P["Lineage 2 — PC firefighting<br/>… → 50c8bde → dc47467"]
  A --> O["Lineage 3 — orphan time-fix<br/>bak dirty → ported"]

  L --> M["merge chain on laptop base<br/>308ad0f → 7b27873 → f6a7b5d<br/>→ 6fae9e6 P5"]
  O --> T["639dec6<br/>20260718-time-fix-v1<br/>SoT tip"]
  M --> T

  P -.->|"content superseded / not FF"| T

  T --> R1["bare main"]
  T --> R2["pc/merge-onto-laptop"]
  T --> R3["pc/orphan-time-fix ABSORBED"]
  T --> R4["GitHub main FF"]
  T --> R5["live pixi-rp checkout"]

  style T fill:#1b5e20,color:#fff
  style P fill:#e65100,color:#fff
```

**Absorbed / superseded (do not reckless-delete):**

| Ref | SHA | Status |
|-----|-----|--------|
| `pc/orphan-time-fix` | `639dec6` | Absorbed (= tip); safe to delete later after ack |
| `pc/dead-code-tooling` | `50c8bde` | Superseded by merge-chain ports |
| `pc/wip-sheet-permanence` | `dc47467` | Superseded divergent snapshot — keep as historical |

---

## C. Deploy / runtime

```mermaid
flowchart TB
  BARE["potato:~/repos/ObsidianWriterStack.git<br/>refs/heads/main @ 639dec6"]
  GITEA["Gitea username/ObsidianWriterStack<br/>PENDING migrate (password file)"]

  BARE -->|"git fetch / reset --hard<br/>or clone swap"| CO["~/pixi-rp/ObsidianWriterStack<br/>branch pc/merge-onto-laptop<br/>origin → bare"]
  GITEA -.->|"post-migrate: change origin"| CO

  CO --> UNIT["~/.config/systemd/user/linuxbox-pixi-rp.service"]
  UNIT --> PY["python3 scripts/unified_rp_server.py<br/>--bind 0.0.0.0 --port 8767"]
  PY --> API[":8767 /api/config<br/>chat_api_revision=20260718-time-fix-v1"]
  PY --> UI[":8767 chat UI"]
  PY --> SES["PixiApp/chat-ui/sessions/*.json<br/>17 sessions preserved"]
  PY --> ENV["~/.linuxbox-pixi/deckard-local.env<br/>OpenRouter only"]

  Clients["PC / phone / Tailscale clients"] --> API
  Clients --> UI
```

---

## D. Feature absorption → single tip

```mermaid
flowchart TB
  subgraph absorbed["Absorbed into 639dec6"]
    TF["orphan time-fix<br/>beat-tier clock + scene_presence<br/>client game_clock inject"]
    SC["sheet-cap Track A<br/>pkg-before-dossier + section cap"]
    PM["permanence / aka / objects<br/>Emily→lin-mei + salvage"]
    P5["P5 wires<br/>continuity / voice / inbox<br/>dense PUT + 402 retry"]
    LD["laptop inject manifest<br/>send_inject_layers + scenario packages"]
    LG["Laguna FG free-first<br/>+ PC modules on laptop base"]
  end

  absorbed --> TIP["639dec6 / 20260718-time-fix-v1"]
  TIP --> LIVE["potato live :8767"]
  TIP --> BARE["bare + GitHub main"]

  DEAD["format_game_clock_markdown<br/>DELETED as dead duplicate"] -.-> TIP
```

---

## Clone URLs (current + post-migrate)

**Current SoT (bare — works now):**

```text
# from potato
git clone ~/repos/ObsidianWriterStack.git

# from PC/LAN
git clone ssh://abhinav@192.168.4.59/home/abhinav/repos/ObsidianWriterStack.git
# or: potato:repos/ObsidianWriterStack.git

# Tailscale
git clone ssh://abhinav@100.122.108.94/home/abhinav/repos/ObsidianWriterStack.git
```

**Gitea (after migrate — owner `username`):**

```text
HTTP LAN:       http://192.168.4.59:13000/username/ObsidianWriterStack.git
HTTP Tailscale: http://100.122.108.94:13000/username/ObsidianWriterStack.git
SSH LAN:        ssh://git@192.168.4.59:12222/username/ObsidianWriterStack.git
SSH Tailscale:  ssh://git@100.122.108.94:12222/username/ObsidianWriterStack.git
```

Post-wizard helper: `scripts/linuxbox/gitea-migrate-rp-from-bare.sh` + `gitea-migrate.env.example`
