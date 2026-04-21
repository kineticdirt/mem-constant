"""Command-line interface for mem-constant."""

from __future__ import annotations

import argparse
import importlib.resources as ir
import sys
from pathlib import Path

from mem_constant import __version__
from mem_constant.carryover import ensure_carryover_scaffold, find_project_root, last_session_file
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


def _carryover_root(ns: argparse.Namespace) -> Path | None:
    return find_project_root(Path(ns.carryover_base))


def cmd_carryover_show(ns: argparse.Namespace) -> int:
    root = _carryover_root(ns)
    if not root:
        print("error: mem-constant.yaml not found (search upward from --path)", file=sys.stderr)
        return 1
    path = last_session_file(root)
    if not path.is_file():
        return 0
    data = path.read_bytes()
    sys.stdout.buffer.write(data)
    if not data.endswith(b"\n"):
        sys.stdout.buffer.write(b"\n")
    return 0


def cmd_carryover_write(ns: argparse.Namespace) -> int:
    root = _carryover_root(ns)
    if not root:
        print("error: mem-constant.yaml not found (search upward from --path)", file=sys.stderr)
        return 1
    src_file = getattr(ns, "file", None)
    if src_file:
        data = Path(src_file).expanduser().resolve().read_bytes()
    else:
        data = sys.stdin.buffer.read()
    dest = last_session_file(root)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    print(f"wrote {dest}")
    return 0


def cmd_carryover_path(ns: argparse.Namespace) -> int:
    root = _carryover_root(ns)
    if not root:
        print("error: mem-constant.yaml not found (search upward from --path)", file=sys.stderr)
        return 1
    print(last_session_file(root))
    return 0


def cmd_carryover_bootstrap(ns: argparse.Namespace) -> int:
    root = find_project_root(Path(ns.carryover_base).resolve())
    if not root:
        print("error: mem-constant.yaml not found (search upward from --path)", file=sys.stderr)
        return 1
    log: list[str] = []
    ensure_carryover_scaffold(root, log)
    for line in log:
        print(line)
    if not log:
        print("carryover scaffold already present")
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
        help="Overwrite existing mem-constant.yaml / docs/mem-constant/ / Cursor rule when present; refreshes .mem-constant scaffold.",
    )
    p_init.add_argument(
        "--with-cursor-rules",
        action="store_true",
        help="Write .cursor/rules/mem-constant.mdc plus carryover hooks (.cursor/hooks.json + script).",
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

    p_co = sub.add_parser(
        "carryover",
        help="Read/write .mem-constant/last-session.md for cross-chat continuity (see Cursor rule).",
    )
    p_co.add_argument(
        "--path",
        default=".",
        dest="carryover_base",
        metavar="DIR",
        help="Directory to search upward from for mem-constant.yaml (default: .).",
    )
    co_sub = p_co.add_subparsers(dest="carryover_cmd", required=True)

    p_cos = co_sub.add_parser("show", help="Print last-session.md to stdout (nothing if missing).")
    p_cos.set_defaults(func=cmd_carryover_show)

    p_cow = co_sub.add_parser(
        "write",
        help="Write stdin or FILE to last-session.md (UTF-8 bytes; creates .mem-constant/ if needed).",
    )
    p_cow.add_argument(
        "file",
        nargs="?",
        default=None,
        help="Optional source file; omit to read stdin.",
    )
    p_cow.set_defaults(func=cmd_carryover_write)

    p_cop = co_sub.add_parser("path", help="Print absolute path to last-session.md.")
    p_cop.set_defaults(func=cmd_carryover_path)

    p_cob = co_sub.add_parser(
        "bootstrap",
        help="Create .mem-constant/README.md and gitignore rule without re-running full init.",
    )
    p_cob.set_defaults(func=cmd_carryover_bootstrap)

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
