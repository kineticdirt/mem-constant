# Project backlog — Space Base lore (sprint-style)

Lightweight tracker (BMad `sprint-status.yaml` expects `_bmad/bmm/config.yaml`; use this until that exists).

## Epics

### Epic A — Evidence completeness

| Story | Description | Status |
|-------|-------------|--------|
| A-1 | Export **Discord threads** for `#rp` (Huatu Knowledge, room splits) and merge into dossiers | **done** (exporter + Space Base re-run); merge **content** into dossiers still optional |
| A-2 | Pass `#cooler-general` / `#mems2-eb` for **tone** and non-canon color (optional appendix) | backlog |
| A-3 | Index `#art` attachments into a **visual cast sheet** (file names → character) | backlog |
| A-4 | Discord corpus **meta-analysis** — stats, spine, gaps | **done** — [[../../discord-export/META-ANALYSIS]] |
| A-5 | **Canon channels** relationship pass + **Elasticsearch** NDJSON (messages + edges) | **done** — [[../../discord-export/CANON-RELATIONSHIP-ANALYSIS]] |
| A-6 | **Timeline + analysis pipeline** — layered clocks (Discord vs table vs diegetic); export → NDJSON → ES; scheduled runbook; optional digest/LLM draft — [[../../reference/timeline-and-analysis-pipeline-plan]] | backlog |

### Epic B — Dossier maintenance

| Story | Description | Status |
|-------|-------------|--------|
| B-1 | Player review: mark **A/B/C** evidence grades, fix conflicts with latest sheets | backlog |
| B-2 | Add **one scene quote** per PC per major arc beat when thread text exists | backlog |

### Epic C — World spine

| Story | Description | Status |
|-------|-------------|--------|
| C-1 | Single **Concordium** glossary note (factions, slurs, plague economy) from `#loredoc` | **draft** — [[../../lore/concordium]] |
| C-2 | Mission brief one-pager: **research station** objective, month clock, payment | **draft** — see [[../../story/station-and-antagonist]] + [[../../story/arc-structure]] |
| C-3 | **5e overlay** playtest: Tension, tech hazards, magic zones — [[../../story/systems-dnd5e-lewd-tech]] | backlog |
| C-4 | **Discord RP bot + dashboard + AI:** state (**tier** §3.0, Tension, zone, **Exposed/Wired**, hazards); backend passes overlay to **your AI** for consistent **rolls** / narration; GM-gated scene changes; webhook + optional ES ingest — [[../../story/systems-dnd5e-lewd-tech#8-discord-rp-bot-dashboard--ai-tooling]] | backlog |

### Epic D — Asteroid blacksite crawl (station + Amalgam)

| Story | Description | Status |
|-------|-------------|--------|
| D-1 | Lock **Amalgam** threat model (hive, absorption, spawn, traps) + link to [[../../story/factions-and-enemies]] | **done** |
| D-2 | **Station systems** bible (life support, food, power, IT, amenities) — [[../../story/station-systems]] | **done** |
| D-3 | **Factions** roster + infighting hooks — [[../../story/factions-and-enemies]] | **done** |
| D-4 | Polish **salvage contract** + employer lies; tie PCs to briefing in one page | backlog |
| D-5 | Station **proper name** + map landmarks (3 per level) | backlog |
| D-6 | **Prior team** evidence trail (“not the first”) — logs, gear, implications | backlog |
| D-7 | **Dispel fields** vs PC magic — table rules / fiction | backlog |
| D-8 | **Cult** hierarchy one-pager (when discovered, what they want) | backlog |

**Kanban:** [[../../kanban]]

---

## Definition of done (dossiers)

- [ ] Each PC has **Egri spine + contradiction** filled from play or marked TBA  
- [ ] **Relationship** section references at least one **corpo** beat where applicable  
- [ ] **Open questions** listed for player/DM  

---

*Regenerate or port to `sprint-status.yaml` when BMad config is present.*
