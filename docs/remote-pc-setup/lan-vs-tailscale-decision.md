# LAN vs Tailscale at home — decision report

**Date:** 2026-07-12 · **Machine:** desktop PC (`desktop-igqesd4` / Wi‑Fi `192.168.4.42`) · **Peer:** linuxbox/potato (`100.122.108.94`, live LAN `192.168.4.23`)

## 1. Question

On the same home network, is Tailscale slowing SSH / Moonlight / dashboard / git enough that we should prefer LAN when home, while keeping Tailscale for travel/remote?

## 2. Verdict (final)

**Choose policy (B): Tailscale for remote/away; LAN for Moonlight + home SSH when you care about latency/bitrate.**

| Situation | Use |
|-----------|-----|
| Away / cellular / other Wi‑Fi | Tailscale MagicDNS / `100.x` (`potato`, `desktop-igqesd4`) |
| Home, SSH to potato | Prefer **`potato-lan`** once HostName is current LAN IP (today **`192.168.4.23`**) |
| Home, Moonlight → desktop | Prefer **desktop LAN** (`192.168.4.42` today) high-bitrate entry; keep a second **100.x** entry for travel |
| Exit node | **Off** on PC / laptop / phone at home. Potato may still *offer* exit; only **use** it when off-LAN and you want home egress |

**Why:** Live A/B from this PC shows potato is already **direct WireGuard over the LAN endpoint** (not DERP for the active path). Tailscale is fine for light work, but **LAN ICMP and SSH were measurably faster**. Documented LAN IP `192.168.1.191` is **stale / dead** — update `potato-lan` before relying on it.

## 3. Evidence (this PC, 2026-07-12)

### Path / exit node

```text
tailscale status → potato: active; offers exit node;
  direct 192.168.4.23:41641  (CurAddr LAN; Relay=nyc listed as fallback only)
Self ExitNodeID: (none)  → this PC is NOT using an exit node
```

Tailscale ping (WG path): `pong … via 192.168.4.23:41641 in 10ms` (repeat sample `61ms` — Wi‑Fi jitter).

### ICMP A/B (10 packets each)

| Target | Min | Avg | Max | Loss | Notes |
|--------|-----|-----|-----|------|-------|
| `192.168.4.23` (live LAN) | 5 ms | **9 ms** | 14 ms | 0% | Current potato Wi‑Fi/LAN |
| `100.122.108.94` (Tailscale) | 8 ms | **22 ms** | 44 ms | 0% | Same peer via 100.x |
| `192.168.1.191` (docs / `potato-lan`) | — | — | — | **100%** | **Stale — do not use** |

**Delta:** LAN ~13 ms better average than Tailscale ICMP on this run. Not a catastrophe for SSH prompts; matters more for streams and “feels snappy.”

### SSH time-to-prompt (`true`)

| Path | Wall time | Notes |
|------|-----------|-------|
| `abhinav@100.122.108.94` (key `id_rsa_potato`) | **~1.1 s** (cold run ~3.5 s) | Works today |
| `abhinav@192.168.4.23` (same key; temp known_hosts) | **~0.75 s** | SSHD reachable (`OpenSSH_8.4p1`); host key must be accepted / HostKeyAlias set |
| `potato-lan` → `192.168.1.191` | N/A | Host unreachable |

### PC LAN (for Moonlight host entry)

Wi‑Fi `192.168.4.42` / mask `255.255.252.0` (`192.168.4.0/22`). Ethernet disconnected. Tailscale self IP `100.118.226.87`.

### Docs already aligned (policy-wise)

| Source | Says |
|--------|------|
| `docs/remote-pc-setup/README.md` | Away = Tailscale; dual Moonlight LAN + 100.x |
| `docs/ssh-le-potato-reference.md` | `potato` = 100.x; `potato-lan` = LAN (IP needs update) |
| `docs/agents/android-tailscale-interface.md` | Exit node off at home unless home egress wanted |

## 4. Policy detail

### Tailscale — keep always on

- MagicDNS names, WoL relay via potato, travel reachability, ACLs.
- Do **not** turn Tailscale off just because you’re home.

### LAN — prefer when home for heavy/sensitive hops

1. **Update** `~/.ssh/config` `Host potato-lan` (and `Host linuxbox` if used) **HostName** from `192.168.1.191` → current potato LAN (today **`192.168.4.23`**; re-check after DHCP).
2. **Optional auto home/away:** `Match exec` on `Host potato` — see **§9** (`scripts/pc/ssh-potato-prefer-lan.sh` + `ssh-potato-match-snippet.txt`).
3. **Moonlight:** two PC entries — LAN high quality + `100.118.226.87` / MagicDNS travel profile (see README). No auto-switch.
4. No subnet routers required; keep Tailscale always on.

### Exit node

- Potato **offers** exit node (`ExitNodeOption: true`); clients must not leave **Use exit node** on while sitting on home Wi‑Fi.
- Exit stays a **linuxbox-only advertise** for when you’re away — never “make Windows the exit.”

## 5. Residual risks

| Risk | Mitigation |
|------|------------|
| Stale LAN IP / DHCP drift | Confirm with `tailscale status` CurAddr or `ip addr` on potato before SSH/Moonlight |
| SSH host-key mismatch on new LAN IP | Update known_hosts or set `HostKeyAlias potato` on `potato-lan` |
| Client client isolation / guest Wi‑Fi | Falls back to 100.x only |
| Path flips to DERP | Prefer LAN; fix NAT/firewall until `direct` returns |
| Exit node left on | Clear: `tailscale set --exit-node=` or tray → Off |
| Moonlight does not auto-switch | Manual dual entries |
| Match exec mis-ordered after Host potato | First HostName wins — put Match **above** Host potato (§9) |

## 6. Checklist (this session)

- [x] Potato shows **direct** (LAN CurAddr), not active DERP relay
- [x] **Use exit node** is **off** on this PC
- [x] A/B ping/SSH LAN vs 100.x recorded (table above)
- [ ] Moonlight dual host entries verified by human (not run this session)
- [x] Policy chosen: **(B)** LAN for Moonlight + home SSH; Tailscale for away

## 7. Follow-ups (human / next agent)

1. Edit `~/.ssh/config`: `potato-lan` / `linuxbox` HostName → `192.168.4.23` (or whatever live LAN is).
2. Install **§9** Match snippet so plain `ssh potato` prefers LAN when home.
3. Add Moonlight LAN entry if streaming at home feels soft on 100.x (dual entries; no auto).
4. Cap Moonlight bitrate for shared 50–100 Mbps (see **§10**); re-run smoke after Wi‑Fi/router changes.

`Test-RemoteTailnet.ps1` remains the **travel** gate (hotspot), not this home A/B.

## 8. Usable option + smoke (2026-07-13 PC)

**Scripts (ponytail A+B):**

| Script | Role |
|--------|------|
| `scripts/pc/smoke-lan-vs-tailscale.sh` | A/B ICMP + `ssh … true`; PASS if either path works; `--tip` prints enable steps |
| `scripts/pc/prefer-lan-when-home.sh` | Wrapper → smoke with `--tip` |
| `scripts/pc/connect-linuxbox.sh` | Tries `potato-lan` (2s) then `potato` / `linuxbox` |
| `scripts/pc/ssh-potato-prefer-lan.sh` | Match exec helper: exit 0 home LAN, 1 away (§9) |
| `scripts/pc/ssh-potato-match-snippet.txt` | Paste into `~/.ssh/config` (Match before Host potato) |

Hub/Meta LAN hint (C) **skipped** (not cheap / not blocking).

**How to enable faster same Wi‑Fi:** keep Tailscale on; at home use `ssh potato-lan` or `bash scripts/pc/connect-linuxbox.sh`; away use `ssh potato`. Exit node stays off on clients. Re-check HostName after DHCP: `bash scripts/pc/prefer-lan-when-home.sh`.

**Smoke run (this PC, 2026-07-13T16:20Z, count=5):**

| Path | ICMP avg | SSH `true` | Notes |
|------|----------|------------|-------|
| LAN `192.168.4.23` | **57 ms** | **1083 ms** PASS | `potato-lan` HostName OK; live LAN via TS SSH confirms `.23` |
| TS `100.122.108.94` | **118 ms** | **1530 ms** PASS | exit_node_id=(none) |
| Winner | LAN (−61 ms) | LAN (−447 ms) | RESULT **PASS** |

**CurAddr note:** Tailscale showed `direct 10.0.0.155:33813` (WG endpoint ≠ L2 Wi‑Fi). Script only treats CurAddr as LAN when in `192.168.4.0/22`; otherwise uses SSH `ip addr` / `potato-lan` / fallback `.23`.

Potato deploy: **no** (scripts/docs only; SSH config local).

## 9. Dynamic allocation (home vs away)

**Yes — for SSH.** Manual `potato` vs `potato-lan` is optional once `Match exec` is installed. Moonlight does **not** auto-switch (keep dual PC entries). Do **not** disable Tailscale.

### How it works

OpenSSH evaluates `Match host potato exec "…"` **before** the static `Host potato` block (first `HostName` wins):

1. Helper `scripts/pc/ssh-potato-prefer-lan.sh` exits **0** only if this machine has a **`192.168.4.0/22`** address **and** TCP **22** on potato LAN answers within ~1s.
2. Match then sets `HostName` to the LAN IP (`192.168.4.23` today) + `HostKeyAlias potato`.
3. If helper exits **1** (away / guest Wi‑Fi / AP isolation), Match is skipped → `Host potato` keeps Tailscale **`100.122.108.94`**.
4. **`potato-lan`** stays an explicit force-LAN alias (no Match). **`connect-linuxbox.sh`** still tries `potato-lan` then `potato`.

### Enable (install into `~/.ssh/config`)

1. Keep existing `Host potato` / `Host potato-lan` auth settings.
2. Paste the **Match block above** `Host potato` (snippet file in repo):

```bash
# From repo root (Git Bash):
cat scripts/pc/ssh-potato-match-snippet.txt
# Copy Match + Host blocks into ~/.ssh/config — Match MUST appear before Host potato.
```

Canonical snippet: `scripts/pc/ssh-potato-match-snippet.txt`. Helper: `scripts/pc/ssh-potato-prefer-lan.sh`.

**Windows note:** Cursor/Git Bash `ssh` usually runs the Git OpenSSH client and can `exec "bash …/ssh-potato-prefer-lan.sh"`. If you use **system** OpenSSH (`C:\Windows\System32\OpenSSH\ssh.exe`), point Match at Git’s `bash.exe` with full paths (see comments in the snippet).

**DHCP drift:** update `Host potato-lan` HostName *and* the Match `HostName` (or set `POTATO_LAN_IP`). Helper prefers `ssh -G potato-lan` hostname when set.

### Verify

```bash
bash scripts/pc/ssh-potato-prefer-lan.sh; echo exit:$?   # 0=home LAN ok, 1=away
ssh -G potato | grep -i hostname                         # should show LAN IP when home
ssh -o BatchMode=yes -o ConnectTimeout=8 potato true     # reaches potato
bash scripts/pc/connect-linuxbox.sh                      # still LAN-first wrapper
```

### What does *not* auto-switch

| Surface | Behavior |
|---------|----------|
| Moonlight | Dual entries only (desktop LAN + 100.x). No Match equivalent. |
| Tailscale app | Stay **on**; exit node **off** at home. |
| Browser dashboard | Bookmark LAN `:8790` at home if you want; 100.x still works. |

## 10. Shared 50–100 Mbps ceiling (honest)

**Same-LAN vs Tailscale does not raise your ISP/Wi‑Fi shared cap.** At home you share ~**50–100 Mbps** with others; that bound applies to **internet egress** and to any stream that competes on the same AP. Preferring LAN only removes Tailscale encryption/overhead and occasional DERP detours for **local** hops (SSH, dashboard, Moonlight host↔client on the LAN).

### What LAN *does* help

- Lower RTT / snappier SSH (already measured).
- Moonlight when **both** PC and client are on home Wi‑Fi/Ethernet — traffic stays on the LAN and does not need the internet pipe.
- Avoid exit-node hairpin (already policy: exit **off** at home).

### What it will *not* fix

- Upload/download to the public internet (git push, OpenRouter, Cloudflare) — still capped by the shared WAN.
- Wi‑Fi contention (neighbors, phones, other rooms) — LAN path can still jitter.
- Forcing a higher Moonlight bitrate than the shared radio can sustain.

### Practical levers (ranked)

| Rank | Action | Effect |
|------|--------|--------|
| 1 | **Exit node off** at home; don’t route local traffic through potato exit | Avoids double-hop + uplink burn |
| 2 | **SSH Match exec** + `potato-lan` / `connect-linuxbox.sh` | Auto home/away for SSH; less friction |
| 3 | **Moonlight bitrate 15–30 Mbps** on a 50–100 Mbps shared link | Leaves headroom for others; raise only if A/B is clean |
| 4 | **5 GHz / less congested channel**; wired Ethernet to desktop or AP if possible | Real capacity + stability wins |
| 5 | Keep Tailscale **direct** (already); fix firewall if path flips to DERP | Away/travel quality |
| 6 | Optional **QoS/SQM** on OpenWrt/Asus — ask before reconfiguring | Fairer share under load; not done from this repo |

Re-run `bash scripts/pc/smoke-lan-vs-tailscale.sh --tip` after Wi‑Fi/router changes.
