# Elasticsearch bulk ingest (SpaceQuest Discord canon)

## Generated files

| File | Index | Notes |
|------|-------|--------|
| `messages-bulk.ndjson` | `spacequest-discord-canon` | One doc per Discord `###` message; includes **`is_gm_voice: true`** when `author` is **WHOLESOMEest Boi** (GM). |
| `relationships-bulk.ndjson` | `spacequest-discord-relations` | Curated edges |

## curl

Index names are in each NDJSON line. Use global `_bulk`:

```bash
curl -s -H "Content-Type: application/x-ndjson" -X POST "ELASTIC_URL/_bulk?pretty" --data-binary "@messages-bulk.ndjson"
curl -s -H "Content-Type: application/x-ndjson" -X POST "ELASTIC_URL/_bulk?pretty" --data-binary "@relationships-bulk.ndjson"
```

## Fields

- `obsidian_uri` — path under SpaceQuest vault; pair with `line_start` to open the export `.md`.
- `is_gm_voice` — filter GM posts vs player voice (not NPC dialogue unless clearly marked in body).

## Regenerate

```bash
python scripts/discord_messages_to_elasticsearch_ndjson.py
```

See [[../CANON-SCOPE]] for which Discord trees are **canon** vs **inspiration only**.
