#!/usr/bin/env bash
# Run ON linuxbox: bootstrap USB workspace and activate overnight portfolio task.
set -euo pipefail

REPO="${HOME}/agent-dump"
TASK_FILE="${REPO}/agents/CURRENT_TASK.md"

bash "${REPO}/scripts/website/portfolio_bootstrap_usb.sh"

cat >"${TASK_FILE}" <<'EOF'
# Hermes task inbox

**Status:** active — portfolio redesign (v3: 3 sites + toggle hub)

Read **`agents/PORTFOLIO_REDESIGN_TASK.md`** and **`agents/PORTFOLIO_CONTENT_INVENTORY.md`**.

**Three separate websites** — `v1-system/`, `v2-editorial/`, `v3-kinetic/` — each a full standalone site (own HTML/CSS/JS). **Not** one page with a theme switch.

**Before each build:** `web_search` → write that folder's **`research.md`** (ideas for that direction only).

**Preview hub:** `portfolio-redesign/index.html` on USB — **toggle tabs** to iframe each site. Keep hub working through step 11.

**USB:** `/media/abhinav/PERSONAL/agent-work/abhinavall-net/portfolio-redesign/`

**This tick:** one step from `progress.md` only; update checkboxes + UTC.

Full content inventory required. No deploy to abhinavall.net. Step 13 → idle + **TASK_COMPLETE**.
EOF

systemctl --user restart hermes-gateway 2>/dev/null || true

echo "Portfolio overnight task ACTIVE."
echo "Workspace: /media/abhinav/PERSONAL/agent-work/abhinavall-net/portfolio-redesign/"
echo "Monitor: tail -f progress.md on USB, or agents/CURRENT_TASK.md"
echo "agent-cycle (every 1m) will advance one step per tick."
