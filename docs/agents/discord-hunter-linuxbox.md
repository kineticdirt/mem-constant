# Discord + Hunter agent — linuxbox

Connect the **hunter-reckoning** Hermes pod to your Discord bot for live RP in category **`1137592539076120666`**, plus batch lore export for the agent.

## Two connections

| Mode | Purpose |
|------|---------|
| **Live gateway** | Bot replies in RP channels (Hermes `hunter-reckoning` profile) |
| **Batch ingest** | `export_discord_lore.py` → `discord-export/` for agent context |

Same bot token for both.

---

## 1. Discord Developer Portal

1. [Discord Developer Portal](https://discord.com/developers/applications) → your app → **Bot**
2. Enable **Message Content Intent** + **Server Members Intent**
3. Copy **Bot Token** (Reset Token if needed)
4. **Installation** → invite bot to your server (Send Messages, Read History, View Channels)

## 2. Secrets on linuxbox

**`~/.hermes/.env`** (chmod 600):

```bash
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_ALLOWED_USERS=YOUR_DISCORD_USER_ID   # right-click you → Copy User ID
OPENROUTER_API_KEY_RP=sk-or-v1-...          # Hunter uses RP $5/day pool
```

**`~/agent-dump/campaigns/tropic-gooner/.env`** (optional duplicate for export script):

```bash
DISCORD_TOKEN=same_bot_token
DISCORD_GUILD_ID=your_server_id
DISCORD_CATEGORY_ID=1137592539076120666
```

Copy from `campaigns/tropic-gooner/.env.example`.

## 3. Wire category → channels

```bash
bash ~/agent-dump/scripts/linuxbox/configure-hermes-discord-hunter.sh
# or override category:
bash ~/agent-dump/scripts/linuxbox/configure-hermes-discord-hunter.sh 1137592539076120666
```

This script:

- Lists all text channels under the category
- Writes `~/.hermes/discord-rp-channels.env`
- Merges into `~/.hermes/.env`:
  - `DISCORD_ALLOWED_CHANNELS` — bot only listens here (+ DMs)
  - `DISCORD_FREE_RESPONSE_CHANNELS` — no @mention required (play-by-post)
  - `DISCORD_REQUIRE_MENTION=false` for those channels

## 4. Start gateway (hunter pod)

```bash
# One-time service for hunter profile
hunter-reckoning gateway install
hunter-reckoning gateway restart
hunter-reckoning gateway status
```

Bot should show **online** in Discord. Post in an RP channel under that category to test.

**Profile:** Gateway runs as **hunter-reckoning** (RP OpenRouter key, Hunter SOUL/task context).

If you already have `hermes-gateway` on `default`, either:

- Stop default and use hunter gateway only for Discord, **or**
- Run `hermes profile use hunter-reckoning` + restart default gateway (single gateway, hunter profile)

## 5. Batch export (lore archive)

```bash
cd ~/agent-dump/campaigns/tropic-gooner
pip install --user discord.py python-dotenv   # once
python export_discord_lore.py --list
python export_discord_lore.py --guild YOUR_GUILD_ID --category 1137592539076120666
```

Output: `discord-export/<server>/.../messages.md`

The **hunter-reckoning** pod scheduler tick reads these exports + live Discord via gateway.

---

## Verify

| Check | Command |
|-------|---------|
| Channels discovered | `cat ~/.hermes/discord-rp-channels.env` |
| Gateway running | `hunter-reckoning gateway status` |
| Bot online | Discord member list |
| Export works | `ls campaigns/tropic-gooner/discord-export/` |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Bot online, no replies | `DISCORD_ALLOWED_USERS` must include your user ID |
| Discovery fails | Bot invited to server? Category ID correct? |
| 401 / login | Token wrong or reset — update both `.env` files |
| OOM on 2 GB | One gateway only — don't run default + hunter gateways together |

See also: `campaigns/tropic-gooner/reports/discord-ingest-runbook.md`

## NYC / Big Apples (same bot)

NYC Mafia × D&D uses category **`1528215677272330300`** (Big Apples) on the **same** `AI_RP_Master` bot / `hunter-reckoning` gateway (one Discord token).

```bash
bash ~/agent-dump/scripts/linuxbox/configure-hermes-discord-nyc.sh
# optional: listen ONLY Big Apples (drops Tropic channel ids from allowlist)
# bash ~/agent-dump/scripts/linuxbox/configure-hermes-discord-nyc.sh --nyc-only
systemctl --user restart hermes-gateway-hunter-reckoning
```

- Model for this profile after configure: **`deepseek/deepseek-v4-flash`**
- Soul / channel prompts: `campaigns/nyc-mafia-dnd/SOUL-discord-qa.md`
- SoT ids: `campaigns/nyc-mafia-dnd/discord.json`

