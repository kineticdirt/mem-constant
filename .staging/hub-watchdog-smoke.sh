#!/usr/bin/env bash
# Ad-hoc integration smoke for linuxbox-status-watchdog.sh using PATH shims.
# Not deployed; run from repo root: bash .staging/hub-watchdog-smoke.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WD="${REPO}/scripts/linuxbox/linuxbox-status-watchdog.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
BIN="${TMP}/bin"
mkdir -p "${BIN}"
export LINUXBOX_AGENT_DUMP="${TMP}/repo"
export HUB_WATCHDOG_LOG="${TMP}/logs"
mkdir -p "${LINUXBOX_AGENT_DUMP}/agents/state"

MODE="${1:?scenario: hung|wedged}"

cat >"${BIN}/systemctl" <<EOF
#!/usr/bin/env bash
if [[ "\$1" == "cat" ]]; then
  [[ "\$2" == "linuxbox-status.service" ]] && exit 0
  exit 1
fi
if [[ "\$1" == "show" ]]; then
  case "${MODE}" in
    hung)
      printf 'ActiveState=active\nSubState=running\nMainPID=0\nActiveStateEnterTimestamp=%s\n' "\$(date)"
      ;;
    wedged)
      printf 'ActiveState=deactivating\nSubState=final-sigkill\nMainPID=0\nActiveStateEnterTimestamp=Wed 2026-08-05 20:00:00 UTC\n'
      ;;
  esac
  exit 0
fi
if [[ "\$1" == "is-active" ]]; then
  [[ "${MODE}" == "hung" ]] && exit 0
  exit 1
fi
exit 0
EOF

cat >"${BIN}/curl" <<'EOF'
#!/usr/bin/env bash
printf '000'
exit 28
EOF

cat >"${BIN}/sudo" <<EOF
#!/usr/bin/env bash
echo "\$*" >>"${TMP}/sudo.log"
exit 0
EOF

chmod +x "${BIN}/systemctl" "${BIN}/curl" "${BIN}/sudo"
export PATH="${BIN}:${PATH}"

bash "${WD}" >/dev/null
ALERT="$(cat "${LINUXBOX_AGENT_DUMP}/agents/state/linuxbox-status-watchdog.json")"
echo "scenario=${MODE}"
echo "alert=${ALERT}"
echo "sudo_calls=$(cat "${TMP}/sudo.log" 2>/dev/null || echo none)"

case "${MODE}" in
  hung)
    [[ "${ALERT}" == *'"recovered"'* && "${ALERT}" == *'restart_hung'* ]] || { echo "SMOKE FAIL: expected recovered/restart_hung" >&2; exit 1; }
    grep -q "systemctl restart linuxbox-status.service" "${TMP}/sudo.log" || { echo "SMOKE FAIL: restart not issued" >&2; exit 1; }
    ;;
  wedged)
    [[ "${ALERT}" == *'failed_needs_reboot'* ]] || { echo "SMOKE FAIL: expected failed_needs_reboot" >&2; exit 1; }
    grep -q "systemctl reset-failed linuxbox-status.service" "${TMP}/sudo.log" || { echo "SMOKE FAIL: reset-failed not issued" >&2; exit 1; }
    ;;
esac
echo "SMOKE PASS (${MODE})"
