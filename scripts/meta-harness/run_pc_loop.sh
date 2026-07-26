#!/usr/bin/env bash
# One PC-side meta-harness iteration: propose locally, rollup on linuxbox.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SSH_HOST="${LINUXBOX_SSH:-potato}"

echo "=== meta-harness PC loop ==="

python3 "${REPO_ROOT}/scripts/meta-harness/propose_harness.py"

ssh "${SSH_HOST}" "bash ~/agent-dump/scripts/linuxbox/meta-harness-rollup.sh"

echo
echo "--- campaign (remote latest) ---"
ssh "${SSH_HOST}" "cat ~/agent-dump/reports/meta-harness/campaign-latest.json" | head -40

echo
echo "Done. Re-run this script or cron it for recurring proposals."
