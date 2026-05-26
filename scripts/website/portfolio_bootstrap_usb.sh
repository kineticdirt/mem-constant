#!/usr/bin/env bash
# Create USB workspace for portfolio redesign prototypes.
set -euo pipefail

ROOT="${1:-/media/abhinav/PERSONAL/agent-work/abhinavall-net/portfolio-redesign}"
REPO="${HOME}/agent-dump"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -d "/media/abhinav/PERSONAL" ]]; then
  echo "ERROR: USB PERSONAL not mounted. Plug thumb drive and retry." >&2
  exit 1
fi

mkdir -p "${ROOT}/v1-system" "${ROOT}/v2-editorial" "${ROOT}/v3-kinetic"

if [[ -f "${REPO}/agents/PORTFOLIO_CONTENT_INVENTORY.md" ]]; then
  cp -f "${REPO}/agents/PORTFOLIO_CONTENT_INVENTORY.md" "${ROOT}/content-inventory.md"
fi

if [[ -f "${SCRIPT_DIR}/portfolio_preview_hub.html" ]]; then
  cp -f "${SCRIPT_DIR}/portfolio_preview_hub.html" "${ROOT}/index.html"
fi

PROGRESS="${ROOT}/progress.md"
if [[ ! -f "${PROGRESS}" ]]; then
  cat >"${PROGRESS}" <<'EOF'
# Portfolio redesign progress

- [ ] 0 Inventory + analysis.md
- [ ] 1 directions.md (3 distinct sites)
- [ ] 2 Research v1 → v1-system/research.md
- [ ] 3 Build v1-system (standalone site)
- [ ] 4 Validate v1
- [ ] 5 Research v2 → v2-editorial/research.md
- [ ] 6 Build v2-editorial
- [ ] 7 Validate v2
- [ ] 8 Research v3 → v3-kinetic/research.md
- [ ] 9 Build v3-kinetic
- [ ] 10 Validate v3
- [ ] 11 Preview hub index.html (toggle 3 sites)
- [ ] 12 comparison.md
- [ ] 13 TASK_COMPLETE

Last tick UTC: (not started)
EOF
fi

echo "ok: ${ROOT} (hub: index.html)"
