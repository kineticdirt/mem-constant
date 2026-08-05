#!/usr/bin/env bash
# Same layout as scripts/create_ebook_library_tree.ps1 — run on linuxbox after
# USB (or any data volume) is mounted. Example:
#   sudo mkdir -p /srv/ebooks
#   sudo mount /dev/sdX1 /srv/ebooks
#   sudo bash create-ebook-library-layout.sh /srv/ebooks
set -euo pipefail

if [ "${1:-}" = "" ] || [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  echo "Usage: $0 /path/to/volume-root"
  echo "Creates ebooks/ tree under that path (writable by current user if permitted)."
  exit 1
fi

ROOT="${1%/}"
if [ ! -d "$ROOT" ]; then
  echo "Error: not a directory: $ROOT" >&2
  exit 1
fi

dirs=(
  "ebooks/00-inbox"
  "ebooks/01-library/fiction"
  "ebooks/01-library/non-fiction"
  "ebooks/01-library/technical"
  "ebooks/01-library/reference"
  "ebooks/02-archive"
  "ebooks/03-periodicals"
  "ebooks/99-calibre-library"
  "ebooks/_meta"
)

for rel in "${dirs[@]}"; do
  mkdir -p "$ROOT/$rel"
done

readme="$ROOT/ebooks/_meta/README.txt"
cat >"$readme" <<'EOF'
Ebook library layout (created by create-ebook-library-layout.sh)

00-inbox        Drop new files here before sorting.
01-library      Sorted by rough category (edit folders as you like).
02-archive      Older or duplicate copies you want off the main shelf.
03-periodicals  Magazines, journals, newsletters.
99-calibre-library  Point Calibre at this folder if you use Calibre.
_meta           Notes and sidecar data.

Reserve ~64 GiB on internal disk for indexes, caches, and tools;
use this volume primarily for the book files themselves.
EOF

echo "Created layout under $ROOT/ebooks/"
