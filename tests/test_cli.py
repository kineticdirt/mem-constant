from __future__ import annotations

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
