#!/usr/bin/env bash
# Open SSH shell on linuxbox. Prefer potato-lan when reachable (same Wi‑Fi),
# else Host potato (Tailscale — or LAN if Match exec installed; see
# scripts/pc/ssh-potato-prefer-lan.sh + docs/remote-pc-setup/lan-vs-tailscale-decision.md §9).
set -euo pipefail

# Home LAN first (short timeout so away networks fail fast).
if ssh -G potato-lan >/dev/null 2>&1; then
  if ssh -o BatchMode=yes -o ConnectTimeout=2 -o IdentitiesOnly=yes potato-lan true >/dev/null 2>&1; then
    echo "[connect-linuxbox] using potato-lan (same Wi‑Fi)" >&2
    exec ssh potato-lan
  fi
fi

# Prefer Match-aware potato before legacy linuxbox alias.
for H in potato linuxbox; do
  if ssh -G "${H}" >/dev/null 2>&1; then
    echo "[connect-linuxbox] using ${H}" >&2
    exec ssh "${H}"
  fi
done

KEY="${LINUXBOX_SSH_KEY:-$HOME/.ssh/id_rsa_potato}"
exec ssh -i "${KEY}" -o IdentitiesOnly=yes abhinav@100.122.108.94
