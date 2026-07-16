#!/usr/bin/env bash
# Deploy lean OpenRouter-only Pixi RP tree from PC ObsidianWriterStack → potato,
# then install/restart user systemd unit linuxbox-pixi-rp (:8767).
#
# Usage (Git Bash on PC):
#   bash scripts/pc/deploy-pixi-linuxbox.sh
#   bash scripts/pc/deploy-pixi-linuxbox.sh --skip-smoke
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OWS_SRC="${OWS_SRC:-$(cd "${ROOT}/../ObsidianWriterStack" 2>/dev/null && pwd || true)}"
if [[ -z "${OWS_SRC}" || ! -f "${OWS_SRC}/scripts/unified_rp_server.py" ]]; then
  OWS_SRC="/c/Users/abhinav/Desktop/MAIN_PROGRAMMING_FILES/ObsidianWriterStack"
fi
SSH_HOST="${SSH_HOST:-potato}"
REMOTE_BASE="${REMOTE_BASE:-/home/abhinav/pixi-rp}"
REMOTE_OWS="${REMOTE_BASE}/ObsidianWriterStack"
SKIP_SMOKE=0
for arg in "$@"; do
  case "$arg" in
    --skip-smoke) SKIP_SMOKE=1 ;;
  esac
done

if [[ ! -f "${OWS_SRC}/scripts/unified_rp_server.py" ]]; then
  echo "ERROR: ObsidianWriterStack not found at ${OWS_SRC}" >&2
  exit 2
fi

echo "Source: ${OWS_SRC}"
echo "Target: ${SSH_HOST}:${REMOTE_OWS}"

ssh -o BatchMode=yes -o ConnectTimeout=12 "${SSH_HOST}" "mkdir -p '${REMOTE_OWS}'"

# Lean sync — no models, no Windows llama binaries, no huge archives/secrets.
# Prefer rsync; fall back to tar-over-ssh.
EXCLUDE=(
  --exclude '.git'
  --exclude '.local'
  --exclude 'models-bonsai-27b'
  --exclude 'modelsdeckard*'
  --exclude 'archive'
  --exclude '__pycache__'
  --exclude '*.pyc'
  --exclude '.pytest_cache'
  --exclude 'node_modules'
  --exclude '.venv'
  --exclude 'deckard-local.env'
  --exclude '.env.openrouter'
  --exclude '*.gguf'
  --exclude 'PixiApp/chat-ui/sessions'
)

if command -v rsync >/dev/null 2>&1; then
  rsync -az --delete \
    "${EXCLUDE[@]}" \
    "${OWS_SRC}/" \
    "${SSH_HOST}:${REMOTE_OWS}/"
else
  echo "rsync missing — using tar-over-ssh"
  tar -C "${OWS_SRC}" \
    --exclude='.git' --exclude='.local' --exclude='models-bonsai-27b' \
    --exclude='modelsdeckard*' --exclude='archive' --exclude='__pycache__' \
    --exclude='*.pyc' --exclude='.pytest_cache' --exclude='node_modules' \
    --exclude='.venv' --exclude='deckard-local.env' --exclude='.env.openrouter' \
    --exclude='*.gguf' --exclude='PixiApp/chat-ui/sessions' \
    -cf - . | ssh -o BatchMode=yes "${SSH_HOST}" "mkdir -p '${REMOTE_OWS}' && tar -C '${REMOTE_OWS}' -xf -"
fi

# Ship install scripts from agent-dump (may be newer than potato git).
scp -q \
  "${ROOT}/scripts/linuxbox/install-linuxbox-pixi-rp.sh" \
  "${ROOT}/scripts/linuxbox/linuxbox-pixi-rp.service" \
  "${SSH_HOST}:/tmp/"

ssh -o BatchMode=yes "${SSH_HOST}" bash -s <<EOF
set -euo pipefail
mkdir -p "\$HOME/agent-dump/scripts/linuxbox"
cp /tmp/install-linuxbox-pixi-rp.sh "\$HOME/agent-dump/scripts/linuxbox/"
cp /tmp/linuxbox-pixi-rp.service "\$HOME/agent-dump/scripts/linuxbox/"
chmod +x "\$HOME/agent-dump/scripts/linuxbox/install-linuxbox-pixi-rp.sh"
# Strip CRLF if SCP from Windows
sed -i 's/\r$//' "\$HOME/agent-dump/scripts/linuxbox/install-linuxbox-pixi-rp.sh" \
  "\$HOME/agent-dump/scripts/linuxbox/linuxbox-pixi-rp.service"
export PIXI_OWS='${REMOTE_OWS}'
export AGENT_DUMP="\$HOME/agent-dump"
bash "\$HOME/agent-dump/scripts/linuxbox/install-linuxbox-pixi-rp.sh"
EOF

if [[ "${SKIP_SMOKE}" -eq 1 ]]; then
  echo "Deploy done (--skip-smoke)."
  exit 0
fi

echo "Remote smoke POST /api/chat…"
ssh -o BatchMode=yes "${SSH_HOST}" bash -s <<'EOF'
set -euo pipefail
RESP="$(curl -s -X POST http://127.0.0.1:8767/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Reply with exactly: POTATO_OR_OK"}],"model":"openrouter/deepseek/deepseek-v4-flash","model_explicit":true,"max_tokens":32}')"
echo "$RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
t = d.get('rp_trace') or {}
content = (d.get('content') or '')
assert t.get('upstream_http_status') == 200, d
assert t.get('rp_openrouter_only') is True, t
assert 'POTATO_OR_OK' in content or content.strip(), content
print('SMOKE OK model=', t.get('request_model'), 'coerced=', t.get('rp_model_coerced'), 'chars=', len(content))
"
EOF

echo "Deploy + verify complete. Open: http://potato:8767/ (or linuxbox MagicDNS :8767)"
