# Research · X bookmarks digest (cadence ~3–4 days / weekly floor)

**Project:** `research-bookmarks` · **Account:** Wholesomeboi (human GM)  
**URL:** https://x.com/i/bookmarks  
**Cadence:** About every **3–4 days**, or at least **once per week**, or **on human ask** to implement/test an idea. **No posting.**

## Goal

Turn **bookmarked** X posts into research digests / implementable AI ideas for this stack. Some bookmarks are already shipped — leave the rest for agents to research and trial (self-apply when useful).

## Auth (decided 2026-07-23)

- **No X API** (won’t pay for minimal use).
- **Path A (primary):** PC/laptop browser while **logged in** — Cursor browser or human — export/list → `reports/research/bookmarks-inbox.json` or a digest md.
- Potato **cannot** read bookmarks logged out. If session missing: **ask human to log in** (Inbox or chat) — do not thrash.

Stable Inbox id (ask-to-login / missing export): `research-bookmarks-weekly` (keep id; cadence is no longer Saturday-only).

## Cron (potato)

`scripts/linuxbox/research-bookmarks-weekly.sh` — installed **every 3 days at 10:00** local (`install-research-bookmarks-cron.sh`).

1. If digest newer than ~3 days → exit 0.
2. If ingest file present → write `reports/research/bookmarks-YYYY-MM-DD.md`.
3. Else → one Inbox ask: please log in on PC and run export / open Cursor browser on bookmarks — **no LLM thrash**, **no API**.

## Think / PC work

1. When human asks to try something from bookmarks → implement/test that item first.
2. When logged-in browser available → pull recent bookmarks, skip already-implemented topics, propose next 1–3 ideas.
3. Prefer free models for digest clustering; paid OK for complex implementation plans.

## Out of scope

- Liking, replying, DMs, scheduling posts
- X API tokens
- Scraping while logged out
- Continuous polling every think tick
