#!/usr/bin/env python3
"""Copy canonical markdown specs from docs/memory/ into the package for wheel builds.

Run from repo root before publishing a release:

    python scripts/vendor_specs.py
"""

from __future__ import annotations

import shutil
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    src_dir = root / "docs" / "memory"
    dest_dir = root / "src" / "mem_constant" / "spec"
    if not src_dir.is_dir():
        raise SystemExit(f"Missing spec source directory: {src_dir}")
    dest_dir.mkdir(parents=True, exist_ok=True)
    for path in sorted(src_dir.glob("*.md")):
        shutil.copy2(path, dest_dir / path.name)
        print(f"copied {path.name} -> {dest_dir / path.name}")


if __name__ == "__main__":
    main()
