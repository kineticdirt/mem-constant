"""Pepper Quill — Cursor Auto primary for NYC Big Apples Discord Q&A.

Hermes gateway still owns Discord listen / allowlist / require_mention.
On NYC listen channels, this hook answers via ``cursor-agent-run.sh``
(``cursor:auto`` only) and skips the Hermes LLM. On Cursor failure,
returns allow so Hermes DeepSeek remains the fallback.

Reply/parent context must already be on the MessageEvent (adapter patch
fetches unresolved references + author). This plugin also re-encodes a
Discord meta block into the Cursor prompt.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional, Set

logger = logging.getLogger(__name__)

# Big Apples listen set (OOC/roll/lore/dm-screen) — exclude art/characters-ba
NYC_LISTEN: Set[str] = {
    "1528215752576995580",  # general-ooc-ba
    "1533280510527406131",  # general
    "1528225899227512902",  # rolly-poley
    "1535816868785426433",  # lore-dump
    "1528216296779415683",  # campaign-discussion-lore
    "1528216246540173313",  # dm-screen
}

OWNER_ID = "265909664590331915"
REAL_HOME = Path(os.path.expanduser("~")).resolve()
# Hermes profile home may differ from passwd home
try:
    import pwd

    REAL_HOME = Path(pwd.getpwuid(os.getuid()).pw_dir)
except Exception:
    pass

REPO = Path(os.environ.get("AGENT_DUMP") or (REAL_HOME / "agent-dump"))
CURSOR_RUN = REPO / "scripts" / "linuxbox" / "cursor-agent-run.sh"
SOUL = REPO / "campaigns" / "nyc-mafia-dnd" / "SOUL-discord-qa.md"
TIMEOUT = int(os.environ.get("PEPPER_CURSOR_TIMEOUT_SEC", "240"))

sys.path.insert(0, str(REPO / "scripts" / "linuxbox"))
from discord_token import _discord_token  # noqa: E402  # after REPO path seed


def _discord_post(channel_id: str, content: str, reply_to: Optional[str] = None) -> None:
    try:
        tok = _discord_token()
    except SystemExit as exc:
        raise RuntimeError(str(exc)) from exc
    body: Dict[str, Any] = {"content": content[:1900]}
    if reply_to:
        body["message_reference"] = {"message_id": str(reply_to)}
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"https://discord.com/api/v10/channels/{channel_id}/messages",
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bot {tok}",
            "Content-Type": "application/json",
            "User-Agent": "pepper-quill-cursor (agent-dump)",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        if resp.status not in (200, 201):
            raise RuntimeError(f"discord post {resp.status}")


def _encode_context(event: Any) -> str:
    source = event.source
    bits = [
        f"platform={getattr(source.platform, 'value', source.platform)}",
        f"channel_id={source.chat_id}",
        f"author={source.user_name} ({source.user_id})",
        f"chat_type={getattr(source, 'chat_type', '')}",
        f"message_id={getattr(event, 'message_id', '')}",
    ]
    if getattr(event, "reply_to_message_id", None):
        bits.append(f"reply_to_message_id={event.reply_to_message_id}")
    if getattr(event, "reply_to_text", None):
        bits.append(f"reply_to_text={event.reply_to_text[:2000]}")
    # channel_context already has [Discord meta] from adapter when patched
    ctx = (getattr(event, "channel_context", None) or "").strip()
    user = (event.text or "").strip()
    soul = SOUL.read_text(encoding="utf-8") if SOUL.is_file() else ""
    parts = [
        "You are Pepper Quill answering ONE Discord message for NYC Big Apples.",
        "OUTPUT RULES: Reply with Discord-ready plain text ONLY. No tools. No file edits. No markdown fences. No STE lint dump.",
        "Cursor Auto is the primary responder. Be concise; OOC/IRL → real-world answer; do not invent campaign lore for car/IRL asks.",
        "If Discord reply parent is present, that is the associate's question — answer IT when asked.",
        "",
        "## SOUL",
        soul[:12000],
        "",
        "## Discord encoded context",
        "\n".join(bits),
        "",
    ]
    if ctx:
        parts += ["## Channel / Discord meta", ctx[:4000], ""]
    parts += ["## User message", user, "", "Final answer (plain text only):"]
    return "\n".join(parts)


def _run_cursor(prompt: str) -> Optional[str]:
    if not CURSOR_RUN.is_file():
        logger.error("pepper-quill-cursor: missing %s", CURSOR_RUN)
        return None
    env = os.environ.copy()
    env["CURSOR_SDK_AUTO_ONLY"] = "1"
    env["CURSOR_VARIANT"] = "auto"
    env["HOME"] = str(REAL_HOME)
    try:
        proc = subprocess.run(
            ["bash", str(CURSOR_RUN)],
            input=prompt,
            text=True,
            capture_output=True,
            timeout=TIMEOUT,
            env=env,
            cwd=str(REPO),
        )
    except subprocess.TimeoutExpired:
        logger.warning("pepper-quill-cursor: Cursor timed out (%ss)", TIMEOUT)
        return None
    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()
    if proc.returncode != 0:
        logger.warning("pepper-quill-cursor: Cursor exit %s stderr=%s", proc.returncode, err[-400:])
        return None
    # Strip common wrapper noise; keep last substantial block
    if not out:
        logger.warning("pepper-quill-cursor: empty Cursor stdout")
        return None
    # Drop leading STE/goal inject echoes if any — take full stdout as reply
    reply = out.strip()
    if len(reply) > 1900:
        reply = reply[:1890] + "…"
    return reply


def _on_pre_gateway_dispatch(event=None, gateway=None, session_store=None, **kwargs):
    if os.environ.get("PEPPER_CURSOR_PRIMARY", "1").strip().lower() in {"0", "false", "no", "off"}:
        return None
    if event is None:
        return None
    source = getattr(event, "source", None)
    if source is None:
        return None
    platform = getattr(source.platform, "value", None) or str(getattr(source, "platform", ""))
    if platform != "discord":
        return None
    chat_id = str(source.chat_id or "")
    if chat_id not in NYC_LISTEN:
        return None
    # Adapter already enforced require_mention for NYC; still skip empties
    text = (getattr(event, "text", None) or "").strip()
    if not text and not getattr(event, "reply_to_text", None):
        return None

    prompt = _encode_context(event)
    logger.info(
        "pepper-quill-cursor: Cursor Auto primary chat=%s user=%s reply_parent=%s",
        chat_id,
        source.user_id,
        bool(getattr(event, "reply_to_text", None)),
    )
    reply = _run_cursor(prompt)
    if not reply:
        # Fallback: enrich text so Hermes DeepSeek still sees parent
        enriched = text
        if getattr(event, "reply_to_text", None):
            enriched = (
                "[Discord reply parent — ANSWER THIS if asked to answer associate]\n"
                f"{event.reply_to_text[:2000]}\n"
                "[/Discord reply parent]\n\n"
                f"{text}"
            )
        logger.info("pepper-quill-cursor: Cursor failed — Hermes DeepSeek fallback")
        return {"action": "rewrite", "text": enriched}

    try:
        _discord_post(chat_id, reply, reply_to=getattr(event, "message_id", None))
    except Exception as exc:
        logger.warning("pepper-quill-cursor: Discord post failed: %s — Hermes fallback", exc)
        return {"action": "rewrite", "text": text}

    return {"action": "skip", "reason": "pepper-quill-cursor Auto answered"}


def register(ctx) -> None:
    ctx.register_hook("pre_gateway_dispatch", _on_pre_gateway_dispatch)
    logger.info("pepper-quill-cursor: registered (Cursor Auto primary for NYC listen)")
