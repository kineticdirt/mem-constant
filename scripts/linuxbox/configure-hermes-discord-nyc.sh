#!/usr/bin/env bash
# Wire Hermes hunter-reckoning Discord gateway to NYC Big Apples category
# for fast lore Q&A (DeepSeek V4 Flash) WITHOUT removing existing Tropic listen channels.
#
# Usage (on linuxbox):
#   bash scripts/linuxbox/configure-hermes-discord-nyc.sh
#   bash scripts/linuxbox/configure-hermes-discord-nyc.sh --nyc-only   # listen ONLY Big Apples (drops Tropic channels)
#
# Category: 1528215677272330300 (Big Apples)
# Model:    deepseek/deepseek-v4-flash
set -euo pipefail

REPO="${HOME}/agent-dump"
HERMES_HOME="${HOME}/.hermes/profiles/hunter-reckoning"
ENV_FILE="${HERMES_HOME}/.env"
CFG="${HERMES_HOME}/config.yaml"
CHANNELS_OUT="${HOME}/.hermes/discord-nyc-channels.env"
MAIN_CHANNELS="${HOME}/.hermes/discord-rp-channels.env"
NYC_ONLY=0
CATEGORY_ID="1528215677272330300"
MODEL="deepseek/deepseek-v4-flash"
SOUL="${REPO}/campaigns/nyc-mafia-dnd/SOUL-discord-qa.md"
PROMPT_SNIPPET="${HERMES_HOME}/nyc-discord-qa-prompt.txt"

for arg in "$@"; do
  case "$arg" in
    --nyc-only) NYC_ONLY=1 ;;
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
  echo "missing ${SOUL} — deploy lore pack first" >&2
  exit 1
fi

# Discover Big Apples channel ids via REST (no discord.py event loop)
CATEGORY_ID="${CATEGORY_ID}" CHANNELS_OUT="${CHANNELS_OUT}" ENV_FILE="${ENV_FILE}" python3 - <<'PY'
import json, os, urllib.request
from pathlib import Path

category_id = os.environ["CATEGORY_ID"]
out_path = Path(os.environ["CHANNELS_OUT"])
env_path = Path(os.environ["ENV_FILE"])

def token_from_env(p: Path) -> str:
    for line in p.read_text(encoding="utf-8").splitlines():
        if line.startswith("DISCORD_BOT_TOKEN="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("DISCORD_BOT_TOKEN missing in hunter profile .env")

tok = token_from_env(env_path)
req = urllib.request.Request(
    "https://discord.com/api/v10/guilds/1012888284222988409/channels",
    headers={"Authorization": f"Bot {tok}", "User-Agent": "nyc-discord-wire (agent-dump)"},
)
with urllib.request.urlopen(req, timeout=45) as resp:
    channels = json.loads(resp.read().decode())

ba = [c for c in channels if str(c.get("parent_id")) == category_id]
# text (0) + forum (15); skip voice/stage
ba = [c for c in ba if int(c.get("type", -1)) in (0, 5, 15)]
if not ba:
    raise SystemExit(f"no channels under category {category_id}")

ids = [str(c["id"]) for c in ba]
lines = [
    f"# Big Apples category {category_id}",
    f"DISCORD_NYC_CATEGORY_ID={category_id}",
    "DISCORD_NYC_CHANNELS=" + ",".join(ids),
]
for c in ba:
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in c.get("name", "ch"))
    lines.append(f"DISCORD_NYC_CHANNEL_{safe}={c['id']}")
out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
out_path.chmod(0o600)
print(f"wrote {out_path} ({len(ids)} channels)")
for c in ba:
    print(f"  {c['id']}  type={c.get('type')}  {c.get('name')}")
PY

# Build union channel list
NYC_IDS=$(grep '^DISCORD_NYC_CHANNELS=' "${CHANNELS_OUT}" | cut -d= -f2-)
EXISTING=""
if [[ "${NYC_ONLY}" -eq 0 ]]; then
  if [[ -f "${MAIN_CHANNELS}" ]]; then
    EXISTING=$(grep '^DISCORD_ALLOWED_CHANNELS=' "${MAIN_CHANNELS}" | cut -d= -f2- || true)
  fi
  if [[ -z "${EXISTING}" ]]; then
    EXISTING=$(grep '^DISCORD_ALLOWED_CHANNELS=' "${HOME}/.hermes/.env" 2>/dev/null | cut -d= -f2- || true)
  fi
fi

# Prefer hermes venv for PyYAML
if [[ -x "${HOME}/.hermes/hermes-agent/venv/bin/python" ]]; then
  PYTHON="${HOME}/.hermes/hermes-agent/venv/bin/python"
else
  PYTHON="python3"
fi

NYC_IDS="${NYC_IDS}" EXISTING="${EXISTING:-}" ENV_FILE="${ENV_FILE}" CFG="${CFG}" MODEL="${MODEL}" SOUL="${SOUL}" PROMPT_SNIPPET="${PROMPT_SNIPPET}" NYC_ONLY="${NYC_ONLY}" \
"${PYTHON}" - <<'PY'
import os
from pathlib import Path

nyc = [x for x in os.environ.get("NYC_IDS", "").split(",") if x.strip()]
existing = [x for x in os.environ.get("EXISTING", "").split(",") if x.strip()]
env_path = Path(os.environ["ENV_FILE"])
cfg_path = Path(os.environ["CFG"])
model = os.environ["MODEL"]
soul = Path(os.environ["SOUL"]).read_text(encoding="utf-8").strip()
prompt_path = Path(os.environ["PROMPT_SNIPPET"])
nyc_only = os.environ.get("NYC_ONLY", "0") == "1"

# dedupe preserve order
seen = set()
union = []
for x in (nyc if nyc_only else existing + nyc):
    if x not in seen:
        seen.add(x)
        union.append(x)

prompt_path.write_text(soul + "\n", encoding="utf-8")
prompt_path.chmod(0o600)

# --- merge hunter .env ---
keys = {
    "DISCORD_ALLOWED_CHANNELS",
    "DISCORD_FREE_RESPONSE_CHANNELS",
    "DISCORD_REQUIRE_MENTION",
    "DISCORD_AUTO_THREAD",
    "DISCORD_NO_THREAD_CHANNELS",
    "DISCORD_NYC_CATEGORY_ID",
    "DISCORD_NYC_CHANNELS",
}
lines = env_path.read_text(encoding="utf-8").splitlines()
out = [ln for ln in lines if ln.split("=", 1)[0] not in keys]
csv = ",".join(union)
nyc_csv = ",".join(nyc)
out += [
    f"DISCORD_ALLOWED_CHANNELS={csv}",
    f"DISCORD_FREE_RESPONSE_CHANNELS={csv}",
    "DISCORD_REQUIRE_MENTION=false",
    "DISCORD_AUTO_THREAD=false",
    f"DISCORD_NO_THREAD_CHANNELS={csv}",
    "DISCORD_NYC_CATEGORY_ID=1528215677272330300",
    f"DISCORD_NYC_CHANNELS={nyc_csv}",
]
env_path.write_text("\n".join(out) + "\n", encoding="utf-8")
env_path.chmod(0o600)

# --- patch config.yaml via PyYAML ---
try:
    import yaml
except ImportError:
    raise SystemExit("PyYAML required — run with hermes venv python on PATH")

text = cfg_path.read_text(encoding="utf-8")
data = yaml.safe_load(text)

# model → DeepSeek V4 Flash (keep prior as fallback head if different)
prev_default = None
if isinstance(data.get("model"), dict):
    prev_default = data["model"].get("default")
    data["model"]["default"] = model
    data["model"]["provider"] = "openrouter"
    data["model"]["base_url"] = "https://openrouter.ai/api/v1"
else:
    data["model"] = {
        "default": model,
        "provider": "openrouter",
        "base_url": "https://openrouter.ai/api/v1",
    }

fb = data.get("fallback_providers") or []
if not isinstance(fb, list):
    fb = []
# ensure previous model remains a soft fallback
if prev_default and prev_default != model:
    fb = [{"provider": "openrouter", "model": prev_default, "base_url": "https://openrouter.ai/api/v1"}] + [
        x for x in fb if not (isinstance(x, dict) and x.get("model") == prev_default)
    ]
# always keep a free fallback after DeepSeek
if not any(isinstance(x, dict) and "kimi" in str(x.get("model", "")).lower() for x in fb):
    fb.append(
        {
            "provider": "openrouter",
            "model": "moonshotai/kimi-k2.6:free",
            "base_url": "https://openrouter.ai/api/v1",
        }
    )
data["fallback_providers"] = fb

discord = data.setdefault("discord", {})
discord["require_mention"] = False
discord["allowed_channels"] = csv
discord["free_response_channels"] = csv
discord["auto_thread"] = False
discord["no_thread_channels"] = csv
# per-channel prompts: every Big Apples channel id → NYC soul
prompts = discord.get("channel_prompts") or {}
if not isinstance(prompts, dict):
    prompts = {}
# drop stale numeric keys; set string keys for NYC
for cid in nyc:
    prompts[str(cid)] = soul
discord["channel_prompts"] = prompts

bak = cfg_path.with_suffix(".yaml.bak-nyc-wire")
bak.write_text(text, encoding="utf-8")
cfg_path.write_text(
    yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=120),
    encoding="utf-8",
)
print(f"backup {bak}")
print(f"model -> {model} (prev {prev_default})")
print(f"allowed/free channels ({len(union)}): {csv}")
print(f"nyc channel_prompts: {len(nyc)}")
print(f"nyc_only={nyc_only}")
PY

echo ""
echo "Config written. Do NOT restart the gateway mid-conversation — players see"
echo "'Gateway shutting down' and turns die. Restart only when Discord is idle:"
echo "  systemctl --user restart hermes-gateway-hunter-reckoning"
echo "  systemctl --user is-active hermes-gateway-hunter-reckoning"
echo "Prefer: leave gateway running; next natural restart picks this up."
echo ""
echo "Smoke: post in #general-ooc-ba (no @mention required). Expect DeepSeek Flash lore answer."
echo "Note: DISCORD_ALLOWED_USERS still gates who can talk; add player IDs if needed."
echo "Tirith note: potato Bullseye (glibc 2.31) cannot run stock tirith binaries"
echo "(they need glibc ≥2.32). Keep security.tirith_enabled=false on hunter;"
echo "hardline + dangerous-command guards still apply. See discord-hunter-linuxbox.md."
