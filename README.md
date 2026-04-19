# mem-constant

**mem-constant** is a design package for using **MemPalace** (long-term archive / source of truth) together with a **lightweight working-memory** layer (the role filled by tools like **Claude Mem** in Cursor): routing, pruning, a daily standup digest, and a global **`handoff`** template when chat context rolls over.

Current release: **`v0.0.1`**. Specs live under [`docs/memory/`](docs/memory/).

## Download (one command)

Pick **HTTPS** (works everywhere) or **SSH** (if your GitHub SSH key is set up).

**HTTPS**

```bash
git clone https://github.com/kineticdirt/mem-constant.git
```

**SSH**

```bash
git clone git@github.com:kineticdirt/mem-constant.git
```

That creates a folder named `mem-constant` with this repo. Open `docs/memory/` for the architecture and policies.

## Optional: exact version

After cloning, stay on the **`v0.0.1`** tag:

```bash
cd mem-constant
git checkout v0.0.1
```

## What you need

- **Git** only (to clone). Reading the docs is plain Markdown.

## Related files in this repo

- [`AGENTS.md`](AGENTS.md) — durable workspace notes for agents (preferences and facts).
- [`AI_GROUPCHAT.md`](AI_GROUPCHAT.md) — coordination ledger for this workspace (when present in your clone).
