# mem-constant

**mem-constant** is a **design package** and **CLI** for pairing **MemPalace** (durable archive) with a **lightweight working-memory** layer (for example **Claude Mem** in Cursor): routing, pruning, a daily standup digest, and a global **`handoff`** template when chat context rolls over.

**Current package version: `0.2.0`** (see `pyproject.toml`). Git tags may still include **`v0.0.1`** for the docs-only era; prefer **`pip show mem-constant`** after install.

---

## Fast path (MemPalace-style)

Install the CLI, then scaffold any project in one shot:

```bash
pip install "git+https://github.com/kineticdirt/mem-constant.git"
mem-constant doctor
cd /your/project/root
mem-constant init --with-cursor-rules
```

You get:

- **`mem-constant.yaml`** — project knobs (thresholds, boundary hints)
- **`docs/mem-constant/*.md`** — full spec set, version-matched to the wheel
- **`.cursor/rules/mem-constant.mdc`** — optional Cursor rule (with **`--with-cursor-rules`**)

When the package is on **PyPI**, replace the `git+https://…` line with:

```bash
pip install mem-constant
```

---

## Clone only (no Python)

If you only want Markdown in git:

```bash
git clone https://github.com/kineticdirt/mem-constant.git
```

Specs: [`docs/memory/`](docs/memory/) (see [`docs/memory/README.md`](docs/memory/README.md)).

---

## Documentation map

| Doc | Audience |
|-----|----------|
| [**docs/INSTALL.md**](docs/INSTALL.md) | Install from PyPI, git, editable mode |
| [**docs/CLI.md**](docs/CLI.md) | `init`, `doctor`, `specs` |
| [**docs/CONFIGURATION.md**](docs/CONFIGURATION.md) | `mem-constant.yaml` |
| [**docs/INTEGRATION-MEMPALACE.md**](docs/INTEGRATION-MEMPALACE.md) | Archive layer + MCP hints |
| [**docs/INTEGRATION-CLAUDE-MEM.md**](docs/INTEGRATION-CLAUDE-MEM.md) | Working cache + Cursor |
| [**docs/PACKAGING.md**](docs/PACKAGING.md) | Maintainers: vendor specs, release |

Architecture and policies (canonical prose): **`docs/memory/*.md`**.

---

## Optional: exact git tag

For reproducible **git** checkouts only:

```bash
cd mem-constant
git checkout v0.0.1
```

For **pip** installs, use **`pip install mem-constant==0.2.0`** once published.

---

## Related files in this repo

- [`AGENTS.md`](AGENTS.md) — durable workspace notes for agents (when this tree is used as a wider workspace).
- [`AI_GROUPCHAT.md`](AI_GROUPCHAT.md) — coordination ledger (optional).

## License

[LICENSE](LICENSE) (MIT).
