# Cloudflare SSO — linuxbox + abhinavall.net

Two related SSO surfaces. **Do not confuse them.**

| Goal | Product | What it protects |
|------|---------|------------------|
| **A — `/Linuxbox/` dashboard** | **Zero Trust Access** (self-hosted app) | `https://abhinavall.net/Linuxbox/` only |
| **B — Cloudflare admin login** | **Dashboard SSO** (Members connector) | `dash.cloudflare.com` for your **email domain** |

Official references:
- [Set up dashboard SSO](https://developers.cloudflare.com/fundamentals/manage-members/dashboard-sso/)
- [Identity providers (Zero Trust)](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/)
- Path app detail: `docs/cloudflare-access-linuxbox.md`

---

## Which do you need?

### Start with **A (Access)** if:
- You log into Cloudflare with **Gmail / GitHub / personal email**
- You only want to lock down **`/Linuxbox/`** on the public site
- **This is the linuxbox agent visibility case** — do this first.

### Add **B (Dashboard SSO)** only if:
- You have a **custom email domain** you control (e.g. `@abhinavall.net` or `@yourcompany.com`)
- **Every** Cloudflare member uses that domain (not `@gmail.com` — [not allowed](https://developers.cloudflare.com/fundamentals/manage-members/dashboard-sso/#prerequisites))
- You want **all** dashboard logins forced through your IdP

**Gmail users:** skip Dashboard SSO connector; use **Access** with Google IdP for `/Linuxbox/`.

---

## Phase 1 — Shared IdP setup (both paths)

Done once in **Zero Trust → Settings → Authentication**.

1. Open [Zero Trust](https://one.dash.cloudflare.com/) (create org if prompted — Free tier is fine).
2. **Settings → Authentication → Login methods**
3. Add **Google** and/or **GitHub** (or SAML/Okta if you have a corp IdP).
4. **Test** each IdP: **Integrations → Identity providers → Test** ([test IdPs](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/#test-idps-in-cloudflare-one)).

Stop here if test fails — fix IdP before any enforcement.

---

## Phase 2A — Access for `/Linuxbox/` (recommended now)

**Protects the agent status page only.** Portfolio stays public.

### Step 1 — Application

**Access → Applications → Add application → Self-hosted**

| Field | Value |
|-------|--------|
| Name | `abhinavall-linuxbox` |
| Session duration | `15 minutes` |
| Domain | `abhinavall.net` |
| Path | `/Linuxbox` |

Enable only the IdPs you configured in Phase 1.

### Step 2 — Policies (strict)

**Policy 1 — Allow** (top)
- Include: **Emails** → your address(es) only
- Optional: **Require MFA**

**Policy 2 — Block** (below)
- Include: **Everyone**

### Step 3 — Verify

```text
Incognito → https://abhinavall.net/Linuxbox/     → Cloudflare login → dashboard
Incognito → https://abhinavall.net/              → portfolio, no login
```

Reply **"Access is on"** when done — agent runs `agents/LINUXBOX_ACCESS_HANDOFF.md` checklist.

Detail: `docs/cloudflare-access-linuxbox.md`

---

## Phase 2B — Dashboard SSO (optional, custom domain only)

From [Set up dashboard SSO](https://developers.cloudflare.com/fundamentals/manage-members/dashboard-sso/).

### Prerequisites checklist

- [ ] **Custom email domain** you control (TXT DNS on that domain)
- [ ] **Super administrator** on the Cloudflare account
- [ ] **Zero Trust organization** exists (Phase 1)
- [ ] **IdP configured and tested** (Phase 1)
- [ ] **Backup API token** with `SSO Connector Edit` role ([create token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)) — store in password manager, **not git**

### Steps

1. **Members → Settings → Add SSO domain**  
   [Go to Members](https://dash.cloudflare.com/?to=/:account/members)

2. Enter your **email domain** (e.g. `abhinavall.net` if your login is `you@abhinavall.net`).

3. **Verify ownership** — add DNS **TXT** record:
   ```text
   cloudflare_dashboard_sso=<code from Cloudflare>
   ```
   On the **email domain's** DNS zone (may differ from `abhinavall.net` zone if email is elsewhere).

4. Wait for verification email (polls up to ~2 days; re-trigger **Begin verification** if timeout).

5. **Test IdP** again under Zero Trust before enabling.

6. **Enable** connector in Members → Settings.

### Warnings (from Cloudflare)

- Enabling applies to **all users with that email domain** on **all accounts** they can access.
- Cannot use `@gmail.com` or broad `.edu` domains.
- Create **backup IdP** (e.g. one-time PIN via API) before enable — see [Bypass dashboard SSO](https://developers.cloudflare.com/fundamentals/manage-members/dashboard-sso/#bypass-dashboard-sso).
- Keep the **`SSO Connector Edit`** API token to disable SSO if locked out.

### Dashboard SSO ≠ `/Linuxbox/` Access

Dashboard SSO does **not** automatically protect `abhinavall.net/Linuxbox/`. You still need **Phase 2A** for the public URL.

---

## Decision tree

```text
Want to lock /Linuxbox/ only?
  └─ Yes → Phase 1 + Phase 2A (Access app on path /Linuxbox)

Also want dash.cloudflare.com login via corp IdP?
  └─ Do you have @yourdomain.com emails on the account?
       ├─ No (Gmail etc.) → Phase 2A only
       └─ Yes → Phase 1 + Phase 2A + Phase 2B (after TXT verify + backup token)
```

---

## Current linuxbox origin (no SSO change needed on Pi)

Access runs at **Cloudflare edge**. linuxbox already serves:

- `linuxbox-status.service` → `127.0.0.1:8790`
- `tunnel-origin-proxy.js` → `/Linuxbox*` → 8790

No Pi config change when you enable Access policies.

---

## Related

- `docs/cloudflare-tunnel-abhinavall.md` — tunnel connector on linuxbox
- `agents/LINUXBOX_ACCESS_HANDOFF.md` — post-OAuth verification checklist
- `docs/ssh-le-potato-reference.md` — SSH / Cursor Remote IDE to linuxbox
