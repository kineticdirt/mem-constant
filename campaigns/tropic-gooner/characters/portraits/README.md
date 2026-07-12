# Character portraits

Portraits are served by the Linuxbox dashboard **Chars** tab via
`/api/characters-registry/image`.

## Where files live (gitignored binaries)

| Location | Purpose |
|----------|---------|
| `campaigns/tropic-gooner/Character Images/<Name>/` | Existing campaign art (Ellaine, Harper, Minerva, Nelly, Redmond, Toga, NPC Images). **Gitignored** (~67MB). |
| `campaigns/tropic-gooner/characters/portraits/<id>/` | Per-character uploads from the dashboard (also keep large files out of git when possible). |

Sync art to potato with scp (not git):

```bash
scp -r "campaigns/tropic-gooner/Character Images" potato:~/agent-dump/campaigns/tropic-gooner/
```

## How to set / change a face

1. Open `/Linuxbox/` → **Chars** → pick a character.
2. **Click a gallery thumb** to set the primary (writes `image_path` + keeps `images[]`).
3. Or **Upload** a file (admin) — saved under `characters/portraits/<id>/`.
4. Or type a relative path under `campaigns/tropic-gooner/` and **Save primary**.

Registry fields:

- `image_path` — primary portrait (shown on roster tiles)
- `images[]` — optional explicit list; disk folders are always scanned and merged

Folder → registry id map (server): Ellaine→`ellaine`/`ellaine-mishpit`, Harper→`harper-maupin`, Minerva→`minerva`/`sister-minerva`, Nelly→`nelly`/`nelly-stein`, Redmond→`red`/`redmond-red-gallagher`, Toga→`toga`.

No file → colored initials tile.
