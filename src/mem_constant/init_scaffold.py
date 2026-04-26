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

IDE_SCAFFOLD_BLOCK_START = "<!-- mem-constant:start -->"
IDE_SCAFFOLD_BLOCK_END = "<!-- mem-constant:end -->"

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

pruning:
  # balanced (default) | aggressive
  mode: balanced
  # cadence hint for your scheduler
  cadence: daily
  # cap destructive/irreversible actions per run
  max_items_per_run: 40
  # minimum confidence to KEEP by default in prune passes
  save_gate_min_confidence: 0.55
  # retention window for quarantine before delete eligibility
  quarantine_days: 14

recontextualization:
  # recontext pass when active goals change materially
  on_goal_change: true
  # minimal similarity delta (0.0-1.0) to trigger recontext pass
  goal_change_threshold: 0.20
  # time cadence hint even when goals are stable
  cadence: weekly

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


def _write_or_merge_text_file(
    dest: Path,
    body: str,
    *,
    yes: bool,
    log: list[str],
    rel_from: Path,
) -> None:
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(body, encoding="utf-8")
        log.append(f"wrote {dest.relative_to(rel_from)}")
        return
    existing = dest.read_text(encoding="utf-8")
    if IDE_SCAFFOLD_BLOCK_START in existing and IDE_SCAFFOLD_BLOCK_END in existing:
        if yes:
            prefix, rest = existing.split(IDE_SCAFFOLD_BLOCK_START, 1)
            _, suffix = rest.split(IDE_SCAFFOLD_BLOCK_END, 1)
            updated = prefix.rstrip() + "\n\n" + body.rstrip() + "\n" + suffix.lstrip()
            dest.write_text(updated, encoding="utf-8")
            log.append(f"updated mem-constant block in {dest.relative_to(rel_from)}")
        else:
            log.append(f"skip {dest.relative_to(rel_from)} (mem-constant block already present)")
        return
    if not yes:
        log.append(f"skip {dest.relative_to(rel_from)} (exists; use --yes to merge mem-constant block)")
        return
    sep = "\n\n" if existing and not existing.endswith("\n\n") else ""
    dest.write_text(existing + sep + body, encoding="utf-8")
    log.append(f"appended mem-constant block to {dest.relative_to(rel_from)}")


def _install_workflow_skills(target: Path, yes: bool, log: list[str]) -> None:
    """Copy bundled workflow-skills/<name>/ trees under ``<target>/.cursor/skills/<name>/``.

    Re-uses the ``--yes`` semantics: existing skill folders are skipped unless ``yes``,
    in which case they are overwritten file-by-file (additive, no top-level rmtree).
    """
    skills_root = ir.files("mem_constant.templates").joinpath("workflow-skills")
    if not skills_root.is_dir():
        log.append("skip workflow-skills: bundled templates/workflow-skills/ not found")
        return
    dest_root = target / ".cursor" / "skills"
    dest_root.mkdir(parents=True, exist_ok=True)
    written = 0
    skipped = 0
    for skill_dir in sorted(skills_root.iterdir(), key=lambda p: p.name):
        if not skill_dir.is_dir():
            continue
        dest_skill = dest_root / skill_dir.name
        if dest_skill.exists() and not yes:
            skipped += 1
            continue
        for src_file in _iter_files(skill_dir):
            rel = src_file.relative_to(skill_dir)
            out = dest_skill / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(src_file.read_bytes())
        written += 1
    log.append(
        f"workflow-skills: wrote {written} skills under {dest_root.relative_to(target)} "
        f"({skipped} existing skipped; use --yes to overwrite)"
    )


def _iter_files(traversable):
    """Yield every file under a Traversable (recursive). Works for filesystem-backed resources."""
    for item in traversable.iterdir():
        if item.is_dir():
            yield from _iter_files(item)
        else:
            yield item


def _install_ide_scaffolds(target: Path, yes: bool, log: list[str]) -> None:
    claude_body = bundled_template("claude-mem-constant.md")
    vscode_body = bundled_template("vscode-copilot-instructions.md")
    _write_or_merge_text_file(
        target / "CLAUDE.md",
        claude_body,
        yes=yes,
        log=log,
        rel_from=target,
    )
    _write_or_merge_text_file(
        target / ".github" / "copilot-instructions.md",
        vscode_body,
        yes=yes,
        log=log,
        rel_from=target,
    )


def run_init(
    target: Path,
    *,
    yes: bool,
    with_cursor_rules: bool,
    with_ide_scaffolds: bool,
    with_workflow_skills: bool = False,
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

    if with_ide_scaffolds:
        _install_ide_scaffolds(target, yes, log)

    if with_workflow_skills:
        _install_workflow_skills(target, yes, log)

    ensure_carryover_scaffold(target, log)

    return log
