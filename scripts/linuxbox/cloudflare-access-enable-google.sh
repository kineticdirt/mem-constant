#!/usr/bin/env bash
# Enable Google login on the abhinavall-linuxbox Cloudflare Access app + allow-list emails.
# Run ON linuxbox after you add Google in Zero Trust (one-time, dashboard):
#   Zero Trust → Settings → Authentication → Login methods → Add → Google
#
# Usage:
#   export GOOGLE_EMAIL=you@gmail.com   # your Google account email
#   bash scripts/linuxbox/cloudflare-access-enable-google.sh
#
# Keeps abhinav.allam@abhinavall.net on the allow list if already present.
set -euo pipefail

ENV_FILE="${HOME}/.cloudflare/access-setup.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID required in ${ENV_FILE}" >&2
  exit 1
fi
if [[ -z "${GOOGLE_EMAIL:-}" ]]; then
  echo "Set GOOGLE_EMAIL=your@gmail.com (the Google account you will sign in with)" >&2
  exit 1
fi

APP_ID="786b3a0f-c57e-4d19-b44d-64cc66a48c15"
ALLOW_EMAIL="${ALLOWED_EMAIL:-abhinav.allam@abhinavall.net}"

python3 - "${CLOUDFLARE_ACCOUNT_ID}" "${CLOUDFLARE_API_TOKEN}" "${APP_ID}" "${GOOGLE_EMAIL}" "${ALLOW_EMAIL}" <<'PY'
import json, sys, urllib.request

account_id, token, app_id, google_email, domain_email = sys.argv[1:6]
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

# Find Google IdP
idps = api("GET", f"/accounts/{account_id}/access/identity_providers")
google_id = None
otp_id = None
for p in idps.get("result") or []:
    if p.get("type") == "google":
        google_id = p["id"]
    if p.get("type") == "onetimepin":
        otp_id = p["id"]
if not google_id:
    print("ERROR: Google IdP not found. Add it first:")
    print("  Zero Trust → Settings → Authentication → Login methods → Add → Google")
    sys.exit(2)

allowed = [google_id]
if otp_id:
    allowed.append(otp_id)

patch = {
    "allowed_idps": allowed,
    "auto_redirect_to_identity": False,
}
r = api("PUT", f"/accounts/{account_id}/access/apps/{app_id}", patch)
if not r.get("success"):
    print("App patch failed:", r.get("errors"))
    sys.exit(3)
print("App updated: Google + One-time PIN enabled on abhinavall-linuxbox")

# Update allow policy emails (owner policy)
policies = api("GET", f"/accounts/{account_id}/access/apps/{app_id}/policies").get("result") or []
allow = next((p for p in policies if p.get("decision") == "allow"), None)
if not allow:
    print("WARN: no allow policy found; add emails manually in dashboard")
    sys.exit(0)

emails = []
for inc in allow.get("include") or []:
    if "email" in inc and inc["email"].get("email"):
        emails.append(inc["email"]["email"])
for e in (google_email, domain_email):
    if e and e not in emails:
        emails.append(e)

include = [{"email": {"email": e}} for e in emails]
body = {
    "name": allow["name"],
    "decision": "allow",
    "include": include,
    "exclude": allow.get("exclude") or [],
    "require": allow.get("require") or [],
    "precedence": allow.get("precedence", 1),
}
r2 = api("PUT", f"/accounts/{account_id}/access/apps/{app_id}/policies/{allow['id']}", body)
if not r2.get("success"):
    print("Policy patch failed:", r2.get("errors"))
    sys.exit(4)
print("Allow policy emails:", ", ".join(emails))
print("Done. Test incognito: https://abhinavall.net/Linuxbox/ → Sign in with Google")
PY
