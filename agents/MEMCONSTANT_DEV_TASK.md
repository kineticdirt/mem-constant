# mem-constant continuous-dev lane

**Goal (user):** keep expanding `mem-constant` to additional IDEs **and CLI agents**, improving
**context generation** and **step-based thinking**. Multi-IDE + CLI is the continuous-dev direction.
**Profile:** `think`. **Gate:** every dependency/tool bump goes through `safe-update-check.sh` first.

## Done (v0.4.0)
- `--with-cli-scaffolds`: writes `AGENTS.md` (Codex CLI + opencode) and `GEMINI.md` (Gemini CLI)
  with the merge-safe `mem-constant:start/end` block. `doctor` now reports both signals.

## Backlog (one increment per tick — smallest abstractable part)

1. **opencode config**: optional `opencode.json` snippet (instructions path + mem-constant rule),
   behind the same flag. Verify opencode reads it.
2. **Codex config**: confirm Codex CLI precedence (`AGENTS.md` vs `~/.codex/`); document in README.
3. **Context generation**: a `mem-constant context` subcommand that emits a compact, ranked context
   pack from `.mem-constant/` + carryover for injection into any CLI agent (token-budgeted).
4. **Step-based thinking**: a shared `docs/mem-constant/step-thinking.md` spec + a template block
   (goal → steps → verify → loop) referenced by every IDE/CLI scaffold.
5. **doctor for CLIs**: detect installed `codex`, `gemini`, `opencode` binaries (like node/npx today).
6. **Per-agent carryover**: ensure `.mem-constant/last-session.md` is the single continuity file all
   agents read (already cross-agent); add tiny adapters where an agent needs a different path.

## Verify each increment
- `py -m pytest tests/ -q` stays green (add a test per increment).
- `mem-constant --version` reflects bumps; `mem-constant doctor` shows new signals.
- New templates carry the `mem-constant:start/end` block so existing files merge, never clobber.
- Bump `__version__` + `pyproject.toml` together; note the change here.

## Notes
- Codex CLI and opencode both consume `AGENTS.md`; Gemini CLI consumes `GEMINI.md`.
- Keep templates short and merge-safe. No new runtime dependencies (package is stdlib-only).
