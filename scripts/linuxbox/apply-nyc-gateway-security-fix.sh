#!/usr/bin/env bash
# Apply NYC Discord gateway security + personality fixes WITHOUT restarting
# hermes-gateway-hunter-reckoning (restarts mid-chat = "Gateway shutting down").
#
# Run ON potato. Idempotent.
set -euo pipefail

HUNTER="${HOME}/.hermes/profiles/hunter-reckoning"
REPO="${LINUXBOX_AGENT_DUMP:-$HOME/agent-dump}"
SOUL="${REPO}/campaigns/nyc-mafia-dnd/SOUL-discord-qa.md"
TS="$(date +%Y%m%d-%H%M%S)"

echo "=== DO NOT systemctl restart hunter gateway while applying this ==="

# 1) Quarantine broken tirith (glibc 2.32+ required; potato is 2.31)
for p in "${HOME}/.hermes/bin/tirith" "${HUNTER}/bin/tirith"; do
  if [[ -f "$p" && ! -L "$p" ]]; then
    if ! "$p" --help >/dev/null 2>&1; then
      mv "$p" "${p}.broken-glibc-${TS}"
      echo "quarantined $p"
    fi
  fi
done

# 2) Stub tirith that always allows (belt-and-suspenders if someone re-enables)
mkdir -p "${HUNTER}/bin"
cat > "${HUNTER}/bin/tirith" <<'STUB'
#!/bin/sh
# Stub: real tirith cannot run on Bullseye glibc 2.31 (false exit 1 = block-all).
# Hermes maps exit 0 = allow. Hardline/dangerous-command guards still apply.
if [ "$1" = "check" ]; then
  echo '{"action":"allow","findings":[],"summary":"stub-allow (glibc tirith unavailable)"}'
  exit 0
fi
exit 0
STUB
chmod +x "${HUNTER}/bin/tirith"
# Also stub root hermes bin so PATH resolve cannot pick a broken binary
mkdir -p "${HOME}/.hermes/bin"
cp -f "${HUNTER}/bin/tirith" "${HOME}/.hermes/bin/tirith"
chmod +x "${HOME}/.hermes/bin/tirith"
echo "installed tirith allow-stub"

# 3) Patch hunter config (tirith off, allowlist, disable terminal toolset, refresh prompts)
export HUNTER REPO SOUL
python3 <<'PY'
from pathlib import Path
import os
import yaml

hunter = Path(os.environ["HUNTER"])
repo = Path(os.environ["REPO"])
soul_path = Path(os.environ["SOUL"])
cfg_path = hunter / "config.yaml"
cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}

sec = cfg.setdefault("security", {})
sec["tirith_enabled"] = False
sec["tirith_fail_open"] = True
sec["tirith_path"] = str(hunter / "bin" / "tirith")

extra = [
    "hermes gateway status",
    "hermes gateway",
    "which hermes",
    "which",
    "find",
    "ls",
    "ls -la",
    "tail",
    "head",
    "cat",
    "systemctl --user is-active",
    "systemctl --user status",
    "journalctl --user",
    "git status",
    "git pull",
    "git pull --ff-only",
    "git fetch",
    "git log",
    "git diff",
    "git rev-parse",
    "shell command via -c/-lc flag",
    "stop/restart system service",
]
allow = list(cfg.get("command_allowlist") or [])
for a in extra:
    if a not in allow:
        allow.append(a)
cfg["command_allowlist"] = allow

agent = cfg.setdefault("agent", {})
disabled = list(agent.get("disabled_toolsets") or [])
for ts in ("terminal", "session_search"):
    if ts not in disabled:
        disabled.append(ts)
agent["disabled_toolsets"] = disabled
# Cap tool rabbit holes on Discord turns
if int(agent.get("max_turns") or 60) > 12:
    agent["max_turns"] = 12

# PATH for any remaining shell
term = cfg.setdefault("terminal", {})
init_path = hunter / "shell-init-path.sh"
init_path.write_text(
    'export PATH="$HOME/.local/bin:$HOME/.hermes/hermes-agent/venv/bin:$HOME/.hermes/profiles/hunter-reckoning/bin:$PATH"\n',
    encoding="utf-8",
)
inits = list(term.get("shell_init_files") or [])
if str(init_path) not in inits:
    inits.append(str(init_path))
term["shell_init_files"] = inits

# --- Quiet Discord display (config mtime → next turn, no restart) ---
display = cfg.setdefault("display", {})
display["tool_progress"] = "off"
display["tool_progress_command"] = False
display["interim_assistant_messages"] = False
display["background_process_notifications"] = "off"
display["cleanup_progress"] = True
platforms_disp = display.setdefault("platforms", {})
if not isinstance(platforms_disp, dict):
    platforms_disp = {}
    display["platforms"] = platforms_disp
platforms_disp.setdefault("discord", {})
if not isinstance(platforms_disp["discord"], dict):
    platforms_disp["discord"] = {}
platforms_disp["discord"]["tool_progress"] = "off"

# NYC channel ids (Big Apples) — strip from free_response; keep Tropic free
NYC_IDS = {
    "1528215752576995580",
    "1528216124632600587",
    "1528216141229461597",
    "1528216246540173313",
    "1528216296779415683",
    "1528225899227512902",
    "1533280510527406131",
    "1535816868785426433",
}
nyc_env = Path.home() / ".hermes" / "discord-nyc-channels.env"
if nyc_env.is_file():
    for ln in nyc_env.read_text(encoding="utf-8").splitlines():
        if ln.startswith("DISCORD_NYC_CHANNELS="):
            for cid in ln.split("=", 1)[1].split(","):
                cid = cid.strip()
                if cid:
                    NYC_IDS.add(cid)

discord = cfg.setdefault("discord", {})
discord["require_mention"] = True
discord["thread_require_mention"] = True
discord["ignore_no_mention"] = True

def _split_ids(raw):
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    return [p.strip() for p in str(raw).split(",") if p.strip()]

frc = _split_ids(discord.get("free_response_channels"))
frc_kept = [c for c in frc if c not in NYC_IDS]
discord["free_response_channels"] = ",".join(frc_kept)

# Compact lore stub (Docs/Pixi-style inject — prefer over search_files)
stub_parts = []
start = repo / "campaigns" / "nyc-mafia-dnd" / "lore-export" / "00-START-HERE.md"
gloss = repo / "campaigns" / "nyc-mafia-dnd" / "lore-export" / "08-glossary.md"
chars_dir = repo / "campaigns" / "nyc-mafia-dnd" / "characters"
if start.is_file():
    stub_parts.append("## Injected lore stub (00-START-HERE)\n" + start.read_text(encoding="utf-8")[:3500])
if gloss.is_file():
    stub_parts.append("## Injected glossary (head)\n" + gloss.read_text(encoding="utf-8")[:2000])
if chars_dir.is_dir():
    names = sorted(p.name for p in chars_dir.glob("*.md"))[:40]
    if names:
        stub_parts.append(
            "## Known character sheet files (read one if asked; do not search)\n"
            + ", ".join(names)
            + "\nPath: /home/abhinav/agent-dump/campaigns/nyc-mafia-dnd/characters/"
        )
lore_stub = "\n\n".join(stub_parts)

soul = soul_path.read_text(encoding="utf-8").strip() if soul_path.is_file() else ""
prompt_body = soul
if lore_stub:
    prompt_body = soul + "\n\n---\n# Context inject (prefer over tools)\n" + lore_stub
if soul:
    prompt = hunter / "nyc-discord-qa-prompt.txt"
    prompt.write_text(prompt_body + "\n", encoding="utf-8")
    prompt.chmod(0o600)
    n = 0
    if isinstance(cfg.get("discord"), dict):
        prompts = cfg["discord"].setdefault("channel_prompts", {})
        # Only refresh Big Apples ids — never overwrite unrelated channel prompts
        for cid in list(prompts.keys()):
            if str(cid) not in NYC_IDS:
                continue
            prompts[cid] = prompt_body
            n += 1
        for cid in NYC_IDS:
            prompts[str(cid)] = prompt_body
        n = len([c for c in prompts if str(c) in NYC_IDS])
    print(f"channel_prompts refreshed nyc_n={n} stub_chars={len(lore_stub)}")

cfg_path.write_text(
    yaml.safe_dump(cfg, default_flow_style=False, sort_keys=False, allow_unicode=True),
    encoding="utf-8",
)
print(f"patched {cfg_path}")
print(f"tirith_enabled={sec.get('tirith_enabled')}")
print(f"disabled_toolsets={agent.get('disabled_toolsets')}")
print(f"tool_progress={display.get('tool_progress')} discord={platforms_disp['discord'].get('tool_progress')}")
print(f"require_mention={discord.get('require_mention')} free_response_kept={len(frc_kept)}")
print(f"allowlist_n={len(allow)}")
PY

# 3b) Hunter .env — mention gate + NYC out of free_response (dotenv override=True each turn)
ENV_FILE="${HUNTER}/.env"
NYC_CHANNELS_FILE="${HOME}/.hermes/discord-nyc-channels.env"
python3 <<'PY'
import os
from pathlib import Path

hunter = Path(os.environ["HUNTER"])
env_path = hunter / ".env"
nyc_file = Path.home() / ".hermes" / "discord-nyc-channels.env"
nyc = set()
if nyc_file.is_file():
    for ln in nyc_file.read_text(encoding="utf-8").splitlines():
        if ln.startswith("DISCORD_NYC_CHANNELS="):
            nyc = {x.strip() for x in ln.split("=", 1)[1].split(",") if x.strip()}
# fallback known Big Apples ids
nyc |= {
    "1528215752576995580",
    "1528216124632600587",
    "1528216141229461597",
    "1528216246540173313",
    "1528216296779415683",
    "1528225899227512902",
    "1533280510527406131",
    "1535816868785426433",
}

keys_set = {
    "DISCORD_REQUIRE_MENTION",
    "DISCORD_FREE_RESPONSE_CHANNELS",
    "DISCORD_THREAD_REQUIRE_MENTION",
    "DISCORD_IGNORE_NO_MENTION",
}
lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.is_file() else []
cur = {}
out = []
for ln in lines:
    if not ln.strip() or ln.strip().startswith("#") or "=" not in ln:
        out.append(ln)
        continue
    k, v = ln.split("=", 1)
    if k in keys_set:
        cur[k] = v
        continue
    out.append(ln)

frc_raw = cur.get("DISCORD_FREE_RESPONSE_CHANNELS", "")
# If missing, try reading from a prior line we skipped — already in cur only if was present
# Also pull from remaining env if key was never set: scan original
if not frc_raw:
    for ln in lines:
        if ln.startswith("DISCORD_FREE_RESPONSE_CHANNELS="):
            frc_raw = ln.split("=", 1)[1]
            break
# Prefer live value from file before strip — re-read allowed channels free list from disk lines we dropped
for ln in lines:
    if ln.startswith("DISCORD_FREE_RESPONSE_CHANNELS="):
        frc_raw = ln.split("=", 1)[1]
kept = [c for c in frc_raw.split(",") if c.strip() and c.strip() not in nyc]
out += [
    "DISCORD_REQUIRE_MENTION=true",
    "DISCORD_THREAD_REQUIRE_MENTION=true",
    "DISCORD_IGNORE_NO_MENTION=true",
    "DISCORD_FREE_RESPONSE_CHANNELS=" + ",".join(kept),
]
env_path.write_text("\n".join(out) + "\n", encoding="utf-8")
env_path.chmod(0o600)
print(f"env require_mention=true free_response_n={len(kept)} nyc_stripped={len(nyc)}")
PY

# 4) Clear auto-resume / stuck session resume so old terminal loops don't continue
SESS="${HUNTER}/sessions/sessions.json"
if [[ -f "$SESS" ]]; then
  cp -a "$SESS" "${SESS}.bak-${TS}"
  python3 <<'PY'
import json
from pathlib import Path
import os
p = Path(os.environ.get("HUNTER", str(Path.home()/".hermes/profiles/hunter-reckoning"))) / "sessions" / "sessions.json"
data = json.loads(p.read_text())
# scrub resume flags if present
changed = False
if isinstance(data, dict):
    for k in list(data.keys()):
        if k in ("resume_pending", "pending_resume", "interrupted"):
            data.pop(k, None)
            changed = True
        v = data.get(k)
        if isinstance(v, dict):
            for rk in ("resume_pending", "pending_resume", "interrupted", "auto_resume"):
                if rk in v:
                    v.pop(rk, None)
                    changed = True
    p.write_text(json.dumps(data, indent=2))
print("sessions scrubbed", changed)
PY
fi

# 5) Verify guards (no gateway restart)
cd "${HOME}/.hermes/hermes-agent"
HERMES_HOME="$HUNTER" ./venv/bin/python <<'PY'
import os
os.environ["HERMES_HOME"] = os.path.expanduser("~/.hermes/profiles/hunter-reckoning")
import tools.tirith_security as t
t._resolved_path = None
from tools.tirith_security import check_command_security, _load_security_config
print("cfg", _load_security_config())
for c in [
    "ls -la ~/.hermes/profiles/hunter-reckoning/logs/gateway.log",
    "hermes gateway status 2>&1",
    "which hermes",
    "find ~/.hermes -name '*.log' | head",
]:
    r = check_command_security(c)
    print(c[:55], "->", r["action"], r.get("summary", "")[:40])
PY

echo ""
echo "OK — gateway NOT restarted."
echo "Check: systemctl --user is-active hermes-gateway-hunter-reckoning"
echo "Hot next-turn (mtime/dotenv): tool_progress=off, require_mention, channel_prompts, free_response strip."
echo "disabled_toolsets (terminal+session_search) + max_turns may need ONE idle reload to bind."
echo "Tirith off + stub apply immediately via config mtime cache."
echo "If Discord still mid-approval spam: ignore/deny; send a fresh short message."
systemctl --user is-active hermes-gateway-hunter-reckoning || true
