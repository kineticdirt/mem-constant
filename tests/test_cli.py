from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from mem_constant import __version__

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
    assert (tmp_path / "mem-constant.yaml").is_file()
    specs = tmp_path / "docs" / "mem-constant"
    assert specs.is_dir()
    assert (specs / "routing-policy.md").is_file()
    assert (tmp_path / ".mem-constant" / "README.md").is_file()
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
