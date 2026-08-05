---
title: Infranet investigation pack
kind: index
tags: [infranet, marketplace, docs-wiki]
status: draft
---

# Infranet — investigation pack (Hub Docs)

How the V1 compute marketplace is supposed to work, what problems it must solve, what open source is reusable, and concrete “try it” spikes.

Canonical pitch (do not fork): [[INFRANET-COMBINED-BRIEF]] · Engineering: `projects/infranet/ARCHITECTURE.md` · Runnable loop: `projects/infranet/poc/`

## Tree

| Doc | Purpose |
|---|---|
| [[00-HOW-IT-WORKS]] | V1 marketplace model: compute tokens ≠ LLM tokens; Skyfire/AP2/ACP settle; VM isolation |
| [[01-PROBLEMS-TO-SOLVE]] | Theoretical + practical problem list |
| [[02-OPEN-SOURCE-LANDSCAPE]] | Reusable OSS (honest; unknowns marked) |
| [[03-TRY-IT-EXAMPLES]] | Spikes against `poc/` + proposed mini experiments |

## Why this pack exists

Hub Docs historically indexed **campaign** trees only. This pack lives under `docs/infranet/wiki/` and is indexed as a **system Docs scope** (`infranet`) so the silo sees Infranet beside campaigns — not an orphan folder agents forget.

## Related (outside wiki/)

- `docs/infranet/INFRANET-COMBINED-BRIEF.md` — canonical brief
- `docs/infranet/INFRANET-BUSINESS-BRIEF.md` / `INFRANET-DESIGN-PROPOSAL.md` — older siblings (pointers only)
- `projects/infranet/` — eng notes + PoC (indexed as scope `infranet-eng`)
