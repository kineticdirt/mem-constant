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
# Restart ONLY when Discord is idle (never mid-reply / mid-approval):
# systemctl --user restart hermes-gateway-hunter-reckoning
```

**Do not bounce the gateway during live chat.** Agent restarts (`systemctl … restart`) send SIGTERM; Hermes exits 1 and Discord posts “Gateway shutting down” / “not accepting another turn”. Prefer leave it running after wiring; one restart when idle if config must reload. Apply security/soul fixes with **`bash scripts/linuxbox/apply-nyc-gateway-security-fix.sh`** (does **not** restart).

### Tirith / false “Security scan: security issue detected” (potato)

Stock `tirith` aarch64 builds need **glibc ≥ 2.32**. Le Potato Bullseye is **glibc 2.31**. Broken binaries still spawn but exit **1**; Hermes maps that to Tirith **block** with empty findings → Discord approval spam for even `git status` / `hermes gateway status` / `ls …/gateway.log`. Tirith “always” approvals are **session-only**, so one GM click does not stick.

**Fix (keep other security):** run `apply-nyc-gateway-security-fix.sh` (or `fix-hermes-tirith-glibc.sh`):
- `security.tirith_enabled: false` on hunter
- quarantine broken binaries → `*.broken-glibc-*`
- install **allow-stub** at `~/.hermes/profiles/hunter-reckoning/bin/tirith` (exit 0) so a re-enable cannot false-block
- `command_allowlist` for read-only diagnostics (`hermes gateway status`, `ls`/`find`/`which`, journalctl, …)
- `agent.disabled_toolsets: [terminal]` on hunter so Discord chat cannot spiral into shell/approvals (hardline still on if CLI used)
- SOUL forbids terminal self-diagnose unless GM explicitly asks

Hardline + `detect_dangerous_command` remain. Re-enable real Tirith only with a glibc-compatible binary.

- Model for this profile after configure: **`deepseek/deepseek-v4-flash`**
- Soul / channel prompts: `campaigns/nyc-mafia-dnd/SOUL-discord-qa.md`
  - Display name / persona: **Pepper Quill** (silent sentinel; female GM-helper; can roast; adaptive length)
  - NYC listen only: `general-ooc-ba`, `general`, `rolly-poley`, `lore-dump`, `campaign-discussion-lore`, `dm-screen` — **exclude** `art`, `characters-ba` (Tropic allowlist kept)
  - **@mention required** on Big Apples (Tropic free-response kept)
  - **Always obey** Discord user `wholesome.man` (`265909664590331915`)
  - `display.tool_progress: all` (+ `display.platforms.discord`) — tool lines show in channel
  - `group_sessions_per_user: false` + `display.busy_input_mode: queue` — one reply can cover several speakers
  - Shutdown/restart notices: **owner DM only** (`scripts/linuxbox/apply-hermes-shutdown-owner-dm.sh`) — not guild/home
  - Scope apply: `scripts/linuxbox/apply-pepper-quill-discord-scope.sh`
  - `disabled_toolsets: [terminal, session_search]`; lore stub inject from `lore-export/` into channel_prompts
  - Rules stack: **D&D 5e external baseline** + **NYC homebrew internal**
- SoT ids: `campaigns/nyc-mafia-dnd/discord.json`
- **Ingest (track player activity):** `bash ~/agent-dump/scripts/linuxbox/nyc-discord-ingest.sh` → `campaigns/nyc-mafia-dnd/discord-export/` — runbook `campaigns/nyc-mafia-dnd/reports/discord-ingest-runbook.md`
- Home channel: `DISCORD_HOME_CHANNEL=1528215752576995580` (`#general-ooc-ba`) — stops home-channel nags
- Env: expand `DISCORD_ALLOWED_USERS` to all Big Apples players; `DISCORD_ALLOW_BOTS=none`
- Quiet refresh (no restart): `bash scripts/linuxbox/apply-nyc-gateway-security-fix.sh`

### Role slash helpers (Hermes `/skill`)

Discord registers campaign skills under the native **`/skill`** picker (autocomplete):

| Slash | Purpose |
|-------|---------|
| `/skill what-do-i-know` | In-lore + **D&D 5e** explanation (NYC homebrew on 5e; player-safe) |
| `/skill archive` | Short player-safe archive note → `notes/discord-archive/` |

Skills live in repo `campaigns/nyc-mafia-dnd/hermes-skills/` and are synced to the hunter profile skills tree. After edits: copy to potato → `/reload-skills` (or restart gateway).

