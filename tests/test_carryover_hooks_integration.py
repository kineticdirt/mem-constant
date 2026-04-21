"""Integration tests: run the Cursor carryover hook script like Cursor would (stdin JSON)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
_HOOK_SCRIPT = _REPO / "src" / "mem_constant" / "templates" / "hooks" / "mem_constant_carryover_hooks.py"


def _run_hook(mode: str, payload: dict) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(_HOOK_SCRIPT), mode],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        check=False,
        encoding="utf-8",
    )


def _base(workspace: Path, hook_event_name: str, **extra: object) -> dict:
    d: dict = {
        "conversation_id": "conv-integration-test",
        "generation_id": "gen-1",
        "model": "test",
        "hook_event_name": hook_event_name,
        "cursor_version": "0.0.0",
        "workspace_roots": [str(workspace.resolve())],
        "user_email": None,
        "transcript_path": None,
    }
    d.update(extra)
    return d


def test_carryover_hooks_buffer_then_session_end(tmp_path: Path) -> None:
    (tmp_path / "mem-constant.yaml").write_text("version: 1\n", encoding="utf-8")

    p1 = _base(tmp_path, "beforeSubmitPrompt", prompt="User line for carryover test.")
    r1 = _run_hook("beforeSubmitPrompt", p1)
    assert r1.returncode == 0, r1.stderr
    out1 = json.loads(r1.stdout or "{}")
    assert out1.get("continue") is True

    p2 = _base(tmp_path, "afterAgentResponse", text="Assistant line for carryover test.")
    r2 = _run_hook("afterAgentResponse", p2)
    assert r2.returncode == 0, r2.stderr
    assert (r2.stdout or "").strip() in ("", "{}")

    p3 = _base(
        tmp_path,
        "sessionEnd",
        session_id="sess-1",
        reason="completed",
        duration_ms=100,
        is_background_agent=False,
        final_status="done",
    )
    r3 = _run_hook("sessionEnd", p3)
    assert r3.returncode == 0, r3.stderr

    last = tmp_path / ".mem-constant" / "last-session.md"
    assert last.is_file()
    text = last.read_text(encoding="utf-8")
    assert "User line for carryover test." in text
    assert "Assistant line for carryover test." in text
    assert "completed" in text

    buf = tmp_path / ".mem-constant" / ".hook-buffer.jsonl"
    assert not buf.is_file()


def test_carryover_hooks_session_end_with_transcript_path(tmp_path: Path) -> None:
    (tmp_path / "mem-constant.yaml").write_text("version: 1\n", encoding="utf-8")
    transcript = tmp_path / "fake-transcript.json"
    transcript.write_text(
        json.dumps(
            {
                "messages": [
                    {"role": "user", "content": "Transcript user bit."},
                    {"role": "assistant", "content": "Transcript assistant bit."},
                ]
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    p = _base(
        tmp_path,
        "sessionEnd",
        session_id="sess-2",
        reason="user_close",
        duration_ms=50,
        is_background_agent=False,
        final_status="ok",
        transcript_path=str(transcript.resolve()),
    )
    r = _run_hook("sessionEnd", p)
    assert r.returncode == 0, r.stderr

    last = tmp_path / ".mem-constant" / "last-session.md"
    body = last.read_text(encoding="utf-8")
    assert "Transcript user bit." in body
    assert "Transcript assistant bit." in body


def test_carryover_hooks_noop_without_mem_constant_yaml(tmp_path: Path) -> None:
    """Workspace root without mem-constant.yaml: must not crash; allow prompt submit."""
    p = _base(tmp_path, "beforeSubmitPrompt", prompt="hello")
    r = _run_hook("beforeSubmitPrompt", p)
    assert r.returncode == 0
    assert json.loads(r.stdout).get("continue") is True
    assert not (tmp_path / ".mem-constant").exists()
