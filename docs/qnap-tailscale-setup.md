# QNAP NAS → Tailscale (on-site setup runbook)

**Goal:** while physically on the NAS's LAN, install Tailscale on the QNAP so you can reach it from your tailnet (PC `100.96.x.x`, linuxbox `100.122.108.94`, phone) **forever after, without traveling back**. The box lives on a different network across the country.

**Why on-site:** installing the Tailscale app needs QTS admin (App Center) access. Doing it on the LAN avoids the chicken-and-egg of "needing remote access to set up remote access," and sidesteps CGNAT / port-forwarding on the remote network entirely. Tailscale is a mesh VPN — no inbound ports, no public exposure.

> **Anti-hallucination (per `AI_GROUPCHAT.md`):** the steps below are the intended procedure. Treat any "it's reachable now" claim as **unverified** until you run `tailscale ping` / open the QTS UI over the `100.x` IP and see it work. Exact menu labels vary by **QTS version and model** — verify on the box.

---

## 0. Before you travel (do on PC)

- [ ] Confirm which **Tailscale account / tailnet** owns the linuxbox + PC nodes, and that you can log into [the admin console](https://login.tailscale.com/admin/machines) on your phone (you'll approve the NAS from there while on-site).
- [ ] Know the QNAP **model number** (sticker on the unit). ARM vs x86 and QTS version decide whether Tailscale is a one-click App Center package or needs Container Station (see §2 fallback).
- [ ] Bring: laptop/phone, the QNAP **admin password**, and an **Ethernet cable** (set up wired, not Wi-Fi).

---

## 1. Reach QTS admin on the LAN

1. Plug the QNAP into the local router via Ethernet; power on.
2. From a computer on the **same LAN**, find it:
   - **Qfinder Pro** (QNAP's discovery tool, Windows/Mac), **or**
   - your router's DHCP client list (look for the QNAP hostname), **or**
   - try `https://<nas-lan-ip>:443` or `:5000` / `:8080` in a browser.
3. Log in to **QTS** as an admin.

---

## 2. Install Tailscale

**Primary path — App Center (QTS 5.x, most current models):**

1. **App Center** → search **"Tailscale"** (official package, publisher *Tailscale Inc.*).
2. If the firmware is old and App Center refuses, **update QTS first** (Control Panel → Firmware Update), then retry.
3. **Install** → open the Tailscale app from the App Center / main menu.

**Fallback path — Container Station** (if no native package for your model/arch):

- Install **Container Station**, then run the official `tailscale/tailscale` container with `--privileged` / `NET_ADMIN` and a persistent `/var/lib/tailscale` volume. (More fiddly; only if §2 primary isn't offered. I can write the exact compose file once we confirm the model.)

> If unsure which path your model supports, **stop and tell me the model number** — I'll confirm before you rely on it.

---

## 3. Join the tailnet + approve

1. In the QNAP Tailscale app, click **Login / Connect** — it shows an auth URL or code.
2. Open that URL, sign in to the **same tailnet** as your PC/linuxbox.
3. In [admin/machines](https://login.tailscale.com/admin/machines): the NAS appears → **approve** it if device approval is on.
4. **Disable key expiry** for the NAS (admin console → the device → ⋯ → *Disable key expiry*). It's an unattended server; you don't want it dropping off the tailnet in 6 months and forcing a re-auth you can't do remotely.
5. Note its **Tailscale IP** (`100.x.y.z`) and MagicDNS name.

---

## 4. Lock it down (important — it's unattended and remote)

- [ ] **Disable public exposure:** turn **off** myQNAPcloud / UPnP / any port-forwarding to the NAS on the router. Tailscale replaces all of that — there's no reason to have QTS facing the public internet.
- [ ] **Strong admin + 2FA:** Control Panel → ensure the default `admin` account is disabled or has a strong unique password; enable **2-Step Verification**.
- [ ] **HTTPS only** for the QTS UI.
- [ ] **(Optional) Tailscale ACL / tag:** tag the NAS (e.g. `tag:nas`) and scope which devices may reach it in the [ACL editor](https://login.tailscale.com/admin/acls).
- [ ] **Do NOT** make the NAS a Tailscale **exit node** — per workspace policy, the exit node is the **linuxbox only**.

---

## 5. Survive power loss / reboots (unattended box)

Because nobody is on-site to push buttons after an outage:

- [ ] **Auto power-on after power restore:** Control Panel → System → Power → set **"turn on automatically after power recovery"** (label varies by model).
- [ ] **Disable disk/system sleep** (or confirm it auto-wakes), so it stays on the tailnet.
- [ ] Confirm Tailscale is set to **start on boot** (the QTS app does this by default; verify it reconnects after a manual reboot test before you leave).

---

## 6. Verify (before you leave the site, then again from home)

**On-site, from your laptop already on the tailnet:**

```bash
tailscale ping <nas-magicdns-name-or-100.x.y.z>
```

Then open the QTS UI over the **Tailscale IP**: `https://100.x.y.z:443` (or whatever QTS port you use). Logging in over the `100.x` address — not the LAN IP — proves the tailnet path works.

**Reboot test:** power-cycle the NAS once; confirm it comes back **Connected** in the admin console and `tailscale ping` succeeds again. This is your insurance that it'll recover from a remote outage.

**From home (PC), later:**

```bash
tailscale status            # NAS should show as a peer
tailscale ping <nas-name>   # expect a pong
```

Browse `https://100.x.y.z:<qts-port>` from the PC — full remote access, no port forwarding involved.

---

## Notes / open items

- Exact Control Panel labels differ across QTS 4.x / 5.x and QuTS hero — verify on the box; tell me the model + QTS version and I'll tighten this.
- If the model has **no native Tailscale package**, we go Container Station (§2 fallback) and I'll provide the exact container config.
- After it's reachable, decide what services to expose over tailnet (file shares / media). The media content stays inside the tailnet — never published to the open internet.
