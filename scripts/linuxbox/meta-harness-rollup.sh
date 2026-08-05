#!/usr/bin/env bash
# Periodic meta-harness campaign rollup → reports/meta-harness/
set -euo pipefail

REPO="${REPO:-${HOME}/agent-dump}"
OUT="${REPO}/reports/meta-harness"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"

mkdir -p "${OUT}"

python3 "${REPO}/scripts/meta-harness/score_tick.py" --campaign > "${OUT}/campaign-latest.json"
cp "${OUT}/campaign-latest.json" "${OUT}/campaign-${STAMP}.json"

python3 "${REPO}/scripts/meta-harness/query_runs.py" summary > "${OUT}/summary-latest.txt"

# ponytail: keep last 48 hourly snapshots max
ls -1t "${OUT}"/campaign-2*.json 2>/dev/null | tail -n +49 | xargs -r rm -f

echo "meta-harness rollup OK → ${OUT}/campaign-latest.json"
