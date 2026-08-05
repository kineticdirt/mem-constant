# Model budget (agent / token management)

Shared **routing + spend policy** for Hermes, dashboard Chat, and future agent swarms.

## Rules

1. **Free first** — Laguna XS 2.1:free → Qwen free (do **not** re-add `tencent/hy3:free`; OpenRouter sunset **2026-07-21**).
2. **Paid only** when free hits rate-limit (429), moderation refusal, unavailable, or empty/broken replies.
3. **Brief/minor** → `deepseek/deepseek-v4-flash` first among paid; **mid** → `stepfun/step-3.7-flash` before Hermes/GLM; workshop prefers Step then DeepSeek then quality.
4. **Track usage** in `agents/state/model-budget.json` (+ Chat’s `chat-model-usage.json`).
5. **Pool caps** — ops/RP daily USD targets live here (`daily_usd_target: 7`). OpenRouter enforces the real key `limit`; sync with `scripts/linuxbox/set-openrouter-key-limit.sh` (needs `OPENROUTER_MANAGEMENT_API_KEY`) or the OpenRouter UI.

`:free` 429s are **capacity/RPM**, not the USD cap — separate failure modes.

## Not Kubernetes

This is the **logical** control plane for model tokens (like pods sharing a quota). Physical K3s scheduling is separate; swarms should call the same policy instead of hard-coding models.

## Files

| Path | Role |
|------|------|
| `config.json` | Policy (git-tracked) |
| `chat-catalog.json` | Curated Chat model picker (est. cost + tok/s; not live scrape) |
| `agents/state/model-budget.json` | Live day counters (gitignored) |
| `scripts/linuxbox/model-budget.py` | CLI: `status` / `decide` / `record` |
| `set-openrouter-key-limit.sh` | Push USD cap to OpenRouter Management API |

Chat modes live in `agents/chat-modes.json`. Human-usable plan: `agents/CHAT_HUMAN_USABLE_V1.md`.
