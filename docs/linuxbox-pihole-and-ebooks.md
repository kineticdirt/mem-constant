# Pi-hole + ebook library on linuxbox (Le Potato)

Use this after you can open a shell on **linuxbox** (see [ssh-le-potato-reference.md](ssh-le-potato-reference.md)). Pi-hole must be installed **on the Pi**; this PC repo only holds scripts and this runbook.

## 1. Pi-hole (network-wide ad blocking)

### What you are changing

- **DHCP clients (LAN):** Your router should hand out the Pi’s **LAN IP** as the **only DNS server** (or set DNS manually per device). Until you do that, ads will not disappear for those clients.
- **Tailscale devices:** In the [Tailscale admin console](https://login.tailscale.com/admin/dns) → **DNS**, add a **global** nameserver = this machine’s **Tailscale IP** (`100.122.108.94` in [ssh-le-potato-reference.md](ssh-le-potato-reference.md)), and enable **Override local DNS** if you want all tailnet devices to use Pi-hole.

### Conflicts to know

- **Port 53** must be free for Pi-hole’s `pihole-FTL`. If **K3s** or another stack binds host port **53**, fix that first or run Pi-hole elsewhere.
- **Port 80** is used for the admin UI by default; change the port in the installer if something else already uses 80.
- **`systemd-resolved`** on Debian often listens on `127.0.0.53:53`. If the installer complains, follow the hints from the preflight script (set `DNSStubListener=no`, restart `systemd-resolved`).

### Install steps (on linuxbox)

1. Copy this repo’s `scripts/linuxbox/` onto the Pi, or `git pull` if the repo is already cloned there.

2. Preflight (optional but recommended):

   ```bash
   bash scripts/linuxbox/preflight-pihole-dns.sh
   ```

3. Run the official installer (interactive wizard — you pick interface, upstream DNS, password):

   ```bash
   sudo bash scripts/linuxbox/install-pihole-interactive.sh
   ```

   If you prefer not to use the wrapper:

   ```bash
   curl -sSL https://install.pi-hole.net | bash
   ```

4. After install, open the admin URL the installer prints. On your **router**, set **LAN DNS** to the Pi’s **static LAN IP** (recommended). Reconnect phones/laptops so they pick up DHCP again.

5. Test from a client:

   ```bash
   nslookup doubleclick.net <PI_LAN_OR_TAILSCALE_IP>
   ```

   You should get a blocked response (often `0.0.0.0` or the Pi’s IP depending on version/settings).

### Security

- Do **not** expose Pi-hole’s admin port to the public internet without a VPN or Tailscale-only access.
- Keep the OS and Pi-hole updated (`pihole -up` after reading release notes).

---

## 2. Ebook library (same folder layout as Windows)

The Windows helper is `scripts/create_ebook_library_tree.ps1`. On linuxbox, use the Bash twin so the **directory tree matches** whether books live on USB or internal disk.

### Mount your books volume

1. Plug the USB drive (or use an internal data partition).
2. Find the device (example names):

   ```bash
   lsblk
   ```

3. Mount (example: first partition on `sda`):

   ```bash
   sudo mkdir -p /srv/ebooks
   sudo mount /dev/sda1 /srv/ebooks
   ```

4. Optional — persist across reboots: add a line to `/etc/fstab` **only after** you are sure of the correct UUID:

   ```bash
   sudo blkid /dev/sda1
   ```

   Example fstab entry (replace UUID and filesystem type):

   ```fstab
   UUID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  /srv/ebooks  ext4  defaults,nofail  0  2
   ```

### Create the library tree

```bash
sudo bash scripts/linuxbox/create-ebook-library-layout.sh /srv/ebooks
```

If the volume should be owned by your user for **rsync** from the PC over SSH:

```bash
sudo chown -R "$USER:$USER" /srv/ebooks/ebooks
```

### Copy books from this PC

From **Git Bash** or PowerShell on the PC (adjust paths and use your SSH host):

```bash
rsync -av --progress "/d/path/to/MyBooks/" abhinav@100.122.108.94:/srv/ebooks/ebooks/00-inbox/
```

Then sort files on the Pi into `01-library/...` at your leisure.

### Optional: share the library on LAN

Not scripted here; if you want **SMB** for Calibre on Windows pointing at the Pi, install `samba` on Debian and export `/srv/ebooks/ebooks` read/write for your LAN — do that only with strong passwords and **without** guest access.

---

## Quick reference

| Goal | Where it runs | Key artifact |
|------|----------------|---------------|
| Ad blocking | linuxbox + router/Tailscale DNS | Pi-hole web UI |
| Same dirs as PC USB layout | linuxbox | `scripts/linuxbox/create-ebook-library-layout.sh` |

SSH reference: [ssh-le-potato-reference.md](ssh-le-potato-reference.md).
