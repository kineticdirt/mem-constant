#!/usr/bin/env bash
# Pepper Quill / hunter-reckoning — narrow Big Apples listen to OOC/roll/lore
# (+ dm-screen @mention). Keep Tropic channels. Silent until @mention.
# Idempotent. Prefer no mid-chat restart (dotenv/config mtime); one idle reload if needed.
set -euo pipefail

HUNTER="${HOME}/.hermes/profiles/hunter-reckoning"
ENV_FILE="${HUNTER}/.env"
CFG="${HUNTER}/config.yaml"
REPO="${LINUXBOX_AGENT_DUMP:-$HOME/agent-dump}"
SOUL="${REPO}/campaigns/nyc-mafia-dnd/SOUL-discord-qa.md"
MAIN_CHANNELS="${HOME}/.hermes/discord-rp-channels.env"
NYC_CHANNELS_OUT="${HOME}/.hermes/discord-nyc-listen.env"
OWNER_ID="265909664590331915"

# NYC listen (answer when @'d) — NOT art / characters-ba
NYC_LISTEN=(
  "1528215752576995580"  # general-ooc-ba
  "1533280510527406131"  # general
  "1528225899227512902"  # rolly-poley
  "1535816868785426433"  # lore-dump
  "1528216296779415683"  # campaign-discussion-lore (forum)
  "1528216246540173313"  # dm-screen (GM ops; still require_mention)
)
# Explicitly excluded from allowlist
NYC_EXCLUDE=(
  "1528216141229461597"  # characters-ba
  "1528216124632600587"  # art
)

if [[ ! -f "$ENV_FILE" || ! -f "$CFG" ]]; then
  echo "missing hunter env/config" >&2
  exit 1
fi

export HUNTER ENV_FILE CFG REPO SOUL MAIN_CHANNELS NYC_CHANNELS_OUT OWNER_ID
export NYC_LISTEN_CSV
NYC_LISTEN_CSV=$(IFS=,; echo "${NYC_LISTEN[*]}")
export NYC_EXCLUDE_CSV
NYC_EXCLUDE_CSV=$(IFS=,; echo "${NYC_EXCLUDE[*]}")

python3 <<'PY'
from pathlib import Path
import os
import yaml

nyc_listen = [x for x in os.environ["NYC_LISTEN_CSV"].split(",") if x]
nyc_exclude = set(x for x in os.environ["NYC_EXCLUDE_CSV"].split(",") if x)
env_path = Path(os.environ["ENV_FILE"])
cfg_path = Path(os.environ["CFG"])
soul_path = Path(os.environ["SOUL"])
main_ch = Path(os.environ["MAIN_CHANNELS"])
out_nyc = Path(os.environ["NYC_CHANNELS_OUT"])
owner = os.environ["OWNER_ID"]

# Tropic / existing non-NYC allowlist
tropic = []
if main_ch.is_file():
    for ln in main_ch.read_text(encoding="utf-8").splitlines():
        if ln.startswith("DISCORD_ALLOWED_CHANNELS="):
            tropic = [x.strip() for x in ln.split("=", 1)[1].split(",") if x.strip()]
            break
# Fallback: current env minus all known NYC category ids
all_nyc_category = set(nyc_listen) | nyc_exclude | {
    "1528215752576995580",
    "1528216124632600587",
    "1528216141229461597",
    "1528216246540173313",
    "1528216296779415683",
    "1528225899227512902",
    "1533280510527406131",
    "1535816868785426433",
}
if not tropic:
    for ln in env_path.read_text(encoding="utf-8").splitlines():
        if ln.startswith("DISCORD_ALLOWED_CHANNELS="):
            tropic = [
                x.strip()
                for x in ln.split("=", 1)[1].split(",")
                if x.strip() and x.strip() not in all_nyc_category
            ]
            break

seen = set()
union = []
for x in tropic + nyc_listen:
    if x in nyc_exclude:
        continue
    if x not in seen:
        seen.add(x)
        union.append(x)

# free-response = tropic only (NYC always require_mention)
tropic_free = [c for c in tropic if c not in all_nyc_category]

out_nyc.write_text(
    "# Big Apples listen (OOC/roll/lore/dm-screen) — Pepper Quill\n"
    f"DISCORD_NYC_LISTEN={','.join(nyc_listen)}\n"
    f"DISCORD_NYC_EXCLUDE={','.join(sorted(nyc_exclude))}\n",
    encoding="utf-8",
)
out_nyc.chmod(0o600)

# --- .env ---
keys = {
    "DISCORD_ALLOWED_CHANNELS",
    "DISCORD_FREE_RESPONSE_CHANNELS",
    "DISCORD_REQUIRE_MENTION",
    "DISCORD_THREAD_REQUIRE_MENTION",
    "DISCORD_IGNORE_NO_MENTION",
    "DISCORD_AUTO_THREAD",
    "DISCORD_NO_THREAD_CHANNELS",
    "DISCORD_NYC_CATEGORY_ID",
    "DISCORD_NYC_CHANNELS",
    "DISCORD_NYC_LISTEN",
    "DISCORD_OPS_OWNER_ID",
    "GATEWAY_OPS_NOTIFY_USER",
    "DISCORD_HOME_CHANNEL",
    "DISCORD_HOME_CHANNEL_NAME",
}
lines = env_path.read_text(encoding="utf-8").splitlines()
out = [ln for ln in lines if not ("=" in ln and ln.split("=", 1)[0] in keys)]
out += [
    f"DISCORD_ALLOWED_CHANNELS={','.join(union)}",
    f"DISCORD_FREE_RESPONSE_CHANNELS={','.join(tropic_free)}",
    "DISCORD_REQUIRE_MENTION=true",
    "DISCORD_THREAD_REQUIRE_MENTION=true",
    "DISCORD_IGNORE_NO_MENTION=true",
    "DISCORD_AUTO_THREAD=false",
    f"DISCORD_NO_THREAD_CHANNELS={','.join(union)}",
    "DISCORD_NYC_CATEGORY_ID=1528215677272330300",
    f"DISCORD_NYC_CHANNELS={','.join(nyc_listen)}",
    f"DISCORD_NYC_LISTEN={','.join(nyc_listen)}",
    f"DISCORD_OPS_OWNER_ID={owner}",
    f"GATEWAY_OPS_NOTIFY_USER={owner}",
    "DISCORD_HOME_CHANNEL=1528215752576995580",
    "DISCORD_HOME_CHANNEL_NAME=general-ooc-ba",
]
env_path.write_text("\n".join(out) + "\n", encoding="utf-8")
env_path.chmod(0o600)

# --- config.yaml ---
cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
discord = cfg.setdefault("discord", {})
discord["require_mention"] = True
discord["thread_require_mention"] = True
discord["ignore_no_mention"] = True
discord["allowed_channels"] = ",".join(union)
discord["free_response_channels"] = ",".join(tropic_free)
discord["auto_thread"] = False
discord["no_thread_channels"] = ",".join(union)
discord["gateway_restart_notification"] = False

display = cfg.setdefault("display", {})
display["tool_progress"] = "all"
display["busy_input_mode"] = "queue"
display.setdefault("platforms", {}).setdefault("discord", {})["tool_progress"] = "all"
cfg["group_sessions_per_user"] = False

soul = soul_path.read_text(encoding="utf-8").strip() if soul_path.is_file() else ""
# lore stub
stub_parts = []
repo = Path(os.environ["REPO"])
start = repo / "campaigns/nyc-mafia-dnd/lore-export/00-START-HERE.md"
gloss = repo / "campaigns/nyc-mafia-dnd/lore-export/08-glossary.md"
if start.is_file():
    stub_parts.append("## Injected lore stub\n" + start.read_text(encoding="utf-8")[:3500])
if gloss.is_file():
    stub_parts.append("## Glossary head\n" + gloss.read_text(encoding="utf-8")[:2000])
lore_stub = "\n\n".join(stub_parts)
prompt_body = soul
if lore_stub:
    prompt_body = soul + "\n\n---\n# Context inject\n" + lore_stub
prompt_path = Path(os.environ["HUNTER"]) / "nyc-discord-qa-prompt.txt"
if soul:
    prompt_path.write_text(prompt_body + "\n", encoding="utf-8")
    prompt_path.chmod(0o600)
    (Path(os.environ["HUNTER"]) / "SOUL.md").write_text(soul + "\n", encoding="utf-8")

prompts = discord.get("channel_prompts") or {}
if not isinstance(prompts, dict):
    prompts = {}
# Drop prompts for excluded NYC channels
for cid in list(prompts.keys()):
    if str(cid) in nyc_exclude:
        prompts.pop(cid, None)
    # Drop old full-category prompts that are no longer listen
    if str(cid) in all_nyc_category and str(cid) not in set(nyc_listen):
        prompts.pop(cid, None)
for cid in nyc_listen:
    if soul:
        prompts[str(cid)] = prompt_body
discord["channel_prompts"] = prompts

cfg_path.write_text(
    yaml.safe_dump(cfg, default_flow_style=False, sort_keys=False, allow_unicode=True),
    encoding="utf-8",
)

print("=== Pepper Quill scope ===")
print(f"tropic_kept={len(tropic_free)} nyc_listen={len(nyc_listen)} excluded={sorted(nyc_exclude)}")
print(f"allowed_total={len(union)}")
print("NYC listen ids:", ",".join(nyc_listen))
print("require_mention=true tool_progress=all gspu=false grn=false")
# Prove excludes absent
bad = [c for c in nyc_exclude if c in union]
print("exclude_in_allowed=", bad if bad else "none (ok)")
PY

echo "OK — scope written. Idle reload if allowlist not live yet:"
echo "  systemctl --user restart hermes-gateway-hunter-reckoning"
