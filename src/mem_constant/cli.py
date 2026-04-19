"""Command-line interface for mem-constant."""

from __future__ import annotations

import argparse
import importlib.resources as ir
import sys
from pathlib import Path

from mem_constant import __version__
from mem_constant.init_scaffold import run_init


def cmd_init(ns: argparse.Namespace) -> int:
    target = Path(ns.path).resolve()
    try:
        for line in run_init(
            target,
            yes=ns.yes,
            with_cursor_rules=ns.with_cursor_rules,
            skip_specs=ns.skip_specs,
        ):
            print(line)
    except FileExistsError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print("\nNext: read docs/mem-constant/autonomous-memory-architecture.md")
    print("MemPalace: https://github.com/kineticdirt/mem-constant/blob/master/docs/INTEGRATION-MEMPALACE.md")
    print("Claude Mem: https://github.com/kineticdirt/mem-constant/blob/master/docs/INTEGRATION-CLAUDE-MEM.md")
    return 0


def cmd_doctor(_ns: argparse.Namespace) -> int:
    print(f"mem-constant {__version__}")
    print(f"python: {sys.version.split()[0]} ({sys.executable})")
    try:
        import mempalace  # type: ignore

        print(f"mempalace: installed ({getattr(mempalace, '__version__', 'version unknown')})")
    except ImportError:
        print("mempalace: not installed (optional; pip install mempalace)")
    try:
        import yaml  # type: ignore

        print(f"pyyaml: installed ({yaml.__version__})")
    except ImportError:
        print("pyyaml: not installed (optional; only needed if you parse mem-constant.yaml in tooling)")
    return 0


def cmd_specs(ns: argparse.Namespace) -> int:
    dest = Path(ns.dest).resolve()
    dest.mkdir(parents=True, exist_ok=True)
    root = ir.files("mem_constant.spec")
    n = 0
    for item in sorted(root.iterdir(), key=lambda p: p.name):
        if not item.is_file() or not item.name.endswith(".md"):
            continue
        out = dest / item.name
        out.write_bytes(item.read_bytes())
        n += 1
    print(f"exported {n} markdown files to {dest}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="mem-constant",
        description="mem-constant — scaffold and docs for MemPalace + working-cache memory stacks.",
    )
    sub = p.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init", help="Create mem-constant.yaml and copy bundled specs into the project.")
    p_init.add_argument(
        "--path",
        default=".",
        help="Project root (default: current directory).",
    )
    p_init.add_argument(
        "--yes",
        action="store_true",
        help="Overwrite existing mem-constant.yaml / docs/mem-constant/ / Cursor rule when present.",
    )
    p_init.add_argument(
        "--with-cursor-rules",
        action="store_true",
        help="Write .cursor/rules/mem-constant.mdc (Cursor editor).",
    )
    p_init.add_argument(
        "--skip-specs",
        action="store_true",
        help="Only write mem-constant.yaml (no docs/mem-constant/ copy).",
    )
    p_init.set_defaults(func=cmd_init)

    p_doc = sub.add_parser("doctor", help="Show Python path, optional mempalace/pyyaml presence.")
    p_doc.set_defaults(func=cmd_doctor)

    p_spec = sub.add_parser("specs", help="Export bundled markdown specs to a directory.")
    p_spec.add_argument(
        "dest",
        help="Output directory (created if missing).",
    )
    p_spec.set_defaults(func=cmd_specs)

    return p


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv in (["--version"], ["-V"]):
        print(f"mem-constant {__version__}")
        return 0
    parser = build_parser()
    ns = parser.parse_args(argv)
    return int(ns.func(ns))


if __name__ == "__main__":
    raise SystemExit(main())
