# Parallel free workers + Lineage phone (2026-07-23)

**Status:** decided direction — not implemented yet.  
**Human:** B (Termux free worker) + multi-subagents; News wants more data sources (topics TBD).

## Goals

1. **Multi-subagents:** 2–3 concurrent free workers; **≤1 paid** at a time.
2. **LineageOS phone:** Role **B** — Tailscale + Termux claims free-pool jobs; potato remains SoT/orchestrator.
3. **News:** expand beyond current **18** RSS sources (situation_monitor + Intel tab).

## Why potato alone is wrong for N>1 Hermes

~2 GB RAM + overlapping Hermes chats caused thrash. Parallelism should prefer **API workers** (phone / free OpenRouter) over more local Hermes processes.

## Architecture (proposed)

```
                    ┌─────────────────┐
  Hub / user-tasks  │ potato SoT      │  claim API + locks
  swarm-queue       │ max free: 2–3   │  paid mutex: 1
                    │ Hermes paid×1   │
                    └────────┬────────┘
           free claim        │
     ┌───────────┬───────────┴───────────┐
     ▼           ▼                       ▼
 Termux phone  free Hermes/API        (optional PC)
 (Laguna/Qwen) on potato if RAM ok    Cursor Task
```

### Policy knobs

| Knob | Where | Target |
|------|--------|--------|
| `max_concurrent` | `agents/swarm-experts.json` | 3 (was 1) |
| `max_paid_concurrent` | new in swarm or model-budget | **1** |
| free RPM soft | `agents/model-budget/config.json` `pools.free` | keep; back off on 429 |
| phone worker | new thin script + docs | claim → free LLM → report |

### Shared-state rules

Phone/workers never SCP-clobber `characters-registry.json` / chat-threads. Ops code edits still go through potato + multitask locks. Phone is best for: digests, feed fetch, triage, code-discovery summaries, inbox enrichment — not registry merges.

## Implementation slices (ordered)

1. **Spec + Hub visibility** — show N running workers in Running now (who/model/pool).
2. **Swarm:** `max_concurrent=3`, paid mutex, free experts only for parallel slots.
3. **Claim API** (loopback/Tailscale): `POST /api/swarm/claim` + `report` (token in `~/.linuxbox-dashboard` or Tailscale ACL — no Hermes `.env` on phone).
4. **Termux pack:** Tailscale, Termux:API wake lock, `worker.sh` cron/loop, pin battery.
5. **News feeds** — after human picks buckets (below).

## News — current (18)

World/geo: BBC World, Guardian, Al Jazeera, NPR  
Markets: BBC Biz, CNBC, MarketWatch, Yahoo, WSJ Markets  
Cyber: THN, Krebs, BleepingComputer, Dark Reading  
Tech/social: Ars, BBC Tech, HN, Lobsters, TechCrunch  

**Gaps (candidates — pick buckets):** science (Nature/ScienceDaily), policy (Federal Register/Congress), AI research (HF blog, arXiv cs.AI), OSINT (Bellingcat), energy, local US, Reddit curated (already partial social_feeds path), Substack allowlist.

## Non-goals (this pass)

- Local GGUF on phone  
- Paid API keys on phone  
- Re-enable `agent-pod-scheduler` dual-fire  
- Infranet marketplace (separate product)

## Open questions for human

1. News: which buckets to add first? (list above or name sources)
2. Phone: always-on dock vs plugged-only?
3. OK to implement slice 1–2 on potato before Termux pack?
