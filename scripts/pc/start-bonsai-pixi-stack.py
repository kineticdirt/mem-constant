#!/usr/bin/env python3
"""Start ObsidianWriterStack: Prism Bonsai gateway (:8000) + unified Pixi RP (:8767)."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

OWS = Path(__file__).resolve().parents[2].parent / "ObsidianWriterStack"
if not OWS.is_dir():
    OWS = Path(r"C:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\ObsidianWriterStack")

STACK = OWS / "scripts" / "start_local_full_stack.py"
CHAT_PORT = 8767


def main() -> int:
    if not STACK.is_file():
        print(f"ERROR: missing {STACK}", file=sys.stderr)
        return 2
    # Tailnet access from potato/laptop (same policy as Bonsai :8000 on 0.0.0.0).
    import os

    os.environ.setdefault("CHAT_UI_HOST", "0.0.0.0")
    os.environ.setdefault("WRITER_BOT_URL", f"http://127.0.0.1:{CHAT_PORT}/writer")
    cmd = [
        sys.executable,
        str(STACK),
        "--skip-gateway",
        "--",
        "--chat-port",
        str(CHAT_PORT),
    ]
    print(
        f"Starting Pixi stack → http://0.0.0.0:{CHAT_PORT} (tailnet: desktop-igqesd4:{CHAT_PORT}; inference :8000)",
        file=sys.stderr,
    )
    return subprocess.call(cmd, cwd=str(OWS))


if __name__ == "__main__":
    raise SystemExit(main())
