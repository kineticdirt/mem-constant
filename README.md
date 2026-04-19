# mem-constant

**Autonomous memory for AI-assisted work** — specs plus a small CLI so you can wire **MemPalace** (long-term archive) and a **working cache** (for example **Claude Mem** in Cursor) without hunting through the repo.

**Package version:** `0.2.0` · **Python:** 3.10+

---

## Quick start (recommended)

| Step | Command |
|------|---------|
| 1. Install CLI | `pip install "git+https://github.com/kineticdirt/mem-constant.git"` |
| 2. Sanity check | `mem-constant doctor` |
| 3. Go to your app | `cd /path/to/your/project` |
| 4. Scaffold | `mem-constant init --with-cursor-rules` |

**On Windows**, if `pip` is not on your PATH, try:

`py -m pip install "git+https://github.com/kineticdirt/mem-constant.git"`

After step 4 you have:

| Path | What it is |
|------|------------|
| `mem-constant.yaml` | Project thresholds and boundary hints (edit as you like) |
| `docs/mem-constant/*.md` | Full design specs, matched to the package version you installed |
| `.cursor/rules/mem-constant.mdc` | Cursor rule (only with `--with-cursor-rules`) |

**Then:** open `docs/mem-constant/autonomous-memory-architecture.md` in that project and follow [docs/INTEGRATION-MEMPALACE.md](docs/INTEGRATION-MEMPALACE.md) / [docs/INTEGRATION-CLAUDE-MEM.md](docs/INTEGRATION-CLAUDE-MEM.md) as needed.

When this package hits **PyPI**, install becomes:

`pip install mem-constant`

---

## Other ways to use this repo

| Goal | What to do |
|------|------------|
| **Browse Markdown only** | `git clone https://github.com/kineticdirt/mem-constant.git` — specs live in [`docs/memory/`](docs/memory/) ([index](docs/memory/README.md)) |
| **SSH clone** | `git clone git@github.com:kineticdirt/mem-constant.git` |
| **Develop the package** | Clone, then `pip install -e ".[dev]"` and `pytest` ([details](docs/INSTALL.md)) |
| **Export specs to a folder** | `mem-constant specs ./path/to/output` |

---

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/INSTALL.md](docs/INSTALL.md) | Install paths (PyPI, git, editable), verify, scaffold |
| [docs/CLI.md](docs/CLI.md) | All `mem-constant` commands and flags |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | `mem-constant.yaml` reference |
| [docs/INTEGRATION-MEMPALACE.md](docs/INTEGRATION-MEMPALACE.md) | Archive layer and MCP hints |
| [docs/INTEGRATION-CLAUDE-MEM.md](docs/INTEGRATION-CLAUDE-MEM.md) | Claude Mem + Cursor |
| [docs/PACKAGING.md](docs/PACKAGING.md) | Releases and vendoring specs |

---

## Optional: pin an old **git** tag

Docs-only history:

```bash
cd mem-constant
git checkout v0.0.1
```

For **pip**, pin with `pip install mem-constant==0.2.0` once published to PyPI.

---

## License

[MIT](LICENSE)
