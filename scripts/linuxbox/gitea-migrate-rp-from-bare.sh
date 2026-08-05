#!/usr/bin/env bash
# Migrate bare ObsidianWriterStack → Gitea after human finishes install wizard.
# Usage (on potato):
#   # preferred: ~/.gitea-migrate.env (chmod 600) — see gitea-migrate.env.example
#   set -a; . ~/.gitea-migrate.env; set +a
#   bash scripts/linuxbox/gitea-migrate-rp-from-bare.sh --owner username --user username
#
# Requires: curl, git, Gitea INSTALL_LOCK=true, admin creds.
# Does not invent passwords. Fails loud if wizard still open.
set -euo pipefail

OWNER="username"
REPO="ObsidianWriterStack"
USER_NAME=""
PASS_ENV="GITEA_ADMIN_PASSWORD"
BARE="${HOME}/repos/ObsidianWriterStack.git"
GITEA_HTTP="http://127.0.0.1:13000"
EXPECTED_TIP="639dec6"
ENV_FILE="${HOME}/.gitea-migrate.env"

# Auto-load safe local env if present (never commit this file).
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  . "$ENV_FILE"
  set +a
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner) OWNER="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --user) USER_NAME="$2"; shift 2 ;;
    --password-env) PASS_ENV="$2"; shift 2 ;;
    --bare) BARE="$2"; shift 2 ;;
    --base-url) GITEA_HTTP="$2"; shift 2 ;;
    -h|--help)
      sed -n '1,12p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$USER_NAME" ]]; then
  USER_NAME="${GITEA_USER:-}"
fi
if [[ -z "$USER_NAME" ]]; then
  echo "ERROR: --user <gitea-admin-username> required (or GITEA_USER in $ENV_FILE)" >&2
  exit 2
fi

PASS="${!PASS_ENV-}"
if [[ -z "$PASS" ]]; then
  echo "ERROR: set $PASS_ENV (admin password). Will not invent secrets." >&2
  echo "Create $ENV_FILE from scripts/linuxbox/gitea-migrate.env.example then:" >&2
  echo "  chmod 600 $ENV_FILE" >&2
  echo "  set -a; . $ENV_FILE; set +a" >&2
  echo "  bash ~/agent-dump/scripts/linuxbox/gitea-migrate-rp-from-bare.sh --owner username --user username" >&2
  exit 2
fi

if [[ ! -d "$BARE" ]]; then
  echo "ERROR: bare missing: $BARE" >&2
  exit 1
fi

title="$(curl -sS "$GITEA_HTTP/" | head -c 800 || true)"
if echo "$title" | grep -qi "Installation"; then
  echo "ERROR: Gitea still showing Installation wizard (INSTALL_LOCK=false)." >&2
  echo "Finish http://192.168.4.59:13000/ (or Tailscale :13000) first." >&2
  exit 1
fi

TIP="$(git --git-dir="$BARE" rev-parse --short main)"
FULL="$(git --git-dir="$BARE" rev-parse main)"
echo "bare main tip: $TIP ($FULL)"
if [[ "$TIP" != "$EXPECTED_TIP"* && "$FULL" != ${EXPECTED_TIP}* ]]; then
  echo "WARN: tip is not $EXPECTED_TIP — continuing anyway (live may have moved)." >&2
fi

API="$GITEA_HTTP/api/v1"
AUTH=(-u "${USER_NAME}:${PASS}")

# Create empty repo if missing (ignore 409 conflict)
code="$(curl -sS -o /tmp/gitea-create-repo.json -w '%{http_code}' \
  "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d "{\"name\":\"${REPO}\",\"private\":true,\"auto_init\":false}" \
  "$API/user/repos" || true)"
echo "create repo HTTP $code"
if [[ "$code" != "201" && "$code" != "409" && "$code" != "422" ]]; then
  echo "ERROR: create repo failed; body in /tmp/gitea-create-repo.json" >&2
  exit 1
fi

REMOTE="${GITEA_HTTP}/${OWNER}/${REPO}.git"
# Prefer push with credentials in URL only for localhost loopback
PUSH_URL="http://${USER_NAME}:${PASS}@127.0.0.1:13000/${OWNER}/${REPO}.git"

echo "Pushing --all and --tags to ${REMOTE} …"
git --git-dir="$BARE" push --all "$PUSH_URL"
git --git-dir="$BARE" push --tags "$PUSH_URL"

echo "OK. Clone URLs:"
echo "  LAN HTTP:       http://192.168.4.59:13000/${OWNER}/${REPO}.git"
echo "  Tailscale HTTP: http://100.122.108.94:13000/${OWNER}/${REPO}.git"
echo "  LAN SSH:        ssh://git@192.168.4.59:12222/${OWNER}/${REPO}.git"
echo "  Tailscale SSH:  ssh://git@100.122.108.94:12222/${OWNER}/${REPO}.git"
echo
echo "Point live checkout when ready:"
echo "  cd ~/pixi-rp/ObsidianWriterStack"
echo "  git remote set-url origin ${REMOTE}"
echo "  git fetch origin && git rev-parse HEAD"
