# Ops revert — ticks, code, Gitea/GitHub

**Goal:** nothing “randomly breaks” without a way back. Prefer **pause** before **hard reset**.

## Instant (no git) — pause lanes

On potato:

```bash
bash ~/agent-dump/scripts/linuxbox/pause-agent-ticks.sh
```

Resume the known-good adaptive schedule:

```bash
bash ~/agent-dump/scripts/linuxbox/resume-agent-ticks-adaptive.sh
```

Disable S1 DB archive only: `export HERMES_PROFILE_DB_GUARD=0` (or set in the think crontab env wrapper). Guard never kills chats; if a DB is locked it skips.

**Do not** re-enable `agent-pod-scheduler.timer` unless dual-fire with crontab is redesigned.

## Code revert — GitHub `Linuxbox` (homelab)

Canonical remote for this workspace’s linuxbox track: `linuxbox` → `git@github.com:kineticdirt/Linuxbox.git`.

Restore point tag (this pack): **`restore-2026-07-23-adaptive-ticks`**

```bash
# PC — inspect
git fetch linuxbox
git log -1 restore-2026-07-23-adaptive-ticks

# PC — soft undo uncommitted local edits to one file
git checkout restore-2026-07-23-adaptive-ticks -- path/to/file

# Potato — after PC pushes a known-good commit + bundle:
# prefer apply-git-bundle (preserves runtime) over raw git reset
bash ~/agent-dump/scripts/linuxbox/apply-git-bundle.sh
# verify runtime still intact
bash ~/agent-dump/scripts/linuxbox/verify-runtime-state.sh
```

**Never** `git reset --hard` on potato without `protected-paths` preserve/restore (see `docs/runtime-state-protection.md`). Runtime (`agents/state/**`, registries, `user-tasks.json`, chat-threads) must survive code reverts.

## Gitea (Pixi / ObsidianWriterStack only)

Gitea on potato `:13000` is the **RP** SoT path — not the agent-dump/Linuxbox tree. Revert Pixi there (or bare `~/repos/ObsidianWriterStack.git`) per `docs/plans/gitea-rp-canonical.md`. Do not use Gitea to roll back dashboard/Hermes ticks.

## If Hub / potato feels broken again

1. `pause-agent-ticks.sh`
2. Check profile DB sizes under `~/.hermes/profiles/*/state.db` — run `hermes-profile-db-guard.sh` if multi‑hundred‑MB+
3. Revert code via tag/commit + bundle (not blind SCP of runtime JSON)
4. `resume-agent-ticks-adaptive.sh` only after Hub loads and `:8790` is healthy
