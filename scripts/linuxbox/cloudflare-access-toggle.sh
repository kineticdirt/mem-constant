#!/usr/bin/env bash
# Toggle Cloudflare Access SSO on /Linuxbox/ (edge layer only).
# off = add a temporary bypass policy (everyone); on = remove it.
# Does not delete IdP config or cloudflare-access-enable-google.sh setup.
#
# Usage (on linuxbox):
#   bash scripts/linuxbox/cloudflare-access-toggle.sh off
#   bash scripts/linuxbox/cloudflare-access-toggle.sh on
#   bash scripts/linuxbox/cloudflare-access-toggle.sh    # reads CLOUDFLARE_ACCESS_SSO_ENABLED
#
# Env: ~/.cloudflare/access-setup.env (chmod 600)
set -euo pipefail

ENV_FILE="${HOME}/.cloudflare/access-setup.env"
STATE_FILE="${HOME}/.cloudflare/access-sso-bypass.json"
APP_ID="${CLOUDFLARE_ACCESS_APP_ID:-786b3a0f-c57e-4d19-b44d-64cc66a48c15}"
BYPASS_POLICY_NAME="${CLOUDFLARE_ACCESS_BYPASS_POLICY:-agent-temp-sso-bypass}"

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

MODE="${1:-${CLOUDFLARE_ACCESS_SSO_ENABLED:-on}}"
MODE="${MODE,,}"
case "${MODE}" in
  on|1|true|yes|enable) WANT_BYPASS=false ;;
  off|0|false|no|disable) WANT_BYPASS=true ;;
  *)
    echo "Usage: $0 on|off" >&2
    exit 1
    ;;
esac

python3 - "${CLOUDFLARE_ACCOUNT_ID}" "${CLOUDFLARE_API_TOKEN}" "${APP_ID}" "${BYPASS_POLICY_NAME}" "${STATE_FILE}" "${WANT_BYPASS}" <<'PY'
import json, sys, urllib.request
from pathlib import Path

account_id, token, app_id, policy_name, state_file, want_bypass_s = sys.argv[1:7]
want_bypass = want_bypass_s.lower() == "true"
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
state_path = Path(state_file)

def api(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def list_policies():
    r = api("GET", f"/accounts/{account_id}/access/apps/{app_id}/policies")
    return r.get("result") or []

def find_bypass(policies):
    for p in policies:
        if p.get("name") == policy_name and p.get("decision") == "bypass":
            return p
    return None

policies = list_policies()
existing = find_bypass(policies)

if want_bypass:
    if existing:
        state_path.write_text(json.dumps({"policy_id": existing["id"], "name": policy_name}) + "\n")
        print(f"SSO bypass already active (policy {existing['id']})")
    else:
        body = {
            "name": policy_name,
            "decision": "bypass",
            "include": [{"everyone": {}}],
            "exclude": [],
            "require": [],
            "precedence": 0,
        }
        r = api("POST", f"/accounts/{account_id}/access/apps/{app_id}/policies", body)
        if not r.get("success"):
            print("Create bypass policy failed:", r.get("errors"))
            sys.exit(2)
        pid = r["result"]["id"]
        state_path.write_text(json.dumps({"policy_id": pid, "name": policy_name}) + "\n")
        print(f"Cloudflare Access SSO: OFF (bypass policy {pid})")
    print("Test: https://abhinavall.net/Linuxbox/ → HTTP Basic only (no Google login)")
else:
    pid = None
    if state_path.exists():
        try:
            pid = json.loads(state_path.read_text()).get("policy_id")
        except json.JSONDecodeError:
            pass
    if not pid and existing:
        pid = existing["id"]
    if not pid:
        print("SSO already ON (no bypass policy found)")
        if state_path.exists():
            state_path.unlink()
        sys.exit(0)
    r = api("DELETE", f"/accounts/{account_id}/access/apps/{app_id}/policies/{pid}")
    if not r.get("success"):
        print("Delete bypass policy failed:", r.get("errors"))
        sys.exit(3)
    if state_path.exists():
        state_path.unlink()
    print(f"Cloudflare Access SSO: ON (removed bypass policy {pid})")
    print("Test: https://abhinavall.net/Linuxbox/ → Cloudflare login, then HTTP Basic")
PY
