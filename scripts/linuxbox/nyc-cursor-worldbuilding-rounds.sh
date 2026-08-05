#!/usr/bin/env bash
# Potato-only: 3 Cursor Auto worldbuilding rounds for NYC while Hermes think does other lanes.
# Usage: bash scripts/linuxbox/nyc-cursor-worldbuilding-rounds.sh
set -euo pipefail
REPO="${AGENT_DUMP:-${HOME}/agent-dump}"
WB="${REPO}/campaigns/nyc-mafia-dnd/worldbuilding"
WRAP="${REPO}/scripts/linuxbox/cursor-agent-run.sh"
export CURSOR_SDK_AUTO_ONLY=1
export CURSOR_VARIANT=auto
export CURSOR_SDK_MODEL=auto
export CURSOR_SDK_PYTHON="${CURSOR_SDK_PYTHON:-${HOME}/venvs/cursor-sdk/bin/python}"
export AGENT_DUMP="${REPO}"

run_round() {
  local id="$1"
  local title="$2"
  local prompt="$3"
  echo "=== ${id}: ${title} ==="
  bash "${WRAP}" "${prompt}"
  echo "=== ${id} done ==="
}

# Round 1 — drip A
run_round F-1 "Salon economy flesh" "$(cat <<'EOF'
NYC Mafia × D&D worldbuilding ONLY. Potato Cursor Auto lane.

Read and obey:
- campaigns/nyc-mafia-dnd/LOCKS.md
- campaigns/nyc-mafia-dnd/worldbuilding/strokes/era-law-pack.md (locked)
- campaigns/nyc-mafia-dnd/SETTING-MAGITECH-DIVERGENCE.md (§C before inventing devices)
- campaigns/nyc-mafia-dnd/worldbuilding/details/era-law-pack-bootleg-salons.md
- campaigns/nyc-mafia-dnd/worldbuilding/LINT.md

Task F-1 (drip A): Extend details/era-law-pack-bootleg-salons.md (or write a sibling details/era-law-pack-salon-seeds.md if cleaner) with:
1) Five named speakeasy/salon seeds — front, back room, family cut, ward visibility tier, one-line play hook each
2) Hardened depression-era price bands
3) Short OTR stamp forgery mini-flow

Rules: 1931 Prohibition + magitech (no modern phones/CCTV/skyscraper default). NSFW measured only if salon type demands. Keep under ~900 words. Mark draft-dependent if needed. Then check [x] F-1 in worldbuilding/progress.md and note Done line.
EOF
)"

# Round 2 — drip B
run_round F-2 "Press & polite denial" "$(cat <<'EOF'
NYC Mafia × D&D worldbuilding ONLY. Potato Cursor Auto lane.

Read LOCKS.md, era-law-pack.md, strokes/ward-visibility-draft.md, SETTING-ANCESTRIES-WARDS.md, LINT.md.

Task F-2 (drip B): Write campaigns/nyc-mafia-dnd/worldbuilding/details/ward-visibility-press-and-passing.md with:
1) Tribune naming policy (3 headline examples max)
2) Passing vs service-entrance rules for denial-tier Midtown
3) How open wards talk differently — short

No full newspaper. Optional: one short vignette file vignettes/era-law-pack/04-ashford-lobby-denial.md if it fits. Check [x] F-2 in progress.md.
EOF
)"

# Round 3 — drip C
run_round F-3 "Family pressure vignettes" "$(cat <<'EOF'
NYC Mafia × D&D worldbuilding ONLY. Potato Cursor Auto lane.

Read LOCKS.md, era-law-pack.md, legacy-reskin/2026-07-26-five-families-reskin.md, LINT.md.

Task F-3 (drip C): Write three vignettes under campaigns/nyc-mafia-dnd/worldbuilding/vignettes/family-pressure/:
1) Chen-Okafor numbers + divination refusal
2) Moretti funeral second-question temptation
3) Kowalski river disposal ethics

Not Session 1 salon raid. draft-dependent: true. Measured kink only if plot demands. Check [x] F-3 in progress.md. Summarize what you wrote at the end.
EOF
)"

echo "All NYC Cursor Auto rounds finished."
