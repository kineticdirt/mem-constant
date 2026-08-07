#!/usr/bin/env python3
"""One-shot Cursor agent via the official Python SDK (cursor-sdk).

Linuxbox / potato Hub lane only — never think/sync crons.
Policy: **Cursor Auto only** (`ModelSelection(id="default")`).
No paid-model fallbacks (no composer / Claude / GPT pin).
Does not touch the PC Cursor IDE — this script is the potato wrapper only.

Auth: CURSOR_API_KEY in env or ~/.cursor-agent.env.
"""
from __future__ import annotations

import argparse
import os
import pwd
import sys
from pathlib import Path


def _real_home() -> Path:
    """Passwd home — Hermes `-p think` overlays $HOME; API key lives under real home."""
    try:
        return Path(pwd.getpwuid(os.getuid()).pw_dir)
    except Exception:
        return Path.home()


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def _auto_model():
    """Cursor Auto only — account catalog id is `default` (not Router auto-smart)."""
    from cursor_sdk import ModelSelection

    return ModelSelection(id="default")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run Cursor agent via Python SDK (Auto only on potato)"
    )
    parser.add_argument("prompt", nargs="?", default="", help="Prompt text")
    parser.add_argument(
        "--cwd",
        default=os.environ.get("AGENT_DUMP") or str(Path.home() / "agent-dump"),
        help="Workspace root",
    )
    parser.add_argument(
        "--model",
        default="auto",
        help="Ignored except for logging — potato policy forces Cursor Auto",
    )
    parser.add_argument(
        "--runtime",
        choices=("local", "cloud"),
        default=os.environ.get("CURSOR_SDK_RUNTIME", "local"),
        help="SDK runtime (default local against --cwd)",
    )
    parser.add_argument(
        "--cloud-repo",
        default=os.environ.get(
            "CURSOR_SDK_CLOUD_REPO", "https://github.com/kineticdirt/Linuxbox"
        ),
        help="Cloud runtime repo URL",
    )
    args = parser.parse_args()

    env_file = Path(
        os.environ.get("CURSOR_AGENT_ENV") or (_real_home() / ".cursor-agent.env")
    )
    _load_env_file(env_file)

    prompt = (args.prompt or "").strip()
    if not prompt and not sys.stdin.isatty():
        prompt = sys.stdin.read().strip()
    if not prompt:
        print("ERROR: empty prompt (pass as arg or stdin)", file=sys.stderr)
        return 2

    api_key = os.environ.get("CURSOR_API_KEY", "").strip()
    if not api_key:
        print(
            f"ERROR: No CURSOR_API_KEY in {env_file} or env. "
            "Paste API key from Cursor Dashboard → API Keys.",
            file=sys.stderr,
        )
        return 125

    try:
        from cursor_sdk import (
            Agent,
            AgentOptions,
            CloudAgentOptions,
            CloudRepository,
            LocalAgentOptions,
        )
    except ImportError:
        print(
            "ERROR: cursor-sdk not installed. On potato: "
            "use ~/venvs/cursor-sdk (uv Python 3.12).",
            file=sys.stderr,
        )
        return 127

    # Potato policy: Auto only. Ignore requested paid pins.
    requested = (args.model or "auto").strip().lower()
    if requested not in ("auto", "default", ""):
        print(
            f"[cursor_sdk_run] ignoring model={requested!r}; "
            "potato lane is Cursor Auto only (no paid pins).",
            file=sys.stderr,
        )
    model = _auto_model()
    cwd = str(Path(args.cwd).resolve())

    header = (
        "You are the linuxbox Cursor SDK agent for this workspace.\n"
        "Use repo skills (.cursor/skills/), AGENTS.md, ponytail YAGNI.\n"
        "Smallest correct diff; one concrete verify step.\n"
        f"Lane: cursor:auto (Cursor Auto / default only) via Python SDK ({args.runtime}).\n\n"
    )
    full_prompt = header + prompt

    try:
        if args.runtime == "cloud":
            options = AgentOptions(
                model=model,
                api_key=api_key,
                cloud=CloudAgentOptions(
                    repos=[
                        CloudRepository(url=args.cloud_repo, starting_ref="main")
                    ],
                ),
            )
        else:
            options = AgentOptions(
                model=model,
                api_key=api_key,
                local=LocalAgentOptions(
                    cwd=cwd,
                    setting_sources=["project", "user"],
                ),
            )

        # No paid fallback — fail loud if Auto unavailable.
        result = Agent.prompt(full_prompt, options)

        status = getattr(result, "status", None) or "finished"
        text = (getattr(result, "result", None) or "").strip()
        if status not in ("finished", None) and not text:
            print(f"ERROR: Cursor SDK run status={status}", file=sys.stderr)
            return 1
        if not text:
            print("ERROR: Cursor SDK returned empty output.", file=sys.stderr)
            return 1
        print(text)
        return 0
    except Exception as err:
        name = type(err).__name__
        msg = str(err)
        if "Authentication" in name or "auth" in msg.lower() or "api key" in msg.lower():
            print(f"ERROR: Cursor SDK auth failed — {msg}", file=sys.stderr)
            return 125
        print(f"ERROR: Cursor SDK failed ({name}): {msg}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
