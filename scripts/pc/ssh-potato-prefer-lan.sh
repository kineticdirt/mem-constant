#!/usr/bin/env bash
# SSH Match exec helper: exit 0 when potato LAN looks reachable (home), else 1 (away).
# Used so Host potato can Prefer LAN HostName when on 192.168.4.0/22, else Tailscale.
# Quiet on stdout (Match only needs exit code). See docs/remote-pc-setup/lan-vs-tailscale-decision.md §9.
set -uo pipefail

LAN_IP="${POTATO_LAN_IP:-192.168.4.59}"
# Optional: read potato-lan HostName from ssh config when set.
if command -v ssh >/dev/null 2>&1; then
  cfg="$(ssh -G potato-lan 2>/dev/null | awk 'tolower($1)=="hostname"{print $2; exit}')"
  if [[ -n "${cfg:-}" && "$cfg" != "potato-lan" ]]; then
    LAN_IP="$cfg"
  fi
fi

# Fast local "on home subnet?" — skip LAN probe when clearly away (saves timeout).
on_home_subnet=0
case "$(uname -s 2>/dev/null)" in
  MINGW*|MSYS*|CYGWIN*)
    if ipconfig 2>/dev/null | grep -E 'IPv4.*192\.168\.(4|5|6|7)\.' >/dev/null 2>&1; then
      on_home_subnet=1
    fi
    ;;
  *)
    if command -v ip >/dev/null 2>&1; then
      if ip -4 -o addr show scope global 2>/dev/null | grep -E 'inet 192\.168\.(4|5|6|7)\.' >/dev/null 2>&1; then
        on_home_subnet=1
      fi
    elif ifconfig 2>/dev/null | grep -E 'inet (addr:)?192\.168\.(4|5|6|7)\.' >/dev/null 2>&1; then
      on_home_subnet=1
    fi
    ;;
esac

# Guest Wi‑Fi / AP isolation: still on subnet but can't reach potato → fall through to Tailscale.
# Away with no home IP: fail fast (do not wait on dead LAN).
if [[ "$on_home_subnet" -eq 0 ]]; then
  exit 1
fi

# TCP :22 probe (1s). Prefer nc; else bash /dev/tcp; else Windows PowerShell.
if command -v nc >/dev/null 2>&1; then
  if nc -z -w 1 "$LAN_IP" 22 >/dev/null 2>&1; then
    exit 0
  fi
  exit 1
fi

if (echo >/dev/tcp/"$LAN_IP"/22) >/dev/null 2>&1; then
  exit 0
fi

# Git Bash often lacks /dev/tcp; OpenSSH Match on Windows may run via cmd — use PowerShell.
if command -v powershell.exe >/dev/null 2>&1; then
  if powershell.exe -NoProfile -Command \
    "\$c=New-Object Net.Sockets.TcpClient; try { \$c.Connect('${LAN_IP}',22); exit 0 } catch { exit 1 } finally { \$c.Dispose() }" \
    >/dev/null 2>&1; then
    exit 0
  fi
fi

exit 1
