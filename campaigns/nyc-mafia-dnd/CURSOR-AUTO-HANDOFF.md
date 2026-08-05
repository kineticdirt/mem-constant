# Cursor Auto handoff — NYC Mafia × D&D

**Updated:** 2026-08-02 (PC GM) — **B19 binder voice** + peoples/races B17

## Active canon (every prompt)

Read `campaigns/nyc-mafia-dnd/LOCKS.md` banner first.

- **Eras:** **Uneven temporal stack** — mid-century culture × late-1800s street tech. **No exact year** (VOID "1958"). `SETTING-CAPABILITY-ASYMMETRY.md`.
- **Peoples & Races:** German elves, French half-elves/genasi/tiefling, Spanish human/dragonborn/tiefling, Welsh firbolgs, Scottish goliaths, Jewish goblinoids (Erklings/Goddarts). `SETTING-PEOPLES-RACES.md` (B17).
- **Arms:** **Capsule arms** default — **VOID gunpowder**. `SETTING-ARMS.md` + `worldbuilding/details/capsule-arms.md` (B16).
- **Asymmetry:** medicine/life **strong** · automata/sentience **threat** · computation **weak**. Classify lane before inventing.
- **Magic-biotech:** sigils, bindings, living patterns — not lab/CRISPR.
- **Tech:** late-1800s spell-tech; D&D 5e needs→spell; NOT 1931 magitech / NOT modern science.
- **Automata:** existential threat (force/labor/sentience — not supercomputers).
- **Prose:** STE for tables/prices; **binder voice** for paragraphs (B19). Barry dryness on examples; no slop.
- **Binder voice (B19):** Digressions OK; opinionated asides; uneven paragraphs; concrete nouns; jokes that land flat. **Avoid:** tapestry/vibrant/delve/nestled/underscores/landscape of; symmetric bullet poetry; "In this setting…". See `worldbuilding/VOICE.md`.
- **Humor (B13):** Barry (HBO) — dry, awkward, darkly funny until it isn't. Not sitcom.

## Primary job (2026-08-02)

| Job | Prompt | Timeout | Deliverable |
|-----|--------|---------|-------------|
| **nyc-peoples-expansion** | `agents/state/cursor-prompts/nyc-peoples-expansion-20260801.txt` | **2400s** | Expand Chinatown, Greek, and Scandinavian blocks with concrete institutions and Barry-tone scene seeds in `SETTING-PEOPLES-RACES.md`. |

```bash
export CURSOR_AGENT_TIMEOUT_SEC=2400 CURSOR_SDK_AUTO_ONLY=1 CURSOR_VARIANT=auto AGENT_DUMP=/home/abhinav/agent-dump
PROMPT=$AGENT_DUMP/agents/state/cursor-prompts/nyc-peoples-expansion-20260801.txt
nohup bash "$AGENT_DUMP/scripts/linuxbox/cursor-agent-run.sh" "$(cat "$PROMPT")" \
  > /mnt/archive/logs/cursor-agent/nyc-peoples-expansion-$(date -u +%Y%m%dT%H%M%SZ).log 2>&1 &
```

| Job | Prompt | Timeout | Deliverable |
|-----|--------|---------|-------------|
| **nyc-capsule-arms-expand** | `agents/state/cursor-prompts/nyc-capsule-arms-expand-20260802.txt` | **1800s** | *(done — integrated into SETTING-ARMS.md and reports)* |

**RAM:** one Auto SDK job if swap heavy; queue boroughs when idle.

## Deferred multitask (when slot free)

| Lane | Prompt | Deliverable |
|------|--------|-------------|
| **nyc-boroughs** | `agents/state/cursor-prompts/nyc-multitask-boroughs-20260801.txt` | `worldbuilding/strokes/borough-city-build.md` |
| **nyc-econ** | `agents/state/cursor-prompts/nyc-multitask-econ-20260801.txt` | `worldbuilding/details/city-economics.md` |
| **nyc-culture** | `agents/state/cursor-prompts/nyc-multitask-culture-20260801.txt` | `worldbuilding/details/nightlife-culture.md` |
| **nyc-barry-tone** | `agents/state/cursor-prompts/nyc-barry-tone-20260801.txt` | Dialogue texture pass |

## Void / do not restore

- **No exact calendar year** (B14) — use uneven stack / jazz-vice language only.
- `nyc-50s-full-rewrite` calendar locks — superseded by B14/B15.

## Ledger

Append `[LINUX] Result` on potato; PC mirrors via SCP/git bundle.
