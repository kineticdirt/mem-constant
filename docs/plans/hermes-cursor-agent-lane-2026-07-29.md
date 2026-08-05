# Hermes ↔ Cursor CLI agent lane (2026-07-29)

**Holder:** `hermes-cursor-agent-lane`  
**Sibling:** `docs/plans/cursor-auto-away-from-pc-2026-07-29.md` (Cloud Agents / Automations — Phase 2)

---

## Shipped (Phase 1 — potato CLI)

| Piece | Path / surface |
|-------|----------------|
| Wrapper | `scripts/linuxbox/cursor-agent-run.sh` — `agent -p --force --disable-auto-update`, loads `~/.cursor-agent.env`, logs to `/mnt/archive/logs/cursor-agent/` |
| Hub Chat provider | Model id `cursor:auto` in `agents/model-budget/chat-catalog.json` (paid tier) |
| Dispatch | `scripts/linuxbox/linuxbox-status-server.js` — `parseModelProvider` + `execCursorChatOnce`; explicit pick only, **no free-first failover** |
| Budget policy | `agents/model-budget/config.json` → `providers.cursor` (soft $10/day target via `CURSOR_DAILY_USD`) |
| Chat mode hint | `agents/chat-modes.json` → **Agent coding** documents `cursor:auto` |
| Cloud env stub | `.cursor/environment.json` (install noop + deploy reminder) |

### How to select (Hub)

1. Open **Hub → Chat** → mode **Agent coding** (or Meta ops with model picker).
2. Model picker → **Paid** group → **Cursor CLI (skills)** (`cursor:auto`).
3. Send — dashboard runs `cursor-agent-run.sh` on potato (not Hermes OpenRouter).

**Auto / free-first** never picks Cursor. Think/fast crons do **not** invoke the wrapper.

### Manual one-shot (SSH)

```bash
bash ~/agent-dump/scripts/linuxbox/cursor-agent-run.sh "Reply PING only — one word."
```

### Auth

- `CURSOR_API_KEY` in `~/.cursor-agent.env` (chmod 600), or `agent login` on potato.
- Do not commit keys; do not put in `~/.hermes/.env`.

---

## Not shipped / deferred

| Item | Status |
|------|--------|
| Docs character-beta `cursor:auto` | Still OpenRouter-only (`linuxbox-docs-wiki.js`) |
| Hermes `cursor` profile primary | Not added — Hermes cannot run Cursor skills natively; Hub dispatches CLI |
| Think-tick auto-invoke on `[ops]` | Blocked by design — use Hub explicit pick or manual wrapper |
| Cloud Automations wired in repo | **Phase 2** — needs dashboard OAuth (human) |
| `.cursor/environment.json` snapshot | Stub only; run Cloud Agents env setup on cursor.com |

---

## Phase 2 — Cloud Agents checklist (human)

From `cursor-auto-away-from-pc-2026-07-29.md`:

- [ ] GitHub app: Cursor R/W on `kineticdirt/Linuxbox`
- [ ] Cloud Agents env snapshot (use `.cursor/environment.json` + agent-led install)
- [ ] Spend limit set (separate from IDE Auto)
- [ ] Phone/PWA logged into same Cursor account
- [ ] Merge → `push-linuxbox-git-bundle.sh` deploy habit

**Blocked without interactive login:** Cursor dashboard GitHub integration + first env snapshot. Inbox seed `cursor-cloud-github-setup` documents the ask.

---

## Verify

```bash
# Catalog lists cursor
curl -s http://127.0.0.1:8790/api/chat/models | grep -o 'cursor:auto'

# Short smoke (only if key present — burns API)
bash ~/agent-dump/scripts/linuxbox/cursor-agent-run.sh "Reply exactly: CURSOR_PING_OK"
```

---

## Non-goals (unchanged)

- No `agent -p` on `agent-cycle-fast` / `agent-cycle-think` crons.
- No default free-first routing to Cursor.
- Cloud VM is not potato runtime SoT.
