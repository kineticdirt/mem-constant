# Multitask shared-state lock

Durable disk lock so parallel Cursor Task / multitask agents (and potato SCP) do not silently overwrite each other — especially `characters-registry.json`.

## Paths

| Path | Role |
|------|------|
| `agents/state/multitask-locks/<resource>.json` | **Source of truth** per resource |
| `agents/state/multitask-checkin.json` | Human/agent summary (`active_claim`, `last_completed`) |

Lock file fields: `resource`, `holder`, `started_at`, `heartbeat_at`, `status` (`claimed` \| `done`), `note`.

## Agent / CLI usage

From repo root (PC or potato):

```bash
# 1) Check in — wait/retry ~1–2s if held & fresh (<5 min); stale locks are stealable
bash scripts/linuxbox/multitask-lock.sh acquire chars-registry:tropic-gooner \
  --holder "pc-agent-$(date +%s)" --wait --note "restore side NPCs"

# 2) Do work (union-merge, write, SCP)

# 3) Release
bash scripts/linuxbox/multitask-lock.sh release chars-registry:tropic-gooner \
  --holder "pc-agent-…"

bash scripts/linuxbox/multitask-lock.sh status chars-registry:tropic-gooner
```

Node equivalent: `node scripts/linuxbox/multitask-lock-cli.js …` or `require("./multitask-lock")`.

**Required** before Task subagents touch registry / push registry to potato — see `.cursor/rules/multitask-shared-state-checkin.mdc`. Also append a `[PC]`/`[LINUX]` Intent line to `AI_GROUPCHAT.md`.

## Server / persist integration

`scripts/linuxbox/chars-registry-persist.js` → `writeRegistryFile()` **acquires** `chars-registry:<campaign>` before write and **releases** after. Pass `skipLock: true` only in unit fixtures.

## Stale / conflict

- Fresh lock (< ~5 minutes since `heartbeat_at`) → acquire waits and retries; fails with `lock_held` if still busy.
- Stale lock → stealable.
- Registry `version` / `base_version` (HTTP 409) is a separate safety net; Chars UI auto-reloads roster on 409 then asks the user to retry (still no clobber).
