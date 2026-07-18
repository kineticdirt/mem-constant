#!/usr/bin/env bash
# Run ON linuxbox. Additively register the ZenMux provider on Hermes profiles WITHOUT
# rewriting model/provider/base_url/fallback (unlike install-hermes-profiles.sh, which
# would revert e.g. the `think` profile's PC-Bonsai routing back to OpenRouter).
#
# Idempotent: only sets `providers.zenmux` when absent (or --force to overwrite that key).
# Default routing is unchanged — ZenMux is merely addressable via
# `hermes --provider zenmux -m <slug>` or the dashboard `zenmux:<slug>` prefix, once
# ZENMUX_API_KEY is present in ~/.hermes/.env.
#
# Usage:
#   bash add-zenmux-provider.sh                 # all profiles under ~/.hermes/profiles + default
#   bash add-zenmux-provider.sh chat think      # only named profiles
#   FORCE=1 bash add-zenmux-provider.sh         # overwrite existing providers.zenmux
set -euo pipefail

HERMES_ROOT="${HERMES_ROOT:-$HOME/.hermes}"
FORCE="${FORCE:-0}"

# Build the profile list: explicit args, else every profile dir + the default (root) config.
declare -a CFGS=()
if [[ $# -gt 0 ]]; then
  for p in "$@"; do CFGS+=("${HERMES_ROOT}/profiles/${p}/config.yaml"); done
else
  [[ -f "${HERMES_ROOT}/config.yaml" ]] && CFGS+=("${HERMES_ROOT}/config.yaml")
  if [[ -d "${HERMES_ROOT}/profiles" ]]; then
    while IFS= read -r cfg; do CFGS+=("${cfg}"); done \
      < <(find "${HERMES_ROOT}/profiles" -mindepth 2 -maxdepth 2 -name config.yaml 2>/dev/null)
  fi
fi

if [[ ${#CFGS[@]} -eq 0 ]]; then
  echo "No Hermes config.yaml found under ${HERMES_ROOT}." >&2
  exit 1
fi

for cfg in "${CFGS[@]}"; do
  if [[ ! -f "${cfg}" ]]; then
    echo "skip (missing): ${cfg}"
    continue
  fi
  python3 - "${cfg}" "${FORCE}" <<'PY'
import sys
import yaml

path, force = sys.argv[1], sys.argv[2] == "1"
with open(path, encoding="utf-8") as f:
    cfg = yaml.safe_load(f) or {}

providers = cfg.get("providers")
if not isinstance(providers, dict):
    providers = {}
    cfg["providers"] = providers

if "zenmux" in providers and not force:
    print(f"unchanged (zenmux present): {path}")
    sys.exit(0)

providers["zenmux"] = {
    "name": "ZenMux",
    "base_url": "https://zenmux.ai/api/v1",
    "key_env": "ZENMUX_API_KEY",
    "api_mode": "chat_completions",
    "discover_models": True,
}
with open(path, "w", encoding="utf-8") as f:
    yaml.safe_dump(cfg, f, default_flow_style=False, sort_keys=False, allow_unicode=True)
print(f"zenmux provider set: {path}")
PY
done

echo ""
echo "Done. Set ZENMUX_API_KEY in ${HERMES_ROOT}/.env to enable, then:"
echo "  hermes --provider zenmux -m <slug> chat -q 'ping'   # or use a zenmux:<slug> id in the dashboard"
echo "Default model/provider/fallback routing was NOT modified."
