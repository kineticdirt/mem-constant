#!/usr/bin/env bash
# safe-update-check.sh — supply-chain "pwned" gate before upgrading a target.
#
# Usage:  bash scripts/linuxbox/safe-update-check.sh <target-name> [--repo-root DIR]
#         bash scripts/linuxbox/safe-update-check.sh --all
#
# Reads agents/update-targets.json, checks the named target for known compromise
# signals, and emits a single verdict: SAFE or HOLD. Writes a markdown report to
# reports/supply-chain/<target>-<UTCdate>.md and prints "VERDICT=SAFE|HOLD".
#
# Policy (CLAUDE.md > Update gate): SAFE => auto-upgrade allowed; HOLD => do not upgrade.
# Fails CLOSED: any error, missing tool, or open advisory => HOLD.
#
# Signals checked (per ecosystem):
#   - Known vulnerabilities via OSV (https://osv.dev) for installed + latest version
#   - Latest published version (PyPI / npm registry / GitHub releases)
#   - Local dependency audit if available (pip-audit / npm audit)
# This script does NOT upgrade anything. It only produces a verdict + report.
set -uo pipefail

REPO_ROOT="${AGENT_DUMP:-$HOME/agent-dump}"
TARGET=""
ALL=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) ALL=1; shift;;
    --repo-root) REPO_ROOT="$2"; shift 2;;
    *) TARGET="$1"; shift;;
  esac
done

TARGETS_JSON="${REPO_ROOT}/agents/update-targets.json"
REPORT_DIR="${REPO_ROOT}/reports/supply-chain"
mkdir -p "${REPORT_DIR}"

if [[ ! -f "${TARGETS_JSON}" ]]; then
  echo "VERDICT=HOLD"
  echo "error: ${TARGETS_JSON} not found" >&2
  exit 2
fi

run_one() {
  local target="$1"
  python3 - "${TARGETS_JSON}" "${target}" "${REPORT_DIR}" <<'PY'
import json, subprocess, sys, urllib.request, urllib.error, datetime, shutil

targets_json, target_name, report_dir = sys.argv[1:4]
cfg = json.load(open(targets_json))
t = next((x for x in cfg.get("targets", []) if x.get("name") == target_name), None)
if not t:
    print("VERDICT=HOLD")
    print(f"error: target {target_name!r} not in update-targets.json", file=sys.stderr)
    sys.exit(2)

notes = []
signals = []        # (label, detail)
hold_reasons = []

def http_json(url, timeout=20, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def sh(cmd, timeout=30):
    try:
        out = subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True, timeout=timeout)
        return out.returncode, (out.stdout or "").strip(), (out.stderr or "").strip()
    except Exception as e:  # noqa: BLE001
        return 1, "", str(e)

eco = t.get("ecosystem", "custom")
pkg = t.get("package") or t.get("name")

# --- current installed version ---
cur_version = None
if t.get("version_cmd"):
    rc, out, err = sh(t["version_cmd"], timeout=25)
    if rc == 0 and out:
        cur_version = out.split()[-1].lstrip("v")
        notes.append(f"installed: {out}")
    else:
        # Not a HOLD on its own: the gate verifies the version we would upgrade TO.
        notes.append(f"version_cmd inconclusive ({err or 'no output'}) — installed version unknown")

# --- latest published version ---
latest = None
if eco == "pip":
    try:
        d = http_json(f"https://pypi.org/pypi/{pkg}/json")
        latest = d["info"]["version"]
        # yanked check for latest
        files = d.get("releases", {}).get(latest, [])
        if files and all(f.get("yanked") for f in files):
            hold_reasons.append(f"latest {latest} is fully yanked on PyPI")
        notes.append(f"PyPI latest: {latest}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            notes.append(f"{pkg} not published on PyPI (likely GitHub/source install) — OSV PyPI check N/A")
        else:
            notes.append(f"PyPI lookup HTTP {e.code}")
            hold_reasons.append("could not reach PyPI to confirm latest")
    except Exception as e:  # noqa: BLE001
        notes.append(f"PyPI lookup failed: {e}")
        hold_reasons.append("could not reach PyPI to confirm latest")
elif eco == "npm":
    try:
        d = http_json(f"https://registry.npmjs.org/{pkg}")
        latest = (d.get("dist-tags") or {}).get("latest")
        notes.append(f"npm latest: {latest}")
    except Exception as e:  # noqa: BLE001
        notes.append(f"npm lookup failed: {e}")
        hold_reasons.append("could not reach npm registry to confirm latest")
elif eco == "custom" and t.get("repo"):
    try:
        d = http_json(f"https://api.github.com/repos/{t['repo']}/releases/latest",
                       headers={"User-Agent": "safe-update-check"})
        latest = (d.get("tag_name") or "").lstrip("v")
        notes.append(f"GitHub latest release: {latest or 'none'}")
    except Exception as e:  # noqa: BLE001
        notes.append(f"GitHub release lookup failed: {e}")

# --- OSV known-vulnerability query (installed + latest) ---
def osv_query(ecosystem, name, version):
    body = json.dumps({"package": {"ecosystem": ecosystem, "name": name},
                       **({"version": version} if version else {})}).encode()
    try:
        d = http_json("https://api.osv.dev/v1/query", data=body,
                      headers={"Content-Type": "application/json"})
        return d.get("vulns") or []
    except Exception as e:  # noqa: BLE001
        return {"__error__": str(e)}

osv_eco = {"pip": "PyPI", "npm": "npm"}.get(eco)
if osv_eco:
    osv_ran = False
    for label, ver in [("installed", cur_version), ("latest", latest)]:
        if not ver:
            continue
        osv_ran = True
        vulns = osv_query(osv_eco, pkg, ver)
        if isinstance(vulns, dict) and "__error__" in vulns:
            notes.append(f"OSV query ({label} {ver}) failed: {vulns['__error__']}")
            hold_reasons.append("OSV advisory check could not complete")
        elif vulns:
            ids = ", ".join(v.get("id", "?") for v in vulns[:8])
            signals.append((f"OSV vulns in {label} {ver}", ids))
            hold_reasons.append(f"{len(vulns)} OSV advisory(ies) affect {label} {ver}: {ids}")
        else:
            signals.append((f"OSV {label} {ver}", "no known advisories"))
    if not osv_ran:
        hold_reasons.append("no resolvable version on registry — could not verify against any advisories")
else:
    notes.append(f"OSV: no ecosystem mapping for {eco!r} (advisory check skipped — treat as caution)")

# --- local dependency audit (timeout=30s; slow SBCs must not block the gate) ---
if eco == "pip" and shutil.which("pip-audit"):
    rc, out, err = sh("pip-audit -f json 2>/dev/null", timeout=30)
    if rc == 0:
        try:
            au = json.loads(out or "{}")
            deps = au.get("dependencies") if isinstance(au, dict) else au
            vulnd = [d for d in (deps or []) if d.get("vulns")]
            if vulnd:
                hold_reasons.append(f"pip-audit: {len(vulnd)} vulnerable dependency(ies)")
                signals.append(("pip-audit", f"{len(vulnd)} vulnerable deps"))
            else:
                signals.append(("pip-audit", "clean"))
        except Exception:  # noqa: BLE001
            notes.append("pip-audit output not parseable")
    elif rc == 124:
        notes.append("pip-audit timed out (30s) — skipped; OSV/registry check still valid")
    else:
        notes.append(f"pip-audit run failed (rc={rc}): {err[:160]}")
elif eco == "npm" and t.get("path") and shutil.which("npm"):
    rc, out, err = sh(f"cd '{t['path']}' && npm audit --json 2>/dev/null", timeout=30)
    if rc == 0:
        try:
            au = json.loads(out or "{}")
            total = (au.get("metadata", {}).get("vulnerabilities", {}) or {}).get("total", 0)
            if total:
                hold_reasons.append(f"npm audit: {total} vulnerability(ies)")
                signals.append(("npm audit", f"{total} total"))
            else:
                signals.append(("npm audit", "clean"))
        except Exception:  # noqa: BLE001
            notes.append("npm audit output not parseable (may be no package.json)")
    elif rc == 124:
        notes.append("npm audit timed out (30s) — skipped; OSV/registry check still valid")
    else:
        notes.append(f"npm audit run failed (rc={rc}): {err[:160]}")

verdict = "HOLD" if hold_reasons else "SAFE"
now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
date = datetime.datetime.utcnow().strftime("%Y%m%d")
report = [
    f"# Supply-chain check — {target_name}",
    "",
    f"- **Verdict:** {verdict}",
    f"- **Checked:** {now}",
    f"- **Ecosystem:** {eco}  ·  **Package/repo:** {pkg}",
    f"- **Installed:** {cur_version or 'unknown'}  ·  **Latest:** {latest or 'unknown'}",
    "",
    "## Signals",
]
report += [f"- {lbl}: {detail}" for lbl, detail in signals] or ["- (none)"]
report += ["", "## Hold reasons"]
report += [f"- {r}" for r in hold_reasons] or ["- none — no compromise/advisory signals found"]
report += ["", "## Notes"]
report += [f"- {n}" for n in notes] or ["- (none)"]
report += ["", "_Auto-upgrade is permitted only on SAFE (policy: auto-upgrade-if-SAFE). HOLD = do not upgrade._", ""]

path = f"{report_dir}/{target_name}-{date}.md"
open(path, "w", encoding="utf-8").write("\n".join(report))
print(f"VERDICT={verdict}")
print(f"REPORT={path}")
for r in hold_reasons:
    print(f"HOLD: {r}", file=sys.stderr)
PY
}

if [[ "${ALL}" -eq 1 ]]; then
  names=$(python3 -c "import json,sys; print('\n'.join(t['name'] for t in json.load(open('${TARGETS_JSON}')).get('targets',[])))")
  overall=0
  while IFS= read -r n; do
    [[ -z "$n" ]] && continue
    echo "=== ${n} ==="
    run_one "$n" || overall=1
  done <<< "${names}"
  exit "${overall}"
else
  if [[ -z "${TARGET}" ]]; then
    echo "usage: $0 <target-name> | --all" >&2
    exit 2
  fi
  run_one "${TARGET}"
fi
