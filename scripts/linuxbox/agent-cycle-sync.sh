#!/usr/bin/env bash
# Deterministic sync + inbox hygiene (formerly fast lane). No LLM.
# Called at the start of every agent-cycle-think-tick.sh (1m crontab).
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
REPO="${HOME}/agent-dump"

cd "${REPO}"
mkdir -p "${REPO}/agents/state"
date -Iseconds > "${REPO}/agents/state/sync-tick.last"

# Keep durable ~/bin shadows (tick re-exec + has-work preference) in lockstep with
# the repo — stale-shadow prevention (pc-2026-08-05). Atomic mv; no-op when equal.
bash "${REPO}/scripts/linuxbox/refresh-bin-shadows.sh" 2>/dev/null || true

python3 "${REPO}/scripts/linuxbox/human-inbox-normalize.py" "${REPO}" --quiet 2>/dev/null || true
bash "${REPO}/scripts/linuxbox/kill-stale-chromium.sh" 2>/dev/null || true
bash "${REPO}/scripts/linuxbox/apply-git-bundle.sh" 2>/dev/null || true
# Bundle hard-reset can replay git HEAD ellipse stubs over GM borders when preserve fails.
bash "${REPO}/scripts/linuxbox/tableslop-gm-borders-autorestore.sh" 2>/dev/null || true
# Always-on error corrector (deterministic): refresh tableslop LATEST.json every sync tick.
timeout 45 bash "${REPO}/scripts/linuxbox/tableslop-error-collect.sh" >/dev/null 2>&1 || true
# Free-model readiness cache (~30m TTL inside script — avoid re-pinging OR on every free fail).
timeout 90 bash "${REPO}/scripts/linuxbox/free-models-health.sh" >/dev/null 2>&1 || true
timeout 12 bash "${REPO}/scripts/linuxbox/git-pull-and-deploy.sh" 2>/dev/null || true
bash "${REPO}/scripts/linuxbox/swarm-dispatch.sh" --once 2>/dev/null || true
python3 "${REPO}/scripts/linuxbox/consume-inbox-answers.py" --repo "${REPO}" 2>/dev/null || true
# LLM hand-edits of user-tasks.json sometimes stamp created_at/updated_at in the
# future (ET→UTC double-conversion). Clamp anything >10min ahead back to now.
python3 - "${REPO}" <<'PY' 2>/dev/null || true
import json, sys
from datetime import datetime, timezone
from pathlib import Path
p = Path(sys.argv[1]) / "agents" / "user-tasks.json"
if not p.is_file():
    raise SystemExit(0)
try:
    d = json.loads(p.read_text(encoding="utf-8"))
except Exception:
    raise SystemExit(0)
now = datetime.now(timezone.utc)
now_s = now.strftime("%Y-%m-%dT%H:%M:%SZ")
changed = 0
for t in (d.get("tasks") if isinstance(d, dict) else []) or []:
    if not isinstance(t, dict):
        continue
    for k in ("created_at", "updated_at"):
        v = t.get(k)
        if not v:
            continue
        try:
            ts = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        except ValueError:
            continue
        if (ts - now).total_seconds() > 600:
            t[k] = now_s
            changed += 1
if changed:
    p.write_text(json.dumps(d, indent=2) + "\n", encoding="utf-8")
    print(f"user-tasks ts clamp: {changed} future stamps reset", flush=True)
PY
