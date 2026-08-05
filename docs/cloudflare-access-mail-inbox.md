# Cloudflare Access — `abhinavall.net/Mail/`

Protect the portfolio inbox UI and inbox API (messages to **abhinav.allam@abhinavall.net**).

## Routes to protect

| Path | Backend |
|------|---------|
| `/Mail` | Portfolio static (`personal_portfolio` :3000) |
| `/api/email/inbox` | Portfolio API (:3000) |
| `/api/email/inbox/*` | Portfolio API (:3000) |

Webhook **`POST /api/email/incoming`** stays **unauthenticated** (Cloudflare Email Worker only).

## Zero Trust application

1. **Access** → **Applications** → **Add** → **Self-hosted**
2. **Name:** `abhinavall-mail-inbox`
3. **Domain:** `abhinavall.net` · **Path:** `/Mail`
4. **Policy:** Allow → **Emails** → your address only

Duplicate application (or add a second path) for **`/api/email/inbox`** if Cloudflare requires separate path rules.

## Local / token fallback

Set on linuxbox `personal_portfolio` env:

```bash
INBOX_API_TOKEN=your-long-random-token
```

Then call API with header `x-inbox-token: your-long-random-token` (dev only).

## Email routing

Cloudflare **Email Routing** → Worker or Email Worker → `POST https://abhinavall.net/api/email/incoming` with JSON body (`from`, `to`, `subject`, `text`).

Messages persist under `personal_portfolio/data/inbox/messages.jsonl`.
