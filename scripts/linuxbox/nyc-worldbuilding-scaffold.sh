#!/usr/bin/env bash
# NYC worldbuilding scaffold — creates dated files from templates. No LLM.
# Usage:
#   bash scripts/linuxbox/nyc-worldbuilding-scaffold.sh --fork year-window --type dialectic
#   bash scripts/linuxbox/nyc-worldbuilding-scaffold.sh --fork era-law-pack --type vignette --title salon-raid
set -euo pipefail

REPO="${NYC_WB_REPO:-$(cd "$(dirname "$0")/../../" && pwd)}"
WB="${REPO}/campaigns/nyc-mafia-dnd/worldbuilding"
DATE="$(date -u +%Y-%m-%d)"

FORK=""
TYPE="dialectic"
TITLE=""
STROKE_SLUG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fork) FORK="${2:-}"; shift 2 ;;
    --type) TYPE="${2:-}"; shift 2 ;;
    --title) TITLE="${2:-}"; shift 2 ;;
    --stroke) STROKE_SLUG="${2:-}"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "${FORK}" ]]; then
  echo "ERROR: --fork <slug> required" >&2
  exit 1
fi

slug_safe="${FORK// /-}"
title_safe="${TITLE:-${slug_safe}}"
title_slug="${title_safe// /-}"

case "${TYPE}" in
  dialectic)
    dest="${WB}/strokes/${DATE}-${slug_safe}-draft.md"
    cp "${WB}/strokes/_TEMPLATE-draft.md" "${dest}"
    ;;
  detail)
    dest="${WB}/details/${slug_safe}-${title_slug}.md"
    cp "${WB}/details/_TEMPLATE-detail.md" "${dest}"
    ;;
  vignette)
    stroke="${STROKE_SLUG:-${slug_safe}}"
    dir="${WB}/vignettes/${stroke}"
    mkdir -p "${dir}"
    nn="$(printf '%02d' "$(($(ls -1 "${dir}"/*.md 2>/dev/null | wc -l) + 1))")"
    dest="${dir}/${nn}-${title_slug}.md"
    cp "${WB}/vignettes/_TEMPLATE-vignette.md" "${dest}"
    ;;
  drip-steer)
    dest="${WB}/drip/${DATE}-${slug_safe}-steer.md"
    cp "${WB}/drip/_TEMPLATE-steer-options.md" "${dest}"
    ;;
  *)
    echo "ERROR: --type dialectic|detail|vignette|drip-steer" >&2
    exit 1
    ;;
esac

echo "Created: ${dest}"
