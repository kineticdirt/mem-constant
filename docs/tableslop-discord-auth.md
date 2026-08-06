# tableslop.org — Discord login + roles for the map

Players **view the campaign map without login** (public). **Login is required to edit** —
border saves (`POST /api/map/regions-ui`), coord saves (`POST /api/map/coords`), and any
future mutating endpoint. Login is Discord OAuth (scope `identify` only); the server keeps
tokens server-side in a SQLite DB and the browser only ever holds an opaque session cookie.

## Roles

| Role | Can view | Can edit map | Can manage users' roles |
|------|----------|--------------|-------------------------|
| `owner` | yes | yes | yes (`GET/POST /api/auth/users`, HUD "Users" panel) |
| `admin` | yes | yes | no |
| `user` | yes | no (403 on save) | no |
| anonymous | yes | no (401 on save) | no |

- First owner is bootstrapped from env **`TABLESLOP_OWNER_DISCORD_ID`** — that Discord id is
  force-set to `owner` on every login, and the API refuses to demote it or to grant `owner`.
  Owner can only ever come from env, so a bad click cannot lock the GM out.
- Everyone else defaults to `user` on first login; the owner promotes to `admin` via the
  HUD **Users** panel or the API.

## Gating semantics (fail-open, never lock the GM out)

- `TABLESLOP_REQUIRE_DISCORD_AUTH` unset/`0` → server runs exactly as before: view + edit open.
- Gating engages only when the OAuth config is **complete**
  (`DISCORD_OAUTH_CLIENT_ID` + `DISCORD_OAUTH_CLIENT_SECRET` + `DISCORD_OAUTH_REDIRECT_URI`
  + `TABLESLOP_SESSION_SECRET`) or the dev stub is on. Half-configured deploy → server logs a
  warning and runs **open**.
- Guild-membership check applies only when **both** `DISCORD_GUILD_ID` and
  `DISCORD_BOT_TOKEN` are set; otherwise skipped.

## Database

`agents/state/tableslop-auth.db` (gitignored runtime state, survives deploys — never shipped
in a push tarball). Override with `TABLESLOP_AUTH_DB` for tests.

Engine: **sql.js** (SQLite compiled to WASM, pure JS, vendored at
`scripts/linuxbox/vendor/sql-js/`). Chosen over `better-sqlite3` because it needs zero native
builds — better-sqlite3 build-from-source on the 2 GB ARM linuxbox is the known failure mode.
The file is a real `SQLite format 3` database (inspect with any `sqlite3` CLI); the in-memory
buffer is rewritten atomically (tmp + rename) after every mutation.

```sql
users (discord_id PK, username, avatar, role CHECK(owner|admin|user), created_at, last_login_at)
oauth_tokens (user_id PK FK, access_token, refresh_token, expires_at, updated_at)
sessions (id PK, user_id FK, created_at, expires_at)
```

## OAuth flow (authorization-code, with CSRF state)

1. HUD **Login with Discord** → `GET /auth/discord` → 302 to discord.com, `state` set as a
   short-lived HttpOnly cookie.
2. Discord → `GET /auth/discord/callback` — `state` must match the cookie (else 403).
3. Server exchanges the code server-side (`client_secret` never leaves the box), fetches
   `users/@me`, optionally checks guild membership, upserts the user row, stores
   access+refresh tokens with `expires_at`, creates a session row.
4. Browser gets `tableslop_session` = HMAC-signed opaque session id —
   `HttpOnly; SameSite=Lax; Secure` (Secure when the redirect URI is https), 7-day expiry.
5. **Refresh-token rotation:** on `GET /api/me`, when the stored access token is expired the
   server rotates via `grant_type=refresh_token` and stores Discord's new token pair.
6. `/auth/logout` deletes the session row and clears the cookie.

## Discord Developer Portal setup (one-time, human)

1. [Developer Portal](https://discord.com/developers/applications) → your app (the existing
   campaign bot app is fine) → **OAuth2** → **Redirects** → add exactly:
   - `https://map.tableslop.org/auth/discord/callback`
   - `http://127.0.0.1:8765/auth/discord/callback` (local test)
2. **OAuth2 → General:** copy **Client ID** and **Client Secret** (Reset Secret if needed).
3. Your Discord user id for `TABLESLOP_OWNER_DISCORD_ID`: Discord client → Settings →
   Advanced → Developer Mode ON → right-click your own name → **Copy User ID**.
4. Put env on potato (`~/.linuxbox-tableslop/.env`, chmod 600) — or `secrets/linuxbox.env` on
   PC + `bash scripts/pc/sync-linuxbox-secrets.sh`:

```bash
TABLESLOP_REQUIRE_DISCORD_AUTH=1
TABLESLOP_SESSION_SECRET=<random-long-string>        # e.g. openssl rand -hex 32
DISCORD_OAUTH_CLIENT_ID=...
DISCORD_OAUTH_CLIENT_SECRET=...
DISCORD_OAUTH_REDIRECT_URI=https://map.tableslop.org/auth/discord/callback
TABLESLOP_OWNER_DISCORD_ID=<your Discord user id>
# optional guild gate (both or neither):
DISCORD_GUILD_ID=1012888284222988409
DISCORD_BOT_TOKEN=...                                 # same bot, membership check only
```

5. `sudo systemctl restart linuxbox-tableslop` → log line shows `gating=on  owner=env`.
6. Log in via the map's Login button; then promote players to `admin` from the HUD
   **Users** panel.

## Dev stub (no Discord app needed)

```bash
TABLESLOP_DEV_AUTH=1 TABLESLOP_REQUIRE_DISCORD_AUTH=1 TABLESLOP_PORT=8799 \
  node scripts/linuxbox/tableslop-server.js
```

`GET /auth/dev-login?as=owner|admin|user` (localhost only) mints a session as a synthetic
`dev-<role>` user — full role/gating flow testable locally. Never set on potato.

## Privacy / ops notes

- Scope is `identify` only: no email, no messages, no DMs. Discord password never seen.
- Access/refresh tokens stay in the server DB; revoking = delete the user's rows or rotate
  `TABLESLOP_SESSION_SECRET` (invalidates all session cookies).
- `POST /api/feedback` stays public by design (screenshot → agent task).

## Status / verify

Server: `scripts/linuxbox/tableslop-server.js` + `scripts/linuxbox/tableslop-auth.js`.
Runnable check: `node scripts/linuxbox/test-tableslop-auth.js` (boots on a scratch port with
the dev stub, exercises public view / 401 / 403 / admin save / owner role API / DB rows /
session-survives-restart, against a backup-restored `regions-ui.json`).
