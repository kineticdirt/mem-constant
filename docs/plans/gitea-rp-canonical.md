# Gitea / linuxbox RP canonical host (Track B P2)

**Date:** 2026-07-18  
**Status:** Wizard **DONE** (`INSTALL_LOCK=true`, Sign In OK) — **migrate waiting on password file**. Bare-git remains interim SoT until migrate.  
**Constraint:** Canonical RP repo lives on **linuxbox only**. Laptop remotes out of scope.  
**What Gitea is for:** linuxbox-local canonical git host for the RP/Pixi tree (LAN + Tailscale `:13000` / SSH `:12222`). Not public. GitHub `RP_TESTBED` stays optional mirror. Live Pixi reads from `~/pixi-rp/ObsidianWriterStack`; Gitea will own versioned history so deploys are `git pull` not eternal SCP snapshots.  
**Topology diagrams:** [`rp-sot-topology-2026-07-18.md`](./rp-sot-topology-2026-07-18.md)

## Evidence (re-verified 2026-07-18T19:52Z SSH potato Tailscale)

| Check | Result |
|-------|--------|
| SSH `potato` (Tailscale `100.122.108.94`) | OK |
| Gitea HTTP `:13000` | Container up (`gitea/gitea:1.21.11`, `13000→3000`, SSH `12222→22`) |
| Gitea install state | **`INSTALL_LOCK = true`**; `/user/login` title **Sign In** (not Installation wizard) |
| Admin username | literally **`username`** (local-only; leave as admin) |
| Admin password | **Not on box** — no `~/.gitea-migrate.env`, no `GITEA_ADMIN_PASSWORD` in hermes/dashboard/pixi env, LINUXBOX template has no password. **Will not invent.** |
| Live Pixi tip | `639dec6` / rev `20260718-time-fix-v1` |
| Live remote | still `origin` → `~/repos/ObsidianWriterStack.git` (bare) |
| IPs | LAN `192.168.4.59`, Tailscale `100.122.108.94` |
| `linuxbox-pixi-rp` | active; `:8767` + `/api/config` → 200; 17 sessions; Laguna FG free-first |

## Unblock migrate (human — one password file)

Password was never pasted in chat. Create a chmod-600 env on potato, then run the script:

```bash
# on potato
cp ~/agent-dump/scripts/linuxbox/gitea-migrate.env.example ~/.gitea-migrate.env
chmod 600 ~/.gitea-migrate.env
# edit ~/.gitea-migrate.env — set GITEA_ADMIN_PASSWORD=… (GITEA_USER=username already)
nano ~/.gitea-migrate.env

set -a; . ~/.gitea-migrate.env; set +a
bash ~/agent-dump/scripts/linuxbox/gitea-migrate-rp-from-bare.sh --owner username --user username
```

Script auto-sources `~/.gitea-migrate.env` if present. After OK, point live:

```bash
cd ~/pixi-rp/ObsidianWriterStack
git remote set-url origin http://127.0.0.1:13000/username/ObsidianWriterStack.git
# or SSH: ssh://git@127.0.0.1:12222/username/ObsidianWriterStack.git
git fetch origin
git rev-parse --short HEAD   # expect 639dec6
systemctl --user restart linuxbox-pixi-rp
curl -sS http://127.0.0.1:8767/api/config | python3 -c 'import sys,json; print(json.load(sys.stdin).get("chat_api_revision"))'
```

Keep bare as backup until two successful deploys via Gitea. Optional later: set full name / create `pixi` deploy token / org — no need to recreate `username`.

### Clone URLs (after migrate — owner `username`)

```text
HTTP LAN:       http://192.168.4.59:13000/username/ObsidianWriterStack.git
HTTP Tailscale: http://100.122.108.94:13000/username/ObsidianWriterStack.git
SSH LAN:        ssh://git@192.168.4.59:12222/username/ObsidianWriterStack.git
SSH Tailscale:  ssh://git@100.122.108.94:12222/username/ObsidianWriterStack.git
```

## Interim canonical (bare git on potato) — CURRENT SoT

```text
potato:~/repos/ObsidianWriterStack.git
```

| Ref | SHA | Notes |
|-----|-----|--------|
| `main` | `639dec6` | SoT tip (= live) |
| `pc/merge-onto-laptop` | `639dec6` | deploy branch |
| `pc/orphan-time-fix` | `639dec6` | absorbed (= tip); leave until ack |
| `pc/dead-code-tooling` | `50c8bde` | superseded |
| `pc/wip-sheet-permanence` | `dc47467` | superseded divergent snapshot |

### Clone / point (now)

```bash
# PC
git remote add linuxbox-rp potato:repos/ObsidianWriterStack.git
git fetch linuxbox-rp

# Live still uses bare as origin until migrate
# ~/pixi-rp/ObsidianWriterStack → origin = ~/repos/ObsidianWriterStack.git @ 639dec6
```

GitHub `kineticdirt/RP_TESTBED` remains optional mirror. **No laptop remote required.**

## Branch cleanup policy

- Prefer **leave** absorbed refs + topology note over delete.
- Safe later (after human ack): delete `pc/orphan-time-fix` only (same SHA as tip).
- Do **not** delete `pc/wip-sheet-permanence` without review (divergent history).

## What was done this pass (2026-07-18T19:52Z)

- Confirmed Gitea past wizard: `INSTALL_LOCK=true`, Sign In 200, API version 1.21.11.
- Searched potato/PC for admin password — none found; will not invent.
- Added `scripts/linuxbox/gitea-migrate.env.example`; migrate script auto-loads `~/.gitea-migrate.env`, default owner `username`.
- Migrate attempted → exit 2 (password missing). Live `origin` left on bare; tip unchanged.
- Pixi smoke: `:8767` 200, rev `20260718-time-fix-v1`, sheet-cap + scene_presence present, 17 sessions, Laguna FG.

## What was NOT done

- No bare→Gitea push (blocked on password file).
- No change of live `origin` to Gitea.
- No deletion of absorbed feature branches.
- No password written to ledger/docs.
