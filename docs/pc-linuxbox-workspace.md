# PC workspace → linuxbox (always-on access)

Use this repo on your **desktop PC** as the control plane. linuxbox stays up 24/7; you edit secrets **once here** and sync.

You already have **`ssh potato`** in `~/.ssh/config` (Tailscale `100.122.108.94` + `id_rsa_potato`).

## One-time: local secrets file

```bash
cp secrets/linuxbox.env.example secrets/linuxbox.env
```

Edit `secrets/linuxbox.env` — paste Discord token, guild ID, your user ID. **Never commit** (gitignored).

## Auto on workspace open

Opening this folder in Cursor runs task **`linuxbox: workspace bootstrap`**:

- If `secrets/linuxbox.env` exists → syncs to potato automatically
- If missing → skips quietly (no error)

Repo sets `"task.allowAutomaticTasks": "on"` in `.vscode/settings.json`.

**If it does not run on open** (first time on this machine):

1. `Ctrl+Shift+P` → **Tasks: Manage Automatic Tasks in Folder**
2. **Allow Automatic Tasks in Folder**
3. Close and reopen the workspace

## Manual commands

| Goal | Command |
|------|---------|
| **Shell on box** | `ssh potato` or `bash scripts/pc/connect-linuxbox.sh` |
| **Push secrets now** | `bash scripts/pc/sync-linuxbox-secrets.sh` |
| **Cursor tasks** | `Ctrl+Shift+P` → **Tasks: Run Task** → **linuxbox: SSH** or **linuxbox: sync secrets** |

### Discord flow

1. Paste token in `secrets/linuxbox.env`
2. Reopen workspace (auto-sync) or run sync manually
3. Verify: `ssh potato 'cd ~/agent-dump/campaigns/tropic-gooner && python3 export_discord_lore.py --list'`

## Cursor Remote SSH (full IDE on box)

1. `F1` → **Remote-SSH: Connect to Host** → `potato`
2. Open folder `/home/abhinav/agent-dump`

## Agents in this workspace

Agents can run `sync-linuxbox-secrets.sh` after you update `secrets/linuxbox.env`. They should **not** read or log token values.
