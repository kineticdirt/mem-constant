# Integrating Claude Code

`mem-constant` supports Claude Code by scaffolding project-level `CLAUDE.md` instructions.

## Scaffold project instructions

From your project root:

```bash
mem-constant init --with-ide-scaffolds
```

This writes or merges:

- `CLAUDE.md`

The inserted mem-constant block tells Claude Code to:

- read `.mem-constant/last-session.md` at session start when available
- keep MemPalace as durable authority
- treat working cache as short-horizon context
- apply prune/recontext policy from `mem-constant.yaml`

Use `--yes` to merge/update existing mem-constant blocks.
