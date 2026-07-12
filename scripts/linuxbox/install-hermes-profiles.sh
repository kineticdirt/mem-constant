#!/usr/bin/env bash
# Run ON linuxbox. Creates fast / think / meta Hermes profiles with per-lane models.
#
# Model routing (2026-06-27, $5 OpenRouter cap — cost-aware):
#   fast  = Qwen FREE  -> high-frequency ticks (every ~30s-1m); NEVER a paid model here
#                         or the $5 cap drains. This is the cost guard.
#   think = Nous hermes-4-70b -> deep work (newest Nous; far cheaper than 405b).
#   meta  = same as think -> dashboard self-improvement.
#   Fallbacks: DeepSeek V4 Flash (cheap MoE) then Qwen free.
# Note: the literal Nous MoE (Mixtral 8x7B) is delisted from OpenRouter; hermes-4-* are dense.
# To revert: set THINK_MODEL back and re-run this script.
set -euo pipefail

source "${HOME}/.bashrc" 2>/dev/null || true
export PATH="${HOME}/.local/bin:${PATH}"
HERMES_BIN="${HOME}/.local/bin/hermes"
HERMES_ROOT="${HOME}/.hermes"

FAST_MODEL="qwen/qwen3-next-80b-a3b-instruct:free"
THINK_MODEL="nousresearch/hermes-4-70b"
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
cfg.setdefault("agent", {})
if profile == "fast":
    cfg["agent"]["max_turns"] = 30
    cfg["agent"]["reasoning_effort"] = "low"

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
  "Quick ticks: status, git pull, IDLE checks, queue ops. Qwen free primary."

ensure_profile think \
  "Deep work: campaign worldbuilding, situation digest, interactive chat."

ensure_profile meta \
  "Dashboard self-improvement: LINUXBOX_DASHBOARD_BACKLOG.md UI and server changes."

patch_profile_config fast "${FAST_MODEL}" "${FALLBACK_DEEPSEEK}" "${THINK_MODEL}"
patch_profile_config think "${THINK_MODEL}" "${FALLBACK_DEEPSEEK}" "${FAST_MODEL}"
patch_profile_config meta "${THINK_MODEL}" "${FALLBACK_DEEPSEEK}" "${FAST_MODEL}"

echo ""
echo "Profiles:"
"${HERMES_BIN}" profile list

echo ""
echo "Smoke (fast / Qwen):"
"${HERMES_BIN}" profile use fast >/dev/null 2>&1 || true
"${HOME}/.local/bin/fast" chat -q "Reply with exactly: fast-qwen-ok" 2>&1 | tail -5

echo ""
echo "Restore default profile for gateway:"
"${HERMES_BIN}" profile use default 2>/dev/null || "${HERMES_BIN}" profile use think 2>/dev/null || true

echo "Done. fast=${FAST_MODEL} (free), think/meta=${THINK_MODEL}, fallback=${FALLBACK_DEEPSEEK}"
