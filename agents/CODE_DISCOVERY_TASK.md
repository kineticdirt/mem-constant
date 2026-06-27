# Code-discovery lane — "keep me in the know"

**Profile:** `think` (low frequency — this lane runs at most once per cycle rotation, not every tick).
**Goal:** surface interesting code snippets / repos / releases from GitHub + the wider web so the
human stays current, without manual searching. Output is a readable digest on the dashboard.

**Scope (only these paths):**
- `reports/code-discovery/` (write digests here)
- `agents/code-discovery-progress.md` (lane state / dedupe ledger)
- read-only: `agents/intel-trackers.json` → `code_discovery` section

**Do not:** clone large repos, run untrusted code, install anything, or use heavy local Chromium.
Prefer GitHub REST API + RSS/Atom (cheap). Cap at `max_items_per_digest` (default 8).

## One tick = one digest

1. Read `agents/intel-trackers.json` → `code_discovery` (topics, github_searches, feeds).
2. Fetch candidates:
   - GitHub search URLs (substitute `{since}` = date 7 days ago, `YYYY-MM-DD`). Unauthenticated
     API is fine (60 req/hr); keep to a few queries.
   - `release_feeds` + `web_feeds` (RSS/Atom).
3. Dedupe against `agents/code-discovery-progress.md` (list of repo URLs already featured).
4. For each kept item (≤ 8) capture: **name + link**, **why it's interesting** (1–2 sentences,
   tie to the topics list), **language/stars**, and where possible **a short representative
   snippet** (README excerpt or a key function — keep it small, attribute the source).
5. Write `reports/code-discovery/discovery-YYYYMMDD-HHMM.md` (markdown; the dashboard Intel tab
   renders it). Also update/append a `LATEST-DISCOVERY.md` pointer if convenient.
6. Append the featured repo URLs to `agents/code-discovery-progress.md` so they aren't repeated.
7. Log one line to `AI_GROUPCHAT.md`. Stop.

## Digest format (template)

```markdown
# Code discovery — {date}

> {one-line theme of this batch}

## 1. {repo name} — {language}, {stars}★
{link}
**Why:** {1–2 sentences tying to a tracked topic}
```{lang}
{short representative snippet, attributed}
```
```

## Verify
- Digest file exists in `reports/code-discovery/` and is valid markdown.
- It renders in `/Linuxbox` Intel/News tab (dashboard already reads situation/intel briefs;
  code-discovery digests should be picked up by the same reader or a small extension).
- No duplicate repos vs the progress ledger.

## Notes
- This lane is for **signal, not volume** — 5–8 genuinely interesting items beats a dump.
- If GitHub rate-limits (HTTP 403), back off and rely on RSS feeds this tick.
