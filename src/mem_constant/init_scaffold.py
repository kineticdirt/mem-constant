"""Project scaffolding for ``mem-constant init``."""

from __future__ import annotations

import importlib.resources as ir
import json
from pathlib import Path

from mem_constant import __version__
from mem_constant.carryover import ensure_carryover_scaffold

HOOKS_CARRYOVER: dict[str, list[dict[str, object]]] = {
    "beforeSubmitPrompt": [
        {
            "command": "py -3 .cursor/hooks/mem_constant_carryover_hooks.py beforeSubmitPrompt",
            "matcher": "UserPromptSubmit",
            "timeout": 8,
        }
    ],
    "afterAgentResponse": [
        {
            "command": "py -3 .cursor/hooks/mem_constant_carryover_hooks.py afterAgentResponse",
            "timeout": 15,
        }
    ],
    "sessionEnd": [
        {
            "command": "py -3 .cursor/hooks/mem_constant_carryover_hooks.py sessionEnd",
            "timeout": 90,
        }
    ],
}

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

# Default retrieval pattern when both vectors and a graph exist (hint for your app; see docs/CONFIGURATION.md)
# query_pipeline: vector_then_graph   # vector_then_graph | graph_then_vector | parallel

# --- Optional: graph + ontology (see docs/mem-constant/graph-ontology-and-customization.md)
# knowledge_graph:
#   enabled: false
#   # backend: chosen by your deployment (Kuzu, Neo4j, Memgraph, RDF store, …)
#   backend: null
#   connection: null
# ontology_profile: null  # URI or path to JSON-LD @context / OWL fragment / org catalog
# projection:
#   min_confidence_for_edges: 0.75
#   memory_types: [decision, fact]
""".format(version=__version__)


def bundled_template(name: str) -> str:
    """Load a UTF-8 text file under ``mem_constant.templates`` (supports ``hooks/…`` paths)."""
    root = ir.files("mem_constant.templates")
    path = root.joinpath(*name.split("/"))
    text = path.read_text(encoding="utf-8")
    if not text.endswith("\n"):
        text += "\n"
    return text


def _install_carryover_hooks(target: Path, yes: bool, log: list[str]) -> None:
    hooks_dir = target / ".cursor" / "hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)
    script = hooks_dir / "mem_constant_carryover_hooks.py"
    body = bundled_template("hooks/mem_constant_carryover_hooks.py")
    if script.exists() and not yes:
        log.append(f"skip {script.relative_to(target)} (exists; use --yes to overwrite)")
    else:
        script.write_text(body, encoding="utf-8")
        log.append(f"wrote {script.relative_to(target)}")

    dest = target / ".cursor" / "hooks.json"
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps({"version": 1, "hooks": HOOKS_CARRYOVER}, indent=2) + "\n", encoding="utf-8")
        log.append(f"wrote {dest.relative_to(target)}")
        return
    if not yes:
        log.append(
            f"skip {dest.relative_to(target)} (exists; use --yes to merge mem-constant carryover hooks)"
        )
        return
    data = json.loads(dest.read_text(encoding="utf-8"))
    data.setdefault("version", 1)
    hooks = data.setdefault("hooks", {})
    for event, defs in HOOKS_CARRYOVER.items():
        cur = hooks.setdefault(event, [])
        for d in defs:
            cmd = d.get("command", "")
            if cmd and not any(isinstance(x, dict) and x.get("command") == cmd for x in cur):
                cur.append(d)
    dest.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    log.append(f"merged mem-constant carryover hooks into {dest.relative_to(target)}")


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
        _install_carryover_hooks(target, yes, log)

    ensure_carryover_scaffold(target, log)

    return log
