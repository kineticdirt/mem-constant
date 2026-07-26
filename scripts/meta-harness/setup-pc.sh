#!/usr/bin/env bash
# One-time PC setup: clone upstream Meta-Harness outside this repo (not vendored).
# ponytail: scaffold only; full domain adapt is manual (see domain_spec.md).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEFAULT_CLONE="${META_HARNESS_DIR:-$(dirname "$REPO_ROOT")/meta-harness}"
CLONE_PATH="${1:-$DEFAULT_CLONE}"

echo "Meta-Harness PC setup"
echo "  repo:  ${REPO_ROOT}"
echo "  clone: ${CLONE_PATH}"
echo

if [[ -d "${CLONE_PATH}/.git" ]]; then
  echo "Already cloned at ${CLONE_PATH}"
else
  echo "Cloning https://github.com/stanford-iris-lab/meta-harness.git ..."
  git clone https://github.com/stanford-iris-lab/meta-harness.git "${CLONE_PATH}"
fi

if command -v uv >/dev/null 2>&1; then
  echo "uv: $(uv --version)"
else
  echo "WARNING: uv not found. Install: https://docs.astral.sh/uv/getting-started/installation/"
  echo "  (upstream uses uv sync in reference_examples/)"
fi

echo
echo "Next steps (from upstream ONBOARDING.md / README):"
echo "  1. cd ${CLONE_PATH}/reference_examples/text_classification"
echo "  2. uv sync"
echo "  3. uv run python meta_harness.py --iterations 1   # smoke test"
echo
echo "Linuxbox domain (this repo):"
echo "  - Read agents/meta-harness/domain_spec.md"
echo "  - Proposer stub: python3 scripts/meta-harness/propose_harness.py"
echo "  - Traces: agents/meta-harness/runs/<pod>/"
echo "  - Candidates: agents/meta-harness/candidates/<timestamp>/"
echo
echo "Optional clone location: integrations/meta-harness (sibling to agent-dump, not inside repo)"
echo "  META_HARNESS_DIR=/path/to/meta-harness $0"
