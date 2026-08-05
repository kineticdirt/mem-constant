#!/usr/bin/env bash
# Install / refresh OpenRouter-only Pixi RP on potato (user systemd).
# Expects tree at ~/pixi-rp/ObsidianWriterStack (deployed by scripts/pc/deploy-pixi-linuxbox.sh).
set -euo pipefail

REPO="${AGENT_DUMP:-$HOME/agent-dump}"
OWS="${PIXI_OWS:-$HOME/pixi-rp/ObsidianWriterStack}"
ENV_DIR="${HOME}/.linuxbox-pixi"
ENV_FILE="${ENV_DIR}/deckard-local.env"
UNIT_SRC="${REPO}/scripts/linuxbox/linuxbox-pixi-rp.service"
UNIT_DST="${HOME}/.config/systemd/user/linuxbox-pixi-rp.service"
EXAMPLE="${OWS}/deckard-linuxbox.env.example"

if [[ ! -f "${OWS}/scripts/unified_rp_server.py" ]]; then
  echo "ERROR: missing ${OWS}/scripts/unified_rp_server.py — run deploy-pixi-linuxbox.sh from PC first" >&2
  exit 2
fi

mkdir -p "${ENV_DIR}" "${HOME}/.config/systemd/user"

if [[ ! -f "${ENV_FILE}" ]]; then
  if [[ -f "${EXAMPLE}" ]]; then
    cp "${EXAMPLE}" "${ENV_FILE}"
  else
    echo "ERROR: missing ${EXAMPLE}" >&2
    exit 2
  fi
fi

# Pull OpenRouter key from Hermes env if Pixi env lacks one (never print the key).
if ! grep -qE '^WRITER_BOT_OPENROUTER_API_KEY=sk-' "${ENV_FILE}" 2>/dev/null; then
  HERMES_ENV="${HOME}/.hermes/.env"
  if [[ -f "${HERMES_ENV}" ]]; then
    KEY="$(grep -E '^OPENROUTER_API_KEY=' "${HERMES_ENV}" | head -1 | cut -d= -f2- | tr -d '\r' || true)"
    if [[ -n "${KEY}" ]]; then
      if grep -qE '^WRITER_BOT_OPENROUTER_API_KEY=' "${ENV_FILE}"; then
        sed -i "s|^WRITER_BOT_OPENROUTER_API_KEY=.*|WRITER_BOT_OPENROUTER_API_KEY=${KEY}|" "${ENV_FILE}"
      else
        printf '\nWRITER_BOT_OPENROUTER_API_KEY=%s\n' "${KEY}" >>"${ENV_FILE}"
      fi
      if grep -qE '^OPENROUTER_API_KEY=' "${ENV_FILE}"; then
        sed -i "s|^OPENROUTER_API_KEY=.*|OPENROUTER_API_KEY=${KEY}|" "${ENV_FILE}"
      else
        printf 'OPENROUTER_API_KEY=%s\n' "${KEY}" >>"${ENV_FILE}"
      fi
      echo "Filled OpenRouter key into ${ENV_FILE} from ~/.hermes/.env"
    else
      echo "WARN: no OPENROUTER_API_KEY in ~/.hermes/.env — set ${ENV_FILE} manually" >&2
    fi
  else
    echo "WARN: missing ~/.hermes/.env — set OpenRouter key in ${ENV_FILE}" >&2
  fi
fi

# Pull ZenMux key from Hermes when Pixi env lacks one (never print the key).
# Used for zenmux:<slug> presets (e.g. zenmux:moonshotai/kimi-k3-free).
if ! grep -qE '^ZENMUX_API_KEY=.+' "${ENV_FILE}" 2>/dev/null; then
  HERMES_ENV="${HOME}/.hermes/.env"
  if [[ -f "${HERMES_ENV}" ]]; then
    ZKEY="$(grep -E '^ZENMUX_API_KEY=' "${HERMES_ENV}" | head -1 | cut -d= -f2- | tr -d '\r' || true)"
    if [[ -n "${ZKEY}" ]]; then
      if grep -qE '^ZENMUX_API_KEY=' "${ENV_FILE}"; then
        sed -i "s|^ZENMUX_API_KEY=.*|ZENMUX_API_KEY=${ZKEY}|" "${ENV_FILE}"
      else
        printf '\nZENMUX_API_KEY=%s\n' "${ZKEY}" >>"${ENV_FILE}"
      fi
      echo "Filled ZenMux key into ${ENV_FILE} from ~/.hermes/.env"
    else
      echo "WARN: no ZENMUX_API_KEY in ~/.hermes/.env — ZenMux presets will 503 until set" >&2
    fi
  fi
fi

chmod 600 "${ENV_FILE}"

# Symlink env into OWS so unified_rp_server load_repo_rp_env_files finds it.
ln -sfn "${ENV_FILE}" "${OWS}/deckard-local.env"
chmod 600 "${OWS}/deckard-local.env" 2>/dev/null || true

# Minimal deps (system python — avoid heavy venv on 2 GB).
python3 -c "import flask, requests, waitress" 2>/dev/null || {
  echo "Installing lean pip deps (flask requests waitress)…"
  python3 -m pip install --user -q 'flask>=2.0' 'requests>=2.28' 'waitress>=2.1'
}

cp "${UNIT_SRC}" "${UNIT_DST}"
# Rewrite WorkingDirectory to actual OWS path
sed -i "s|WorkingDirectory=.*|WorkingDirectory=${OWS}|" "${UNIT_DST}"

# User units only start at boot when linger is on for the user (hermes installer
# asserts this; pixi must too — 2026-08-05 reboot left pixi inactive until manual start).
if ! loginctl show-user "${USER}" -p Linger 2>/dev/null | grep -q '^Linger=yes$'; then
  loginctl enable-linger "${USER}" 2>/dev/null \
    || sudo -n loginctl enable-linger "${USER}" 2>/dev/null \
    || echo "WARN: linger off — run 'sudo loginctl enable-linger ${USER}' or Pixi will not auto-start at boot" >&2
fi
loginctl show-user "${USER}" -p Linger 2>/dev/null || true

systemctl --user daemon-reload
systemctl --user enable linuxbox-pixi-rp.service
systemctl --user restart linuxbox-pixi-rp.service
sleep 2
systemctl --user --no-pager --full status linuxbox-pixi-rp.service | head -20

CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8767/ || true)"
echo "GET / → HTTP ${CODE}"
if [[ "${CODE}" != "200" ]]; then
  echo "ERROR: Pixi not healthy on :8767" >&2
  journalctl --user -u linuxbox-pixi-rp -n 40 --no-pager || true
  exit 1
fi

curl -s http://127.0.0.1:8767/api/config | python3 -c "
import sys, json
c = json.load(sys.stdin)
assert c.get('rp_openrouter_only') is True, c
assert c.get('nsfw_route_local') is False, c
dm = str(c.get('default_model') or '')
assert 'bonsai' not in dm.lower() and not dm.endswith('.gguf'), dm
print('config OK rev=', c.get('chat_api_revision'), 'default=', dm)
"

echo "Pixi RP live: http://127.0.0.1:8767/ (tailnet: http://potato:8767/ or linuxbox MagicDNS)"
