# Installing mem-constant

**TL;DR:** install the Python package, run **`mem-constant doctor`**, then **`mem-constant init --with-cursor-rules`** in your project root. Full specs land in **`docs/mem-constant/`**.

---

## What you need

| Requirement | Notes |
|-------------|--------|
| **Python 3.10+** | Must be on your PATH as `python` / `python3` / Windows **`py`** |
| **pip** | Or **`uv pip`** — same commands, swap the prefix if you use `uv` |

**Optional** (integrations):

- **MemPalace** — `pip install mempalace` ([integration guide](INTEGRATION-MEMPALACE.md))
- **Node.js 18+** — for **Claude Mem** + Cursor ([integration guide](INTEGRATION-CLAUDE-MEM.md))

---

## Install the CLI

### From GitHub (works today)

Stable URL for the default branch:

```bash
pip install "git+https://github.com/kineticdirt/mem-constant.git"
```

**Windows:** if `pip` fails, use:

```bash
py -m pip install "git+https://github.com/kineticdirt/mem-constant.git"
```

### From PyPI (when published)

```bash
pip install mem-constant
```

---

## Verify

```bash
mem-constant --version
mem-constant doctor
```

You should see the package version, your Python path, and optional notes for **mempalace** / **pyyaml**.

---

## Scaffold a project

Run from the **root of the project** you want to configure (where you keep `docs/` or your app tree):

```bash
mem-constant init --with-cursor-rules
```

| Flag | Effect |
|------|--------|
| *(none)* | Creates `mem-constant.yaml` and `docs/mem-constant/*.md` |
| **`--with-cursor-rules`** | Also writes `.cursor/rules/mem-constant.mdc` |
| **`--yes`** | Overwrites existing scaffold files (safe for CI) |
| **`--skip-specs`** | Only writes `mem-constant.yaml` |

**Examples:**

```bash
mem-constant init
mem-constant init --path ~/code/my-app --with-cursor-rules --yes
mem-constant specs ./vendor/mem-constant-md
```

---

## Editable install (contributors)

```bash
git clone https://github.com/kineticdirt/mem-constant.git
cd mem-constant
pip install -e ".[dev]"
pytest
```

Read **[BUILD-PHILOSOPHY.md](BUILD-PHILOSOPHY.md)** before larger changes (specs → vendor → scaffold → docs → tests).

---

## Next steps

1. Read **`docs/mem-constant/autonomous-memory-architecture.md`** in your project.
2. Wire **MemPalace** — [INTEGRATION-MEMPALACE.md](INTEGRATION-MEMPALACE.md)
3. Optional **Claude Mem** — [INTEGRATION-CLAUDE-MEM.md](INTEGRATION-CLAUDE-MEM.md)
4. Tune **`mem-constant.yaml`** — [CONFIGURATION.md](CONFIGURATION.md)

More command detail: [CLI.md](CLI.md).
