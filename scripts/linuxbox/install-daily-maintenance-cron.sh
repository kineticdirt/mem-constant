#!/usr/bin/env bash
# Run ON linuxbox: daily intel feed health probe (07:00 UTC) before situation-rss (08:00).
set -euo pipefail

source "${HOME}/.bashrc" 2>/dev/null || true
HERMES_BIN="${HOME}/.local/bin/hermes"
REPO="${HOME}/agent-dump"
HERMES_SCRIPTS="${HOME}/.hermes/scripts"

mkdir -p "${HERMES_SCRIPTS}"
mkdir -p "${REPO}/reports/maintenance"
mkdir -p "${REPO}/agents"

install -m 755 "${REPO}/scripts/linuxbox/intel-feed-health.py" "${HERMES_SCRIPTS}/intel-feed-health.py"

cat > "${HERMES_SCRIPTS}/intel-feed-health.sh" <<'WRAP'
#!/usr/bin/env bash
set -euo pipefail
REPO="${HOME}/agent-dump"
cd "${REPO}"
python3 "${HOME}/.hermes/scripts/intel-feed-health.py" || true
WRAP
chmod 755 "${HERMES_SCRIPTS}/intel-feed-health.sh"

delete_if_exists() {
  local name="$1"
  local id
  id="$("${HERMES_BIN}" cron list 2>/dev/null | grep -E "${name}" | head -1 | awk '{print $1}')" || true
  if [[ -n "${id}" ]]; then
    "${HERMES_BIN}" cron delete "${id}" 2>/dev/null || true
  fi
}

delete_if_exists "intel-feed-health"

"${HERMES_BIN}" cron create "0 7 * * *" "" \
  --name intel-feed-health \
  --workdir "${REPO}" \
  --script intel-feed-health.sh \
  --no-agent \
  --deliver local

echo "Installed intel-feed-health (07:00 UTC daily)."
echo "Reports: ${REPO}/reports/maintenance/"
echo "Agent lane: agents/DAILY_MAINTENANCE_TASK.md + maintenance-progress.md"
