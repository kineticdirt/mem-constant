from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from mem_constant import __version__
from mem_constant.cli import _resolve_init_target

_REPO = Path(__file__).resolve().parents[1]
_SRC = str(_REPO / "src")


def _env() -> dict[str, str]:
    e = os.environ.copy()
    e["PYTHONPATH"] = _SRC + os.pathsep + e.get("PYTHONPATH", "")
    return e


def test_version_runs() -> None:
    out = subprocess.run(
        [sys.executable, "-m", "mem_constant.cli", "--version"],
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    )
    assert __version__ in (out.stdout + out.stderr)


def test_doctor_zero() -> None:
    subprocess.run(
        [sys.executable, "-m", "mem_constant.cli", "doctor"],
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    )


def test_init_creates_files(tmp_path: Path) -> None:
    subprocess.run(
        [
            sys.executable,
            "-m",
            "mem_constant.cli",
            "init",
            "--path",
            str(tmp_path),
            "--yes",
        ],
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    )
    cfg = tmp_path / "mem-constant.yaml"
    assert cfg.is_file()
    specs = tmp_path / "docs" / "mem-constant"
    assert specs.is_dir()
    assert (specs / "routing-policy.md").is_file()
    assert (tmp_path / ".mem-constant" / "README.md").is_file()
    cfg_text = cfg.read_text(encoding="utf-8")
    assert "pruning:" in cfg_text
    assert "recontextualization:" in cfg_text
    assert "mode: balanced" in cfg_text
    gi = (tmp_path / ".gitignore").read_text(encoding="utf-8")
    assert ".mem-constant/last-session.md" in gi
    assert ".mem-constant/.hook-buffer.jsonl" in gi


def test_init_with_cursor_rules_writes_hooks(tmp_path: Path) -> None:
    subprocess.run(
        [
            sys.executable,
            "-m",
            "mem_constant.cli",
            "init",
            "--path",
            str(tmp_path),
            "--yes",
            "--skip-specs",
            "--with-cursor-rules",
        ],
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    )
    assert (tmp_path / ".cursor" / "hooks" / "mem_constant_carryover_hooks.py").is_file()
    data = json.loads((tmp_path / ".cursor" / "hooks.json").read_text(encoding="utf-8"))
    assert "sessionEnd" in data["hooks"]
    assert "beforeSubmitPrompt" in data["hooks"]


def test_init_with_workflow_skills_drops_34_skills(tmp_path: Path) -> None:
    subprocess.run(
        [
            sys.executable,
            "-m",
            "mem_constant.cli",
            "init",
            "--path",
            str(tmp_path),
            "--yes",
            "--skip-specs",
            "--with-workflow-skills",
        ],
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    )
    skills_dir = tmp_path / ".cursor" / "skills"
    assert skills_dir.is_dir()
    skills = sorted(p.name for p in skills_dir.iterdir() if p.is_dir())
    assert len(skills) == 34, f"expected 34 published skills, got {len(skills)}: {skills}"
    assert not any(s.startswith("bmad-") for s in skills), f"bmad- prefix leaked into: {skills}"
    assert (skills_dir / "create-implementation-spec" / "SKILL.md").is_file()
    assert (skills_dir / "agent-spec-author" / "SKILL.md").is_file()
    skill_md = (skills_dir / "create-implementation-spec" / "SKILL.md").read_text(encoding="utf-8")
    assert "name: create-implementation-spec" in skill_md


def test_init_without_workflow_skills_writes_no_skills(tmp_path: Path) -> None:
    subprocess.run(
        [
            sys.executable,
            "-m",
            "mem_constant.cli",
            "init",
            "--path",
            str(tmp_path),
            "--yes",
            "--skip-specs",
        ],
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    )
    skills_dir = tmp_path / ".cursor" / "skills"
    assert not skills_dir.exists() or not any(skills_dir.iterdir())


def test_init_with_ide_scaffolds_writes_claude_and_vscode_files(tmp_path: Path) -> None:
    subprocess.run(
        [
            sys.executable,
            "-m",
            "mem_constant.cli",
            "init",
            "--path",
            str(tmp_path),
            "--yes",
            "--skip-specs",
            "--with-ide-scaffolds",
        ],
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    )
    assert (tmp_path / "CLAUDE.md").is_file()
    assert (tmp_path / ".github" / "copilot-instructions.md").is_file()


def test_resolve_init_target_redirects_home_default_path(tmp_path: Path) -> None:
    ns = SimpleNamespace(path=".")
    fake_home = tmp_path / "home"
    fake_home.mkdir(parents=True, exist_ok=True)
    with patch("mem_constant.cli.Path.home", return_value=fake_home), patch(
        "mem_constant.cli.Path.cwd", return_value=fake_home
    ):
        target, note = _resolve_init_target(ns)
    assert target == fake_home / ".mem-constant"
    assert note is not None and "~/.mem-constant" in note


def test_resolve_init_target_keeps_explicit_path(tmp_path: Path) -> None:
    explicit = tmp_path / "proj"
    ns = SimpleNamespace(path=str(explicit))
    target, note = _resolve_init_target(ns)
    assert target == explicit.resolve()
    assert note is None


def test_init_merges_existing_hooks_json(tmp_path: Path) -> None:
    (tmp_path / "mem-constant.yaml").write_text("version: 1\n", encoding="utf-8")
    cdir = tmp_path / ".cursor"
    cdir.mkdir(parents=True, exist_ok=True)
    existing = {
        "version": 1,
        "hooks": {"beforeShellExecution": [{"command": "echo noop", "timeout": 1}]},
    }
    (cdir / "hooks.json").write_text(json.dumps(existing, indent=2), encoding="utf-8")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "mem_constant.cli",
            "init",
            "--path",
            str(tmp_path),
            "--yes",
            "--skip-specs",
            "--with-cursor-rules",
        ],
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    )
    data = json.loads((cdir / "hooks.json").read_text(encoding="utf-8"))
    assert "beforeShellExecution" in data["hooks"]
    assert "sessionEnd" in data["hooks"]
    cmds = [h.get("command", "") for h in data["hooks"]["sessionEnd"]]
    assert any("mem_constant_carryover_hooks.py sessionEnd" in c for c in cmds)


def test_carryover_write_show(tmp_path: Path) -> None:
    subprocess.run(
        [
            sys.executable,
            "-m",
            "mem_constant.cli",
            "init",
            "--path",
            str(tmp_path),
            "--yes",
            "--skip-specs",
        ],
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    )
    w = subprocess.run(
        [
            sys.executable,
            "-m",
            "mem_constant.cli",
            "carryover",
            "--path",
            str(tmp_path),
            "write",
        ],
        input="session note alpha\n",
        capture_output=True,
        text=True,
        check=True,
        env=_env(),
    )
    assert "wrote" in w.stdout
    s = subprocess.run(
        [
            sys.executable,
            "-m",
            "mem_constant.cli",
            "carryover",
            "--path",
            str(tmp_path),
            "show",
        ],
        capture_output=True,
        text=True,
        check=True,
        env=_env(),
    )
    assert s.stdout.replace("\r\n", "\n") == "session note alpha\n"


def test_carryover_bootstrap(tmp_path: Path) -> None:
    (tmp_path / "mem-constant.yaml").write_text("version: 1\n", encoding="utf-8")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "mem_constant.cli",
            "carryover",
            "--path",
            str(tmp_path),
            "bootstrap",
        ],
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    )
    assert (tmp_path / ".mem-constant" / "README.md").is_file()
    assert ".mem-constant/last-session.md" in (tmp_path / ".gitignore").read_text(encoding="utf-8")


def test_doctor_graphify_guardrail_when_graphify_out_present(tmp_path: Path) -> None:
    subprocess.run(
        [
            sys.executable,
            "-m",
            "mem_constant.cli",
            "init",
            "--path",
            str(tmp_path),
            "--yes",
            "--skip-specs",
        ],
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    )
    (tmp_path / "graphify-out").mkdir()
    out = subprocess.run(
        [
            sys.executable,
            "-m",
            "mem_constant.cli",
            "doctor",
            "--path",
            str(tmp_path),
        ],
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    )
    body = out.stdout + out.stderr
    assert "graphify: detected" in body
    assert "graphify-out/ in project root" in body
    assert "L1 structural graph is read-only" in body
    assert "INTEGRATION-GRAPHIFY.md" in body


def test_doctor_no_graphify_line_when_absent(tmp_path: Path) -> None:
    subprocess.run(
        [
            sys.executable,
            "-m",
            "mem_constant.cli",
            "init",
            "--path",
            str(tmp_path),
            "--yes",
            "--skip-specs",
        ],
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    )
    out = subprocess.run(
        [
            sys.executable,
            "-m",
            "mem_constant.cli",
            "doctor",
            "--path",
            str(tmp_path),
        ],
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    )
    body = out.stdout + out.stderr
    assert "graphify-out/ in project root" not in body


def test_doctor_reports_project_ide_scaffold_signals(tmp_path: Path) -> None:
    subprocess.run(
        [
            sys.executable,
            "-m",
            "mem_constant.cli",
            "init",
            "--path",
            str(tmp_path),
            "--yes",
            "--skip-specs",
            "--with-ide-scaffolds",
        ],
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    )
    out = subprocess.run(
        [
            sys.executable,
            "-m",
            "mem_constant.cli",
            "doctor",
            "--path",
            str(tmp_path),
        ],
        check=True,
        capture_output=True,
        text=True,
        env=_env(),
    )
    body = out.stdout + out.stderr
    assert "claude.project_instructions: present" in body
    assert "vscode.project_instructions: present" in body
