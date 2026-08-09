# Euro Campaign (working title pending)

Discord-managed table. Player mirror: `https://campaigns.tableslop.org/c/eurosluts` (alias `/c/euro`).

## Discord

| | ID |
|--|-----|
| Server (guild) | `1265793253798576148` |
| Category + threads | `1477755184607396063` |
| Primary play / probe | `1495469564060893254` (`#main-rp`) |
| Early / SmithsVille | `1477735120252178453` (`#campaign-rp`) |
| Sheets | `1475174763533176844` |

Deep link (main-rp): https://discord.com/channels/1265793253798576148/1495469564060893254

SoT files: `discord.json` + `tracker.json`. Analysis SoT: `../euro-adventure-2026/`.

**Display name:** still pending (`name_pending: true`). Do not rename without GM lock — see `../euro-adventure-2026/analysis/define-with-gm.md` Q8.

## Probe

```bash
python3 scripts/linuxbox/campaign-discord-probe.py
```

Writes `agents/state/campaign-discord-status.json` (no tokens).
