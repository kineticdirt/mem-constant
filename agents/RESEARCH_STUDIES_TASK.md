# Research lane (studies / benchmarks)

**Four continuous lanes:** **campaign · project · research · education** (not a fifth idle tier).  
This file = **research**. **Education** = human SI drills (`SELF_IMPROVEMENT_TASK.md` / `si-*`).

**Profile:** `think` when `agents/research-studies-progress.md` has unchecked `[ ]` **and** ops + continuous **project/campaign** boards are quiet.  
**Priority among quiet lanes:** after **education** (SI), before IDLE. Meta markers (dashboard/integrity/…) may still outrank both when open.  
**Not this lane:**
- **Education** → `agents/SELF_IMPROVEMENT_TASK.md` / `si-*` (do not edit that board from research ticks)
- X bookmarks ingest → `agents/RESEARCH_BOOKMARKS_TASK.md`
- AI-stack self-improve → `agents/SELF_IMPROVE_PROGRESS.md`

**Goal:** agent **researches** topics or runs **measurable studies** (model evals, literature notes, design comparisons) → `reports/research/` (alias ok: `reports/studies/`).

## Models — free-only (required)

Config SoT: **`agents/research-studies-models.json`**.

| Role | OpenRouter id |
|------|----------------|
| **Default** | `nvidia/nemotron-3-super-120b-a12b:free` |
| Options | Laguna `poolside/laguna-xs-2.1:free`, Nemotron-ultra `nvidia/nemotron-3-ultra-550b-a55b:free`, North-mini-code `cohere/north-mini-code:free` (no Ling free — 404) |

Rules:

- **Free-only.** Never call paid models for this lane (no DeepSeek / GLM / Hermes-paid / Venice / Step).
- Prefer **default Nemotron-super**; rotate among `options[]` for comparative studies.
- Only ids confirmed live in `agents/model-budget/chat-catalog.json` / probe. Skip sunset/dead: kimi / qwen `:free` / hy3 / Step.
- **Do not** rewrite Hermes think `config.yaml` for this lane (think stays free-only chain). Per-model hops: `hermes -p think chat -m <id>` when supported, else OpenRouter curl with ops key from `~/.hermes/.env` (never print/commit the key). See `scripts/linuxbox/research-studies-probe.sh`.
- **Live page/paper fetch:** `python3 scripts/linuxbox/firecrawl-fetch.py <url>` (Firecrawl cloud; key auto-read from `~/.hermes/.env`) — never raw-curl paywalled or JS-rendered pages.

## One tick = one progress box

1. Read this spec + first unchecked `[ ]` in `agents/research-studies-progress.md`.
2. Do the **smallest** slice of that study (one model × one prompt family, or one research note section — not the whole project).
3. Write/update the deliverable under `reports/research/` (dated file + optional `LATEST.md` pointer).
4. Flip that progress `[ ]`→`[x]`; append a dated Done line.
5. Append one `[LINUX]`/`[PC]` line to `AI_GROUPCHAT.md`. Stop. Do not batch. Do not reseed mid-tick.

When **Open** is empty → skip until human reseeds (or a later quiet tick adds 2–4 new `[ ]`). Prefer reseeding when quiet rather than IDLE forever.

## First project — free-model benchmark

**Deliverable:** `reports/research/free-model-benchmark-YYYY-MM-DD.md` with a **strengths/weaknesses table**.

**Models under test** (from config; skip any that probe FAIL):

1. Laguna XS 2.1 free  
2. Nemotron 3 Super 120B free *(default)*  
3. Nemotron 3 Ultra 550B free *(if still free/live)*  
4. Ling 3.0 Flash free  
5. North Mini Code free  

**Protocol (same short prompts for every model):**

| Family | Prompt gist (keep identical across models) |
|--------|--------------------------------------------|
| Reasoning | One multi-step logic / Bayes-style problem; ask for steps + final answer |
| Code | One small function + edge case; ask for complete runnable snippet |
| Instruction-follow | Multi-constraint instruction (format, length, required keywords) |
| Refusal/safety (light) | Soft boundary ask — note whether it refuses cleanly vs over/under-refuses |

**Record per run:** model id, wall latency (s), completeness (full / truncated / empty), quality notes (1–3 bullets), finish_reason if available. Use `scripts/linuxbox/research-studies-probe.sh` (`max_tokens` 1600 — Laguna-class models may spend the budget on `reasoning_tokens` and return empty content at lower caps).

**Report must include:** methods (prompt text or hashes), per-model rows, **strengths/weaknesses table**, recommendation for think vs research default.

Tick slicing example: `rs-bench-a` = Laguna × reasoning only; next tick = next model or next family — do not finish the whole matrix in one tick.

## Themes (later projects)

| Bucket | Examples |
|--------|----------|
| Model evals | latency/quality matrices, refusal behavior, code vs prose |
| Stack research | Meta-Harness papers, RAG patterns, eval harnesses — apply notes to this repo |
| Domain studies | short literature digests with citations + “what we would try next” |

## Scope (write)

- `agents/research-studies-progress.md`
- `agents/research-studies-models.json` (only if adding a **probed** free id)
- `reports/research/` (or `reports/studies/`)
- `AI_GROUPCHAT.md` (one ledger line)

**Do not:** touch production portfolio, Cloudflare, secrets, campaign registries, human-inbox spam, or SI boards unless the study explicitly needs a read-only cite.

## Verify

- Progress box flipped **or** explicitly blocked with one rich inbox ask (rare — prefer report-only).
- Report path exists under `reports/research/`.
- No paid model id appears in the Done line or report methods.
