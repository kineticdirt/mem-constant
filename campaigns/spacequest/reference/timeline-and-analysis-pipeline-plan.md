# Plan — timeline + automated scanning & analysis

**Status:** plan (not fully automated yet). **Goal:** one **timeline** story players can trust, and a **repeatable pipeline** where exports get **indexed** and **analysis** stays current without hand-copying.

---

## 1. Timeline layers (three clocks)

Keep them **labeled** so notes do not blur:

| Layer | Where it lives | Examples |
| ----- | ---------------- | -------- |
| **Real / Discord** | [[../lore/timeline]] | UTC stamps from exports; `#rp`, `#corpo-station` beats. |
| **Tabletop sessions** | [[../sessions/README]] + per-session README | “Session 1 — docking bay” when you play the asteroid crawl at the table. |
| **Diegetic** | Session posts, `story/` | Stardates, employer “month window,” in-fiction clocks. |

**Rule of thumb:** When a **table session** completes, add a **short row** under `lore/timeline.md` → **Tabletop timeline** linking to `sessions/session-NN/` and `story/session-NN-*.md`. Do **not** merge Discord 2026 ship beats into the asteroid crawl without a note — fork or subsection.

---

## 2. What “the bot scanning” means here

| Stage | Mechanism (existing or planned) | Output |
| ----- |----------------------------------|--------|
| **Pull Discord text** | [`export_discord_lore.py`](../export_discord_lore.py) + `.env` token | `discord-export/.../messages.md` |
| **Search / graph index** | [`scripts/discord_messages_to_elasticsearch_ndjson.py`](../scripts/discord_messages_to_elasticsearch_ndjson.py) | `discord-export/elastic-bulk/*.ndjson` → ES indices (see [[../discord-export/elastic-bulk/ingest-instructions]]) |
| **Static analysis** | Re-run or diff-aware **meta** pass | Updates to [[../discord-export/META-ANALYSIS]], [[../discord-export/CANON-RELATIONSHIP-ANALYSIS]] (manual or scripted refresh) |
| **Timeline hygiene** | Human or **semi-auto**: script suggests new date ranges from latest export mtimes | PR into [[../lore/timeline]] |

**“Bot” in practice:** a **scheduler** (Task Scheduler, `cron`, Git hook, or CI on a branch) that runs **export → NDJSON regen → curl ingest** when you choose, plus optional **notification** (Discord webhook: “ingest OK / fail”).

**Not in scope for this plan alone:** full **Discord slash-command** RP bot (see [[../story/systems-dnd5e-lewd-tech]] §8, [[../characters/meta/PROJECT-BACKLOG]] C-4). The **scanning** plan is **corpus maintenance**, not in-channel play.

---

## 3. Phased implementation

### Phase A — Documentation-only (done when this file ships)

- Timeline layers documented (§1).  
- Links from [[README]] · [[../lore/README]] · [[../reference/README]].

### Phase B — Repeatable local runbook

- One markdown **checklist** in this folder or `discord-export/`: “After export, run A, B, C.”  
- Optional: `scripts/run_post_export.ps1` / `.sh` **without** secrets in repo (calls `python` + `curl` with env vars).

### Phase C — Scheduled automation

- Nightly or weekly: export **or** ingest-only if export is manual.  
- Log file under `.cursor/` or `discord-export/logs/` (gitignored) with last success time.

### Phase D — Analysis “making good”

- Define **one** automated metric: e.g. message count delta, new `obsidian_uri` list, GM-voice ratio.  
- Optional: pipe **new** chunks to local LLM ([[../characters/meta/LOCAL-LLM-NOTES]]) for **draft** timeline bullets — **human review** before commit.

---

## 4. Success criteria

1. After a fresh export, a **single runbook** gets ES and NDJSON aligned with vault paths.  
2. `lore/timeline.md` has a clear place for **asteroid campaign** table sessions vs **Discord** history.  
3. No duplicate “truth” — analysis docs **point** at export paths + line numbers, not forked prose.

---

## 5. Backlog linkage

Tracked as **A-6** in [[../characters/meta/PROJECT-BACKLOG]] until Phases B–D are satisfied or cancelled.

**See also:** [[../discord-export/CANON-SCOPE]] · [[../sessions/README]] · [[../story/README]]
