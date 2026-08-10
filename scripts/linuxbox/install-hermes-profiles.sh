#!/usr/bin/env bash
# Run ON linuxbox. Creates fast / think / meta Hermes profiles with per-lane models.
#
# Model routing (2026-07-24) — FREE-FIRST. Paid order is DeepSeek, then GLM 5.2 as DeepSeek's backup.
#   think = FREE-ONLY (every-minute cron; must never reach a paid model)
#   fast  = free-first, DeepSeek only if all free fail
#   meta/code = free code model → big free → DeepSeek → GLM 5.2 (backup for DeepSeek)
#   chat  = free-first → DeepSeek → GLM 5.2
# Do NOT re-add (probe-verified dead, each one silently burns a retry hop):
#   qwen/qwen3-next-80b-a3b-instruct:free  — delisted from OpenRouter (paid variant only now)
#   zenmux moonshotai/kimi-k3-free         — 404 invalid_model, never existed (real kimi-k3 = $3/$15 per M)
#   stepfun/step-3.7-flash                 — demoted, burned ~$14/day thrashing think
#   tencent/hy3:free                       — OpenRouter sunset 2026-07-21
#   inclusionai/ling-3.0-flash:free        — OpenRouter 404 2026-08-09 (paid slug only; see think-free-swap _do_not_readd)
# ZenMux cannot be a profile PRIMARY: Hermes resolves it as provider "custom" and drops
# ZENMUX_API_KEY → 403. Keep it registered for dashboard/manual `zenmux:<slug>` use only.
# Re-probe ids before editing: .staging/model-probe/probe_free_models.py
#   Canonical chains + auto-rotate: agents/hermes-model-registry.json + scripts/linuxbox/hermes-model-failover.sh
# OpenRouter provider for glm-5.2: use default Balanced routing; avoid DekaLLM (low uptime).
set -euo pipefail

source "${HOME}/.bashrc" 2>/dev/null || true
export PATH="${HOME}/.local/bin:${PATH}"
HERMES_BIN="${HOME}/.local/bin/hermes"
HERMES_ROOT="${HOME}/.hermes"

# Verified free models (wide pool 2026-07-25 — SoT agents/model-budget/think-free-swap.json).
# Hermes same-provider fallback_providers often does NOT rotate model ids; think tick outer -m loop is real failover.
FREE_SMALL="poolside/laguna-xs-2.1:free"
FREE_MID="nvidia/nemotron-3-super-120b-a12b:free"
FREE_CODE="cohere/north-mini-code:free"
FREE_BIG="nvidia/nemotron-3-ultra-550b-a55b:free"
FREE_LAGUNA_S="poolside/laguna-s-2.1:free"
FREE_GEMMA="google/gemma-4-31b-it:free"
FREE_OSS="openai/gpt-oss-20b:free"
# Paid tail: DeepSeek is the only paid head; GLM 5.2 sits behind it as backup.
PAID_HEAD="deepseek/deepseek-v4-flash"
PAID_BACKUP="z-ai/glm-5.2"

patch_profile_config() {
  local profile="$1"
  local primary="$2"
  shift 2
  local cfg="${HERMES_ROOT}/profiles/${profile}/config.yaml"
  if [[ ! -f "${cfg}" ]]; then
    echo "missing ${cfg}" >&2
    return 1
  fi
  # remaining args = fallback chain, in order (variadic: chains are 2-4 deep)
  python3 - "${profile}" "${cfg}" "${primary}" "$@" <<'PY'
import sys
import yaml

profile, path, primary = sys.argv[1:4]
fallbacks = sys.argv[4:]
with open(path, encoding="utf-8") as f:
    cfg = yaml.safe_load(f)

cfg.setdefault("model", {})
cfg["model"]["default"] = primary
cfg["model"]["provider"] = "openrouter"
cfg["model"]["base_url"] = "https://openrouter.ai/api/v1"
cfg["fallback_providers"] = [
    {"provider": "openrouter", "model": m, "base_url": "https://openrouter.ai/api/v1"}
    for m in fallbacks
]
# ZenMux — second OpenAI-compatible provider, selectable alongside OpenRouter.
# Defining it here only makes it addressable (`hermes --provider zenmux -m <slug>` or a
# `zenmux:<slug>` prefix routed by the dashboard); it does NOT change default routing —
# primary stays openrouter, so behaviour is unchanged when ZENMUX_API_KEY is unset.
cfg.setdefault("providers", {})
cfg["providers"]["zenmux"] = {
    "name": "ZenMux",
    "base_url": "https://zenmux.ai/api/v1",
    "key_env": "ZENMUX_API_KEY",
    "api_mode": "chat_completions",
    "discover_models": True,
}
cfg.setdefault("agent", {})
if profile == "fast":
    cfg["agent"]["max_turns"] = 30
    cfg["agent"]["reasoning_effort"] = "low"
elif profile in ("code", "meta"):
    cfg["agent"]["reasoning_effort"] = "high"

with open(path, "w", encoding="utf-8") as f:
    yaml.safe_dump(cfg, f, default_flow_style=False, sort_keys=False, allow_unicode=True)
print(f"patched {profile} -> primary={primary}")
PY
}

ensure_profile() {
  local name="$1"
  local desc="$2"
  if "${HERMES_BIN}" profile show "${name}" >/dev/null 2>&1; then
    echo "profile exists: ${name}"
    return 0
  fi
  "${HERMES_BIN}" profile create "${name}" --clone --description "${desc}"
}

ensure_profile fast \
  "Quick ticks: status, git pull, IDLE checks, queue ops. Free-first; DeepSeek last resort."

ensure_profile think \
  "Deep work: campaign worldbuilding, situation digest, agent-cycle-think (may failover to PC Bonsai)."

ensure_profile chat \
  "Dashboard Chat only: OpenRouter free-first; never patched to PC Bonsai."

ensure_profile code \
  "Coding + UI: server/JS changes, Playwright smoke, refactors. Free code model primary; GLM-5.2 last."

ensure_profile meta \
  "Dashboard self-improvement: LINUXBOX_DASHBOARD_BACKLOG.md UI and server changes."

# think: FREE-ONLY wide pool — every-minute cron, never reaches a paid model (fails/IDLEs instead of spending).
# Note: Hermes often retries primary 3× without rotating same-provider fallbacks; think tick uses -m rotate through think-free-swap.json.
patch_profile_config think "${FREE_SMALL}" "${FREE_MID}" "${FREE_CODE}" "${FREE_BIG}" "${FREE_LAGUNA_S}" "${FREE_GEMMA}" "${FREE_OSS}"
# fast: free-first; DeepSeek only if every free model fails.
patch_profile_config fast "${FREE_SMALL}" "${FREE_MID}" "${PAID_HEAD}"
# meta/code: free code model first; GLM 5.2 last, as DeepSeek's backup.
patch_profile_config meta "${FREE_CODE}" "${FREE_BIG}" "${PAID_HEAD}" "${PAID_BACKUP}"
patch_profile_config code "${FREE_CODE}" "${FREE_BIG}" "${PAID_HEAD}" "${PAID_BACKUP}"
# chat: interactive dashboard chat, same paid tail.
patch_profile_config chat "${FREE_SMALL}" "${FREE_MID}" "${PAID_HEAD}" "${PAID_BACKUP}"

# Ops-safe cron approvals: think/meta/code cron_mode=approve; fast stays deny; hardline kept
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/patch-hermes-approvals-git-safe.py" ]]; then
  python3 "${SCRIPT_DIR}/patch-hermes-approvals-git-safe.py" || true
fi

echo ""
echo "Profiles:"
"${HERMES_BIN}" profile list

echo ""
echo "Smoke (fast / free primary):"
"${HERMES_BIN}" profile use fast >/dev/null 2>&1 || true
"${HOME}/.local/bin/fast" chat -q "Reply with exactly: fast-free-ok" 2>&1 | tail -5

echo ""
echo "Restore default profile for gateway:"
"${HERMES_BIN}" profile use default 2>/dev/null || "${HERMES_BIN}" profile use think 2>/dev/null || true

echo "Done (FREE-FIRST). think=${FREE_SMALL} FREE-ONLY | fast=${FREE_SMALL} | meta/code=${FREE_CODE} | paid tail=${PAID_HEAD} then ${PAID_BACKUP}"
echo "NOTE: do NOT re-add tencent/hy3:free (sunset), qwen/...:free (delisted 2026-07-24), moonshotai/kimi-k3-free (404 never existed), stepfun/step-3.7-flash (burned ~\$14 thrashing think)."
echo "ZenMux stays registered for manual/dashboard 'zenmux:<slug>' use only — it CANNOT be a profile primary (Hermes resolves it as provider 'custom' and drops ZENMUX_API_KEY -> 403)."
echo "Re-probe free ids before editing chains: python3 .staging/model-probe/probe_free_models.py"
