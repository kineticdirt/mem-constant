#!/usr/bin/env bash
# Fail-loud if Hub server local require('./…') modules are missing from
# scripts/pc/push-linuxbox.sh DASHBOARD_PATHS.
# Prevention for pc-2026-08-05-deploy-list-new-file-miss (server ships, deps don't).
#
# Usage:
#   bash scripts/linuxbox/check-dashboard-require-paths.sh
#   bash scripts/linuxbox/check-dashboard-require-paths.sh --self-check
set -euo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-}"
if [[ -z "${REPO}" ]]; then
  REPO="$(cd "$(dirname "$0")/../.." && pwd)"
fi

SERVER_JS="${REPO}/scripts/linuxbox/linuxbox-status-server.js"
PUSH_SH="${REPO}/scripts/pc/push-linuxbox.sh"
MODE="${1:-}"

run_check() {
  local simulate_missing="${1:-}"
  SERVER_JS="${SERVER_JS}" PUSH_SH="${PUSH_SH}" REPO="${REPO}" \
    SIMULATE_MISSING="${simulate_missing}" python3 - <<'PY'
import os, re, sys
from pathlib import Path

repo = Path(os.environ["REPO"])
server = Path(os.environ["SERVER_JS"])
push_sh = Path(os.environ["PUSH_SH"])
simulate = (os.environ.get("SIMULATE_MISSING") or "").strip().replace("\\", "/")

if not server.is_file():
    print(f"check-dashboard-require-paths: missing {server}", file=sys.stderr)
    sys.exit(2)
if not push_sh.is_file():
    print(f"check-dashboard-require-paths: missing {push_sh}", file=sys.stderr)
    sys.exit(2)

# Parse DASHBOARD_PATHS=( ... ) from push-linuxbox.sh (ignore comments / blanks).
text = push_sh.read_text(encoding="utf-8")
m = re.search(r"^DASHBOARD_PATHS=\((.*?)^\)\s*$", text, re.M | re.S)
if not m:
    print("check-dashboard-require-paths: DASHBOARD_PATHS=(…) not found in push-linuxbox.sh", file=sys.stderr)
    sys.exit(2)
paths = set()
for line in m.group(1).splitlines():
    line = line.split("#", 1)[0].strip()
    if not line:
        continue
    paths.add(line.replace("\\", "/"))

if simulate:
    if simulate in paths:
        paths.remove(simulate)
    else:
        print(f"check-dashboard-require-paths: SIMULATE_MISSING not in DASHBOARD_PATHS: {simulate}", file=sys.stderr)
        sys.exit(2)

req_re = re.compile(r"""require\s*\(\s*['"](\./[^'"]+)['"]\s*\)""")

def resolve_req(from_file: Path, rel: str):
    # Node: './foo' → foo.js next to from_file when no extension.
    target = (from_file.parent / rel).resolve()
    if target.is_file():
        return target
    if not target.suffix:
        for ext in (".js", ".json", ".node"):
            cand = Path(str(target) + ext)
            if cand.is_file():
                return cand
    return None

# BFS from status-server through local ./ requires under scripts/linuxbox/.
linuxbox_root = (repo / "scripts" / "linuxbox").resolve()
seen_files = set()
queue = [server.resolve()]
required_repo_paths = []

while queue:
    cur = queue.pop(0)
    if cur in seen_files:
        continue
    seen_files.add(cur)
    try:
        body = cur.read_text(encoding="utf-8")
    except OSError as e:
        print(f"check-dashboard-require-paths: cannot read {cur}: {e}", file=sys.stderr)
        sys.exit(2)
    for rel in req_re.findall(body):
        resolved = resolve_req(cur, rel)
        if resolved is None:
            print(
                f"check-dashboard-require-paths: unresolved require('{rel}') from {cur.relative_to(repo)}",
                file=sys.stderr,
            )
            sys.exit(1)
        if not str(resolved).startswith(str(linuxbox_root)):
            continue  # ignore odd escapes outside linuxbox/
        try:
            rel_repo = resolved.relative_to(repo.resolve()).as_posix()
        except ValueError:
            continue
        if rel_repo not in required_repo_paths:
            required_repo_paths.append(rel_repo)
        if resolved not in seen_files:
            queue.append(resolved)

missing = [p for p in required_repo_paths if p not in paths]
# Entrypoint must also be listed.
entry = "scripts/linuxbox/linuxbox-status-server.js"
if entry not in paths:
    missing.insert(0, entry)

if missing:
    print("check-dashboard-require-paths: FAIL - required Hub modules missing from DASHBOARD_PATHS:", file=sys.stderr)
    for p in missing:
        print(f"  - {p}", file=sys.stderr)
    print(
        "Add them to scripts/pc/push-linuxbox.sh DASHBOARD_PATHS before deploy "
        "(pc-2026-08-05-deploy-list-new-file-miss).",
        file=sys.stderr,
    )
    sys.exit(1)

print(f"check-dashboard-require-paths: ok ({len(required_repo_paths)} local requires covered)")
for p in required_repo_paths:
    print(f"  + {p}")
sys.exit(0)
PY
}

if [[ "${MODE}" == "--self-check" ]]; then
  echo "=== require-paths self-check: listed OK ==="
  run_check ""
  echo "=== require-paths self-check: synthetic missing → expect fail ==="
  if run_check "scripts/linuxbox/chars-registry-read-cache.js"; then
    echo "check-dashboard-require-paths: self-check FAIL — synthetic missing did not fail" >&2
    exit 1
  fi
  echo "check-dashboard-require-paths: self-check ok (listed OK; synthetic missing failed as expected)"
  exit 0
fi

run_check ""
