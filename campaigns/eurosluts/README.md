# Euro Campaign (working title pending)

Discord-managed table. **SoT campaign tree:** `campaigns/euro-adventure-2026/`.

## Player URL

- **https://campaigns.tableslop.org/c/eurosluts**
- Alias: `/c/euro` (same tracker)

Loopback on potato: `http://127.0.0.1:8768/c/eurosluts` (campaigns-availability-server).

## Discord

| | ID |
|--|-----|
| Server (guild) | `1265793253798576148` |
| Category + threads | `1477755184607396063` |
| Early / campaign-rp | `1477735120252178453` |
| Primary `#main-rp` | `1495469564060893254` |

Deep link: https://discord.com/channels/1265793253798576148/1477735120252178453

SoT files here: `discord.json` + `tracker.json` (player mirror).  
GM prep: `../euro-adventure-2026/README.md` (timeline, define-with-gm, NEXT-ARC).

## Probe

```bash
python3 scripts/linuxbox/campaign-discord-probe.py
```

Writes `agents/state/campaign-discord-status.json` (no tokens).
