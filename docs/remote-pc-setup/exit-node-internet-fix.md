# Exit node broke internet / potato SSH (chicken–egg)

**Symptom:** Client has **Use exit node** on (linuxbox / potato). Public internet dies or hangs. `ssh potato` / Tailscale to the box fails. Agents trying to *fix* the exit node cannot reach potato — they are already routing through the broken exit.

**Do not** start potato diagnosis while the client still has an exit node selected. Restore local internet first.

Related: [ssh-le-potato-reference.md](../ssh-le-potato-reference.md) (advertise / approve), [lan-vs-tailscale-decision.md](lan-vs-tailscale-decision.md) (exit **off** at home).

---

## 1. Immediate recovery — restore internet NOW

Clear the exit node on **this** device. Run commands **one at a time** (no `&&`).

### CLI (Windows / macOS / Linux client)

```text
tailscale set --exit-node=
```

Confirm:

```text
tailscale status
```

Look for no active exit node on **Self** (e.g. `ExitNodeID` empty / not using an exit).

### Windows Tailscale GUI

1. System tray → **Tailscale**
2. **Exit Node** → **Off** (or “None”)

### Phone (iOS / Android)

1. Open **Tailscale** app
2. Disable **Use exit node** (set to None / Off)

Internet should return via the normal Wi‑Fi / cellular path within a few seconds. If Tailscale itself is wedged, toggle Tailscale **off** then **on** after clearing the exit node — still do **not** re-enable exit until §3.

---

## 2. With exit node OFF — verify potato SSH / internet

Only after §1:

1. **Client internet:** browser or `ping 1.1.1.1` / open a known site.
2. **Tailscale up (no exit):** `tailscale status` — potato/`raspbian-bullseye-aml-s905x-cc` should show as a peer; this PC must **not** list an exit node in use.
3. **SSH potato** (pick one path):
   - Away / tailnet: `ssh potato`
   - Home LAN preferred: `ssh potato-lan` (or LAN IP `192.168.4.59` when wired eth0 is up)
4. Optional: `ssh potato hostname` or `ssh potato uptime`

If SSH still fails with exit **off**, the problem is not this chicken–egg — debug SSH/keys/LAN separately. If SSH works only after clearing exit, the exit path was the blocker; continue to §3–§5.

---

## 3. Re-enable exit node (client flags)

Use only when you **want** home egress (travel / café). Prefer exit **off** on the desktop at home.

```text
tailscale set --exit-node=<linuxbox-name-or-ip> --exit-node-allow-lan-access=true
```

Examples:

```text
tailscale set --exit-node=raspbian-bullseye-aml-s905x-cc --exit-node-allow-lan-access=true
```

```text
tailscale set --exit-node=100.122.108.94 --exit-node-allow-lan-access=true
```

`--exit-node-allow-lan-access=true` keeps local LAN (printers, `192.168.x`, home Moonlight/SSH) reachable while default internet goes through the exit. Without it, LAN hairpin/breakage is a common “internet and home SSH both weird” failure.

Clear again anytime:

```text
tailscale set --exit-node=
```

Verify egress: [https://ifconfig.me](https://ifconfig.me) should show **home** public IP when exit is on.

---

## 4. Common causes (client stuck / “no internet”)

| Cause | What happens |
|--------|----------------|
| **DNS via exit** | Exit selected; DNS answers (or fails) only through potato. If potato DNS/forwarding is broken, every hostname dies even when Tailscale peers look “up”. |
| **No LAN access** | Exit on without `--exit-node-allow-lan-access=true` — cannot reach home LAN hosts; feels like “potato gone” while on the same Wi‑Fi. |
| **Exit not approved** | Admin never approved `0.0.0.0/0` / `::/0` on the linuxbox machine — clients get empty exit list or a half-broken path. |
| **No MASQUERADE / NAT on potato** | Exit advertised but forwarded packets leave without SNAT — client traffic blackholes. Needs working NAT/MASQUERADE on the uplink path Tailscale expects. |
| **IPv6** | Client prefers AAAA; `::/0` unapproved or IPv6 forward off on potato → some apps hang while IPv4 might still work (or the reverse). |

---

## 5. Potato-side checklist (when SSH works again)

Run **on potato**, one command at a time. Do not claim the exit is fixed until these check out and a client egress test passes.

1. **IP forward**

   ```text
   cat /proc/sys/net/ipv4/ip_forward
   ```

   Expect `1`. IPv6 if you advertise `::/0`:

   ```text
   cat /proc/sys/net/ipv6/conf/all/forwarding
   ```

   Expect `1`.

2. **Advertise exit node**

   ```text
   sudo tailscale set --advertise-exit-node
   ```

   Confirm prefs include default routes:

   ```text
   sudo tailscale debug prefs
   ```

   Look for **`AdvertiseRoutes`** with `0.0.0.0/0` (and `::/0` if using IPv6 exit).

3. **Approve routes (tailnet admin)**

   - UI: [Machines](https://login.tailscale.com/admin/machines) → linuxbox → approve exit / `0.0.0.0/0` (and `::/0` if shown).
   - Or API helper (key in shell only, never commit):  
     `scripts/approve_tailscale_linuxbox_exit_routes.ps1`  
     (see [ssh-le-potato-reference.md](../ssh-le-potato-reference.md)).

4. **NAT / MASQUERADE**

   Confirm forwarded exit traffic is SNATed out the home uplink (iptables/nft / Tailscale’s expected path). If packets forward but never return, check MASQUERADE/NAT and home-router firewalling of forwarded traffic.

5. **Client re-test**

   On a **second** device (or after deliberately re-enabling exit with §3 flags): browse + `ifconfig.me`. Keep the **PC used for SSH diagnostics** with exit **off** until that works.

---

## 6. Incident note — 2026-07-29

PC agents could **not** SSH potato while diagnosing exit-node internet loss — likely the client was already on a **broken exit node** (chicken–egg). **Diagnose potato only after disconnecting the exit node** (§1–§2).

This doc is recovery + checklist only. **Do not treat potato exit-node config as fixed** from the write alone; verify on-box after SSH is restored.
