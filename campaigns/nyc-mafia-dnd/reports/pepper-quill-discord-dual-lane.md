# Pepper Quill — Discord dual-lane (NYC Big Apples)

**Bot:** AI_RP_Master / persona **Pepper Quill**  
**Profile:** Hermes `hunter-reckoning`  
**GM/owner:** `265909664590331915` (`wholesome.man`)

## Architecture

| Role | Component | Notes |
|------|-----------|--------|
| **Listen / gateway** | Hermes Discord adapter + hunter gateway | Token, allowlist, `require_mention`, Tropic free-response, reactions |
| **Primary Q&A (NYC listen)** | **Cursor Auto** | `pre_gateway_dispatch` plugin `pepper-quill-cursor` → `bash scripts/linuxbox/cursor-agent-run.sh` (`CURSOR_SDK_AUTO_ONLY=1`, `cursor:auto` only) → Discord REST reply → `action: skip` |
| **Secondary / fallback** | Hermes DeepSeek | On Cursor timeout/fail/empty: `action: rewrite` (enrich with reply parent) then normal Hermes LLM |

Parallel pattern (AGENTS.md): Agent1 Hermes ∥ Agent2 Cursor Auto — for **NYC Discord Q&A answers**, Cursor Auto is the **main** responder; Hermes stays the listener and fallback (not the primary answer model).

Disable Cursor primary: `PEPPER_CURSOR_PRIMARY=0` in hunter `.env`.

## Reply / Discord context encoding (do not drop)

**Why:** Unresolved `message.reference.resolved` left `reply_to_text` empty → associate car/brake asks were answered as lore/`search_files` on Discord nicks.

**Where encoded:**

1. **Discord adapter** (`plugins/platforms/discord/adapter.py`, patch via `install-pepper-quill-cursor-primary.sh`):
   - `fetch_message` when reference unresolved
   - `reply_to_text = "Author (id): body"`
   - Prepend `[Discord meta]…[/Discord meta]` into `channel_context` (channel id/name, guild, author, mentions, reply parent, message link)
2. **Gateway** (`gateway/run.py`): inject reply parent into LLM text (`[:2000]`, labeled “Discord reply parent — ANSWER THIS…”)
3. **Cursor plugin** (`pepper-quill-cursor`): re-encodes the same fields into the Cursor prompt; on Hermes fallback, rewrites `event.text` with the parent block

## Channel allowlist (NYC)

Listen (mention-required): `general-ooc-ba`, `general`, `rolly-poley`, `lore-dump`, `campaign-discussion-lore`, `dm-screen`.  
**Exclude:** `art`, `characters-ba`.  
Tropic free-response allowlist **kept**. Scope: `apply-pepper-quill-discord-scope.sh` + `discord.json`.

## Reactions / shutdown

- Temporary **✅** while working; clear on complete (no stuck 👀). Patch: `apply-hermes-shutdown-owner-dm.sh`.
- Shutdown/restart: **never** guild/home; **owner DM only** via `create_dm` (v3 — user id ≠ channel id). `gateway_restart_notification: false`.

## Tools / security (keep)

- `disabled_toolsets: [terminal, session_search, file]` — no `search_files` spam on OOC
- OOC/IRL → web; Tirith glibc stub + hardline — `docs/agents/discord-hunter-linuxbox.md`, `apply-nyc-gateway-security-fix.sh`
- Think security C0–C8, Meta-Harness, ingest cron — unchanged; see `THINK_SECURITY_CHECKS.md`, ingest runbook below

## Install / reload

```bash
# on potato — after SCP of scripts/plugin
sed -i 's/\r$//' ~/agent-dump/scripts/linuxbox/install-pepper-quill-cursor-primary.sh
sed -i 's/\r$//' ~/agent-dump/scripts/linuxbox/apply-hermes-shutdown-owner-dm.sh
bash ~/agent-dump/scripts/linuxbox/install-pepper-quill-cursor-primary.sh
bash ~/agent-dump/scripts/linuxbox/apply-hermes-shutdown-owner-dm.sh
# Idle only:
systemctl --user restart hermes-gateway-hunter-reckoning
journalctl --user -u hermes-gateway-hunter-reckoning -n 80 --no-pager | grep -E 'pepper-quill|reply-context|Cursor Auto|discord connected'
```

## Related SoT

- Soul: `campaigns/nyc-mafia-dnd/SOUL-discord-qa.md`
- Ingest: `campaigns/nyc-mafia-dnd/reports/discord-ingest-runbook.md`
- Ops: `docs/agents/discord-hunter-linuxbox.md`
- Plugin source: `scripts/linuxbox/pepper-quill-cursor-plugin/`
- Cursor lane: `scripts/linuxbox/cursor-agent-run.sh` + `~/.cursor-agent.env`
