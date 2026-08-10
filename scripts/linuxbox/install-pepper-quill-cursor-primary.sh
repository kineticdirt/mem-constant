#!/usr/bin/env bash
# Install Pepper Quill Cursor-primary plugin + Discord reply-context patches.
# Hermes listens; Cursor Auto answers NYC Big Apples @mentions; Hermes = fallback.
# Idempotent. Idle gateway reload required for adapter/plugin load.
set -euo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-$HOME/agent-dump}"
HERMES_AGENT="${HERMES_AGENT:-$HOME/.hermes/hermes-agent}"
HUNTER="${HOME}/.hermes/profiles/hunter-reckoning"
PLUGIN_SRC="${REPO}/scripts/linuxbox/pepper-quill-cursor-plugin"
PLUGIN_DST="${HUNTER}/plugins/pepper-quill-cursor"
ADAPTER="${HERMES_AGENT}/plugins/platforms/discord/adapter.py"
RUN_PY="${HERMES_AGENT}/gateway/run.py"
OWNER_ID="265909664590331915"
TS="$(date +%Y%m%d-%H%M%S)"

mkdir -p "${HUNTER}/plugins"
rm -rf "${PLUGIN_DST}"
cp -a "${PLUGIN_SRC}" "${PLUGIN_DST}"
# CRLF: see scripts/linuxbox/README.md (shared note)
find "${PLUGIN_DST}" -type f \( -name '*.py' -o -name '*.yaml' -o -name '*.md' -o -name '*.sh' \) -exec sed -i 's/\r$//' {} +
chmod +x "${PLUGIN_DST}"/*.sh 2>/dev/null || true
echo "installed plugin → ${PLUGIN_DST}"

export ADAPTER RUN_PY OWNER_ID TS REPO HUNTER
python3 <<'PY'
from pathlib import Path
import os
import re

adapter_path = Path(os.environ["ADAPTER"])
run_path = Path(os.environ["RUN_PY"])
ts = os.environ["TS"]
marker = "agent-dump: pepper reply-context encode"

# --- Discord adapter: fetch unresolved reply + author ---
text = adapter_path.read_text(encoding="utf-8")
if marker not in text:
    old = '''        reply_to_id = None
        reply_to_text = None
        if message.reference:
            reply_to_id = str(message.reference.message_id)
            if message.reference.resolved:
                reply_to_text = getattr(message.reference.resolved, "content", None) or None

        event = MessageEvent(
            text=event_text,
            message_type=msg_type,
            source=source,
            raw_message=message,
            message_id=str(message.id),
            media_urls=media_urls,
            media_types=media_types,
            reply_to_message_id=reply_to_id,
            reply_to_text=reply_to_text,
'''
    new = f'''        reply_to_id = None
        reply_to_text = None
        # {marker}
        if message.reference:
            reply_to_id = str(message.reference.message_id)
            _resolved = message.reference.resolved
            if _resolved is None and message.reference.message_id:
                try:
                    _resolved = await message.channel.fetch_message(int(message.reference.message_id))
                except Exception as _fetch_exc:
                    logger.debug("[%s] reply fetch failed: %s", self.name, _fetch_exc)
                    _resolved = None
            if _resolved is not None:
                _r_author = getattr(_resolved, "author", None)
                _r_name = (
                    getattr(_r_author, "display_name", None)
                    or getattr(_r_author, "global_name", None)
                    or getattr(_r_author, "name", None)
                    or "unknown"
                )
                _r_uid = str(getattr(_r_author, "id", "") or "")
                _r_body = (getattr(_resolved, "content", None) or "").strip()
                reply_to_text = f"{{_r_name}} ({{_r_uid}}): {{_r_body}}" if _r_body else f"{{_r_name}} ({{_r_uid}}): (no text)"

        # Encode Discord-specific metadata so reply/associate asks cannot lose parent context
        try:
            _meta_bits = []
            _meta_bits.append(f"channel_id={{getattr(message.channel, 'id', '')}}")
            _meta_bits.append(f"channel_name={{getattr(message.channel, 'name', '') or getattr(getattr(message.channel, 'parent', None), 'name', '') or ''}}")
            _g = getattr(message.guild, "id", None) if getattr(message, "guild", None) else None
            if _g:
                _meta_bits.append(f"guild_id={{_g}}")
            _meta_bits.append(f"author={{getattr(message.author, 'display_name', None) or getattr(message.author, 'name', '')}} ({{message.author.id}})")
            if message.mentions:
                _ms = ", ".join(
                    f"{{getattr(u, 'display_name', None) or u.name}} ({{u.id}})" for u in message.mentions[:12]
                )
                _meta_bits.append(f"mentions={{_ms}}")
            if reply_to_id:
                _meta_bits.append(f"reply_to_message_id={{reply_to_id}}")
            if reply_to_text:
                _meta_bits.append(f"reply_to={{reply_to_text[:1500]}}")
            if _g and getattr(message.channel, "id", None) and getattr(message, "id", None):
                _meta_bits.append(
                    f"message_link=https://discord.com/channels/{{_g}}/{{message.channel.id}}/{{message.id}}"
                )
            _meta_block = "[Discord meta]\\n" + "\\n".join(_meta_bits) + "\\n[/Discord meta]"
            if _channel_context:
                _channel_context = _meta_block + "\\n\\n" + _channel_context
            else:
                _channel_context = _meta_block
        except Exception as _meta_exc:
            logger.debug("[%s] discord meta encode failed: %s", self.name, _meta_exc)

        event = MessageEvent(
            text=event_text,
            message_type=msg_type,
            source=source,
            raw_message=message,
            message_id=str(message.id),
            media_urls=media_urls,
            media_types=media_types,
            reply_to_message_id=reply_to_id,
            reply_to_text=reply_to_text,
'''
    if old not in text:
        raise SystemExit("adapter reply needle missing — Hermes Discord adapter changed")
    bak = adapter_path.with_suffix(f".py.bak-replyctx-{ts}")
    bak.write_text(text, encoding="utf-8")
    adapter_path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"patched adapter reply-context → {bak.name}")
else:
    print("adapter reply-context already present")

# --- run.py: longer reply snippet ---
rtext = run_path.read_text(encoding="utf-8")
if "reply_snippet = event.reply_to_text[:2000]" not in rtext:
    if "reply_snippet = event.reply_to_text[:500]" in rtext:
        bak = run_path.with_suffix(f".py.bak-replylen-{ts}")
        bak.write_text(rtext, encoding="utf-8")
        rtext = rtext.replace(
            "reply_snippet = event.reply_to_text[:500]",
            "reply_snippet = event.reply_to_text[:2000]  # agent-dump: keep associate Q body",
            1,
        )
        # richer prefix
        rtext = rtext.replace(
            'message_text = f\'[Replying to: "{reply_snippet}"]\\n\\n{message_text}\'',
            'message_text = (\n'
            '                f\'[Discord reply parent — ANSWER THIS if the user asks to answer their associate]\\n\'\n'
            '                f\'{reply_snippet}\\n\'\n'
            '                f\'[/Discord reply parent]\\n\\n{message_text}\'\n'
            '            )',
            1,
        )
        run_path.write_text(rtext, encoding="utf-8")
        print(f"patched run.py reply inject → {bak.name}")
    else:
        print("WARN: reply_snippet needle missing")
else:
    print("run.py reply inject already long")

# Enable plugin in hunter config if there is a plugins list
import yaml
cfg_path = Path(os.environ["HUNTER"]) / "config.yaml"
cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
plugins = cfg.setdefault("plugins", {})
if isinstance(plugins, dict):
    enabled = plugins.setdefault("enabled", [])
    if isinstance(enabled, list) and "pepper-quill-cursor" not in enabled:
        enabled.append("pepper-quill-cursor")
elif isinstance(plugins, list) and "pepper-quill-cursor" not in plugins:
    plugins.append("pepper-quill-cursor")
    cfg["plugins"] = plugins
cfg_path.write_text(yaml.safe_dump(cfg, default_flow_style=False, sort_keys=False, allow_unicode=True), encoding="utf-8")
print("config plugins note written")
PY

# Ensure DISCORD_OPS_OWNER_ID present
grep -q '^DISCORD_OPS_OWNER_ID=' "${HUNTER}/.env" || echo "DISCORD_OPS_OWNER_ID=${OWNER_ID}" >> "${HUNTER}/.env"
grep -q '^PEPPER_CURSOR_PRIMARY=' "${HUNTER}/.env" || echo "PEPPER_CURSOR_PRIMARY=1" >> "${HUNTER}/.env"

# Sync SOUL into hunter profile copies (if present)
SOUL_SRC="${REPO}/campaigns/nyc-mafia-dnd/SOUL-discord-qa.md"
if [[ -f "${SOUL_SRC}" ]]; then
  cp -a "${SOUL_SRC}" "${HUNTER}/SOUL.md" 2>/dev/null || true
  mkdir -p "${HUNTER}/channel_prompts"
  for f in nyc-discord-qa-prompt.txt; do
    cp -a "${SOUL_SRC}" "${HUNTER}/${f}" 2>/dev/null || true
  done
  echo "synced SOUL → hunter profile"
fi

echo "OK — Cursor-primary plugin + reply-context patches installed."
echo "Idle reload: systemctl --user restart hermes-gateway-hunter-reckoning"
echo "Verify log: pepper-quill-cursor / Cursor Auto / Discord meta"
echo "Dual-lane doc: ${REPO}/campaigns/nyc-mafia-dnd/reports/pepper-quill-discord-dual-lane.md"
