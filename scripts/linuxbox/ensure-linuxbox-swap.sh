#!/usr/bin/env bash
# Idempotent: ensure /var/swap is TARGET_MB on BTRFS root (NOCOW). Run ON linuxbox with sudo.
# ponytail: skip if swap already >= target; slow swap is OK, exhaustion is not.
set -euo pipefail

TARGET_MB="${1:-2048}"
SWAP_FILE="/var/swap"
FSTAB_LINE="${SWAP_FILE} none swap sw 0 0"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo on linuxbox: sudo bash $0 [TARGET_MB]" >&2
  exit 1
fi

current_kb=0
if [[ -f /proc/swaps ]] && grep -q "${SWAP_FILE}" /proc/swaps 2>/dev/null; then
  current_kb=$(awk -v f="${SWAP_FILE}" '$1==f {print $3}' /proc/swaps)
fi
current_mb=$((current_kb / 1024))
target_kb=$((TARGET_MB * 1024))

if [[ "${current_mb}" -ge "${TARGET_MB}" ]]; then
  echo "OK swap already ${current_mb}MiB >= ${TARGET_MB}MiB"
  exit 0
fi

echo "Resizing swap ${current_mb}MiB -> ${TARGET_MB}MiB on ${SWAP_FILE}"

if grep -q "${SWAP_FILE}" /proc/swaps 2>/dev/null; then
  swapoff "${SWAP_FILE}" || true
fi

rm -f "${SWAP_FILE}"
touch "${SWAP_FILE}"
chattr +C "${SWAP_FILE}" 2>/dev/null || true
dd if=/dev/zero of="${SWAP_FILE}" bs=1M count="${TARGET_MB}" conv=fsync status=progress
chmod 600 "${SWAP_FILE}"
mkswap "${SWAP_FILE}"
swapon "${SWAP_FILE}"

if ! grep -qF "${FSTAB_LINE}" /etc/fstab 2>/dev/null; then
  # Remove stale swap lines for this path
  sed -i "\|${SWAP_FILE}|d" /etc/fstab
  echo "${FSTAB_LINE}" >> /etc/fstab
fi

echo "OK swap now:"
cat /proc/swaps
