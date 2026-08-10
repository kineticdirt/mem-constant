#!/usr/bin/env bash
# Atomically set Hub deploy-pair markers to the same id.
# Prevention for pc-2026-08-08-dash-build-pair-drift: agents bump
# linuxbox-status-server.js DASH_BUILD but forget index.html meta (or SCP one file).
# verify-runtime-state.sh fails html≠js; this helper is the write path.
#
# Usage:
#   bash scripts/linuxbox/bump-dash-build.sh <new-id>   # write both files
#   bash scripts/linuxbox/bump-dash-build.sh --check    # exit 1 if mismatch/missing
#   bash scripts/linuxbox/bump-dash-build.sh --self-check
set -euo pipefail

REPO="${LINUXBOX_AGENT_DUMP:-}"
if [[ -z "${REPO}" ]]; then
  REPO="$(cd "$(dirname "$0")/../.." && pwd)"
fi
HTML="${REPO}/scripts/linuxbox/linuxbox-status/index.html"
JS="${REPO}/scripts/linuxbox/linuxbox-status-server.js"

read_pair() {
  local html_mark js_mark
  html_mark="$(grep -o 'name="dash-build" content="[^"]*"' "${HTML}" | grep -o 'content="[^"]*"' | cut -d'"' -f2 || true)"
  js_mark="$(grep -o 'DASH_BUILD = "[^"]*"' "${JS}" | cut -d'"' -f2 || true)"
  printf '%s\t%s\n' "${html_mark}" "${js_mark}"
}

check_pair() {
  local html_mark js_mark
  IFS=$'\t' read -r html_mark js_mark < <(read_pair)
  if [[ -z "${html_mark}" || -z "${js_mark}" ]]; then
    echo "bump-dash-build: FAIL missing marker html='${html_mark}' js='${js_mark}'" >&2
    return 1
  fi
  if [[ "${html_mark}" != "${js_mark}" ]]; then
    echo "bump-dash-build: FAIL mismatch html='${html_mark}' js='${js_mark}'" >&2
    return 1
  fi
  echo "bump-dash-build: ok (${html_mark})"
  return 0
}

write_pair() {
  local id="$1"
  if [[ ! "${id}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{2,80}$ ]]; then
    echo "bump-dash-build: bad id '${id}' (expect short slug like db_YYYYMMDD-feature-r1)" >&2
    exit 1
  fi
  [[ -f "${HTML}" && -f "${JS}" ]] || {
    echo "bump-dash-build: missing HTML/JS under ${REPO}" >&2
    exit 1
  }
  # Python rewrite keeps CRLF/LF as-is and avoids sed -i platform quirks.
  ID="${id}" HTML="${HTML}" JS="${JS}" python3 - <<'PY'
import os, re, pathlib
html_path = pathlib.Path(os.environ["HTML"])
js_path = pathlib.Path(os.environ["JS"])
new_id = os.environ["ID"]
html = html_path.read_text(encoding="utf-8")
js = js_path.read_text(encoding="utf-8")
html2, n1 = re.subn(
    r'(name="dash-build" content=")[^"]*(")',
    rf'\g<1>{new_id}\g<2>',
    html,
    count=1,
)
js2, n2 = re.subn(
    r'(DASH_BUILD = ")[^"]*(")',
    rf'\g<1>{new_id}\g<2>',
    js,
    count=1,
)
if n1 != 1 or n2 != 1:
    raise SystemExit(f"replace counts html={n1} js={n2} (want 1 each)")
html_path.write_text(html2, encoding="utf-8")
js_path.write_text(js2, encoding="utf-8")
print(f"bump-dash-build: wrote {new_id}")
PY
  check_pair
}

self_check() {
  local root html js out
  root="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '${root}'" EXIT
  mkdir -p "${root}/scripts/linuxbox/linuxbox-status"
  html="${root}/scripts/linuxbox/linuxbox-status/index.html"
  js="${root}/scripts/linuxbox/linuxbox-status-server.js"
  printf '%s\n' '<meta name="dash-build" content="db_old-r1">' >"${html}"
  printf '%s\n' 'const DASH_BUILD = "db_old-r1";' >"${js}"
  REPO="${root}" HTML="${html}" JS="${js}"
  check_pair >/dev/null
  # Force mismatch → --check must fail
  printf '%s\n' 'const DASH_BUILD = "db_other-r1";' >"${js}"
  if check_pair >/dev/null 2>&1; then
    echo "bump-dash-build: self-check FAIL expected mismatch" >&2
    exit 1
  fi
  write_pair "db_selfcheck-r1" >/dev/null
  IFS=$'\t' read -r out _ < <(read_pair)
  [[ "${out}" == "db_selfcheck-r1" ]]
  echo "bump-dash-build: self-check OK"
}

case "${1:-}" in
  --check)
    check_pair
    ;;
  --self-check)
    self_check
    ;;
  ""|-h|--help)
    echo "Usage: $0 <new-id> | --check | --self-check" >&2
    exit 2
    ;;
  *)
    write_pair "$1"
    ;;
esac
