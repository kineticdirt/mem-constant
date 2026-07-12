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
2. **Moonlight:** two PC entries — LAN high quality + `100.118.226.87` / MagicDNS travel profile (see README).
3. Skip subnet routers / auto Match exec until A/B shows DERP or large sustained deltas.

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

## 6. Checklist (this session)

- [x] Potato shows **direct** (LAN CurAddr), not active DERP relay
- [x] **Use exit node** is **off** on this PC
- [x] A/B ping/SSH LAN vs 100.x recorded (table above)
- [ ] Moonlight dual host entries verified by human (not run this session)
- [x] Policy chosen: **(B)** LAN for Moonlight + home SSH; Tailscale for away

## 7. Follow-ups (human / next agent)

1. Edit `~/.ssh/config`: `potato-lan` / `linuxbox` HostName → `192.168.4.23` (or whatever `tailscale status` CurAddr shows).
2. Optionally patch docs that hardcode `192.168.1.191` once the new IP is stable.
3. Add Moonlight LAN entry if streaming at home feels soft on 100.x.
4. Re-run ICMP A/B after any Wi‑Fi / router change; if relayed or avg delta ≫ 20–50 ms, revisit.

`Test-RemoteTailnet.ps1` remains the **travel** gate (hotspot), not this home A/B.
