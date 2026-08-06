#!/usr/bin/env bash
# Wire Hermes gateway (hunter-reckoning profile) to Discord RP category.
# Run ON linuxbox after bot token is in place.
#
# Prerequisites:
#   ~/.hermes/.env:
#     DISCORD_BOT_TOKEN=...
#     DISCORD_ALLOWED_USERS=your_discord_user_id
#     OPENROUTER_API_KEY_RP=...  (hunter uses RP pool)
#   campaigns/tropic-gooner/.env (optional, same token):
#     DISCORD_TOKEN=...  (or DISCORD_BOT_TOKEN)
#     DISCORD_GUILD_ID=...
#     DISCORD_CATEGORY_ID=1137592539076120666
#
# Usage:
#   bash configure-hermes-discord-hunter.sh
#   bash configure-hermes-discord-hunter.sh 1137592539076120666
set -euo pipefail

REPO="${HOME}/agent-dump"
HERMES_ROOT="${HOME}/.hermes"
ENV_FILE="${HERMES_ROOT}/.env"
CAMPAIGN_ENV="${REPO}/campaigns/tropic-gooner/.env"
CATEGORY_ID="${1:-1137592539076120666}"
CHANNELS_ENV="${HERMES_ROOT}/discord-rp-channels.env"
LIST_PY="${REPO}/scripts/linuxbox/list-discord-category-channels.py"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "missing ${ENV_FILE}" >&2
  exit 1
fi

if ! grep -qE '^DISCORD_BOT_TOKEN=' "${ENV_FILE}" 2>/dev/null; then
  tok=$(python3 "${REPO}/scripts/linuxbox/discord_token.py" 2>/dev/null) || tok=""
  if [[ -z "${tok}" ]]; then
    echo "Set DISCORD_BOT_TOKEN in ${ENV_FILE} (Discord Developer Portal → Bot → Token)." >&2
    exit 1
  fi
  echo "DISCORD_BOT_TOKEN=${tok}" >> "${ENV_FILE}"
fi

if ! grep -qE '^DISCORD_ALLOWED_USERS=' "${ENV_FILE}" 2>/dev/null; then
  echo "Set DISCORD_ALLOWED_USERS=your_user_id in ${ENV_FILE} (right-click you → Copy User ID)." >&2
  exit 1
fi

# Campaign .env template fields (no secrets in git)
mkdir -p "$(dirname "${CAMPAIGN_ENV}")"
if [[ ! -f "${CAMPAIGN_ENV}" ]]; then
  cat > "${CAMPAIGN_ENV}" <<EOF
# gitignored — paste bot token from Discord Developer Portal
DISCORD_TOKEN=
DISCORD_GUILD_ID=
DISCORD_CATEGORY_ID=${CATEGORY_ID}
EOF
  chmod 600 "${CAMPAIGN_ENV}"
  echo "Created ${CAMPAIGN_ENV} — paste DISCORD_TOKEN and DISCORD_GUILD_ID"
fi

python3 -c "import discord" 2>/dev/null || pip install --user 'discord.py>=2.3' python-dotenv

echo "Discovering channels in category ${CATEGORY_ID}..."
python3 "${LIST_PY}" "${CATEGORY_ID}" | grep -v '^#' | grep -v '^$' > "${CHANNELS_ENV}.new" || {
  echo "Channel discovery failed — check token, bot in server, category ID." >&2
  exit 1
}
mv "${CHANNELS_ENV}.new" "${CHANNELS_ENV}"
chmod 600 "${CHANNELS_ENV}"
echo "Wrote ${CHANNELS_ENV}:"
cat "${CHANNELS_ENV}"

# Merge channel settings into main hermes .env (replace prior discord-rp lines)
python3 - "${ENV_FILE}" "${CHANNELS_ENV}" <<'PY'
import sys
from pathlib import Path

env_path = Path(sys.argv[1])
channels_path = Path(sys.argv[2])
keys = {
    "DISCORD_ALLOWED_CHANNELS",
    "DISCORD_FREE_RESPONSE_CHANNELS",
    "DISCORD_REQUIRE_MENTION",
    "DISCORD_AUTO_THREAD",
    "DISCORD_NO_THREAD_CHANNELS",
}
lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
out = [ln for ln in lines if ln.split("=", 1)[0] not in keys]
for ln in channels_path.read_text(encoding="utf-8").splitlines():
    if ln.strip() and not ln.startswith("#"):
        out.append(ln)
env_path.write_text("\n".join(out) + "\n", encoding="utf-8")
print("merged discord channel config into", env_path)
PY

chmod 600 "${ENV_FILE}"

export PATH="${HOME}/.local/bin:${PATH}"
HERMES_BIN="${HOME}/.local/bin/hermes"

# Hunter pod uses RP OpenRouter key + Discord for live RP
if "${HERMES_BIN}" profile show hunter-reckoning >/dev/null 2>&1; then
  prof_env="${HERMES_ROOT}/profiles/hunter-reckoning/.env"
  grep -q '^DISCORD_BOT_TOKEN=' "${prof_env}" 2>/dev/null || {
    tok=$(python3 "${REPO}/scripts/linuxbox/discord_token.py" 2>/dev/null) || tok=""
    [[ -n "${tok}" ]] && echo "DISCORD_BOT_TOKEN=${tok}" >> "${prof_env}"
  }
  grep -q '^DISCORD_ALLOWED_USERS=' "${prof_env}" 2>/dev/null || {
    users=$(grep '^DISCORD_ALLOWED_USERS=' "${ENV_FILE}" | cut -d= -f2-)
    echo "DISCORD_ALLOWED_USERS=${users}" >> "${prof_env}"
  }
  chmod 600 "${prof_env}"
fi

echo ""
echo "Start Discord gateway on hunter-reckoning profile:"
echo "  hunter-reckoning gateway install   # once"
echo "  hunter-reckoning gateway restart"
echo ""
echo "Or default gateway after: hermes profile use hunter-reckoning && hermes gateway restart"
echo ""
echo "Ingest (batch export): cd ${REPO}/campaigns/tropic-gooner && python export_discord_lore.py --guild GUILD_ID --category ${CATEGORY_ID}"
