#!/usr/bin/env bash
# Install ONE named cloudflared tunnel systemd unit — never touches other tunnels.
# Sourced by install-cloudflared-{tableslop,abhinavall}-tunnel.sh
set -euo pipefail

cloudflared_ensure_binary() {
  if command -v cloudflared >/dev/null 2>&1; then
    return 0
  fi
  echo "cloudflared not found. On linuxbox:" >&2
  echo "  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null" >&2
  echo "  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list" >&2
  echo "  sudo apt update && sudo apt install -y cloudflared" >&2
  return 1
}

# Usage: cloudflared_install_named_tunnel <unit_basename> <env_file> <token> <unit_src>
# unit_basename: cloudflared-tableslop | cloudflared-abhinavall
cloudflared_install_named_tunnel() {
  local unit_base="$1"
  local env_file="$2"
  local token="$3"
  local unit_src="$4"
  local unit_dst="/etc/systemd/system/${unit_base}.service"
  local owner="${SUDO_USER:-abhinav}"

  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run with sudo on linuxbox." >&2
    return 1
  fi
  if [[ -z "${token}" ]]; then
    echo "Missing tunnel token for ${unit_base}." >&2
    return 1
  fi
  if [[ ! -f "${unit_src}" ]]; then
    echo "Missing unit file: ${unit_src}" >&2
    return 1
  fi

  cloudflared_ensure_binary

  install -d -o "${owner}" -g "${owner}" -m 700 "$(dirname "${env_file}")"
  printf 'TUNNEL_TOKEN=%s\n' "${token}" > "${env_file}.tmp"
  chown "${owner}:${owner}" "${env_file}.tmp"
  chmod 600 "${env_file}.tmp"
  mv "${env_file}.tmp" "${env_file}"

  cp "${unit_src}" "${unit_dst}"
  chmod 644 "${unit_dst}"

  systemctl daemon-reload
  systemctl enable "${unit_base}.service"
  systemctl restart "${unit_base}.service"
  sleep 2
  systemctl is-active "${unit_base}.service"
}
