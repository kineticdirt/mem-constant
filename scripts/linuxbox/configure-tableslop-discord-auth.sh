#!/usr/bin/env bash
# Write ~/.linuxbox-tableslop/.env and restart tableslop with Discord OAuth.
# Run on linuxbox after Discord Developer Portal redirect URI is set.
#
# Required env (or pass inline):
#   DISCORD_OAUTH_CLIENT_ID, DISCORD_OAUTH_CLIENT_SECRET
#   DISCORD_BOT_TOKEN (membership check), DISCORD_GUILD_ID
#
# Usage:
#   bash scripts/linuxbox/configure-tableslop-discord-auth.sh
#   TABLESLOP_REQUIRE_DISCORD_AUTH=0 bash ...   # disable login gate
set -euo pipefail

ENV_DIR="${HOME}/.linuxbox-tableslop"
ENV_FILE="${ENV_DIR}/.env"
REQUIRE="${TABLESLOP_REQUIRE_DISCORD_AUTH:-1}"
REDIRECT="${DISCORD_OAUTH_REDIRECT_URI:-https://map.tableslop.org/auth/discord/callback}"
GUILD="${DISCORD_GUILD_ID:-1012888284222988409}"
OWNER_ID="${TABLESLOP_OWNER_DISCORD_ID:-}"

client_id="${DISCORD_OAUTH_CLIENT_ID:-}"
client_secret="${DISCORD_OAUTH_CLIENT_SECRET:-}"
bot_token="${DISCORD_BOT_TOKEN:-${DISCORD_TOKEN:-}}"
session_secret="${TABLESLOP_SESSION_SECRET:-}"

if [[ "${REQUIRE}" == "1" ]]; then
  if [[ -z "${client_id}" || -z "${client_secret}" ]]; then
    echo "Set DISCORD_OAUTH_CLIENT_ID and DISCORD_OAUTH_CLIENT_SECRET." >&2
    echo "Discord Developer Portal → your app → OAuth2 → Redirects:" >&2
    echo "  ${REDIRECT}" >&2
    exit 1
  fi
  if [[ -z "${OWNER_ID}" ]]; then
    echo "WARN: TABLESLOP_OWNER_DISCORD_ID unset — no owner will be bootstrapped (nobody can manage roles)." >&2
  fi
  if [[ -z "${bot_token}" ]]; then
    echo "WARN: DISCORD_BOT_TOKEN unset — guild-membership gate disabled (anyone with Discord can log in as 'user')." >&2
  fi
fi

if [[ -z "${session_secret}" ]]; then
  session_secret="$(openssl rand -hex 32)"
fi

mkdir -p "${ENV_DIR}"
chmod 700 "${ENV_DIR}"

cat > "${ENV_FILE}" <<EOF
TABLESLOP_REQUIRE_DISCORD_AUTH=${REQUIRE}
TABLESLOP_SESSION_SECRET=${session_secret}
TABLESLOP_OWNER_DISCORD_ID=${OWNER_ID}
DISCORD_OAUTH_CLIENT_ID=${client_id}
DISCORD_OAUTH_CLIENT_SECRET=${client_secret}
DISCORD_OAUTH_REDIRECT_URI=${REDIRECT}
DISCORD_GUILD_ID=${GUILD}
DISCORD_BOT_TOKEN=${bot_token}
EOF
chmod 600 "${ENV_FILE}"

if systemctl is-enabled linuxbox-tableslop >/dev/null 2>&1; then
  sudo systemctl restart linuxbox-tableslop
  sleep 1
  systemctl is-active linuxbox-tableslop
  curl -sf "http://127.0.0.1:8765/health"
  echo ""
fi

echo "OK — ${ENV_FILE} written (chmod 600)."
if [[ "${REQUIRE}" == "1" ]]; then
  echo "Public login: https://map.tableslop.org/"
else
  echo "Auth disabled — map is public (@guest hidden in UI)."
fi
