# mem-constant CLI reference

Entry point: **`mem-constant`** (installed by pip).

Global option:

- **`--version`** — print package version and exit.

## `mem-constant init`

Create project-local files for the autonomous memory stack.

| Option | Meaning |
|--------|---------|
| **`--path DIR`** | Project root (default: **`.`**). |
| **`--yes`** | Overwrite existing **`mem-constant.yaml`**, files under **`docs/mem-constant/`**, and **`.cursor/rules/mem-constant.mdc`** if present. |
| **`--with-cursor-rules`** | Write **`.cursor/rules/mem-constant.mdc`** (Cursor). |
| **`--skip-specs`** | Only write **`mem-constant.yaml`** (no spec copy). |

**Exit codes:** `0` success, `1` on error (for example refusing to overwrite without **`--yes`**).

### Examples

```bash
mem-constant init
mem-constant init --path ~/repos/my-app
mem-constant init --with-cursor-rules --yes
mem-constant init --skip-specs
```

## `mem-constant doctor`

Prints:

- mem-constant version
- Python executable and version
- Whether **`mempalace`** is importable (optional)
- Whether **`pyyaml`** is importable (optional; useful if your own scripts parse **`mem-constant.yaml`**)

Always exits **`0`**.

## `mem-constant specs DEST`

Export all bundled **`*.md`** specification files to directory **`DEST`** (created if needed). Useful for documentation sites or copying into a non-Python repo without using **`init`**.

```bash
mem-constant specs ./vendor/mem-constant-specs
```

## See also

- [INSTALL.md](INSTALL.md) — pip and git install paths
- [CONFIGURATION.md](CONFIGURATION.md) — **`mem-constant.yaml`** fields
- [PACKAGING.md](PACKAGING.md) — releasing new versions
