# Agentic frameworks audit — 2026-07-26

**Machine evidence:** PC workspace `agent-dump` + SSH `potato` (reachable).  
**Scope:** inventory only — implemented vs docs/trace. No fixes in this pass.  
**Holder:** `agentic-fw-audit`.

### How to read Status

| Status | Meaning |
|--------|---------|
| **implemented** | Code + runtime path exists and is exercised (or clearly available in live Cursor/Hermes) |
| **partial** | Scaffold / install / timers exist but core loop is stale, idle, unpromoted, or Cursor-only while live ticks ignore it |
| **docs-only** | Plans/INTEGRATION docs or prefs name it; little/no runnable wiring |
| **absent** | Named as desire; no real install |

**User asked?** `yes` = explicit preference in `AGENTS.md` / rules / plans; `trace` = appears in ledger/docs but weaker “must use” signal.

---

## Executive snapshot (honest)

Live always-on work on potato is mostly **custom shell + Hermes profiles + OpenRouter free rotate** (`crontab` `agent-cycle-fast` / `agent-cycle-think`), not a full Meta-Harness search loop, not swarm MoE with tasks, and not Graphify/TED-RAG. Several “frameworks” are **real on Cursor (PC)** but **invisible to think ticks**. Meta-Harness **rollup still runs** but **new traces stopped ~2026-07-21** when `agent-pod-scheduler` went inactive; think ticks never wrote `agents/meta-harness/runs/`.

---

## Memory

| Name | User asked? | Status | Evidence paths | Used in live ticks? | Gap |
|------|-------------|--------|----------------|---------------------|-----|
| **MemPalace** | yes | **partial** | `docs/INTEGRATION-MEMPALACE.md`; PC `pip` mempalace **3.3.0**; Cursor MCP `user-mempalace`; global rule MemPalace = durable SoT | **no** (Hermes ticks do not call MemPalace) | Authority model is documented + MCP-available on PC; **no potato install**; promotion on milestones is discipline, not an automated tick step |
| **claude-mem** | yes | **implemented** (Cursor) / **absent** (potato ticks) | `docs/INTEGRATION-CLAUDE-MEM.md`; user hooks in `~/.cursor/hooks.json` (session-init/context/observation/summarize); MCP `user-claude-mem` | **no** for Hermes | Working cache for Cursor threads only; not in `agent-cycle-*` |
| **mem-constant** | yes | **partial** | `.mem-constant/last-session.md`, `pixi-engine.md`; `.cursor/hooks/precompact_carryover.py` → carryover; PC package **0.2.2** (AGENTS claims **0.4.0**); potato has carryover file only, **no pip package** | **indirect** (carryover files may be read by humans/agents; not a Hermes dependency) | Version skew vs AGENTS; no `mem-constant.yaml` in repo root; potato not a mem-constant runtime |
| **Graphify** | yes (layering) | **docs-only** | `docs/INTEGRATION-GRAPHIFY.md`, `docs/BUILD-PHILOSOPHY.md` L1 | **no** | `graphifyy` **not installed** on PC (`import` false); no repo graph artifacts; L4→L1 bridge never built |

---

## Orchestration

| Name | User asked? | Status | Evidence paths | Used in live ticks? | Gap |
|------|-------------|--------|----------------|---------------------|-----|
| **Hermes (Nous)** | yes | **implemented** | Gateway **active**; profiles `fast/think/meta/code/chat/hunter-*`; `hermes` **v0.14.0**; think-focus updated **2026-07-26T03:27Z** | **yes** | Primary live agent runtime. Note: AGENTS says Hermes-managed hex jobs for fast/think — **live is user crontab** `* * * * *` → `~/bin/agent-cycle-{fast,think}-tick.sh`. Hermes cron list has RSS/site/intel/etc., **not** agent-cycle-* |
| **Owl Alpha / “OWL”** | trace→yes (early) | **docs-only / superseded** | `docs/agents/linuxbox-hermes-owl-alpha.md` (historical Owl Alpha primary) | **no** | Doc tables still cite Owl/old paid chains; live think is Laguna free-first / paid last-resort DeepSeek |
| **NousAgent lane** | yes | **partial** | `agents/nousagent-progress.md` (items still `[ ]`); `nousagent-health.sh`; has-work includes nousagent board | **rarely** | Progress board never completed; health script used by dashboard; not a separate framework |
| **swarm MoE** | yes | **partial** | `agents/swarm-experts.json`; `scripts/linuxbox/swarm-dispatch.sh`; timer **active/enabled**; fast-tick calls `--once`; `docs/agents/swarm-moe-linuxbox.md` | **timer yes, work no** | Potato **missing** `agents/swarm-queue.json`; PC queue `tasks: []`; `swarm-runs.jsonl` = **1 smoke line (2026-07-05)**; experts JSON stale (delisted Qwen free, old Hermes/GLM ids); `max_concurrent: 1` |
| **Meta-Harness** | yes | **partial** | `agents/meta-harness/` + `scripts/meta-harness/`; upstream clone `…/MAIN_PROGRAMMING_FILES/meta-harness`; plan `docs/plans/meta-harness-linuxbox-integration.md`; rollup timer **active** → `reports/meta-harness/`; **1637** historical run JSONs on potato | **rollup yes; new traces no** | Newest run files **2026-07-21** (hunter/tropic). `agent-pod-scheduler` **inactive** (only writer of per-tick runs + `score_tick`). Think tick **does not** call `score_tick` / write runs. Campaign **001** winner **staged never promoted** (`active/` missing on potato). Rollup re-scores **stale** corpus every 30m (identical ~520KB campaign dumps) |
| **Cursor CLI (`agent`)** | yes | **implemented** (manual) | Potato `~/.local/bin/agent` → cursor-agent **2026.06.26**; `~/.cursor-agent.env` present | **no** (off-cron by design) | Paid lane; not free always-on |
| **cursor.com/agents** | yes | **trace / partial** | Swarm routing `cursor-cloud` → expert `cloud`; push→git-bundle path in swarm doc | **no standing queue** | Handoff path exists on paper; empty swarm queue |
| **continual-learning** | trace | **partial** | `.cursor/hooks/state/continual-learning.json` (+ index); spacequest copy; Cursor subagent type `agents-memory-updater` | **no** Hermes | State files exist; workspace `hooks.json` only wires **preCompact carryover** — not a full continual-learning loop into MemPalace |
| **agent-pod-scheduler** | yes (older) | **partial / stalled** | `scripts/linuxbox/agent-pod-scheduler.sh` (writes meta-harness runs); systemd timer **inactive** | **no** (since ~Jul 21) | Replaced in practice by crontab think/fast; meta-harness tracing orphaned |

---

## Coding style / skills

| Name | User asked? | Status | Evidence paths | Used in live ticks? | Gap |
|------|-------------|--------|----------------|---------------------|-----|
| **ponytail** | yes | **implemented** (dual surface) | Cursor: `.cursor/rules/ponytail.mdc` + `.cursor/skills/ponytail/`; Hermes: plugin **enabled v4.8.3** under `~/.hermes/plugins/ponytail`; CLAUDE.md install note; `ponytail-cleanup` pod traces (9 historical) | **Cursor yes; Hermes plugin enabled but slash-commands not proven on every tick** | Not “rule only” — Hermes plugin **is** installed+enabled. Live ticks still mostly follow CLAUDE.md prose ladder, not necessarily `/ponytail` skill invocation |
| **BMAD / workflow skills** | yes | **implemented** (Cursor dogfood) | `.cursor/skills/` **44** dirs, **41** `bmad-*`; `_bmad/` deleted 2026-04-26; mem-constant templates under `src/mem_constant/templates/workflow-skills/` | **no** Hermes | Skills available when Cursor invokes them; think ticks do not load BMAD skill pack |
| **Karpathy guidelines** | yes | **implemented** (Cursor rule) | `.cursor/rules/karpathy-guidelines.mdc` alwaysApply | **no** Hermes | Instruction-only for Cursor agents |
| **resource-governance / context-budget** | yes | **implemented** (rules) | `.cursor/rules/resource-governance.mdc`, `context-budget.mdc`; CLAUDE.md mirror | **partial** (budget/free-first encoded in tick scripts) | Policy lives in rules + tick code; not a separate framework |

---

## Inference / routing

| Name | User asked? | Status | Evidence paths | Used in live ticks? | Gap |
|------|-------------|--------|----------------|---------------------|-----|
| **OpenRouter free swap** | yes | **implemented** | `agents/model-budget/think-free-swap.json`; think-tick rotate + probes; Hub `/api/model-budget`; ledger 2026-07-25 free-429 / paid last-resort | **yes** | Core live routing. Free pool often **429 Remaining=0**; paid DeepSeek last-resort when enabled |
| **ZenMux** | yes | **partial** | Provider registered; chat catalog `zenmux:` prefix; AGENTS: cannot be Hermes profile primary | **manual Chat/Pixi picks only** | Dead free slug history (`kimi-k3-free` 404); not think primary |
| **Bonsai (PC :8000)** | yes (optional) | **partial / down** | `agents/pc-bonsai-routing.json`; potato curl `:8000` → **000** this audit | **no** (unreachable) | Optional failover; OpenRouter path carries think |
| **Satyr (PC summarizer)** | yes (Pixi) | **partial** | Pixi env `SATYR_BASE_URL` set on potato; `linuxbox-pixi-rp` tree present | **Pixi path only** (not Hermes ticks) | Host-order Satyr→OpenRouter→hydrate; not agentic-ops framework |
| **Venice NSFW helper** | yes (Pixi) | **trace** | AGENTS prefs | Pixi-adjacent | Out of ops-tick scope |

---

## Research / browse

| Name | User asked? | Status | Evidence paths | Used in live ticks? | Gap |
|------|-------------|--------|----------------|---------------------|-----|
| **Firecrawl** | yes | **partial** | `FIRECRAWL_API_KEY` set in `~/.hermes/.env`; think/default config `backend: firecrawl` / `cloud_provider: firecrawl`; `configure-firecrawl-hermes.sh` | **configured, plugin “not enabled”** | Hermes `browser/firecrawl` plugin status **not enabled** while YAML points at firecrawl — ambiguous whether tools actually fire. Prefer cloud over Chromium is policy |
| **TED-RAG** | yes (watch) | **docs-only / absent** | `agents/intel-trackers.json` watch entry; AGENTS: “don’t integrate until mature” | **no** | Explicit non-integration |

---

## Planned not shipped

| Name | User asked? | Status | Evidence paths | Used in live ticks? | Gap |
|------|-------------|--------|----------------|---------------------|-----|
| **LineageOS parallel free workers** | yes | **docs-only** | `docs/plans/parallel-free-workers-lineage-2026-07-23.md` — “decided direction — **not implemented yet**” | **no** | No claim API, no Termux worker, swarm still `max_concurrent: 1` |
| **Meta-Harness Phase 2 domain adapt / Phase 3 promote** | yes | **partial** | Plan unchecked: human promote winner; proposer filesystem root; Claude→Cursor/Hermes wrapper | **no** | Winner `think-prompt.md.staged` never → live `think-prompt.md` on potato |
| **Infranet agentic-commerce** | adjacent | **docs-only** (product) | `docs/infranet/`, `projects/infranet/` | **no** | Not an agent orchestration framework for this stack; listed only to avoid conflation |
| **Graphify install + L1 regen** | yes | **absent** | INTEGRATION doc only | **no** | Never `pip install graphifyy` / `graphify .` in this workspace |
| **Harbor / TBench2 on box** | explicit non-goal | **absent** | Meta-Harness plan Phase 4 | **no** | Correctly kept off 2 GB ARM |

---

## Potato runtime checklist (2026-07-26 evidence)

| Check | Result |
|-------|--------|
| SSH `potato` | REACHABLE |
| `hermes-gateway` | active |
| User crontab fast/think | `* * * * *` both present; think-focus fresh |
| Hermes cron agent-cycle-* | **absent** (docs drift) |
| `swarm-dispatch.timer` | active; queue file **missing** on potato |
| `meta-harness-rollup.timer` | active; summary shows hunter 1201 / tropic 402 / think 25 / ponytail 9 |
| Newest meta-harness run JSON | **2026-07-21** |
| `agent-pod-scheduler.timer` | **inactive** |
| Hermes plugin `ponytail` | **enabled** 4.8.3 |
| Hermes plugin `browser/firecrawl` | **not enabled** (YAML still references firecrawl) |
| Cursor CLI | installed; env present; off-cron |
| mem-constant / mempalace pip on potato | **not installed** |
| Bonsai :8000 from potato | down |

---

## What agents actually use day-to-day

```text
┌─ Cursor (PC) ─────────────────────────────────────────────┐
│ claude-mem hooks + MCP │ MemPalace MCP │ ponytail rule+skill │
│ BMAD/workflow skills   │ Karpathy/gov rules │ preCompact→carryover │
│ (optional) Meta-Harness PC campaign scripts                 │
└────────────────────────────────────────────────────────────┘

┌─ potato always-on ────────────────────────────────────────┐
│ crontab → agent-cycle-fast / agent-cycle-think              │
│      → hermes chat --profile … + OpenRouter free rotate     │
│      → CLAUDE.md + CURRENT_TASK lane boards                 │
│ swarm timer → IDLE (no queue)                               │
│ meta-harness rollup → rescores OLD pod-scheduler traces     │
│ Firecrawl key present; browser plugin not enabled           │
│ ponytail Hermes plugin enabled (slash skills available)     │
└────────────────────────────────────────────────────────────┘
```

**Verdict on the user’s suspicion:** Partly right. The stack **names** Meta-Harness, swarm, Graphify, TED-RAG, Lineage workers, mem-constant 0.4.0, Owl — but **live ticks are custom Hermes+crontab**. Cursor **does** use claude-mem, MemPalace MCP, ponytail, and BMAD skills. Meta-Harness is **installed and rollup-alive** but **not driving or scoring current think ticks**.

---

## Top gaps (priority)

1. **Meta-Harness disconnected from live think** — no new traces since pod-scheduler died; winner never promoted; rollup is a zombie scorer.
2. **Swarm MoE idle** — timer without queue file/tasks; experts stale; not the parallel free MoE you asked for.
3. **Memory authority not on the box** — MemPalace/claude-mem/mem-constant are Cursor-centric; potato ticks don’t promote/query them.
4. **Graphify + TED-RAG + Lineage workers** — still watch/docs only.
5. **Docs drift** — Owl Alpha runbook, Hermes-managed agent-cycle crons, mem-constant **0.4.0** claim vs PC **0.2.2**, Firecrawl “configured” vs plugin not enabled.

---

## Sources touched

- `AGENTS.md`, `CLAUDE.md`, `AI_GROUPCHAT.md` (keyword scan)
- `docs/INTEGRATION-{MEMPALACE,CLAUDE-MEM,GRAPHIFY}.md`
- `docs/plans/meta-harness-linuxbox-integration.md`, `parallel-free-workers-lineage-2026-07-23.md`
- `docs/agents/swarm-moe-linuxbox.md`, `linuxbox-hermes-owl-alpha.md`
- `agents/meta-harness/**`, `scripts/meta-harness/**`, `agents/swarm-*.json`
- `.cursor/rules/*`, `.cursor/skills/`, `.cursor/hooks.json`
- Potato: systemd timers, crontab, hermes plugins/cron, meta-harness runs mtimes, think-focus

*End of inventory. No commit. No framework “fixes” in this pass.*
