#!/usr/bin/env bash
# Push secrets/linuxbox.env from this PC → linuxbox Hermes + campaign .env files.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="${REPO}/secrets/linuxbox.env"
HOST="${LINUXBOX_HOST:-potato}"
KEY="${LINUXBOX_SSH_KEY:-$HOME/.ssh/id_rsa_potato}"

SSH_OPTS=(-o BatchMode=yes)
if [[ -f "${KEY}" ]]; then
  SSH_OPTS+=(-i "${KEY}" -o IdentitiesOnly=yes)
fi
if ! ssh -G "${HOST}" >/dev/null 2>&1; then
  HOST="abhinav@100.122.108.94"
fi

if [[ ! -f "${SRC}" ]]; then
  echo "Missing ${SRC}" >&2
  echo "Copy secrets/linuxbox.env.example → secrets/linuxbox.env and paste tokens." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "${SRC}"
set +a

tok="${DISCORD_BOT_TOKEN:-${DISCORD_TOKEN:-}}"
if [[ -z "${tok}" ]]; then
  echo "Set DISCORD_BOT_TOKEN or DISCORD_TOKEN in ${SRC}" >&2
  exit 1
fi

allowed="${DISCORD_ALLOWED_USERS:-}"
guild="${DISCORD_GUILD_ID:-1012888284222988409}"
category="${DISCORD_CATEGORY_ID:-1137592539076120666}"
oauth_id="${DISCORD_OAUTH_CLIENT_ID:-}"
oauth_secret="${DISCORD_OAUTH_CLIENT_SECRET:-}"
oauth_redirect="${DISCORD_OAUTH_REDIRECT_URI:-https://map.tableslop.org/auth/discord/callback}"
tableslop_auth="${TABLESLOP_REQUIRE_DISCORD_AUTH:-1}"
zenmux_key="${ZENMUX_API_KEY:-}"

ssh "${SSH_OPTS[@]}" "${HOST}" bash -s <<EOF
set -euo pipefail
tok=$(printf '%q' "${tok}")
allowed=$(printf '%q' "${allowed}")
guild=$(printf '%q' "${guild}")
category=$(printf '%q' "${category}")
oauth_id=$(printf '%q' "${oauth_id}")
oauth_secret=$(printf '%q' "${oauth_secret}")
oauth_redirect=$(printf '%q' "${oauth_redirect}")
tableslop_auth=$(printf '%q' "${tableslop_auth}")
zenmux_key=$(printf '%q' "${zenmux_key}")

merge_kv() {
  local file="\$1" key="\$2" val="\$3"
  touch "\$file"
  chmod 600 "\$file"
  if grep -q "^\${key}=" "\$file" 2>/dev/null; then
    sed -i "s|^\${key}=.*|\${key}=\${val}|" "\$file"
  else
    echo "\${key}=\${val}" >> "\$file"
  fi
}

mkdir -p ~/agent-dump/campaigns/tropic-gooner
merge_kv ~/.hermes/.env DISCORD_BOT_TOKEN "\$tok"
if [[ -n "\$allowed" ]]; then
  merge_kv ~/.hermes/.env DISCORD_ALLOWED_USERS "\$allowed"
fi
if [[ -n "\$zenmux_key" ]]; then
  merge_kv ~/.hermes/.env ZENMUX_API_KEY "\$zenmux_key"
fi
merge_kv ~/agent-dump/campaigns/tropic-gooner/.env DISCORD_TOKEN "\$tok"
merge_kv ~/agent-dump/campaigns/tropic-gooner/.env DISCORD_BOT_TOKEN "\$tok"
merge_kv ~/agent-dump/campaigns/tropic-gooner/.env DISCORD_CATEGORY_ID "\$category"
if [[ -n "\$guild" ]]; then
  merge_kv ~/agent-dump/campaigns/tropic-gooner/.env DISCORD_GUILD_ID "\$guild"
fi
chmod 600 ~/.hermes/.env ~/agent-dump/campaigns/tropic-gooner/.env
echo "Secrets merged on linuxbox."

export DISCORD_OAUTH_CLIENT_ID="\$oauth_id"
export DISCORD_OAUTH_CLIENT_SECRET="\$oauth_secret"
export DISCORD_OAUTH_REDIRECT_URI="\$oauth_redirect"
export DISCORD_GUILD_ID="\$guild"
export DISCORD_BOT_TOKEN="\$tok"
export TABLESLOP_REQUIRE_DISCORD_AUTH="\$tableslop_auth"
if [[ -n "\$oauth_id" && -n "\$oauth_secret" ]]; then
  bash ~/agent-dump/scripts/linuxbox/configure-tableslop-discord-auth.sh
else
  echo "Skip tableslop OAuth — set DISCORD_OAUTH_CLIENT_ID/SECRET in secrets/linuxbox.env"
fi
EOF

echo "Running Discord channel configure on linuxbox..."
ssh "${SSH_OPTS[@]}" "${HOST}" 'bash ~/agent-dump/scripts/linuxbox/configure-hermes-discord-hunter.sh 1137592539076120666' || true

echo "OK — secrets synced. Test: ssh ${HOST} 'cd ~/agent-dump/campaigns/tropic-gooner && python3 export_discord_lore.py --list'"
