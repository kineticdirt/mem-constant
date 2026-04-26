# Integrating Claude Mem (working-cache layer)

**[Claude Mem](https://github.com/thedotmack/claude-mem)** fits the **short-horizon working cache** role: hooks + SQLite/Chroma worker so the model keeps thread-local context without bloating the archive.

## Requirements

- **Node.js 18+**
- **Cursor** (documented hooks/MCP integration)
- Optional project instructions scaffold for Claude Code via:

```bash
mem-constant init --with-ide-scaffolds
```

This writes/merges a mem-constant continuity block in project `CLAUDE.md`.

## One-shot install (upstream recommended)

```bash
npx --yes claude-mem@latest install --ide cursor
```

Then start the worker (upstream):

```bash
npx claude-mem start
```

Fully **quit and reopen Cursor** so hooks load. Confirm **Settings → Hooks** and **MCP** entries.

## Verify integration health

From the target project root (or pass `--path`):

```bash
mem-constant doctor --path .
```

Look for:

- `node: found` and `npx: found`
- `cursor.user_hooks: present` and `claude-mem.hooks: detected`
- `cursor.user_mcp: present` and `claude-mem.mcp: detected`
- `cursor.workspace_hooks.mem_constant: detected` (if you used `mem-constant init --with-cursor-rules`)

If Claude Mem is not detected in user Cursor files, re-run:

```bash
npx --yes claude-mem@latest install --ide cursor
npx claude-mem start
```

Then fully restart Cursor.

## Where this repo documents more

This **agent-dump** workspace keeps workshop notes under **`workshop/02-claude-mem-cursor/`** (install scripts, weekly upgrade on Windows). Those paths exist in the larger ObsidianWriterStack-style repo; on the slim **mem-constant** GitHub clone they may be absent. Treat this file as the **portable** integration summary.

## Policy alignment

Use **`docs/mem-constant/routing-policy.md`** (from **`mem-constant init`**) to decide what stays in Claude Mem vs what you **promote** to MemPalace at **new chat / new agent / milestone** boundaries.

## What goes where

- **Claude Mem (working cache):** short-lived chat context, active TODOs, immediate thread continuity.
- **`.mem-constant/last-session.md`:** cross-chat handoff summary for the next session in this project.
- **MemPalace (archive):** durable decisions, reusable facts, stable references that must survive many sessions.

Practical rule: if it matters after the current milestone, promote it to MemPalace; keep only operational continuity in Claude Mem/carryover.

## See also

- [INSTALL.md](INSTALL.md)
- [INTEGRATION-MEMPALACE.md](INTEGRATION-MEMPALACE.md)
- Upstream: [claude-mem](https://github.com/thedotmack/claude-mem), [docs.claude-mem.ai](https://docs.claude-mem.ai/)
