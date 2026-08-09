#!/usr/bin/env bash
# Patch Hermes gateway so Discord "Gateway shutting down / restarting" notices
# go to the owner DM only — never guild/home channels.
#
# Re-run after Hermes upgrades (vendored tree under ~/.hermes/hermes-agent).
# Idempotent. Does NOT restart the gateway (run.py change needs one idle reload).
set -euo pipefail

HERMES_AGENT="${HERMES_AGENT:-$HOME/.hermes/hermes-agent}"
RUN_PY="${HERMES_AGENT}/gateway/run.py"
HUNTER_ENV="${HOME}/.hermes/profiles/hunter-reckoning/.env"
HUNTER_CFG="${HOME}/.hermes/profiles/hunter-reckoning/config.yaml"
OWNER_ID="${DISCORD_OPS_OWNER_ID:-265909664590331915}"
export HERMES_AGENT RUN_PY HUNTER_ENV HUNTER_CFG OWNER_ID

if [[ ! -f "$RUN_PY" ]]; then
  echo "missing $RUN_PY" >&2
  exit 1
fi

python3 <<'PY'
from pathlib import Path
import datetime
import os
import yaml

owner = os.environ["OWNER_ID"]
env_path = Path(os.environ["HUNTER_ENV"])
run_path = Path(os.environ["RUN_PY"])
cfg_path = Path(os.environ["HUNTER_CFG"])
marker = "agent-dump: discord shutdown notify → owner DM only"

# --- .env owner target ---
keys = {"DISCORD_OPS_OWNER_ID", "GATEWAY_OPS_NOTIFY_USER"}
lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.is_file() else []
out = []
for ln in lines:
    if "=" in ln and not ln.strip().startswith("#"):
        if ln.split("=", 1)[0] in keys:
            continue
    out.append(ln)
out += [f"DISCORD_OPS_OWNER_ID={owner}", f"GATEWAY_OPS_NOTIFY_USER={owner}"]
env_path.write_text("\n".join(out) + "\n", encoding="utf-8")
env_path.chmod(0o600)
print(f"env owner DM target={owner}")

# --- config: suppress stock discord restart/home spam ---
cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
discord = cfg.setdefault("discord", {})
discord["gateway_restart_notification"] = False
plats = cfg.setdefault("platforms", {})
if isinstance(plats, dict):
    dplat = plats.setdefault("discord", {})
    if isinstance(dplat, dict):
        dplat["gateway_restart_notification"] = False
cfg_path.write_text(
    yaml.safe_dump(cfg, default_flow_style=False, sort_keys=False, allow_unicode=True),
    encoding="utf-8",
)
print("discord.gateway_restart_notification=false")

# --- patch run.py ---
text = run_path.read_text(encoding="utf-8")
if marker in text:
    print("run.py patch already present")
else:
    needle = (
        '        msg = f"⚠️ Gateway {action} — {hint}"\n'
        "\n"
        "        notified: set[tuple[str, str, Optional[str]]] = set()\n"
    )
    inject = f'''        msg = f"⚠️ Gateway {{action}} — {{hint}}"

        # {marker}
        # Discord: never post shutdown/restart notices to guild/home channels.
        # DM the ops owner only (DISCORD_OPS_OWNER_ID / GATEWAY_OPS_NOTIFY_USER).
        try:
            import os as _os
            _owner = (
                _os.environ.get("DISCORD_OPS_OWNER_ID")
                or _os.environ.get("GATEWAY_OPS_NOTIFY_USER")
                or ""
            ).strip()
            _discord = None
            try:
                _discord = Platform.DISCORD
            except Exception:
                _discord = None
            if _owner and _discord is not None:
                _adapter = self.adapters.get(_discord)
                if _adapter is not None:
                    try:
                        _dm = await _adapter.send(str(_owner), msg)
                        if _dm is None or getattr(_dm, "success", True) is not False:
                            logger.info(
                                "Sent shutdown notification to Discord owner DM %s (guild suppressed)",
                                _owner,
                            )
                        else:
                            logger.warning(
                                "Owner DM shutdown notify failed: %s",
                                getattr(_dm, "error", "success=False"),
                            )
                    except Exception as _e:
                        logger.warning("Owner DM shutdown notify error: %s", _e)
                self._agent_dump_discord_shutdown_dm_done = True
        except Exception as _e:
            logger.debug("agent-dump shutdown DM redirect skipped: %s", _e)

        notified: set[tuple[str, str, Optional[str]]] = set()
'''
    if needle not in text:
        raise SystemExit("needle not found in gateway/run.py — Hermes layout changed")
    bak = run_path.with_suffix(
        f".py.bak-shutdown-dm-{datetime.datetime.now().strftime('%Y%m%d-%H%M%S')}"
    )
    bak.write_text(text, encoding="utf-8")
    text2 = text.replace(needle, inject, 1)

    old_active = (
        "                platform = Platform(platform_str)\n"
        "                adapter = self.adapters.get(platform)\n"
        "                if not adapter:\n"
        "                    continue\n"
        "\n"
        "                platform_cfg = self.config.platforms.get(platform)\n"
        "                if platform_cfg is not None and not platform_cfg.gateway_restart_notification:\n"
    )
    new_active = (
        "                platform = Platform(platform_str)\n"
        "                adapter = self.adapters.get(platform)\n"
        "                if not adapter:\n"
        "                    continue\n"
        "\n"
        "                # agent-dump: discord shutdown → owner DM only\n"
        '                if platform_str == "discord" and getattr(self, "_agent_dump_discord_shutdown_dm_done", False):\n'
        "                    continue\n"
        "\n"
        "                platform_cfg = self.config.platforms.get(platform)\n"
        "                if platform_cfg is not None and not platform_cfg.gateway_restart_notification:\n"
    )
    if old_active not in text2:
        raise SystemExit("active-session skip needle missing")
    text2 = text2.replace(old_active, new_active, 1)

    old_home = (
        "        for platform, adapter in list(self.adapters.items()):\n"
        "            home = self.config.get_home_channel(platform)\n"
        "            if not home or not home.chat_id:\n"
        "                continue\n"
        "\n"
        "            platform_cfg = self.config.platforms.get(platform)\n"
        "            if platform_cfg is not None and not platform_cfg.gateway_restart_notification:\n"
    )
    new_home = (
        "        for platform, adapter in list(self.adapters.items()):\n"
        "            home = self.config.get_home_channel(platform)\n"
        "            if not home or not home.chat_id:\n"
        "                continue\n"
        "\n"
        "            # agent-dump: discord shutdown → owner DM only (skip home channel spam)\n"
        '            if platform.value == "discord" and getattr(self, "_agent_dump_discord_shutdown_dm_done", False):\n'
        "                continue\n"
        "\n"
        "            platform_cfg = self.config.platforms.get(platform)\n"
        "            if platform_cfg is not None and not platform_cfg.gateway_restart_notification:\n"
    )
    if old_home not in text2:
        raise SystemExit("home-channel skip needle missing")
    text2 = text2.replace(old_home, new_home, 1)
    run_path.write_text(text2, encoding="utf-8")
    print(f"patched {run_path}")
    print(f"backup {bak}")

# Verify marker + suppress flag
assert marker in run_path.read_text(encoding="utf-8")
cfg2 = yaml.safe_load(cfg_path.read_text(encoding="utf-8"))
assert cfg2.get("discord", {}).get("gateway_restart_notification") is False
print("VERIFY ok: owner-DM patch + gateway_restart_notification=false")
PY

echo "OK — shutdown notices → owner DM only."
echo "Idle reload required to load run.py patch:"
echo "  systemctl --user restart hermes-gateway-hunter-reckoning"
