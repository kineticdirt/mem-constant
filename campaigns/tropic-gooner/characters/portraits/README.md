# Character portraits

Dashboard Chars tab serves images via
`/api/characters-registry/image`.

## Sources (checked in order)

| Path | Role |
|------|------|
| `image_path` / `images[]` on the registry row | Explicit primary / gallery |
| Doc refs in `story_path` (+ `duplicate_paths`) | `Attachment: \`…\``, Obsidian `![[file.jpg]]`, http(s) image URLs — resolved by **basename** under `Character Images/` or `characters/portraits/` when the binary exists |
| `characters/portraits/<id>/` | Per-character uploads from the dashboard |
| `Character Images/<Folder>/` | Campaign art folders — **only for canonical ids** (see below) |

## Canonical folder map (no twin sharing)

| Registry id | Folder |
|-------------|--------|
| `ellaine-mishpit` | `Ellaine/` |
| `harper-maupin` | `Harper/` |
| `sister-minerva` | `Minerva/` |
| `nelly-stein` | `Nelly/` |
| `redmond-red-gallagher` | `Redmond/` |
| `toga` | `Toga/` |

Thread twins (`ellaine`, `nelly`, `red`, `minerva`, `rosa`, …), author stubs, and the GM (`wholesomeest-boi`) are `hidden` / `role: gm` and do **not** inherit these folders (that was the duplicate-face bug).

## Sync art to potato (gitignored)

```bash
scp -r "campaigns/tropic-gooner/Character Images" potato:~/agent-dump/campaigns/tropic-gooner/
```

Or symlink on-box to `/mnt/archive/...` if already archived.

## Dashboard UX

1. Default grid = non-hidden PCs only; **GM · …** chip opens the GM row; **Show stubs** reveals collapsed twins.
2. **Click a gallery thumb** to set the primary (writes `image_path` + keeps `images[]`).
3. Or **Upload** a file (admin) — saved under `characters/portraits/<id>/`.
4. Sheet shows **Unresolved attachments** when a markdown `attachments/…` ref has no matching image under portraits / `Character Images/` / `discord-export/**/attachments`.
5. **Why / Resolve…** popout (admin): copies matching export binaries into `characters/portraits/<id>/`, sets primary, then optionally re-fetches remaining misses via Discord bot (`tools/fetch_unresolved_attachments.py`). CLI: `python tools/resolve_discord_attachments.py [--from-discord]`.

## Registry fields

- `image_path` — primary portrait (shown on roster tiles)
- `images[]` — optional explicit gallery paths
- `doc_attachments` — known doc refs (also scanned live from story markdown)
- `hidden` / `role` / `canonical_id` — collapse twins without deleting rows

## Why attachments were “missing”

Ingest writes `- Attachment: \`attachments/FILE.jpg\`` into sheet markdown, but binaries live under **`discord-export/…/attachments/`** (often excluded from lean sync). The Chars resolver now indexes those dirs by basename; **Resolve** copies them into portraits so they survive without the export tree.