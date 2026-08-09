#!/usr/bin/env bash
# Export Big Apples Discord category into campaigns/nyc-mafia-dnd/discord-export/
# for agent tracking / readback. Run on linuxbox.
#
# Usage:
#   bash scripts/linuxbox/nyc-discord-ingest.sh
#   bash scripts/linuxbox/nyc-discord-ingest.sh --list
set -euo pipefail

REPO="${HOME}/agent-dump"
CAMPAIGN="${REPO}/campaigns/nyc-mafia-dnd"
EXPORT_PY="${CAMPAIGN}/export_discord_lore.py"
ENV_FILE="${CAMPAIGN}/.env"
HUNTER_ENV="${HOME}/.hermes/profiles/hunter-reckoning/.env"
GUILD_ID="1012888284222988409"
CATEGORY_ID="1528215677272330300"
STAMP_FILE="${HOME}/.hermes/state/nyc-discord-ingest-last.json"
LOG_DIR="/mnt/archive/logs/nyc-discord-ingest"
mkdir -p "$(dirname "${STAMP_FILE}")" "${LOG_DIR}" 2>/dev/null || true

if [[ ! -f "${EXPORT_PY}" ]]; then
  echo "missing ${EXPORT_PY}" >&2
  exit 1
fi

# Ensure campaign .env has token + ids (gitignored)
ENV_FILE="${ENV_FILE}" HUNTER_ENV="${HUNTER_ENV}" GUILD_ID="${GUILD_ID}" CATEGORY_ID="${CATEGORY_ID}" python3 - <<'PY'
from pathlib import Path
import os
env_path = Path(os.environ["ENV_FILE"])
hunter = Path(os.environ["HUNTER_ENV"])
guild, cat = os.environ["GUILD_ID"], os.environ["CATEGORY_ID"]
tok = ""
if hunter.exists():
    for ln in hunter.read_text(encoding="utf-8").splitlines():
        if ln.startswith("DISCORD_BOT_TOKEN="):
            tok = ln.split("=", 1)[1].strip()
            break
if not tok:
    raise SystemExit("no DISCORD_BOT_TOKEN in hunter profile .env")
lines = []
if env_path.exists():
    for ln in env_path.read_text(encoding="utf-8").splitlines():
        if ln.split("=", 1)[0] in {
            "DISCORD_BOT_TOKEN",
            "DISCORD_TOKEN",
            "DISCORD_GUILD_ID",
            "DISCORD_CATEGORY_ID",
        }:
            continue
        lines.append(ln)
lines += [
    f"DISCORD_BOT_TOKEN={tok}",
    f"DISCORD_TOKEN={tok}",
    f"DISCORD_GUILD_ID={guild}",
    f"DISCORD_CATEGORY_ID={cat}",
]
env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
env_path.chmod(0o600)
print(f"wrote {env_path} (token redacted)")
PY

cd "${CAMPAIGN}"
export PATH="${HOME}/.local/bin:${PATH}"
python3 -c "import discord, dotenv" 2>/dev/null || pip install --user 'discord.py>=2.3' python-dotenv

TS="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="${LOG_DIR}/ingest-${TS}.log"

if [[ "${1:-}" == "--list" ]]; then
  python3 "${EXPORT_PY}" --list --guild "${GUILD_ID}" | tee "${LOG}"
  exit 0
fi

echo "Ingesting Big Apples category ${CATEGORY_ID} ..."
python3 "${EXPORT_PY}" --guild "${GUILD_ID}" --category "${CATEGORY_ID}" 2>&1 | tee "${LOG}"

# stamp
STAMP_FILE="${STAMP_FILE}" CAMPAIGN="${CAMPAIGN}" CATEGORY_ID="${CATEGORY_ID}" LOG="${LOG}" python3 - <<'PY'
import json, os, time
from pathlib import Path
stamp = Path(os.environ["STAMP_FILE"])
campaign = Path(os.environ["CAMPAIGN"])
cat = os.environ["CATEGORY_ID"]
log = os.environ["LOG"]
root = campaign / "discord-export"
files = list(root.rglob("messages.md")) if root.exists() else []
payload = {
    "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "category_id": cat,
    "messages_md_count": len(files),
    "export_root": str(root),
    "log": log,
}
stamp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
print(json.dumps(payload, indent=2))
PY

echo "OK — export under ${CAMPAIGN}/discord-export/ (gitignored runtime on potato; archive log ${LOG})"
