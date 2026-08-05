#!/usr/bin/env bash
# Thin wrapper: A/B LAN vs Tailscale and print the home-WiFi enable tip.
# See smoke-lan-vs-tailscale.sh for the real probes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec bash "$ROOT/scripts/pc/smoke-lan-vs-tailscale.sh" --tip "$@"
