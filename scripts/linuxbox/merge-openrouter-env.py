#!/usr/bin/env python3
"""Merge OPENROUTER_API_KEY from a one-line file into ~/.hermes/.env."""
from pathlib import Path
import sys

key_file = Path(sys.argv[1])
env_path = Path.home() / ".hermes/.env"
key_line = key_file.read_text(encoding="utf-8").strip()
if not key_line.startswith("OPENROUTER_API_KEY="):
    raise SystemExit("key file must be OPENROUTER_API_KEY=...")

lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
out: list[str] = []
replaced = False
for line in lines:
    if line.startswith("OPENROUTER_API_KEY=") or line.startswith("# OPENROUTER_API_KEY"):
        if not replaced:
            out.append(key_line)
            replaced = True
        continue
    out.append(line)
if not replaced:
    out.append(key_line)
env_path.write_text("\n".join(out) + "\n", encoding="utf-8")
env_path.chmod(0o600)
print("ok: OPENROUTER_API_KEY written to", env_path)
