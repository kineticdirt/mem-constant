# Runtime state protection

**Problem this solves:** the always-on lanes (fast tick `apply-git-bundle.sh` every ~30s,
think lane `git-pull-and-deploy.sh`) and PC deploys (`push-linuxbox.sh`,
`push-linuxbox-git-bundle.sh`) repeatedly reverted live runtime state — the Tropic
characters registry went v23→v3 and v28→v3 via `git reset --hard`, dashboard HTML was
wiped to stale generations by stash/pop, and PC tarballs overwrote potato's
`agents/state/**` and `agents/user-tasks.json` with stale copies.

**Contract:**

- **Code is git-owned.** Scripts, server JS, dashboard HTML, docs, config seeds — flow
  PC → GitHub (`Linuxbox` main) → git bundle → potato. Deploy resets are allowed to
  replace them. Dashboard files MUST be committed to `main` (SCP-only overlays get
  reverted by the next hard reset — commit + bundle, then SCP for speed if you like).
- **Runtime is state-owned.** Files mutated by live services (registries, user tasks,
  `agents/state/**`, uploaded portraits, map edit-mode saves) belong to the box.
  Git and PC tarballs must never replace them. They are gitignored on the `main`
  track and preserved by every wipe-capable script.
- **Explicit beats auto.** An intentional deploy (e.g. `push-tableslop-map.sh` scp of
  map JSONs) may overwrite runtime files; automatic lanes may not.

## The manifest

`agents/protected-runtime-paths.json` lists every runtime-truth path with a type:

| type | restore rule after reset/stash | PC push tarballs |
|------|-------------------------------|------------------|
| `versioned-json` | keep local when `local.version >= incoming.version` | dropped |
| `runtime-file` | local always wins | dropped |
| `runtime-dir` | local always wins (subtree) | dropped (except `allow_push` entries like `.gitkeep`) |

Helper: `scripts/linuxbox/protected-paths.py` (`list`, `preserve DIR`, `restore DIR`,
`filter-stdin`, `verify-versions`). Stdlib-only; runs on box python3.9 and PC git-bash.

**Adding a path:** append an entry to the manifest (choose the type; set
`backup: true` unless it is bulky binaries), add a gitignore rule if the file is
currently tracked, `git rm --cached <path>` on the `main` track, deploy manifest +
scripts via `push-linuxbox.sh --scripts-linuxbox`. Done — every wipe path honors it.

## Who honors it

- `scripts/linuxbox/apply-git-bundle.sh` — self-executes from a temp copy (the reset
  swaps the script mid-run otherwise), takes a flock, snapshots protected files
  (`preserve`), runs `backup-registries.sh`, hard-resets, `restore`s, then runs the
  verify gate. Falls back to the legacy registry-only preserve if the helper is missing.
- `scripts/linuxbox/git-pull-and-deploy.sh` — same preserve/restore around its
  stash → pull → pop, plus the verify gate when HEAD moved.
- `scripts/pc/push-linuxbox.sh` — path lists no longer contain runtime files, and
  every tarball is additionally piped through `protected-paths.py filter-stdin`
  (defense in depth: re-adding a runtime path to a list is a no-op). After a
  service-restart push it runs the verify gate on the box and fails loudly.

## Git ownership decision (2026-07-15)

Untracked on the `main` track (gitignored, `git rm --cached`):
`campaigns/*/characters-registry.json`, `agents/user-tasks.json`,
`agents/archive-meta.json`, `agents/swarm-queue.json`,
`agents/state/pod-scheduler.json`, `agents/state/intent-violations.jsonl`
(plus blanket `agents/state/*` ignore). HEAD can no longer carry a stale v3 registry —
`git reset --hard` simply does not touch untracked files.

Map JSONs (`map.json`, `coords.json`, `regions-ui.json`) stay **tracked** (the PC map
pipeline authors them) but are manifest-protected as `runtime-file`: box edit-mode
saves survive resets; PC updates them via the explicit `push-tableslop-map.sh` scp.

## Backups (truth stays recoverable without git)

`scripts/linuxbox/backup-registries.sh` — timestamped copies of all manifest
`backup: true` files to `/mnt/archive/state-backups/<UTC>/` (fallback
`<repo>/backups/state/`), retention last 40 snapshots. Runs automatically before
every hard reset in `apply-git-bundle.sh`; run manually any time.

The dashboard server also writes `characters-registry.json.bak-<ts>` beside the file
on every write, and revisions land under `agents/state/chars-registry-revisions/`.

## Verify gate (fail loud, never silent)

`scripts/linuxbox/verify-runtime-state.sh --context <who>` checks:

1. **Version watermarks** — every `versioned-json` current version >= last seen
   (watermarks in `agents/state/protected-versions.json`); a version going DOWN fails.
2. **Deploy-pair marker** — `<meta name="dash-build">` in `index.html` must equal
   `const DASH_BUILD` in `linuxbox-status-server.js` (bump both together when the
   HTML↔API shape changes), plus legacy structural markers (`active-work`,
   `chat-threads-toggle`).
3. **Live service** — `http://127.0.0.1:8790/` returns 200 (box only).
4. **Roster API** — each manifest `verify.api` endpoint parses as JSON and has
   `>= min_visible` characters.

On failure it appends `agents/state/dashboard-deploy-alerts.jsonl`, opens a
human-inbox question (stable id `runtime-verify-fail-<YYYYMMDD>`, never re-asks an
answered one), and exits 1 — the calling script surfaces the failure (`VERIFY FAILED`)
instead of proceeding silently. Box-side alerts go to the alerts file + inbox (not the
tracked `AI_GROUPCHAT.md`, which auto-lane resets would themselves revert); PC-side
push failures should get a `[PC]` ledger line by whoever ran the push.

## Known remaining risks

- `push-tableslop-map.sh` intentionally overwrites map JSONs (explicit deploy) — box
  edit-mode saves made between your last pull-from-box and that deploy are lost.
  Pull map JSONs from potato before running it.
- The registry `.bak-*` files beside `characters-registry.json` grow unbounded
  (~46 as of 2026-07-15); harmless but worth a retention pass someday.
- `agents/user-tasks.json` is now potato-owned. PC-side edits to it do NOT deploy;
  create tasks via the dashboard (or scp explicitly after a union-merge by id).
