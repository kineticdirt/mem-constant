#!/usr/bin/env bash
# Publish homelab tree to github.com/kineticdirt/Linuxbox (main).
# mem-constant package sources stay on mem-constant repo — not copied here.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
REMOTE="${LINUXBOX_GIT_REMOTE:-git@github.com:kineticdirt/Linuxbox.git}"
BRANCH="${LINUXBOX_GIT_BRANCH:-main}"
STAGE="$(mktemp -d /tmp/linuxbox-publish-XXXXXX)"
trap 'rm -rf "${STAGE}"' EXIT

echo "=== publish-linuxbox-repo → ${REMOTE} (${BRANCH}) ==="

python3 - "${REPO}" "${STAGE}" <<'PY'
import os
import shutil
import sys
from pathlib import Path

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
EXCLUDE_DIRS = {
    ".git", "node_modules", "__pycache__", ".pytest_cache", "secrets",
    "src", "tests", ".staging",
}
EXCLUDE_FILES = {
    "nul", "pyproject.toml", "phase3_migrate_skills.py", "agent-workflow-fold-plan.md",
}
SKIP_PREFIXES = (
    "campaigns/tropic-gooner/map/master-enhanced.png",
    "campaigns/tropic-gooner/map/tiles/",
)

def skip(rel: str) -> bool:
    if rel in EXCLUDE_FILES:
        return True
    parts = rel.replace("\\", "/").split("/")
    if parts[0] in EXCLUDE_DIRS:
        return True
    if parts[:2] == ["src", "mem_constant"]:
        return True
    norm = rel.replace("\\", "/")
    for p in SKIP_PREFIXES:
        if norm == p or norm.startswith(p):
            return True
    return False

for root, dirs, files in os.walk(src):
    rel_root = Path(root).relative_to(src)
    # prune dirs in-place
    dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not (rel_root.parts == () and d == "src")]
    if rel_root.parts and rel_root.parts[0] in EXCLUDE_DIRS:
        continue
    for name in files:
        rel = str((rel_root / name).as_posix()) if str(rel_root) != "." else name
        if skip(rel):
            continue
        s = Path(root) / name
        d = dst / rel_root / name
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(s, d)
print(f"staged under {dst}")
PY

cp "${REPO}/README-LINUXBOX.md" "${STAGE}/README.md"

cd "${STAGE}"
git init -q
git add -A
git commit -q -m "$(cat <<'EOF'
chore: initial Linuxbox homelab + swarm MoE

Homelab agent stack (Hermes pods, swarm dispatcher, dashboard, campaigns).
mem-constant package sources intentionally excluded — see mem-constant repo.
EOF
)"

git branch -M "${BRANCH}"
git remote add origin "${REMOTE}"
echo "pushing $(git rev-parse --short HEAD) …"
git push -u origin "${BRANCH}"

echo "=== published $(git rev-parse --short HEAD) to ${REMOTE} ${BRANCH} ==="
