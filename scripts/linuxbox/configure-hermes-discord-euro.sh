#!/usr/bin/env bash
# Wire Hermes hunter-reckoning Discord gateway to Euro Adventure guild
# WITHOUT removing Tropic or NYC listen channels. Same AI_RP_Master bot / one gateway.
#
# Usage (on linuxbox):
#   bash scripts/linuxbox/configure-hermes-discord-euro.sh
#
# Guild:    1265793253798576148 (Wholesome's RP stuff / eurosluts)
# Category: 1477755184607396063 (Guild Hall) + selected Text Channels
#
# Restart ONLY when Discord is idle:
#   systemctl --user restart hermes-gateway-hunter-reckoning
set -euo pipefail

REPO="${HOME}/agent-dump"
HERMES_HOME="${HOME}/.hermes/profiles/hunter-reckoning"
ENV_FILE="${HERMES_HOME}/.env"
CFG="${HERMES_HOME}/config.yaml"
CHANNELS_OUT="${HOME}/.hermes/discord-euro-channels.env"
SOUL="${REPO}/campaigns/euro-adventure-2026/SOUL-discord.md"
PROMPT_SNIPPET="${HERMES_HOME}/euro-discord-prompt.txt"
GUILD_ID="1265793253798576148"
GUILD_HALL_CAT="1477755184607396063"

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
  esac
done

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "missing ${ENV_FILE}" >&2
  exit 1
fi
if [[ ! -f "${CFG}" ]]; then
  echo "missing ${CFG}" >&2
  exit 1
fi
if [[ ! -f "${SOUL}" ]]; then
  echo "missing ${SOUL}" >&2
  exit 1
fi

if [[ -x "${HOME}/.hermes/hermes-agent/venv/bin/python" ]]; then
  PYTHON="${HOME}/.hermes/hermes-agent/venv/bin/python"
else
  PYTHON="python3"
fi

GUILD_ID="${GUILD_ID}" GUILD_HALL_CAT="${GUILD_HALL_CAT}" CHANNELS_OUT="${CHANNELS_OUT}" \
ENV_FILE="${ENV_FILE}" CFG="${CFG}" SOUL="${SOUL}" PROMPT_SNIPPET="${PROMPT_SNIPPET}" \
REPO="${REPO}" \
"${PYTHON}" - <<'PY'
import json
import os
import sys
import urllib.request
from pathlib import Path

try:
    import yaml
except ImportError as e:
    raise SystemExit(f"PyYAML required: {e}")

sys.path.insert(0, str(Path(os.environ["REPO"]) / "scripts" / "linuxbox"))
from discord_token import _discord_token

guild_id = os.environ["GUILD_ID"]
hall_cat = os.environ["GUILD_HALL_CAT"]
out_path = Path(os.environ["CHANNELS_OUT"])
env_path = Path(os.environ["ENV_FILE"])
cfg_path = Path(os.environ["CFG"])
soul = Path(os.environ["SOUL"]).read_text(encoding="utf-8").strip()
prompt_path = Path(os.environ["PROMPT_SNIPPET"])

tok = _discord_token()
req = urllib.request.Request(
    f"https://discord.com/api/v10/guilds/{guild_id}/channels",
    headers={"Authorization": f"Bot {tok}", "User-Agent": "euro-discord-wire (agent-dump)"},
)
with urllib.request.urlopen(req, timeout=45) as resp:
    channels = json.loads(resp.read().decode())

# Active Euro listen set (not Previous Campaigns, not sheets/gm/memes/storage).
LISTEN = [
    "1495469564060893254",  # #main-rp (Guild Hall) — primary play
    "1477735120252178453",  # #campaign-rp — SmithsVille intake
    "1477755236591468647",  # #main-guild-hall
    "1265793253798576151",  # #general
    "1300182920346206228",  # #roll
    "1394030384261496993",  # #lore
    "1475174870349381906",  # #roleplay (Text Channels)
]
EXCLUDE = {
    "1475174763533176844",  # #sheets
    "1282480728159817760",  # #gm-channel
    "1477755253335130246",  # #storage
    "1477755301552722011",  # #registration-and-accounting
    "1523698730585423955",  # #god-forbid-memes
    "1275577054422630410",  # #wholesome-posts
    "1333161174216474624",  # #current-effects-and-rp-notifications
}

by_id = {str(c["id"]): c for c in channels}
# Prefer declared order; keep only channels that exist (or keep declared for offline ids)
ids = []
for lid in LISTEN:
    if lid in by_id or True:
        ids.append(lid)
# Drop excludes if somehow listed
ids = [i for i in ids if i not in EXCLUDE]

# Prove Guild Hall parent for main-rp when API has it
main = by_id.get("1495469564060893254")
if main and str(main.get("parent_id")) != hall_cat:
    print(f"WARN: #main-rp parent={main.get('parent_id')} expected Guild Hall {hall_cat}")

lines = [
    f"# Euro Adventure guild {guild_id} — listen-only (AI_RP_Master)",
    f"DISCORD_EURO_GUILD_ID={guild_id}",
    f"DISCORD_EURO_CATEGORY_ID={hall_cat}",
    "DISCORD_EURO_CHANNELS=" + ",".join(ids),
    "DISCORD_EURO_EXCLUDE=" + ",".join(sorted(EXCLUDE)),
]
for cid in ids:
    c = by_id.get(cid, {"id": cid, "name": "listen", "type": "?"})
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in c.get("name", "ch"))
    lines.append(f"DISCORD_EURO_CHANNEL_{safe}={c['id']}")
out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
out_path.chmod(0o600)
print(f"wrote {out_path} ({len(ids)} listen channels)")
for cid in ids:
    c = by_id.get(cid, {"name": "?", "type": "?"})
    print(f"  LISTEN {cid}  type={c.get('type')}  #{c.get('name')}")

# --- merge hunter .env ---
euro = ids
nyc_known = {
    "1528215752576995580",
    "1533280510527406131",
    "1528225899227512902",
    "1535816868785426433",
    "1528216296779415683",
    "1528216246540173313",
    "1528216141229461597",
    "1528216124632600587",
}

def env_val(key: str) -> str:
    for ln in env_path.read_text(encoding="utf-8").splitlines():
        if ln.startswith(key + "="):
            return ln.split("=", 1)[1].strip()
    return ""

existing = [x for x in env_val("DISCORD_ALLOWED_CHANNELS").split(",") if x.strip()]
nyc = [x for x in env_val("DISCORD_NYC_CHANNELS").split(",") if x.strip()] or [
    x for x in env_val("DISCORD_NYC_LISTEN").split(",") if x.strip()
]
if not nyc:
    nyc = [x for x in existing if x in nyc_known]

seen = set()
union = []
for x in existing + euro:
    if x in EXCLUDE:
        continue
    if x not in seen:
        seen.add(x)
        union.append(x)

# free-response = Tropic only (not NYC, not Euro)
mention_req = set(nyc) | set(euro) | nyc_known
tropic_free = [c for c in union if c not in mention_req]

keys = {
    "DISCORD_ALLOWED_CHANNELS",
    "DISCORD_FREE_RESPONSE_CHANNELS",
    "DISCORD_REQUIRE_MENTION",
    "DISCORD_THREAD_REQUIRE_MENTION",
    "DISCORD_IGNORE_NO_MENTION",
    "DISCORD_AUTO_THREAD",
    "DISCORD_NO_THREAD_CHANNELS",
    "DISCORD_EURO_GUILD_ID",
    "DISCORD_EURO_CATEGORY_ID",
    "DISCORD_EURO_CHANNELS",
}
lines_env = env_path.read_text(encoding="utf-8").splitlines()
out = [ln for ln in lines_env if ln.split("=", 1)[0] not in keys]
csv = ",".join(union)
euro_csv = ",".join(euro)
out += [
    f"DISCORD_ALLOWED_CHANNELS={csv}",
    f"DISCORD_FREE_RESPONSE_CHANNELS={','.join(tropic_free)}",
    "DISCORD_REQUIRE_MENTION=true",
    "DISCORD_THREAD_REQUIRE_MENTION=true",
    "DISCORD_IGNORE_NO_MENTION=true",
    "DISCORD_AUTO_THREAD=false",
    f"DISCORD_NO_THREAD_CHANNELS={csv}",
    f"DISCORD_EURO_GUILD_ID={guild_id}",
    f"DISCORD_EURO_CATEGORY_ID={hall_cat}",
    f"DISCORD_EURO_CHANNELS={euro_csv}",
]
env_path.write_text("\n".join(out) + "\n", encoding="utf-8")
env_path.chmod(0o600)

prompt_path.write_text(soul + "\n", encoding="utf-8")
prompt_path.chmod(0o600)

# --- patch config.yaml ---
text = cfg_path.read_text(encoding="utf-8")
data = yaml.safe_load(text) or {}
discord = data.setdefault("discord", {})
discord["require_mention"] = True
discord["thread_require_mention"] = True
discord["ignore_no_mention"] = True
discord["allowed_channels"] = csv
discord["free_response_channels"] = ",".join(tropic_free)
discord["auto_thread"] = False
discord["no_thread_channels"] = csv

prompts = discord.get("channel_prompts") or {}
if not isinstance(prompts, dict):
    prompts = {}
for cid in euro:
    prompts[str(cid)] = soul
discord["channel_prompts"] = prompts

bak = cfg_path.with_suffix(".yaml.bak-euro-wire")
bak.write_text(text, encoding="utf-8")
cfg_path.write_text(
    yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=120),
    encoding="utf-8",
)
print(f"backup {bak}")
print(f"allowed ({len(union)}); free_response tropic-only ({len(tropic_free)}); euro ({len(euro)})")
print("euro channel_prompts set; require_mention=true")
PY

echo ""
echo "Config written. Do NOT restart mid-conversation. When idle:"
echo "  systemctl --user restart hermes-gateway-hunter-reckoning"
echo "Smoke: @AI_RP_Master in Euro #general or #main-rp."
echo "Note: DISCORD_ALLOWED_USERS still gates who can talk — add Euro player IDs if needed."
echo "Invite (if membership missing): see docs/agents/discord-hunter-linuxbox.md § Euro"
