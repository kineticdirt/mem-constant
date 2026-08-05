# Characters registry versioning

How agents and the dashboard avoid wiping GM-created Chars (Celine, side NPCs) during multitask / PC→potato sync.

## File

`campaigns/<campaign>/characters-registry.json`

| Field | Meaning |
|-------|---------|
| `version` | Integer monotone counter. Bumped on every successful write. |
| `revision` | Same as `version` (alias for clients). |
| `updated_at` | ISO timestamp of last write. |
| `characters[].updated_at` | Optional per-row; not required for conflict detection. |

## Conflict detection

All write APIs accept `base_version` (or `if_match_version`):

- `POST /api/characters-registry` (patch/create fields)
- `POST /api/characters-registry/create`
- `POST /api/characters-registry/merge`
- `POST /api/characters-registry/upload`
- `POST /api/characters-registry/remove-image`
- `POST /api/characters-registry/import-image-url`

If `base_version` is sent and does **not** equal the on-disk `version`, the server returns **HTTP 409** `{ "error": "version_conflict", "disk_version": N, "base_version": M }`.

UI response: auto-reload roster to disk `version`, then retry. Do not force-overwrite. Hard-refresh only if reload fails.

Omitting `base_version` is allowed for one-off ops tools, but agents **must** send it when mutating after a GET.

## Soft preserve (GM ids)

`writeCharactersRegistry` always `preserveUnknownIds`: any id present on disk but missing from the payload is **kept**. Blind SCP of an older PC file cannot delete potato-only GM rows if the live write path is used. Prefer:

1. Pull potato copy  
2. Union-merge by id (`unionRegistriesById` in `scripts/linuxbox/chars-registry-persist.js`)  
3. Write once with bumped version  

Never `scp` a truncated registry over potato as the only step.

## Soft-hide vs visible side NPCs

- Soft-hide (`hidden: true`) **only** for true merge stubs with `canonical_id` (or GM/author/thread twin stubs).
- Named side NPCs (`role: npc` / `side` without `canonical_id`) stay `hidden: false` on the default grid.
- Restore helper: `node scripts/linuxbox/restore-chars-side-npcs.js --pc <pc.json> --potato <live.json> --write`

## Revision backups

Before each write, the previous file is copied to:

`agents/state/chars-registry-revisions/<campaign>/v<prev>-<timestamp>.json`

Last ~12 kept. Sibling `characters-registry.json.bak-<timestamp>` may also appear next to the live file.

## Multitask lock (required)

Before mutating this file (or SCP-syncing it), **acquire the disk lock**:

```bash
bash scripts/linuxbox/multitask-lock.sh acquire chars-registry:tropic-gooner --holder <id> --wait
```

`writeRegistryFile` acquires `chars-registry:<campaign>` automatically. Full doc: `docs/multitask-shared-state-lock.md`. Also follow `.cursor/rules/multitask-shared-state-checkin.mdc` (ledger + union-merge).

## Conflict UX

HTTP 409 `version_conflict` → Chars UI **auto-reloads** the roster to the disk version and asks the user to **retry** (still no force-overwrite). Hard-refresh remains a fallback if reload fails.