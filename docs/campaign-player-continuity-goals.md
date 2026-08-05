# Campaign player continuity — goals (deferred implementation)

**Status:** goal definition only — not built yet.  
**Campaigns:** Tropic Gooner / Hunter (primary), extensible to SpaceQuest and NYC Mafia.

## Problem

Players leave mid-chronicle, play on different schedules, or go on hiatus. The table still needs in-character presence in Discord and lore consistency. Today the dashboard shows flat file dumps; Discord exports are not linked to playable characters; the agent executes tasks but does not converse like a GM who asks clarifying questions.

## Near-term (now)

1. **Human-first navigation** — pick one campaign → folder (characters, places, plot) → one doc; talk in Chat with that doc as context.
2. **Discord ↔ character registry** — `characters-registry.json` per campaign: `discord_user_id`, `discord_username`, `player_name`, `story_path`, `status` (active / hiatus / retired).
3. **Agent asks questions** — when registry rows lack Discord link or player name, agent posts to `human-inbox.json` instead of guessing.
4. **Brainstorm** — Stories UI → Chat in workshop mode: human is GM; assistant captures theories, notes, and tasks (not "talk to GM").

## Long-term goal: player proxy ("pick up the slack")

When a linked player is **hiatus**, **retired**, or **offline for a session**, a governed agent may:

- Speak in their Discord channel **only** with explicit human opt-in (`can_proxy: true` on registry row).
- Use character sheet + recent channel history as grounding; never invent major plot without inbox approval.
- Hand control back when the player returns (proxy off, audit log entry).

**Out of scope until:** registry complete, Hunter bot token healthy, human policy on proxy boundaries, and a `player-proxy` lane spec.

## Success criteria (future)

- [ ] Registry 100% linked for active PCs (Discord ID + player name).
- [ ] Proxy run logs to `campaigns/<id>/reports/proxy-runs/` with channel + timestamp.
- [ ] Human can toggle `can_proxy` per character from `/Linuxbox/` Stories.
- [ ] No proxy without `can_proxy: true` and campaign GM approval in inbox.
