#!/usr/bin/env bash
# Run ON linuxbox. Creates fast / think / meta Hermes profiles with per-lane models.
#
# Model routing (2026-07-13):
#   fast  = Laguna :free primary → Qwen :free → DeepSeek paid last resort
#           (do NOT re-add tencent/hy3:free — OpenRouter sunset 2026-07-21)
#   think = Nous hermes-4-70b → campaigns, digests, narrative worldbuilding
#   code  = z-ai/glm-5.2 → coding, dashboard UI/server, Playwright-verify loops
#   meta  = z-ai/glm-5.2 → same as code (dashboard self-improvement backlog)
#   think/code/meta fallbacks: Step mid → DeepSeek → (cross) quality (no Qwen :free — CN moderation on adult RP).
#   Canonical chains + auto-rotate: agents/hermes-model-registry.json + scripts/linuxbox/hermes-model-failover.sh
# OpenRouter provider for glm-5.2: use default Balanced routing; avoid DekaLLM (low uptime).
set -euo pipefail

source "${HOME}/.bashrc" 2>/dev/null || true
export PATH="${HOME}/.local/bin:${PATH}"
HERMES_BIN="${HOME}/.local/bin/hermes"
HERMES_ROOT="${HOME}/.hermes"

FAST_MODEL="poolside/laguna-xs-2.1:free"
FAST_FALLBACK_QWEN="qwen/qwen3-next-80b-a3b-instruct:free"
THINK_MODEL="nousresearch/hermes-4-70b"
CODE_MODEL="z-ai/glm-5.2"
FALLBACK_STEP="stepfun/step-3.7-flash"
FALLBACK_DEEPSEEK="deepseek/deepseek-v4-flash"

patch_profile_config() {
  local profile="$1"
  local primary="$2"
  local fb1="$3"
  local fb2="$4"
  local cfg="${HERMES_ROOT}/profiles/${profile}/config.yaml"
  if [[ ! -f "${cfg}" ]]; then
    echo "missing ${cfg}" >&2
    return 1
  fi
  python3 - "${profile}" "${cfg}" "${primary}" "${fb1}" "${fb2}" <<'PY'
import sys
import yaml

profile, path, primary, fb1, fb2 = sys.argv[1:6]
with open(path, encoding="utf-8") as f:
    cfg = yaml.safe_load(f)

cfg.setdefault("model", {})
cfg["model"]["default"] = primary
cfg["model"]["provider"] = "openrouter"
cfg["model"]["base_url"] = "https://openrouter.ai/api/v1"
cfg["fallback_providers"] = [
    {"provider": "openrouter", "model": fb1, "base_url": "https://openrouter.ai/api/v1"},
    {"provider": "openrouter", "model": fb2, "base_url": "https://openrouter.ai/api/v1"},
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
  "Quick ticks: status, git pull, IDLE checks, queue ops. Laguna free primary; Qwen free fallback."

ensure_profile think \
  "Deep work: campaign worldbuilding, situation digest, agent-cycle-think (may failover to PC Bonsai)."

ensure_profile chat \
  "Dashboard Chat only: OpenRouter free-first; never patched to PC Bonsai."

ensure_profile code \
  "Coding + UI: server/JS changes, Playwright smoke, refactors. GLM-5.2 primary."

ensure_profile meta \
  "Dashboard self-improvement: LINUXBOX_DASHBOARD_BACKLOG.md UI and server changes."

patch_profile_config fast "${FAST_MODEL}" "${FAST_FALLBACK_QWEN}" "${FALLBACK_DEEPSEEK}"
# ponytail: think must never fall back to Qwen free — dashboard campaign chat hits moderation refusals in Chinese
patch_profile_config think "${THINK_MODEL}" "${FALLBACK_STEP}" "${FALLBACK_DEEPSEEK}"
patch_profile_config chat "${THINK_MODEL}" "${FALLBACK_STEP}" "${FALLBACK_DEEPSEEK}"
patch_profile_config code "${CODE_MODEL}" "${FALLBACK_STEP}" "${FALLBACK_DEEPSEEK}"
patch_profile_config meta "${CODE_MODEL}" "${FALLBACK_STEP}" "${FALLBACK_DEEPSEEK}"

# Ops-safe cron approvals: think/meta/code cron_mode=approve; fast stays deny; hardline kept
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/patch-hermes-approvals-git-safe.py" ]]; then
  python3 "${SCRIPT_DIR}/patch-hermes-approvals-git-safe.py" || true
fi

echo ""
echo "Profiles:"
"${HERMES_BIN}" profile list

echo ""
echo "Smoke (fast / Laguna):"
"${HERMES_BIN}" profile use fast >/dev/null 2>&1 || true
"${HOME}/.local/bin/fast" chat -q "Reply with exactly: fast-laguna-ok" 2>&1 | tail -5

echo ""
echo "Restore default profile for gateway:"
"${HERMES_BIN}" profile use default 2>/dev/null || "${HERMES_BIN}" profile use think 2>/dev/null || true

echo "Done. fast=${FAST_MODEL} (free, fb=${FAST_FALLBACK_QWEN}), think=${THINK_MODEL}, code/meta=${CODE_MODEL}, mid=${FALLBACK_STEP}, minor=${FALLBACK_DEEPSEEK}"
echo "NOTE: tencent/hy3:free removed (OpenRouter sunset 2026-07-21) — do not re-add."
echo "ZenMux provider defined on all managed profiles (base https://zenmux.ai/api/v1, key_env ZENMUX_API_KEY)."
echo "  Set ZENMUX_API_KEY in ~/.hermes/.env to enable; select via 'hermes --provider zenmux -m <slug>' or a 'zenmux:<slug>' prefix. Default routing unchanged (openrouter)."
