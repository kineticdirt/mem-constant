#!/usr/bin/env bash
# Run ON linuxbox. Hermes "agent pods" — RP $5 + ops $5 budget pools.
# Requires OPENROUTER_API_KEY_RP and OPENROUTER_API_KEY_OPS in ~/.hermes/.env
set -euo pipefail

source "${HOME}/.bashrc" 2>/dev/null || true
export PATH="${HOME}/.local/bin:${PATH}"
HERMES_BIN="${HOME}/.local/bin/hermes"
HERMES_ROOT="${HOME}/.hermes"
REPO="${HOME}/agent-dump"
ENV_FILE="${HERMES_ROOT}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "missing ${ENV_FILE}" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "${ENV_FILE}"

if [[ -z "${OPENROUTER_API_KEY_RP:-}" ]] || [[ -z "${OPENROUTER_API_KEY_OPS:-}" ]]; then
  echo "Set OPENROUTER_API_KEY_RP and OPENROUTER_API_KEY_OPS in ${ENV_FILE} (each OpenRouter account \$5/day limit)." >&2
  exit 1
fi

write_profile_key() {
  local profile="$1"
  local key_var="$2"
  local key_val="${!key_var}"
  local prof_env="${HERMES_ROOT}/profiles/${profile}/.env"
  mkdir -p "$(dirname "${prof_env}")"
  if [[ -f "${prof_env}" ]]; then
    grep -v '^OPENROUTER_API_KEY=' "${prof_env}" > "${prof_env}.tmp" || true
    mv "${prof_env}.tmp" "${prof_env}"
  fi
  echo "OPENROUTER_API_KEY=${key_val}" >> "${prof_env}"
  chmod 600 "${prof_env}"
  echo "key ${key_var} -> profile ${profile}"
}

ensure_profile() {
  local name="$1"
  local desc="$2"
  if "${HERMES_BIN}" profile show "${name}" >/dev/null 2>&1; then
    echo "profile exists: ${name}"
  else
    "${HERMES_BIN}" profile create "${name}" --clone --description "${desc}"
  fi
}

# Base profiles (models)
bash "${REPO}/scripts/linuxbox/install-hermes-profiles.sh"

# RP pods
for p in hunter-reckoning spacequest nyc-mafia-dnd tropic-gooner; do
  case "${p}" in
    hunter-reckoning) ensure_profile hunter-reckoning "WoD Hunter — Isla Primavera (RP pod, \$5 pool)" ;;
    spacequest)       ensure_profile spacequest "SpaceQuest worldbuilding (RP pod)" ;;
    nyc-mafia-dnd)    ensure_profile nyc-mafia-dnd "NYC Mafia D&D (RP pod)" ;;
    tropic-gooner)    ensure_profile tropic-gooner "Island setting/map orgs (RP pod)" ;;
  esac
  write_profile_key "${p}" OPENROUTER_API_KEY_RP
done

# Ops pods (install-hermes-profiles already created think/code/meta/fast)
for p in think code meta; do
  write_profile_key "${p}" OPENROUTER_API_KEY_OPS
done

HUNTER_PROMPT='Hunter pod (profile hunter-reckoning, RP budget). Workdir agent-dump.

Read agents/HUNTER_RECKONING_TASK.md and campaigns/tropic-gooner/reports/progress-hunter.md.
Complete exactly ONE unchecked [ ] item for the Hunter layer, then stop.
If blocked, append ONE question to agents/state/human-inbox.json (include context field). If nothing to do: IDLE only.
Do NOT touch dashboard, infra, or other campaigns.'

create_rp_cron() {
  local name="$1"
  local schedule="$2"
  local profile="$3"
  local prompt="$4"
  local raw id
  raw=$("${HERMES_BIN}" cron list 2>/dev/null || true)
  id=$(echo "${raw}" | awk -v n="${name}" '
    /^[[:space:]]*[0-9a-f]{12}/ { gsub(/^[[:space:]]+/, ""); id=$1 }
    $0 ~ "Name:[[:space:]]*" n "$" { if (id != "") { print id; exit } }
  ')
  if [[ -n "${id}" ]]; then
    "${HERMES_BIN}" cron remove "${id}" 2>/dev/null || true
  fi
  "${HERMES_BIN}" cron create "${schedule}" "${prompt}" \
    --workdir "${REPO}" \
    --name "${name}" \
    --profile "${profile}" \
    --deliver local
}

create_rp_cron "pod-hunter-reckoning" "every 5m" "hunter-reckoning" "${HUNTER_PROMPT}"

echo ""
echo "OK — agent pods wired. RP key -> hunter/spacequest/nyc/tropic; ops key -> think/code/meta."
echo "Set \$5/day limit on EACH OpenRouter account in dashboard."
echo "Next: stagger spacequest/nyc/tropic crons manually or via kanban (Phase B)."
