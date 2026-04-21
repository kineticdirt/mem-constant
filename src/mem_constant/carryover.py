"""Session carryover file — gitignored markdown the agent reads at new-chat boundaries."""

from __future__ import annotations

from pathlib import Path

MEM_CONSTANT_YAML = "mem-constant.yaml"
LAST_SESSION = "last-session.md"
BUFFER_NAME = ".hook-buffer.jsonl"
CARRYOVER_DIR = ".mem-constant"

CARRYOVER_README = """# mem-constant session carryover

This directory holds **`.mem-constant/last-session.md`**, a short-lived note so a **new** Cursor chat can pick up where the last one stopped.

## Bootstrap (existing repo)

If you already have `mem-constant.yaml` but no `.mem-constant/` folder:

```bash
mem-constant carryover bootstrap
```

## Write (end of session)

From the project root (where `mem-constant.yaml` lives), pipe a handoff or notes into the file:

```bash
mem-constant carryover write < handoff.txt
```

Or paste in the terminal (then press Ctrl+Z and Enter on Windows, or Ctrl+D on Unix):

```bash
mem-constant carryover write
```

## Read (you or the agent)

```bash
mem-constant carryover show
```

The Cursor rule **`mem-constant.mdc`** tells the agent to **read this file at the start of a new thread** when it exists. Use the format in `docs/mem-constant/global-handoff-template.md` when saving context.

## Automated export (Cursor hooks)

With **`mem-constant init --with-cursor-rules`**, the repo gets **`.cursor/hooks.json`** plus **`.cursor/hooks/mem_constant_carryover_hooks.py`**, which:

- append each **user** prompt and **assistant** reply to **`.mem-constant/.hook-buffer.jsonl`** during the session, and
- on **`sessionEnd`** (composer chat closed / completed), write **`.mem-constant/last-session.md`** from the buffer and, when Cursor provides it, **`transcript_path`**.

Enable **chat/composer transcripts** in Cursor if you want the transcript section populated when the buffer is empty.
"""


def find_project_root(start: Path) -> Path | None:
    """Return the directory containing ``mem-constant.yaml``, searching upward from ``start``."""
    cur = start.resolve()
    if cur.is_file():
        cur = cur.parent
    for p in [cur, *cur.parents]:
        if (p / MEM_CONSTANT_YAML).is_file():
            return p
    return None


def carryover_directory(root: Path) -> Path:
    return root / CARRYOVER_DIR


def last_session_file(root: Path) -> Path:
    return carryover_directory(root) / LAST_SESSION


def ensure_carryover_scaffold(target: Path, log: list[str]) -> None:
    """Create ``.mem-constant/`` and README; append a gitignore rule for ``last-session.md``."""
    d = carryover_directory(target)
    d.mkdir(parents=True, exist_ok=True)
    readme = d / "README.md"
    if not readme.is_file():
        readme.write_text(CARRYOVER_README, encoding="utf-8")
        log.append(f"wrote {readme}")
    _ensure_gitignore_carryover_patterns(target, log)


def _ensure_gitignore_carryover_patterns(target: Path, log: list[str]) -> None:
    lines_to_add = [
        f"{CARRYOVER_DIR}/{LAST_SESSION}",
        f"{CARRYOVER_DIR}/{BUFFER_NAME}",
    ]
    gi = target / ".gitignore"
    existing_lines: set[str] = set()
    existing_text = ""
    if gi.is_file():
        existing_text = gi.read_text(encoding="utf-8")
        existing_lines = set(existing_text.splitlines())

    missing = [ln for ln in lines_to_add if ln not in existing_lines]
    if not missing:
        return
    header = "# mem-constant session carryover (may contain chat excerpts)"
    addition: list[str] = []
    if header not in existing_lines:
        addition.append(header)
    addition.extend(missing)
    block = "\n".join(addition) + "\n"
    if gi.is_file():
        prefix = "" if existing_text.endswith("\n") or not existing_text else "\n"
        gi.write_text(existing_text + prefix + block, encoding="utf-8")
        log.append(f"appended carryover rules to {gi}")
        return
    gi.write_text(block, encoding="utf-8")
    log.append(f"wrote {gi} with carryover rules")
