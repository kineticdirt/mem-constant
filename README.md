# mem-constant

**Autonomous memory for AI-assisted work** — specs plus a small CLI so you can wire **MemPalace** (long-term archive) and a **working cache** (for example **Claude Mem** in Cursor) without hunting through the repo.

**Package version:** `0.2.2` · **Python:** 3.10+

**How we build this:** [docs/BUILD-PHILOSOPHY.md](docs/BUILD-PHILOSOPHY.md) (specs first, graph **on top of** vectors, engineering ontology over vendor lock-in).

---

## Quick start (recommended)

| Step | Command |
|------|---------|
| 1. Install CLI | `pip install "git+https://github.com/kineticdirt/mem-constant.git"` |
| 2. Sanity check | `mem-constant doctor --path .` |
| 3. Go to your app | `cd /path/to/your/project` |
| 4. Scaffold | `mem-constant init --with-cursor-rules` |

**On Windows**, if `pip` is not on your PATH, try:

`py -m pip install "git+https://github.com/kineticdirt/mem-constant.git"`

After step 4 you have:

| Path | What it is |
|------|------------|
| `mem-constant.yaml` | Project thresholds and boundary hints (edit as you like) |
| `docs/mem-constant/*.md` | Full design specs, matched to the package version you installed |
| `.cursor/rules/mem-constant.mdc` | Cursor rule (only with `--with-cursor-rules`); **alwaysApply** so new chats read carryover |
| `.mem-constant/` | Session carryover scaffold; **`last-session.md`** is gitignored — use **`mem-constant carryover write`** |

**Then:** open `docs/mem-constant/autonomous-memory-architecture.md` in that project and follow [docs/INTEGRATION-MEMPALACE.md](docs/INTEGRATION-MEMPALACE.md) / [docs/INTEGRATION-CLAUDE-MEM.md](docs/INTEGRATION-CLAUDE-MEM.md) as needed.

When this package hits **PyPI**, install becomes:

`pip install mem-constant`

---

## Layering at a glance

mem-constant separates concerns into named layers (full detail in [docs/BUILD-PHILOSOPHY.md](docs/BUILD-PHILOSOPHY.md)):

| Layer | What it is |
|-------|------------|
| **L0** | Raw evidence — transcripts, code, commits, logs |
| **L1** | **Structural graph** — code/repo map (e.g. [Graphify](docs/INTEGRATION-GRAPHIFY.md)). Regenerable, read-only, low-authority. |
| **L2** | Vector index over text you choose to embed |
| **L3** | Working cache — short-horizon continuity (e.g. Claude Mem) |
| **L4** | **Archive** — MemPalace: durable facts and decisions, the authority layer |
| **L5** | **Curatorial graph** — typed relations *derived from L4* via [mem-constant ontology](docs/memory/graph-ontology-and-customization.md) |

L1 and L5 are **two different graphs**: structural code/repo (L1) vs curated typed relations from MemPalace (L5). They bridge only through **evidence anchors** (L4 → L1, one-way). Details: [docs/INTEGRATION-GRAPHIFY.md](docs/INTEGRATION-GRAPHIFY.md) § Layer position.

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
| [docs/INTEGRATION-CLAUDE-CODE.md](docs/INTEGRATION-CLAUDE-CODE.md) | Claude Code project instructions scaffold |
| [docs/INTEGRATION-VSCODE.md](docs/INTEGRATION-VSCODE.md) | VS Code Copilot Chat scaffold |
| [docs/INTEGRATION-GRAPHIFY.md](docs/INTEGRATION-GRAPHIFY.md) | Graphify as the **structural graph (L1)**; layer position + evidence-anchor pattern |
| [docs/PACKAGING.md](docs/PACKAGING.md) | Releases and vendoring specs |
| [docs/BUILD-PHILOSOPHY.md](docs/BUILD-PHILOSOPHY.md) | Build habits, L0–L5 layering, contribution flow |
| [docs/memory/graph-ontology-and-customization.md](docs/memory/graph-ontology-and-customization.md) | **Curatorial graph (L5)**: graph on vectors, engineering ontology, behind/in-front pipelines |

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
