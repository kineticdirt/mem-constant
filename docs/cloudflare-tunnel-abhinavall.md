# Cloudflare Tunnel — abhinavall.net (linuxbox)

**Split tunnel policy:** tableslop map uses **`cloudflared-tableslop`** + **WOD_HTR** — see **`docs/cloudflare-tunnels-linuxbox.md`**. This doc is **abhinavall backend only**.

**Connector host:** **linuxbox** (`cloudflared-abhinavall.service`).  
**Not** the Windows PC — not the tableslop tunnel.

## Architecture

```text
Internet → Cloudflare → cloudflared (linuxbox) → local origin (e.g. localhost:8080)
```

PC holds **`sites/abhinavall.net/`** source; sync/deploy to linuxbox origin before expecting live changes.

## Reset after moving Cloudflare accounts

### 1. Cloudflare dashboard (new account)

1. **Zero Trust** → **Networks** → **Tunnels** → create/open tunnel → copy **Install connector** token.
2. **DNS** → **abhinavall.net** → **Records**: delete conflicting **A / AAAA / CNAME** for `@` and `www` (keep MX/TXT). Tunnel public hostname cannot be created while a same-name record exists.
3. **Published application** (tunnel route):
   - Subdomain: *(empty)*
   - Domain: `abhinavall.net`
   - Path: *(empty)*
   - Type: **HTTP**
   - URL: **`localhost:8080`** *(or whatever port serves production files on linuxbox — not a PC port)*

### 2. linuxbox (connector)

```bash
cd ~/agent-dump
sudo bash scripts/linuxbox/install-cloudflared-abhinavall-tunnel.sh '<TUNNEL_TOKEN>'
```

See **`docs/cloudflare-tunnels-linuxbox.md`**. Do **not** use deprecated `install-cloudflared-tunnel.sh`.

Verify:

```bash
systemctl is-active cloudflared-abhinavall
journalctl -u cloudflared-abhinavall -n 20 --no-pager
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/
```

### 3. Windows PC

**Do not** run `cloudflared service install` on the PC for this tunnel. If installed by mistake:

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" service uninstall
```

## Verify live

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://abhinavall.net/
```

Expect **200**.

## If dashboard route is still `localhost:8780`

Cloudflared resolves `localhost` to **IPv6** (`[::1]`). If nothing listens on **8780**, the public site returns **502**.

**Preferred:** edit the tunnel **Published application route** to **`localhost:8080`**.

**linuxbox workaround (current):** systemd unit proxies **8780 → portfolio Node app on 3000** (`personal_portfolio/api/server.js`):

```bash
sudo systemctl enable --now abhinavall-origin-8780
curl -s http://127.0.0.1:8780/ | grep -o '<title>[^<]*</title>'
```

Files: `scripts/linuxbox/abhinavall-origin-8780.service`, `scripts/linuxbox/tunnel-origin-proxy.js`.

**Do not** point **8780** at `/home/abhinav/www` — that directory is only a linuxbox placeholder stub.

## Security

- Rotate tunnel token if exposed in chat/logs.
- Never commit tokens to git.

## Related

- `sites/abhinavall.net/DEPLOY.md` — production static bundle on PC
- `scripts/website/deploy_abhinavall_site.sh` — validate before deploy
