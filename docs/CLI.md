# mem-constant CLI reference

Entry point: **`mem-constant`** (installed by pip).

Global option:

- **`--version`** — print package version and exit.

## `mem-constant init`

Create project-local files for the autonomous memory stack.

| Option | Meaning |
|--------|---------|
| **`--path DIR`** | Project root (default: **`.`**). |
| **`--yes`** | Overwrite existing **`mem-constant.yaml`**, files under **`docs/mem-constant/`**, and **`.cursor/rules/mem-constant.mdc`** if present; ensures **`.mem-constant/`** scaffold. |
| **`--with-cursor-rules`** | Write **`.cursor/rules/mem-constant.mdc`**, **`.cursor/hooks/mem_constant_carryover_hooks.py`**, and merge **`.cursor/hooks.json`** (Cursor carryover automation). |
| **`--with-ide-scaffolds`** | Write/merge mem-constant blocks into project **`CLAUDE.md`** and **`.github/copilot-instructions.md`** (Claude Code + VS Code Copilot Chat guidance). |
| **`--skip-specs`** | Only write **`mem-constant.yaml`** (no spec copy). |

**Exit codes:** `0` success, `1` on error (for example refusing to overwrite without **`--yes`**).

### Cursor hooks (automated carryover)

With **`--with-cursor-rules`**, **`init`** installs Composer hooks that:

1. Record each user prompt (**`beforeSubmitPrompt`**, matcher **`UserPromptSubmit`**) and assistant reply (**`afterAgentResponse`**) into **`.mem-constant/.hook-buffer.jsonl`**.
2. On **`sessionEnd`** (chat closed / session finished), write **`.mem-constant/last-session.md`** from that buffer and, when present, Cursor’s **`transcript_path`** payload.

If **`.cursor/hooks.json`** already exists, use **`--yes`** so entries are **merged** without removing your other hooks. Restart Cursor after the first install if hooks do not load.

Requires **`py -3`** on **`PATH`** (Windows) or adjust the **`command`** in **`hooks.json`** to your Python.

If you run `mem-constant init` from **`$HOME`** with default `--path .`, it now resolves to **`$HOME/.mem-constant/`** to avoid writing policy files directly into your home root.

### Examples

```bash
mem-constant init
mem-constant init --path ~/repos/my-app
mem-constant init --with-cursor-rules --yes
mem-constant init --with-ide-scaffolds --yes
mem-constant init --skip-specs
```

## `mem-constant doctor`

Prints:

- mem-constant version
- Python executable and version
- Whether **`mempalace`** is importable (optional)
- Whether **`pyyaml`** is importable (optional; useful if your own scripts parse **`mem-constant.yaml`**)
- Whether **`node`** / **`npx`** are on PATH (needed for Claude Mem install/start)
- Project-level IDE instruction scaffolds:
  - **`CLAUDE.md`** (Claude Code)
  - **`.github/copilot-instructions.md`** (VS Code Copilot Chat)
- Optional integration signals from Cursor config files:
  - workspace **`.cursor/hooks.json`** and whether mem-constant carryover hooks are present
  - user **`~/.cursor/hooks.json`** and **`~/.cursor/mcp.json`**, plus whether they mention `claude-mem`

Option:

| Option | Meaning |
|--------|---------|
| **`--path DIR`** | Directory to search upward from for **`mem-constant.yaml`** (default: **`.`**). |

Always exits **`0`**.

Example:

```bash
mem-constant doctor --path .
```

## `mem-constant carryover`

Cross-chat **continuity** via **`.mem-constant/last-session.md`** (gitignored by default). The Cursor rule **`mem-constant.mdc`** tells the agent to read this file at the start of a new thread.

Global option for **`show`**, **`write`**, and **`path`**:

| Option | Meaning |
|--------|---------|
| **`--path DIR`** | Directory to search **upward** from for **`mem-constant.yaml`** (default: **`.`**). |

### `mem-constant carryover show`

Print **`last-session.md`** to stdout. Prints nothing if the file is missing.

### `mem-constant carryover write [FILE]`

Write **stdin** (if **`FILE`** is omitted) or the contents of **`FILE`** to **`last-session.md`**. Creates **`.mem-constant/`** if needed.

### `mem-constant carryover path`

Print the absolute path to **`last-session.md`** for scripts and editors.

### `mem-constant carryover bootstrap`

Create **`.mem-constant/README.md`** and append a **`.gitignore`** rule for **`last-session.md`** without re-copying specs. Use on existing repos that already have **`mem-constant.yaml`**.

## `mem-constant specs DEST`

Export all bundled **`*.md`** specification files to directory **`DEST`** (created if needed). Useful for documentation sites or copying into a non-Python repo without using **`init`**.

```bash
mem-constant specs ./vendor/mem-constant-specs
```

## See also

- [INSTALL.md](INSTALL.md) — pip and git install paths
- [CONFIGURATION.md](CONFIGURATION.md) — **`mem-constant.yaml`** fields
- [PACKAGING.md](PACKAGING.md) — releasing new versions
