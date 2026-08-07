#!/usr/bin/env bash
# Print papercut entries by status from agents/papercuts.md.
# Usage: bash scripts/linuxbox/papercuts-list.sh [open|in-progress|fixed|all]
# ponytail: awk paragraph scan; entries are "## pc-*" sections, template fenced off.
set -euo pipefail

REPO="${AGENT_DUMP:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
FILE="${REPO}/agents/papercuts.md"
STATUS="${1:-open}"

[[ -f "${FILE}" ]] || { echo "ERROR: no papercuts file at ${FILE}" >&2; exit 1; }

awk -v status="${STATUS}" '
  function flush() { if (building && hit) printf "%s\n", buf }
  /^```/ { inf = !inf; next }
  inf { next }
  /^## pc-/ { flush(); buf = $0 ORS; building = 1; hit = 0; next }
  building {
    buf = buf $0 ORS
    if ($0 ~ /\*\*Status:\*\*/ && (status == "all" || $0 ~ ("\\*\\*Status:\\*\\*[[:space:]]*" status))) hit = 1
  }
  END { flush() }
' "${FILE}"
