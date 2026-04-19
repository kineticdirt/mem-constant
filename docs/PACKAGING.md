# Packaging and releases (maintainers)

## Layout

| Path | Role |
|------|------|
| **`docs/memory/*.md`** | Canonical spec text in git |
| **`src/mem_constant/spec/*.md`** | Same files **vendored** into the wheel |
| **`scripts/vendor_specs.py`** | Copies **`docs/memory`** → **`src/mem_constant/spec`** |

## Before tagging a release

1. Edit specs only under **`docs/memory/`** (or merge PRs that do).
2. Run from repo root:

   ```bash
   python scripts/vendor_specs.py
   ```

3. Confirm **`git diff src/mem_constant/spec`** looks right.
4. Bump version in **`pyproject.toml`** and **`src/mem_constant/__init__.py`** (`__version__`).
5. Run checks:

   ```bash
   pip install -e ".[dev]"
   pytest
   python -m build
   ```

6. Tag and publish (example):

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   pip install build twine
   python -m build
   python -m twine upload dist/*
   ```

## Wheel contents

**`pyproject.toml`** declares **`package-data`**: all **`spec/*.md`** and **`templates/*.mdc`** ship inside the **`mem_constant`** package. **`mem-constant init`** reads them with **`importlib.resources`** so installs work without a git checkout.

## Documentation for users

Keep **user-facing** install and CLI docs in **`docs/INSTALL.md`**, **`docs/CLI.md`**, **`docs/CONFIGURATION.md`**, and integration guides. **`README.md`** should stay a short front door with links to those files.
