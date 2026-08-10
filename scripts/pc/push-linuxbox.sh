#!/usr/bin/env bash
# Push agent-dump paths to physical linuxbox. PC-side only.
# Usage:
#   bash scripts/pc/push-linuxbox.sh --finished   # all bundles in linuxbox-deploy-manifest.json
#   bash scripts/pc/push-linuxbox.sh --all|--agents|--scripts-linuxbox|--dashboard
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
FIX_SH_CRLF_REMOTE="${REPO}/scripts/pc/fix-sh-crlf-remote.sh"
HOST="${LINUXBOX_HOST:-abhinav@100.122.108.94}"
KEY="${LINUXBOX_SSH_KEY:-$HOME/.ssh/id_rsa_potato}"
REMOTE="${LINUXBOX_AGENT_DUMP:-/home/abhinav/agent-dump}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=25 -o IdentitiesOnly=yes -i "${KEY}")
TARBALL="/tmp/linuxbox-push-$$.tgz"
MANIFEST="${REPO}/agents/linuxbox-deploy-manifest.json"

MODE="${1:---all}"

# Runtime-truth files (user-tasks, swarm-queue, archive-meta, agents/state/**)
# are potato-owned and MUST NOT be pushed from PC — see
# docs/runtime-state-protection.md + agents/protected-runtime-paths.json.
AGENT_PATHS=(
  agents/CURRENT_TASK.md
  agents/deepsec-config.json
  agents/inbox-seeds.json
  agents/INBOX_PROSE.md
  agents/THINK_SECURITY_CHECKS.md
  agents/USER_TASKS_TASK.md
  agents/swarm-experts.json
  agents/hermes-model-registry.json
  agents/model-budget/config.json
  agents/model-budget/README.md
  agents/model-budget/chat-catalog.json
  agents/chat-modes.json
  agents/CHAT_HUMAN_USABLE_V1.md
  agents/agent-pods.manifest.json
  agents/system-integrity-config.json
  agents/system-integrity-progress.md
  agents/SYSTEM_INTEGRITY_TASK.md
  agents/SECURITY_CODE_AUDIT_TASK.md
  agents/security-code-audit-progress.md
  agents/intel-trackers.json
  scripts/situation_monitor/sources.json
  scripts/situation_monitor/sources.example.json
  scripts/situation_monitor/daily_situation_monitor.py
  scripts/situation_monitor/run-daily-brief.sh
  agents/linuxbox-deploy-manifest.json
  agents/protected-runtime-paths.json
  agents/machine-registry.json
  agents/resource-governor.json
  agents/intent
  agents/AGENT_LOOPS_INTENT.md
  agents/state/.gitkeep
  agents/state/multitask-locks/.gitkeep
  agents/meta-harness/eval-tasks.json
  agents/meta-harness/domain_spec.md
  agents/meta-harness/runs/README.md
  agents/meta-harness/candidates/README.md
  .cursor/rules/anti-slop.mdc
  .cursor/rules/ai-bad-habits.mdc
  .cursor/skills/write-source-analysis/check_article.py
)

LINUXBOX_SCRIPT_PATHS=(
  scripts/linuxbox/apply-git-bundle.sh
  scripts/linuxbox/align-agent-dump-linuxbox.sh
  scripts/linuxbox/repoint-agent-dump-remote.sh
  scripts/linuxbox/git-pull-and-deploy.sh
  scripts/linuxbox/protected-paths.py
  scripts/linuxbox/verify-runtime-state.sh
  scripts/linuxbox/backup-registries.sh
  agents/protected-runtime-paths.json
  scripts/linuxbox/swarm-dispatch.sh
  scripts/linuxbox/install-swarm-dispatch-timer.sh
  scripts/linuxbox/agent-cycle-sync.sh
  scripts/linuxbox/think-setup-context.py
  scripts/linuxbox/install-agent-cycle-think-only.sh
  scripts/linuxbox/agent-cycle-fast-tick.sh
  scripts/linuxbox/agent-cycle-think-tick.sh
  scripts/linuxbox/refresh-bin-shadows.sh
  scripts/linuxbox/lib/think-log-classify.sh
  scripts/linuxbox/think-continuity-seed.py
  scripts/linuxbox/goal-inject.py
  scripts/linuxbox/think-work-packet.py
  scripts/linuxbox/resource_governor.py
  agents/think-agent-setup.md
  scripts/linuxbox/agent-cycle-has-work.py
  scripts/linuxbox/think-shell-access-form.py
  scripts/linuxbox/think-incident-form.py
  scripts/linuxbox/cursor-agent-run.sh
  scripts/linuxbox/human-inbox-normalize.py
  scripts/linuxbox/consume-inbox-answers.py
  scripts/linuxbox/kill-stale-chromium.sh
  scripts/linuxbox/tableslop-server.js
  scripts/linuxbox/tableslop-auth.js
  scripts/linuxbox/test-tableslop-auth.js
  scripts/linuxbox/vendor/sql-js/sql-wasm.js
  scripts/linuxbox/vendor/sql-js/sql-wasm.wasm
  scripts/linuxbox/vendor/sql-js/LICENSE
  scripts/linuxbox/tableslop-static/3d
  scripts/linuxbox/campaigns-availability-server.js
  scripts/linuxbox/campaigns-availability-selfcheck.js
  scripts/linuxbox/campaign-discord-probe.py
  scripts/linuxbox/install-campaigns-avail-linuxbox.sh
  scripts/linuxbox/linuxbox-campaigns-avail.service
  campaigns/eurosluts/tracker.json
  campaigns/eurosluts/discord.json
  campaigns/nyc-mafia-dnd/tracker.json
  campaigns/nyc-mafia-dnd/discord.json
  campaigns/tropic-gooner/tracker.json
  campaigns/tropic-gooner/discord.json
  campaigns/tropic-gooner/map/cities
  scripts/linuxbox/agent-pod-scheduler.sh
  scripts/linuxbox/deepsec-scan.sh
  scripts/linuxbox/archive_meta.py
  scripts/linuxbox/lib/archive-paths.sh
  scripts/linuxbox/verify_agent_intent.py
  scripts/linuxbox/agent-intent-gate.sh
  scripts/linuxbox/agent-intent-gate.service
  scripts/linuxbox/agent-intent-gate.timer
  scripts/linuxbox/install-agent-intent-gate.sh
  scripts/linuxbox/hermes-model-failover.sh
  scripts/linuxbox/install-hermes-profiles.sh
  scripts/linuxbox/pc-bonsai-failover.sh
  scripts/linuxbox/hermes-gateway-watchdog.sh
  scripts/linuxbox/install-hermes-gateway-watchdog.sh
  scripts/linuxbox/linuxbox-status-watchdog.sh
  scripts/linuxbox/install-linuxbox-status-watchdog.sh
  scripts/linuxbox/nousagent-health.sh
  scripts/linuxbox/patch-hermes-approvals-git-safe.py
  scripts/linuxbox/model-budget.py
  scripts/linuxbox/set-openrouter-key-limit.sh
  scripts/linuxbox/install-hermes-model-health-cron.sh
  scripts/linuxbox/install-situation-monitor-cron.sh
  scripts/linuxbox/hermes-env-bootstrap.sh
  scripts/linuxbox/meta-harness-rollup.sh
  scripts/linuxbox/meta-harness-rollup.service
  scripts/linuxbox/meta-harness-rollup.timer
  scripts/linuxbox/install-meta-harness-rollup.sh
  scripts/meta-harness/record_tick.py
  scripts/meta-harness/score_tick.py
  scripts/meta-harness/query_runs.py
  scripts/meta-harness/propose_harness.py
  scripts/meta-harness/run_think_campaign.py
  scripts/meta-harness/think_baseline.py
  scripts/meta-harness/score_prompt.py
  scripts/meta-harness/README.md
)

DASHBOARD_PATHS=(
  scripts/linuxbox/linuxbox-status-server.js
  scripts/linuxbox/linuxbox-docs-wiki.js
  scripts/linuxbox/linuxbox-status/index.html
  scripts/linuxbox/linuxbox-status/docs-wiki.js
  scripts/linuxbox/linuxbox-status/icons/pixi.svg
  scripts/linuxbox/linuxbox-machines.js
  scripts/linuxbox/linuxbox-systems.js
  scripts/linuxbox/chat-offload-handoff.js
  scripts/linuxbox/chars-registry-merge.js
  scripts/linuxbox/chars-registry-persist.js
  scripts/linuxbox/chars-registry-read-cache.js
  scripts/linuxbox/multitask-lock.js
  scripts/linuxbox/multitask-lock-cli.js
  scripts/linuxbox/multitask-lock.sh
  scripts/linuxbox/restore-chars-side-npcs.js
  scripts/linuxbox/test-multitask-lock.js
  scripts/linuxbox/test-chars-registry-persist.js
  scripts/pixi/sheet-to-dossier.py
  campaigns/_templates/character-sheet.md
  campaigns/_templates/character-sheet.example.md
  campaigns/tropic-gooner/characters/_pilot-mira-vale-example.md
  campaigns/nyc-mafia-dnd/characters/INDEX.md
  docs/pixi/docs-engine-bridge.md
  docs/plans/character-sheet-baseline-2026-07-27.md
  agents/machine-registry.json
  agents/linuxbox-systems.json
  agents/state/multitask-locks/.gitkeep
  docs/multitask-shared-state-lock.md
  docs/chars-registry-versioning.md
  docs/agents/linuxbox-systems-panel.md
  docs/infranet/INFRANET-COMBINED-BRIEF.md
  docs/infranet/INFRANET-BUSINESS-BRIEF.md
  docs/infranet/INFRANET-DESIGN-PROPOSAL.md
  docs/infranet/wiki/INDEX.md
  docs/infranet/wiki/00-HOW-IT-WORKS.md
  docs/infranet/wiki/01-PROBLEMS-TO-SOLVE.md
  docs/infranet/wiki/02-OPEN-SOURCE-LANDSCAPE.md
  docs/infranet/wiki/03-TRY-IT-EXAMPLES.md
  projects/infranet/ARCHITECTURE.md
  projects/infranet/poc/README.md
)

normalize_sh() {
  for p in "$@"; do
    [[ "${p}" == *.sh ]] && sed -i 's/\r$//' "${REPO}/${p}" 2>/dev/null || true
  done
}

# Hub once shipped with literal "\r" (backslash+r) instead of CRLF → browser JS parse fail → stuck Loading…
normalize_dashboard_text() {
  for p in "$@"; do
    case "${p}" in
      *.html|*.js)
        sed -i -e 's/\\r$//' -e 's/\r$//' "${REPO}/${p}" 2>/dev/null || true
        ;;
    esac
  done
}

push_tarball() {
  local -n _paths=$1
  local restart_svc="${2:-}"
  local verify_url="${3:-}"

  # Defense in depth: never ship protected runtime paths, even if a future
  # edit re-adds one to a path list (docs/runtime-state-protection.md).
  local _py
  _py="$(command -v python3 || command -v python)"
  if [[ -n "${_py}" && -f "${REPO}/agents/protected-runtime-paths.json" ]]; then
    local _filtered=()
    while IFS= read -r p; do
      p="${p//$'\r'/}"
      [[ -n "${p}" ]] && _filtered+=("${p}")
    done < <(printf '%s\n' "${_paths[@]}" | PROTECTED_REPO="${REPO}" "${_py}" "${REPO}/scripts/linuxbox/protected-paths.py" filter-stdin)
    _paths=("${_filtered[@]}")
  fi

  if [[ ${#_paths[@]} -eq 0 ]]; then
    echo "nothing to push" >&2
    return 1
  fi

  normalize_sh "${_paths[@]}"
  normalize_dashboard_text "${_paths[@]}"
  tar -czf "${TARBALL}" -C "${REPO}" "${_paths[@]}"
  echo "uploading $(du -h "${TARBALL}" | cut -f1) → ${HOST}:${REMOTE} …"
  scp "${SSH_OPTS[@]}" "${TARBALL}" "${HOST}:/tmp/linuxbox-push.tgz"

  ssh "${SSH_OPTS[@]}" "${HOST}" bash -s <<EOF
set -euo pipefail
# Preserve runtime inbox + chat-threads if a push tarball includes agents/state stubs.
INBOX_BAK=""
CHAT_BAK=""
if [[ -f "${REMOTE}/agents/state/human-inbox.json" ]]; then
  INBOX_BAK=\$(mktemp)
  cp -a "${REMOTE}/agents/state/human-inbox.json" "\$INBOX_BAK"
fi
if [[ -d "${REMOTE}/agents/state/chat-threads" ]]; then
  CHAT_BAK=\$(mktemp -d)
  cp -a "${REMOTE}/agents/state/chat-threads/." "\$CHAT_BAK/"
fi
tar xzf /tmp/linuxbox-push.tgz -C "${REMOTE}"
if [[ -n "\$INBOX_BAK" ]]; then
  mkdir -p "${REMOTE}/agents/state"
  cp -a "\$INBOX_BAK" "${REMOTE}/agents/state/human-inbox.json"
  rm -f "\$INBOX_BAK"
fi
if [[ -n "\$CHAT_BAK" ]]; then
  mkdir -p "${REMOTE}/agents/state/chat-threads"
  cp -a "\$CHAT_BAK/." "${REMOTE}/agents/state/chat-threads/"
  rm -rf "\$CHAT_BAK"
fi
chmod +x "${REMOTE}/scripts/linuxbox/"*.sh 2>/dev/null || true
chmod +x "${REMOTE}/scripts/linuxbox/lib/"*.sh 2>/dev/null || true
mkdir -p /mnt/archive/logs/agent-runs /mnt/archive/logs/security /mnt/archive/logs/loop-traces 2>/dev/null || true
mkdir -p "${REMOTE}/agents/state"
# Always prefer state/ as canonical; legacy path must be a symlink (pods historically wrote agents/human-inbox.json).
if [[ -f "${REMOTE}/agents/state/human-inbox.json" ]]; then
  if [[ -f "${REMOTE}/agents/human-inbox.json" && ! -L "${REMOTE}/agents/human-inbox.json" ]]; then
    # Merge any answers that landed on the legacy stub before replacing with symlink.
    python3 - <<'PY' || true
import json, os
remote = os.environ.get("REMOTE") or "${REMOTE}"
legacy = os.path.join(remote, "agents", "human-inbox.json")
canon = os.path.join(remote, "agents", "state", "human-inbox.json")
try:
    with open(legacy, encoding="utf-8") as f:
        leg = json.load(f)
    with open(canon, encoding="utf-8") as f:
        can = json.load(f)
except Exception:
    raise SystemExit(0)
answered = {q.get("id"): q for q in (can.get("answered") or []) if q.get("id")}
for q in leg.get("answered") or []:
    if q.get("id") and q["id"] not in answered:
        answered[q["id"]] = q
open_ids = {q.get("id") for q in (can.get("open") or []) if q.get("id")}
for q in leg.get("open") or []:
    if q.get("id") and q["id"] not in open_ids and q["id"] not in answered:
        can.setdefault("open", []).append(q)
        open_ids.add(q["id"])
can["answered"] = list(answered.values())
with open(canon, "w", encoding="utf-8") as f:
    json.dump(can, f, indent=2)
    f.write("\n")
print("merged legacy human-inbox into state/")
PY
    mv "${REMOTE}/agents/human-inbox.json" "${REMOTE}/agents/human-inbox.json.bak-\$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
  fi
  ln -sfn state/human-inbox.json "${REMOTE}/agents/human-inbox.json" 2>/dev/null || true
fi
if [[ -n "${restart_svc}" ]]; then
  sudo systemctl restart "${restart_svc}"
  sleep 2
  systemctl is-active "${restart_svc}" || true
fi
if [[ -n "${verify_url}" ]]; then
  curl -s -o /dev/null -w "verify:%{http_code}\n" "${verify_url}" || true
fi
# Fail-loud runtime verification after any service-affecting push.
if [[ -n "${restart_svc}" && -f "${REMOTE}/scripts/linuxbox/verify-runtime-state.sh" ]]; then
  bash "${REMOTE}/scripts/linuxbox/verify-runtime-state.sh" --context pc-push || {
    echo "push-linuxbox: VERIFY FAILED on box — see agents/state/dashboard-deploy-alerts.jsonl" >&2
    exit 1
  }
fi
echo "remote: archive=\$(test -d /mnt/archive/logs && echo ok || echo missing)"
EOF
  bash "${FIX_SH_CRLF_REMOTE}"
  rm -f "${TARBALL}"
  echo "OK pushed ${#_paths[@]} paths"
}

pick_paths() {
  case "${MODE}" in
    --agents) printf '%s\n' "${AGENT_PATHS[@]}" ;;
    --scripts-linuxbox) printf '%s\n' "${LINUXBOX_SCRIPT_PATHS[@]}" ;;
    --dashboard) printf '%s\n' "${DASHBOARD_PATHS[@]}" ;;
    --all)
      printf '%s\n' "${AGENT_PATHS[@]}" "${LINUXBOX_SCRIPT_PATHS[@]}"
      if [[ -f "${REPO}/CLAUDE.md" ]]; then echo CLAUDE.md; fi
      ;;
    *) return 1 ;;
  esac
}

run_bundle() {
  local id="$1"
  python3 - "${MANIFEST}" "${id}" "${REPO}" <<'PY'
import json, subprocess, sys
from pathlib import Path

manifest, bundle_id, repo = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
data = json.loads(manifest.read_text(encoding="utf-8"))
bundle = next((b for b in data.get("bundles", []) if b["id"] == bundle_id), None)
if not bundle:
    sys.exit(2)
hints = bundle.get("paths_hint", [])
if hints and not any((repo / h).exists() for h in hints):
    print(f"SKIP {bundle_id}: no local paths")
    sys.exit(0)
push = bundle["push"]
script = repo / push["script"]
args = push.get("args", [])
print(f"RUN {bundle_id}: {script} {' '.join(args)}")
subprocess.run(["bash", str(script)] + args, cwd=repo, check=True)
PY
}

if [[ "${MODE}" == "--finished" ]]; then
  echo "=== push-linuxbox --finished (deploy when done) ==="
  for id in agent-config dashboard tableslop-map; do
    echo "--- bundle: ${id} ---"
    if [[ "${id}" == "tableslop-map" ]]; then
      if [[ -f "${REPO}/campaigns/tropic-gooner/map/master-enhanced.png" ]]; then
        normalize_sh "${REPO}/scripts/linuxbox/push-tableslop-map.sh"
        bash "${REPO}/scripts/linuxbox/push-tableslop-map.sh" || echo "WARN: tableslop push failed" >&2
      else
        echo "SKIP tableslop-map: no master-enhanced.png"
      fi
    elif [[ "${id}" == "dashboard" ]]; then
      PATHS=()
      while IFS= read -r p; do p="${p//$'\r'/}"; [[ -n "${p}" && -e "${REPO}/${p}" ]] && PATHS+=("${p}"); done < <(printf '%s\n' "${DASHBOARD_PATHS[@]}")
      if [[ ${#PATHS[@]} -gt 0 ]]; then
        push_tarball PATHS linuxbox-status "http://127.0.0.1:8790/" || echo "WARN: dashboard push failed" >&2
      else
        echo "SKIP dashboard: no files"
      fi
    else
      MODE="--all"
      PATHS=()
      while IFS= read -r p; do
        p="${p//$'\r'/}"
        [[ -z "${p}" ]] && continue
        [[ -e "${REPO}/${p}" ]] && PATHS+=("${p}")
      done < <(pick_paths)
      push_tarball PATHS "" "" || echo "WARN: agent-config push failed" >&2
    fi
  done
  echo "=== finished ==="
  exit 0
fi

PATHS=()
while IFS= read -r p; do
  p="${p//$'\r'/}"
  [[ -z "${p}" ]] && continue
  if [[ -e "${REPO}/${p}" ]]; then
    PATHS+=("${p}")
  else
    echo "skip missing: ${p}" >&2
  fi
done < <(pick_paths || { echo "usage: $0 [--finished|--all|--agents|--scripts-linuxbox|--dashboard]" >&2; exit 2; })

restart=""
verify=""
if [[ "${MODE}" == "--dashboard" ]]; then
  restart="linuxbox-status"
  verify="http://127.0.0.1:8790/"
fi

push_tarball PATHS "${restart}" "${verify}"
