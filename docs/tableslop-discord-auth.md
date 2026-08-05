# tableslop.org — Discord login for map access

Let players **view the campaign map** after proving they are in your Discord server — **without** you storing Discord passwords or long-lived tokens.

## How it works

| Step | What happens |
|------|----------------|
| 1 | User opens `https://map.tableslop.org/` |
| 2 | Clicks **Login with Discord** |
| 3 | Discord OAuth (scope **`identify` only**) — user approves on discord.com |
| 4 | tableslop server exchanges the code, reads user id + username **once** |
| 5 | Bot API checks: is this user a **member of guild `1012888284222988409`?** |
| 6 | If yes → signed **httpOnly session cookie** (no DB). Discord access token is **discarded**. |
| 7 | Map loads. You never see their Discord password. |

**Not collected:** email (unless you add scope `email`), password, message content, DMs.

**Optional:** restrict to a Discord **role** (e.g. players only) via bot `GET /guilds/{id}/members/{user}` + role check.

## Discord Developer Portal setup

**Not Supabase** — tableslop has built-in OAuth (`tableslop-server.js`). You only need Discord + env on linuxbox.

Same application as your bot (recommended) or a separate OAuth app:

1. [Discord Developer Portal](https://discord.com/developers/applications) → your app → **OAuth2** → **Redirects** — add exactly:
   - `https://map.tableslop.org/auth/discord/callback`
   - `http://127.0.0.1:8765/auth/discord/callback` (local test)
2. **OAuth2 → General:** copy **Client ID** and **Client Secret** (Reset Secret if needed).
3. **Bot** tab: ensure bot is in guild `1012888284222988409` with **Server Members Intent** if you add role checks later.
4. OAuth **scopes** (handled by server): `identify` only.

### PC → linuxbox (recommended)

```bash
# secrets/linuxbox.env — copy from secrets/linuxbox.env.example
DISCORD_OAUTH_CLIENT_ID=...
DISCORD_OAUTH_CLIENT_SECRET=...
DISCORD_BOT_TOKEN=...          # same bot — membership check
TABLESLOP_REQUIRE_DISCORD_AUTH=1
bash scripts/pc/sync-linuxbox-secrets.sh
```

### Or on linuxbox directly

```bash
export DISCORD_OAUTH_CLIENT_ID=...
export DISCORD_OAUTH_CLIENT_SECRET=...
export DISCORD_BOT_TOKEN=...
bash ~/agent-dump/scripts/linuxbox/configure-tableslop-discord-auth.sh
sudo cp ~/agent-dump/scripts/linuxbox/linuxbox-tableslop.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart linuxbox-tableslop
```

## linuxbox env (`~/.linuxbox-tableslop/.env`, chmod 600)

```bash
TABLESLOP_REQUIRE_DISCORD_AUTH=1
TABLESLOP_SESSION_SECRET=random-long-string
DISCORD_OAUTH_CLIENT_ID=...
DISCORD_OAUTH_CLIENT_SECRET=...
DISCORD_OAUTH_REDIRECT_URI=https://map.tableslop.org/auth/discord/callback
DISCORD_GUILD_ID=1012888284222988409
DISCORD_BOT_TOKEN=...   # same bot — membership check only
```

## vs Cloudflare Access

| Approach | Pros |
|----------|------|
| **Built-in Discord OAuth** (tableslop) | Players use Discord; no Google/email; guild gate matches your server |
| **Cloudflare Access + Google** | Already used for `/Linuxbox/` admin; Discord is not a first-class CF IdP — needs custom OIDC bridge |

Recommendation: **Discord OAuth on tableslop** for players; keep Cloudflare for tunnel/DDoS only (or add Access policy requiring login for `map.tableslop.org` as defense-in-depth).

## Privacy

- Session cookie = signed `{ userId, username, exp }` — no server-side user table required.
- Log only user id on login success (optional); never log OAuth client secret or bot token.
- **Revoke access:** remove user from Discord server or rotate `TABLESLOP_SESSION_SECRET`.

## Status

Server support: `scripts/linuxbox/tableslop-server.js` (env-gated). Set `TABLESLOP_REQUIRE_DISCORD_AUTH=0` to keep map public during setup.

**Implementation plan (phased, human portal steps):** [`tableslop-discord-oauth-plan.md`](../tableslop-discord-oauth-plan.md) at repo root.
