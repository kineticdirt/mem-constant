# Installing mem-constant

**mem-constant** is a small Python package with a **`mem-constant`** CLI. It ships the autonomous-memory Markdown specs inside the wheel so you get a **MemPalace-style** flow: install once, then **`init`** in any project.

## Requirements

- **Python 3.10+** on your `PATH`
- **pip** (or **uv pip**)

Optional (see [INTEGRATION-MEMPALACE.md](INTEGRATION-MEMPALACE.md) and [INTEGRATION-CLAUDE-MEM.md](INTEGRATION-CLAUDE-MEM.md)):

- **MemPalace** (`pip install mempalace`) for archival MCP
- **Node.js 18+** if you use **Claude Mem** with Cursor

## Install from PyPI (when published)

```bash
pip install mem-constant
```

Verify:

```bash
mem-constant --version
mem-constant doctor
```

## Install from Git (always works)

Use this until a release is on PyPI, or to track `main`:

```bash
pip install "git+https://github.com/kineticdirt/mem-constant.git"
```

Editable clone (for contributors):

```bash
git clone https://github.com/kineticdirt/mem-constant.git
cd mem-constant
pip install -e .
```

## Scaffold a project (recommended first step)

From your **project root** (where you keep source and `docs/`):

```bash
mem-constant init --with-cursor-rules
```

- Writes **`mem-constant.yaml`** (routing thresholds and boundary hints).
- Copies bundled specs to **`docs/mem-constant/`** (same content as `docs/memory/` in the upstream repo).
- With **`--with-cursor-rules`**, adds **`.cursor/rules/mem-constant.mdc`** for Cursor.

Non-interactive overwrite (CI or repeat runs):

```bash
mem-constant init --with-cursor-rules --yes
```

Specs only, custom output directory:

```bash
mem-constant specs ./out/specs
```

## Next steps

1. Read **`docs/mem-constant/autonomous-memory-architecture.md`** in your project.
2. Wire **MemPalace**: [INTEGRATION-MEMPALACE.md](INTEGRATION-MEMPALACE.md)
3. Optional **Claude Mem**: [INTEGRATION-CLAUDE-MEM.md](INTEGRATION-CLAUDE-MEM.md)
4. Tune **`mem-constant.yaml`**: [CONFIGURATION.md](CONFIGURATION.md)
