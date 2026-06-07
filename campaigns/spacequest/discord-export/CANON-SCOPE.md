# Discord export — canon vs inspiration

## GM account

**`WHOLESOMEest Boi` is the GM** (you). In Elasticsearch `messages-bulk.ndjson`, posts authored by that account are **facilitation**, not PC diegesis—unless clearly spoken **in voice** as an NPC.

**Query hint:** when mining player voice vs GM, filter `author` (exact string) or tag documents in your pipeline with `role: gm` if you extend the ingest script.

## Canon for Space Base V2 (this campaign)

| Include | Folder / channel |
|---------|------------------|
| **Yes** | Space Base V2 category: `#characters`, `#rp`, `#loredoc`, `#corpo-station`, `#dm-screen-spbs`, and related `messages.md` + threads under that export |
| **Yes** | Vault: `characters/pcs/`, `story/`, `lore/` as authored here |

## Inspiration only (do not treat as table canon)

| Path | Note |
|------|------|
| `discord-export/art-and-campaign-images-1040838595541483550/` | Image inspiration |
| `discord-export/art-1473129294015496345/` | Art channel dump |
| `discord-export/characters-space-base-1117957303560310796/` | **Original / unrelated** Space Base — not this party’s sheets |

Elasticsearch: filter **`channel_key`** (or `channel_folder`) to **Space Base V2** paths only when building “campaign truth.”

**See:** [[CANON-RELATIONSHIP-ANALYSIS]] · [[elastic-bulk/messages-bulk.ndjson]]
