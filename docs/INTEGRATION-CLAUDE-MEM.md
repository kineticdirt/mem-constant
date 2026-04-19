# Integrating Claude Mem (working-cache layer)

**[Claude Mem](https://github.com/thedotmack/claude-mem)** fits the **short-horizon working cache** role: hooks + SQLite/Chroma worker so the model keeps thread-local context without bloating the archive.

## Requirements

- **Node.js 18+**
- **Cursor** (for the documented hook and MCP integration)

## One-shot install (upstream recommended)

```bash
npx --yes claude-mem@latest install --ide cursor
```

Then start the worker (upstream):

```bash
npx claude-mem start
```

Fully **quit and reopen Cursor** so hooks load. Confirm **Settings → Hooks** and **MCP** entries.

## Where this repo documents more

This **agent-dump** workspace keeps workshop notes under **`workshop/02-claude-mem-cursor/`** (install scripts, weekly upgrade on Windows). Those paths exist in the larger ObsidianWriterStack-style repo; on the slim **mem-constant** GitHub clone they may be absent. Treat this file as the **portable** integration summary.

## Policy alignment

Use **`docs/mem-constant/routing-policy.md`** (from **`mem-constant init`**) to decide what stays in Claude Mem vs what you **promote** to MemPalace at **new chat / new agent / milestone** boundaries.

## See also

- [INSTALL.md](INSTALL.md)
- [INTEGRATION-MEMPALACE.md](INTEGRATION-MEMPALACE.md)
- Upstream: [claude-mem](https://github.com/thedotmack/claude-mem), [docs.claude-mem.ai](https://docs.claude-mem.ai/)
