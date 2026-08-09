#!/usr/bin/env bash
# Re-apply Pepper Quill Discord UX patches on potato after Hermes upgrades.
# - Shutdown/restart notices → owner DM only (never guild/home)
# - Reactions: ✅ while working, clear on complete (no stuck 👀)
# Idempotent. Does NOT restart (run.py/adapter need one idle reload).
set -euo pipefail

HERMES_AGENT="${HERMES_AGENT:-$HOME/.hermes/hermes-agent}"
RUN_PY="${HERMES_AGENT}/gateway/run.py"
ADAPTER="${HERMES_AGENT}/plugins/platforms/discord/adapter.py"
HUNTER_ENV="${HOME}/.hermes/profiles/hunter-reckoning/.env"
HUNTER_CFG="${HOME}/.hermes/profiles/hunter-reckoning/config.yaml"
OWNER_ID="${DISCORD_OPS_OWNER_ID:-265909664590331915}"
export HERMES_AGENT RUN_PY ADAPTER HUNTER_ENV HUNTER_CFG OWNER_ID

python3 <<'PY'
from pathlib import Path
import datetime
import os
import re
import yaml

owner = os.environ["OWNER_ID"]
run_path = Path(os.environ["RUN_PY"])
adapter_path = Path(os.environ["ADAPTER"])
env_path = Path(os.environ["HUNTER_ENV"])
cfg_path = Path(os.environ["HUNTER_CFG"])
ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")

# --- env ---
keys = {"DISCORD_OPS_OWNER_ID", "GATEWAY_OPS_NOTIFY_USER"}
lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.is_file() else []
out = []
for ln in lines:
    if "=" in ln and not ln.strip().startswith("#") and ln.split("=", 1)[0] in keys:
        continue
    out.append(ln)
out += [f"DISCORD_OPS_OWNER_ID={owner}", f"GATEWAY_OPS_NOTIFY_USER={owner}"]
env_path.write_text("\n".join(out) + "\n", encoding="utf-8")
env_path.chmod(0o600)

# --- config ---
cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
discord = cfg.setdefault("discord", {})
discord["gateway_restart_notification"] = False
discord["reactions"] = True
agent = cfg.setdefault("agent", {})
disabled = list(agent.get("disabled_toolsets") or [])
for ts_name in ("terminal", "session_search", "file"):
    if ts_name not in disabled:
        disabled.append(ts_name)
agent["disabled_toolsets"] = disabled
display = cfg.setdefault("display", {})
# Keep progress for useful tools; file searches disabled so no 🔍 search_files spam
display["tool_progress"] = "all"
display.setdefault("platforms", {}).setdefault("discord", {})["tool_progress"] = "all"
cfg_path.write_text(
    yaml.safe_dump(cfg, default_flow_style=False, sort_keys=False, allow_unicode=True),
    encoding="utf-8",
)
print("disabled_toolsets=", disabled)
print("gateway_restart_notification=false")

# --- harden shutdown notify in run.py ---
text = run_path.read_text(encoding="utf-8")
marker_v3 = "agent-dump: discord shutdown v3 owner-DM create_dm"
marker_v2 = "agent-dump: discord shutdown v2 owner-DM hard-skip"
# Upgrade v2→v3 in place when only the send path is wrong (user id ≠ channel id)
if marker_v2 in text and marker_v3 not in text:
    old_dm = '''            if _adapter is not None and _owner:
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
                    logger.warning("Owner DM shutdown notify error: %s", _e)'''
    new_dm = f'''            if _adapter is not None and _owner:
                try:
                    # {marker_v3}
                    # User id is NOT a channel id — open DM first (404 Unknown Channel otherwise)
                    _client = getattr(_adapter, "_client", None)
                    if _client is None:
                        raise RuntimeError("discord client not ready")
                    _user = await _client.fetch_user(int(_owner))
                    _dm_ch = await _user.create_dm()
                    await _dm_ch.send(msg)
                    logger.info(
                        "Sent shutdown notification to Discord owner DM %s (guild suppressed)",
                        _owner,
                    )
                except Exception as _e:
                    logger.warning("Owner DM shutdown notify error: %s", _e)'''
    if old_dm not in text:
        raise SystemExit("v2→v3 owner DM needle missing")
    bak = run_path.with_suffix(f".py.bak-shutdown-v3-{ts}")
    bak.write_text(text, encoding="utf-8")
    text = text.replace(old_dm, new_dm, 1)
    run_path.write_text(text, encoding="utf-8")
    print(f"upgraded shutdown v2→v3 create_dm → {bak.name}")
elif marker_v3 in text:
    print("shutdown v3 create_dm already present")

if marker_v2 not in text and marker_v3 not in text:
    # Replace entire method body start through notified loop with hard-skip version
    # Find method and replace from msg= through end of home-channel loop
    start = text.find("    async def _notify_active_sessions_of_shutdown(self) -> None:")
    if start < 0:
        raise SystemExit("method missing")
    end = text.find("    def _finalize_shutdown_agents(", start)
    if end < 0:
        raise SystemExit("finalize method missing")
    bak = run_path.with_suffix(f".py.bak-shutdown-v2-{ts}")
    bak.write_text(text, encoding="utf-8")
    new_method = f'''    async def _notify_active_sessions_of_shutdown(self) -> None:
        """Send shutdown/restart notifications.

        agent-dump Pepper Quill: Discord NEVER posts to guild/home channels.
        Owner DM only ({owner}). Other platforms keep stock behavior.
        """
        active = self._snapshot_running_agents()

        action = "restarting" if self._restart_requested else "shutting down"
        hint = (
            "Your current task will be interrupted. "
            "Send any message after restart and I'll try to resume where you left off."
            if self._restart_requested
            else "Your current task will be interrupted."
        )
        msg = f"⚠️ Gateway {{action}} — {{hint}}"

        # {marker_v2}
        # {marker_v3}
        try:
            import os as _os
            _owner = (
                _os.environ.get("DISCORD_OPS_OWNER_ID")
                or _os.environ.get("GATEWAY_OPS_NOTIFY_USER")
                or "{owner}"
            ).strip() or "{owner}"
            _discord = getattr(Platform, "DISCORD", None)
            _adapter = self.adapters.get(_discord) if _discord is not None else None
            if _adapter is not None and _owner:
                try:
                    # User id is NOT a channel id — open DM first
                    _client = getattr(_adapter, "_client", None)
                    if _client is None:
                        raise RuntimeError("discord client not ready")
                    _user = await _client.fetch_user(int(_owner))
                    _dm_ch = await _user.create_dm()
                    await _dm_ch.send(msg)
                    logger.info(
                        "Sent shutdown notification to Discord owner DM %s (guild suppressed)",
                        _owner,
                    )
                except Exception as _e:
                    logger.warning("Owner DM shutdown notify error: %s", _e)
        except Exception as _e:
            logger.debug("agent-dump shutdown DM redirect skipped: %s", _e)

        notified: set[tuple[str, str, Optional[str]]] = set()
        for session_key in active:
            source = None
            try:
                if getattr(self, "session_store", None) is not None:
                    self.session_store._ensure_loaded()
                    entry = self.session_store._entries.get(session_key)
                    source = getattr(entry, "origin", None) if entry else None
            except Exception as e:
                logger.debug(
                    "Failed to load session origin for shutdown notification %s: %s",
                    session_key,
                    e,
                )

            if source is None:
                source = self._get_cached_session_source(session_key)

            if source is not None:
                platform_str = source.platform.value
                chat_id = str(source.chat_id)
                thread_id = source.thread_id
            else:
                _parsed = _parse_session_key(session_key)
                if not _parsed:
                    continue
                platform_str = _parsed["platform"]
                chat_id = _parsed["chat_id"]
                thread_id = _parsed.get("thread_id")

            # Hard-skip Discord guild/active chats (owner DM already sent)
            if platform_str == "discord":
                continue

            dedup_key = (platform_str, chat_id, str(thread_id) if thread_id else None)
            if dedup_key in notified:
                continue

            try:
                platform = Platform(platform_str)
                adapter = self.adapters.get(platform)
                if not adapter:
                    continue

                platform_cfg = self.config.platforms.get(platform)
                if platform_cfg is not None and not platform_cfg.gateway_restart_notification:
                    logger.info(
                        "Shutdown notification suppressed for active session: %s has gateway_restart_notification=false",
                        platform_str,
                    )
                    continue

                metadata = {{"thread_id": thread_id}} if thread_id else None
                result = await adapter.send(chat_id, msg, metadata=metadata)
                if result is not None and getattr(result, "success", True) is False:
                    logger.debug(
                        "Failed to send shutdown notification to %s:%s: %s",
                        platform_str,
                        chat_id,
                        getattr(result, "error", "send returned success=False"),
                    )
                    continue

                notified.add(dedup_key)
                logger.info(
                    "Sent shutdown notification to active chat %s:%s",
                    platform_str, chat_id,
                )
            except Exception as e:
                logger.debug(
                    "Failed to send shutdown notification to %s:%s: %s",
                    platform_str, chat_id, e,
                )

        for platform, adapter in list(self.adapters.items()):
            # Hard-skip Discord home channel (public OOC spam)
            if platform.value == "discord":
                continue

            home = self.config.get_home_channel(platform)
            if not home or not home.chat_id:
                continue

            platform_cfg = self.config.platforms.get(platform)
            if platform_cfg is not None and not platform_cfg.gateway_restart_notification:
                logger.info(
                    "Shutdown notification suppressed for home channel: %s has gateway_restart_notification=false",
                    platform.value,
                )
                continue

            dedup_key = (platform.value, str(home.chat_id), str(home.thread_id) if home.thread_id else None)
            if dedup_key in notified:
                continue

            try:
                metadata = {{"thread_id": home.thread_id}} if home.thread_id else None
                if metadata:
                    result = await adapter.send(str(home.chat_id), msg, metadata=metadata)
                else:
                    result = await adapter.send(str(home.chat_id), msg)
                if result is not None and getattr(result, "success", True) is False:
                    logger.debug(
                        "Failed to send shutdown notification to home channel %s:%s: %s",
                        platform.value,
                        home.chat_id,
                        getattr(result, "error", "send returned success=False"),
                    )
                    continue

                notified.add(dedup_key)
                logger.info(
                    "Sent shutdown notification to home channel %s:%s",
                    platform.value,
                    home.chat_id,
                )
            except Exception as e:
                logger.debug(
                    "Failed to send shutdown notification to home channel %s:%s: %s",
                    platform.value,
                    home.chat_id,
                    e,
                )

'''
    text = text[:start] + new_method + text[end:]
    run_path.write_text(text, encoding="utf-8")
    print(f"patched shutdown v2+v3 → {run_path} (bak {bak.name})")
# else: already have v2 and/or v3 from earlier branch
# --- reactions: ✅ while working; clear on complete ---
react_marker = "agent-dump: pepper reactions ✅ temp"
adapter = adapter_path.read_text(encoding="utf-8")
if react_marker not in adapter:
    bak_a = adapter_path.with_suffix(f".py.bak-react-{ts}")
    bak_a.write_text(adapter, encoding="utf-8")
    old = '''    async def on_processing_start(self, event: MessageEvent) -> None:
        """Add an in-progress reaction for normal Discord message events."""
        if not self._reactions_enabled():
            return
        message = event.raw_message
        if hasattr(message, "add_reaction"):
            await self._add_reaction(message, "👀")

    async def on_processing_complete(self, event: MessageEvent, outcome: ProcessingOutcome) -> None:
        """Swap the in-progress reaction for a final success/failure reaction."""
        if not self._reactions_enabled():
            return
        message = event.raw_message
        if hasattr(message, "add_reaction"):
            await self._remove_reaction(message, "👀")
            if outcome == ProcessingOutcome.SUCCESS:
                await self._add_reaction(message, "✅")
            elif outcome == ProcessingOutcome.FAILURE:
                await self._add_reaction(message, "❌")
'''
    new = f'''    async def on_processing_start(self, event: MessageEvent) -> None:
        """Add a temporary ✅ ack while working ({react_marker})."""
        if not self._reactions_enabled():
            return
        message = event.raw_message
        if hasattr(message, "add_reaction"):
            # Prefer checkmark ack; never leave stuck 👀
            await self._add_reaction(message, "✅")

    async def on_processing_complete(self, event: MessageEvent, outcome: ProcessingOutcome) -> None:
        """Clear temporary reactions when the reply is posted."""
        if not self._reactions_enabled():
            return
        message = event.raw_message
        if hasattr(message, "add_reaction"):
            # Clear ack marks (and any leftover eyes from older builds)
            await self._remove_reaction(message, "✅")
            await self._remove_reaction(message, "👀")
            if outcome == ProcessingOutcome.FAILURE:
                await self._add_reaction(message, "❌")
'''
    if old not in adapter:
        # try replace if already partially patched
        if "await self._add_reaction(message, \"👀\")" in adapter:
            adapter2 = adapter.replace(
                'await self._add_reaction(message, "👀")',
                'await self._add_reaction(message, "✅")  # agent-dump pepper temp ack',
                1,
            )
            # finalize: remove checkmark path that leaves permanent ✅
            adapter2 = re.sub(
                r"await self\._remove_reaction\(message, \"👀\"\)\n"
                r"\s+if outcome == ProcessingOutcome\.SUCCESS:\n"
                r"\s+await self\._add_reaction\(message, \"✅\"\)\n"
                r"\s+elif outcome == ProcessingOutcome\.FAILURE:\n"
                r"\s+await self\._add_reaction\(message, \"❌\"\)",
                'await self._remove_reaction(message, "✅")\n'
                '            await self._remove_reaction(message, "👀")\n'
                "            if outcome == ProcessingOutcome.FAILURE:\n"
                '                await self._add_reaction(message, "❌")',
                adapter2,
                count=1,
            )
            if react_marker not in adapter2:
                adapter2 = adapter2.replace(
                    "Add an in-progress reaction for normal Discord message events.",
                    f"Add a temporary ✅ ack while working ({react_marker}).",
                    1,
                )
            adapter_path.write_text(adapter2, encoding="utf-8")
            print(f"patched reactions (fallback) → {adapter_path}")
        else:
            raise SystemExit("reaction needles missing — Hermes adapter changed")
    else:
        adapter_path.write_text(adapter.replace(old, new, 1), encoding="utf-8")
        print(f"patched reactions → {adapter_path} (bak {bak_a.name})")
else:
    print("reactions patch already present")

assert marker_v2 in run_path.read_text(encoding="utf-8") or "Hard-skip Discord" in run_path.read_text(encoding="utf-8")
print("VERIFY ok")
PY

echo "OK. Idle reload to load run.py + adapter patches:"
echo "  systemctl --user restart hermes-gateway-hunter-reckoning"
