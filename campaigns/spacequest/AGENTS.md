## Learned User Preferences

- When planning build work, prefer decomposing into atomic features and dependencies rather than leaning only on story-shaped abstractions.
- Keep player-facing map assets visually quieter than GM material (e.g. separate base vs hidden or unlabeled vs keyed map variants).
- Treat Discord as an organizational and RP workflow layer; prefer a local tool-calling LLM plus RAG over vault docs when automating “does things” assistance, rather than making Discord the sole mechanical state owner.
- Separate concerns at the table: map and VTT handle geometry, distance, LOS, and template placement; spell resolution, damage, and conditions stay in the chosen rules flow.

## Learned Workspace Facts

- SpaceQuest is an Obsidian-hosted D&D campaign workspace; the 5e overlay and related mechanics live primarily in `story/systems-dnd5e-lewd-tech.md`.
- Session 1 gridded maps are generated from `sessions/session-01/maps/build_session01_svgs.py`, including Obsidian-oriented SVGs and Planar Ally-oriented map-only `*-pa.svg` exports.
- `sessions/session-01/maps/planarally.md` documents Planar Ally usage, grid calibration, map-vs-resolution scope, and public access via Cloudflare Tunnel on the `tableslop.org` zone (details configured outside the vault).
- `AI_GROUPCHAT.md` is used as a coordination ledger for substantive edits and decisions touching the campaign vault.
- `story/vtt-platform-stories.md` holds the VTT roadmap (local HTTP tooling, declarative map generation, deployment).
- `export_discord_lore.py` and `discord-export/` support Discord history export and canon-scoping workflows alongside markdown in the vault.
