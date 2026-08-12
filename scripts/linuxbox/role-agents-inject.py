#!/usr/bin/env python3
"""Compact role/project catalog block for think + Cursor harness inject."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def catalog_paths(repo: Path) -> list[Path]:
    return [
        repo / "agents" / "meta-harness" / "role-agents" / "catalog.json",
        repo / ".mem-constant" / "role-agents" / "catalog.json",
    ]


def load_catalog(repo: Path) -> dict | None:
    for p in catalog_paths(repo):
        if p.is_file():
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
    return None


def build_block(cat: dict) -> str:
    roles = cat.get("roles") or []
    projects = cat.get("projects") or []
    devices = cat.get("devices") or []
    hints = cat.get("dispatch_hints") or {}

    role_ids = ", ".join(r.get("id", "?") for r in roles)
    proj_ids = ", ".join(p.get("id", "?") for p in projects)
    hint_lines = []
    for k, v in list(hints.items())[:12]:
        if isinstance(v, list):
            hint_lines.append(f"  - {k}: {', '.join(str(x) for x in v)}")
    device_line = ""
    if devices:
        d0 = devices[0]
        device_line = f"\nDevice: {d0.get('model') or d0.get('id')} → agent `{d0.get('agent', '')}`"

    return f"""## Role-agent cluster (harness — dispatch, do not ignore)
SoT: agents/meta-harness/role-agents/catalog.json · upstream kineticdirt/agent-role-cluster
Roles: {role_ids}
Projects: {proj_ids}{device_line}
Prefer project-* when the ask names a product lane. New recurring lane → role-new-project.
Phone/PWA/Pixel → android-pixel3a.
Dispatch hints:
{chr(10).join(hint_lines) if hint_lines else "  (none)"}
Agents on disk: .cursor/agents/role-*.md · .cursor/agents/project-*.md
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    args = ap.parse_args()
    repo = Path(args.repo).resolve()
    cat = load_catalog(repo)
    if not cat:
        return 0
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.write(build_block(cat))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
