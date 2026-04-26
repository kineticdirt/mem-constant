# Integrating VS Code Copilot Chat

`mem-constant` supports VS Code Copilot Chat through project instructions scaffolding.

## Scaffold project instructions

From your project root:

```bash
mem-constant init --with-ide-scaffolds
```

This writes or merges:

- `.github/copilot-instructions.md`

The inserted mem-constant block tells Copilot Chat to:

- read `.mem-constant/last-session.md` when present
- treat MemPalace as durable archive authority
- follow `mem-constant.yaml` pruning and recontext settings

Use `--yes` to merge/update existing mem-constant blocks.
