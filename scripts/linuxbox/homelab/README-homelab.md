# Homelab Docker stack (linuxbox)

Installed on the Pi under **`/home/abhinav/homelab/`** with **`docker-compose.yml`**.

| Service      | Host port | Notes |
|--------------|-----------|--------|
| **Uptime Kuma** | **13001** | Monitoring; first visit creates admin. Something else already uses **3001** (Node). |
| **Gitea**       | **13000** (HTTP), **12222** (git SSH) | Git + wiki-style repos; SQLite. Port **3000** was in use (Node). |

**Pi-hole:** not installed here — finish when **static IP** is set.

**Paperless-ngx / Home Assistant:** not deployed — heavier; add later if you want.

**Commands:**

```bash
cd /home/abhinav/homelab
sudo docker-compose up -d
sudo docker-compose ps
sudo docker-compose logs -f
```

**Tailscale:** open `http://100.122.108.94:13000` and `:13001` from another machine on the tailnet (replace IP if yours changed).
