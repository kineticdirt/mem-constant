#!/usr/bin/env bash
# Weekly free-model availability check (reuses .staging/model-probe/probe_free_models.py).
# Writes reports/model-probe/YYYY-MM-DD.md and updates think-free-swap.json last_probe.
# Cron: install via install-probe-free-models-weekly-cron.sh (Sun 07:15).
set -euo pipefail
REPO="${HOME}/agent-dump"
PROBE="${REPO}/.staging/model-probe/probe_free_models.py"
SWAP="${REPO}/agents/model-budget/think-free-swap.json"
REPORT_DIR="${REPO}/reports/model-probe"
ENV_FILE="${HOME}/.hermes/.env"

mkdir -p "${REPORT_DIR}"

# shellcheck disable=SC1090
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ENV_FILE}"
  set +a
fi
export OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-${OPENROUTER_API_KEY_OPS:-}}"
if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo "OPENROUTER_API_KEY missing — cannot probe"
  exit 1
fi

DAY="$(date -u +%Y-%m-%d)"
OUT="${REPORT_DIR}/${DAY}.md"
TMP="$(mktemp)"
set +e
python3 "${PROBE}" >"${TMP}" 2>&1
rc=$?
set -e

{
  echo "# Free model probe — ${DAY}"
  echo ""
  echo "Source: \`.staging/model-probe/probe_free_models.py\`"
  echo "Swap SoT: \`agents/model-budget/think-free-swap.json\`"
  echo ""
  echo '```'
  cat "${TMP}"
  echo '```'
} >"${OUT}"
ln -sfn "${DAY}.md" "${REPORT_DIR}/LATEST.md"

SWAP="${SWAP}" TMP="${TMP}" DAY="${DAY}" python3 - <<'PY'
import json, os, re
from datetime import datetime, timezone
from pathlib import Path
swap_p = Path(os.environ["SWAP"])
tmp = Path(os.environ["TMP"]).read_text(encoding="utf-8", errors="replace")
day = os.environ["DAY"]
ok = []
fail = []
for line in tmp.splitlines():
  m = re.match(r"^(OK|FAIL)\s+(\S+)", line.strip())
  if not m:
    continue
  (ok if m.group(1) == "OK" else fail).append(m.group(2))
try:
  data = json.loads(swap_p.read_text(encoding="utf-8"))
except Exception:
  data = {}
data["last_probe"] = {
  "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
  "key": "ops ~/.hermes/.env OPENROUTER_API_KEY",
  "result": f"weekly probe {day}: OK={len(ok)} FAIL={len(fail)}; ok={ok}; fail={fail}",
  "ok": ok,
  "fail": fail,
  "report": f"reports/model-probe/{day}.md",
}
swap_p.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
print(f"updated {swap_p} last_probe ok={len(ok)} fail={len(fail)}")
PY

rm -f "${TMP}"
echo "report: ${OUT}"
exit "${rc}"
