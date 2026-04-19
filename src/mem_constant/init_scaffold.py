"""Project scaffolding for ``mem-constant init``."""

from __future__ import annotations

import importlib.resources as ir
from pathlib import Path

from mem_constant import __version__

DEFAULT_CONFIG = """# mem-constant — project memory policy (YAML)
# Installed by: mem-constant init
# Docs: https://github.com/kineticdirt/mem-constant/blob/master/docs/CONFIGURATION.md

version: 1
package_version: "{version}"

routing:
  # Align with docs/mem-constant/routing-policy.md
  mempalace_min_confidence: 0.75
  quarantine_max_confidence: 0.45

# Optional: absolute path to MemPalace palace root (see MemPalace docs)
# mempalace_palace_path: null

boundaries:
  sync_triggers:
    - new_chat
    - new_agent
    - end_milestone
""".format(version=__version__)


def bundled_template(name: str) -> str:
    text = ir.files("mem_constant.templates").joinpath(name).read_text(encoding="utf-8")
    if not text.endswith("\n"):
        text += "\n"
    return text


def run_init(
    target: Path,
    *,
    yes: bool,
    with_cursor_rules: bool,
    skip_specs: bool,
) -> list[str]:
    """Apply scaffold under ``target`` (usually cwd). Returns human-readable log lines."""
    log: list[str] = []
    target = target.resolve()
    target.mkdir(parents=True, exist_ok=True)

    config_path = target / "mem-constant.yaml"
    if config_path.exists() and not yes:
        raise FileExistsError(
            f"Refusing to overwrite existing {config_path.name} (use --yes to replace)."
        )
    config_path.write_text(DEFAULT_CONFIG, encoding="utf-8")
    log.append(f"wrote {config_path}")

    if not skip_specs:
        dest_specs = target / "docs" / "mem-constant"
        if dest_specs.exists() and any(dest_specs.iterdir()) and not yes:
            raise FileExistsError(
                f"Refusing to overwrite non-empty {dest_specs} (use --yes to replace)."
            )
        dest_specs.mkdir(parents=True, exist_ok=True)
        spec_root = ir.files("mem_constant.spec")
        n = 0
        for item in sorted(spec_root.iterdir(), key=lambda p: p.name):
            if not item.is_file() or not item.name.endswith(".md"):
                continue
            (dest_specs / item.name).write_bytes(item.read_bytes())
            n += 1
        log.append(f"copied bundled specs -> {dest_specs} ({n} files)")

    if with_cursor_rules:
        rules_dir = target / ".cursor" / "rules"
        rules_dir.mkdir(parents=True, exist_ok=True)
        rule_path = rules_dir / "mem-constant.mdc"
        if rule_path.exists() and not yes:
            raise FileExistsError(
                f"Refusing to overwrite existing {rule_path} (use --yes to replace)."
            )
        rule_path.write_text(bundled_template("cursor-mem-constant.mdc"), encoding="utf-8")
        log.append(f"wrote {rule_path}")

    return log
