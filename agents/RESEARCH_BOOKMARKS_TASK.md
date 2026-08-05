# Research · X bookmarks digest (cadence ~3–4 days / weekly floor)

**Project:** `research-bookmarks` · **Account:** Wholesomeboi (human GM)  
**Source config:** `agents/research-bookmarks-source.json` ← **canonical paths + howto**  
**URL:** https://x.com/i/bookmarks  
**Cadence:** About every **3–4 days**, or at least **once per week**, or **on human ask** to implement/test an idea. **No posting.**

## Goal

Turn **bookmarked** X posts into research digests / implementable AI ideas for this stack. Some bookmarks are already shipped — leave the rest for agents to research and trial (self-apply when useful).

## Auth (decided 2026-07-23)

- **No X API** (won’t pay for minimal use).
- **Path A (primary):** PC/laptop browser while **logged in** — Cursor browser or human — then:
  - `python scripts/pc/write-bookmarks-inbox.py <urls…>` or `--file paste.json` → `reports/research/bookmarks-inbox.json`
  - optional `--push-potato` to drop ingest on linuxbox
  - or hand-edit from `reports/research/bookmarks-inbox.example.json`
- Potato **cannot** read bookmarks logged out. If session missing: **ask human to log in** (Inbox or chat) — do not thrash.

Stable Inbox id (ask-to-login / missing export): `research-bookmarks-weekly` (keep id; cadence is no longer Saturday-only).

## Cron (potato)

`scripts/linuxbox/research-bookmarks-weekly.sh` — installed **every 3 days at 10:00** local (`install-research-bookmarks-cron.sh`). Reads ingest path from `agents/research-bookmarks-source.json`.

1. If digest/ask newer than ~3 days → exit 0.
2. If ingest file present → write `reports/research/bookmarks-YYYY-MM-DD.md`.
3. Else → one Inbox ask: please log in on PC and run `write-bookmarks-inbox.py` / open Cursor browser on bookmarks — **no LLM thrash**, **no API**.

## Think / PC work

1. When human asks to try something from bookmarks → implement/test that item first.
2. When `reports/research/bookmarks-inbox.json` or a fresh digest exists → skip already-implemented topics, propose next 1–3 ideas (user-task `rb-02-next-digest`).
3. When logged-in browser available on PC → pull recent bookmarks into the inbox file (writer script), then digest.
4. Prefer free models for digest clustering; paid OK for complex implementation plans.

## Out of scope

- Liking, replying, DMs, scheduling posts
- X API tokens
- Scraping while logged out
- Continuous polling every think tick
- Mixing into News/Intel RSS (separate lane; bookmarks are research ideas, not headline feeds)
