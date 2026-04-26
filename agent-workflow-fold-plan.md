# Plan: Fold `_bmad` into `mem-constant`, reframe to AI-coding focus

**Date:** 2026-04-26 (UTC)
**Status:** Revised after second AskQuestion pass — **no deletes**, all 14 candidates become REFRAME. Awaiting reframe-target confirmation for the 7 newly-promoted-to-REFRAME skills.
**Ledger:** `AI_GROUPCHAT.md` `[PC] Intent` line of same date
**Workspace = mem-constant git checkout** (`origin = git@github.com:kineticdirt/mem-constant.git`); `.cursor/`, `_bmad/`, `_bmad-output/` are currently **untracked**.

## User-confirmed decisions (2026-04-26, second pass)

- **Q1 — `_bmad/` source install:** **DELETE entirely.** If we ever need it, re-run the BMAD installer.
- **Q2 — `_bmad-output/` rename:** **Rename to `agent-artifacts/`.**
- **Q3 — Skill deletes:** **No deletes.** User direction: _"Keep the skills but align them with the current goals."_ → all 7 previously-DELETE skills move to REFRAME. Total reframes: **14**. Total keeps: **27**. Total deletes: **0**.
- **Q4 — Phase pause:** **Yes**, stop after Phase 2 (workspace skill reorg, ~14 mutations) before Phase 3 (mem-constant templates + new init flag + version bump).

---

## Goal (one line)

Make this dev system's agent toolset produce **standards-compliant code** rather than **B2B product pitches**, by folding the AI-useful subset of BMAD into `mem-constant` (templates + workspace dogfood) and removing/reshaping the rest.

## User-confirmed decisions (2026-04-26 AskQuestion answers)

1. **Destination = both** — ship AI-focused workflow skills as templates inside `src/mem_constant/templates/workflow-skills/` **and** reorganize the workspace's `.cursor/skills/` to match (workspace dogfoods its own templates).
2. **Business-skill treatment** — delete the irreducibly business ones; **reframe** research / validation skills toward "agent achieves code per coding standards"; keep AI-coding core untouched. (User free-form: _"In some ways its similar to business facing but rather we're just improving the ability of the agent to achieve the code according to standard coding standards and practices."_)
3. **`_bmad-output/`** — rebuild only the canonical artifacts (secure-API brainstorm, referenced from `AI_GROUPCHAT.md` Group goal #3) under new AI-native naming; archive the rest.

---

## Per-skill classification (~41 `bmad-*` skills)

### KEEP (already AI-coding aligned, no changes) — 27

bmad-advanced-elicitation · bmad-agent-architect (Winston) · bmad-agent-dev (Amelia) · bmad-agent-tech-writer (Paige) · bmad-brainstorming · bmad-checkpoint-preview · bmad-code-review · bmad-correct-course · bmad-create-architecture · bmad-create-story · bmad-dev-story · bmad-distillator · bmad-document-project · bmad-editorial-review-prose · bmad-editorial-review-structure · bmad-generate-project-context · bmad-help (catalog will need editing) · bmad-index-docs · bmad-party-mode · bmad-qa-generate-e2e-tests · bmad-quick-dev · bmad-retrospective · bmad-review-adversarial-general · bmad-review-edge-case-hunter · bmad-shard-doc · bmad-sprint-planning · bmad-sprint-status

### REFRAME (rename folder + rewrite SKILL.md / persona / templates to AI-coding lens) — 14

#### Group A — clear reframes (originally REFRAME) — 7

| Current skill | Reframe to | Lens |
|---|---|---|
| `bmad-create-prd` | `bmad-create-implementation-spec` | Code-driven spec (acceptance criteria + test plan + standards adherence), not market-driven PRD |
| `bmad-edit-prd` | `bmad-edit-implementation-spec` | Mirror of above |
| `bmad-validate-prd` | `bmad-validate-implementation-spec` | Validates spec for completeness, testability, standards alignment |
| `bmad-check-implementation-readiness` | (keep name) | Swap inputs from PRD/UX/Architecture/Epics → Spec/Architecture/Tests/Standards |
| `bmad-create-epics-and-stories` | (keep name) | Strip "stakeholder" framing, keep dev-task decomposition |
| `bmad-domain-research` | `bmad-technical-domain-research` | Codebase + framework + library landscape, not industry/business domain |
| `bmad-technical-research` | (keep name) | Sharpen prompt to "research a stack/library/pattern for AI-driven implementation" |

#### Group B — proposed reframes (originally DELETE, now KEEP-AND-ALIGN) — 7

These need user confirmation. Multiple plausible targets per skill; the **default** is bold, alternatives below. Persona renames are first-pass suggestions.

| Current skill | **Proposed reframe** | Persona/lens shift | Alt options |
|---|---|---|---|
| `bmad-agent-pm` (John) | **`bmad-agent-spec-author`** | "John" stays; persona shifts from "PM extracting user needs via interviews" to "spec author extracting implementation needs via critical questioning of requirements/code/tests/standards." Drives `bmad-create-implementation-spec`. | `bmad-agent-task-driver`, keep `bmad-agent-pm` name + only rewrite description |
| `bmad-agent-analyst` (Mary) | **`bmad-agent-code-analyst`** | "Mary" stays; persona shifts from "strategic business analyst" to "code/architecture/dependency analyst — competitive landscape of *libraries* not products." Drives `bmad-technical-research`. | `bmad-agent-requirements-analyst`, `bmad-agent-stack-analyst` |
| `bmad-agent-ux-designer` (Sally) | **`bmad-agent-dx-designer`** | "Sally" stays; persona shifts from "UX designer for end users" to "DX/CLI/API designer — designing developer-facing surfaces (CLIs, APIs, error messages, log lines)." | `bmad-agent-cli-designer`, `bmad-agent-api-designer`, merge into `bmad-agent-tech-writer` |
| `bmad-create-ux-design` | **`bmad-create-developer-experience-design`** | Plan CLI/API/error-message/log/output patterns and conventions for a tool/library, not user-facing UI. | `bmad-create-cli-design`, `bmad-create-api-design` |
| `bmad-market-research` | **`bmad-tooling-landscape-research`** | "What tools/libraries/frameworks exist for this coding problem, with tradeoffs" — keeps the comparative-research mechanic, swaps "customers/competitors" for "libraries/tools." | `bmad-library-landscape-research` |
| `bmad-prfaq` | **`bmad-release-notes-prfaq`** | Keep the **working-backwards** mechanic but anchor it to the changelog/release notes for a feature instead of a press release. Forces "what would the user-facing changelog say" before implementation. | `bmad-changelog-prfaq`, `bmad-feature-prfaq` |
| `bmad-product-brief` | **`bmad-feature-brief`** | Brief structure preserved but anchored to a code feature (problem, scope, acceptance criteria, non-goals, dependencies) not a product (segments, value props). | `bmad-agent-capability-brief` |

**Totals: 27 keep + 14 reframe + 0 delete = 41 skills accounted for.**

---

## Phased execution

Each phase = a granular commit boundary. No phase begins until the prior commits cleanly and tests stay green.

### Phase 1 — Plan + ledger (no behavior change)

- 1.1 `[PC] Intent` line in `AI_GROUPCHAT.md` (DONE before this draft)
- 1.2 This plan saved at workspace root (DONE; untracked)
- 1.3 **User sign-off on the DELETE list and Q1/Q2 below**

### Phase 2 — Workspace `.cursor/skills/` reorg (workspace-only, untracked) — **PAUSE POINT after this phase**

- 2.1 Group A reframes (7 skills) — for each: rename folder, rewrite `SKILL.md` description/persona/capability table, update any `bmm-skill-manifest.yaml`. One logical mutation each.
- 2.2 Group B reframes (7 skills) — same as 2.1, using the confirmed reframe targets from the second AskQuestion pass.
- 2.3 Update `bmad-help/SKILL.md` (the user-facing skill catalog) — replace deleted/reframed entries with new names.
- 2.4 Update `_bmad/_config/skill-manifest.csv`, `_bmad/_config/agent-manifest.csv`, `_bmad/_config/bmad-help.csv` to reflect new catalog. **Note:** Phase 5 will delete `_bmad/` outright, so these manifest updates are short-lived; we still touch them so any tool that reads them mid-phase doesn't crash.
- 2.5 Sanity check: `bmad-party-mode` agent list reflects renamed personas (Sally → DX-designer, John → spec-author, Mary → code-analyst).
- 2.6 **STOP** — show user `.cursor/skills/` listing + before/after diff sample. Wait for go-ahead before Phase 3.

### Phase 3 — `mem-constant` package: ship workflow-skills templates (committed)

- 3.1 Create `src/mem_constant/templates/workflow-skills/<skill-name>/SKILL.md` for the KEEP+REFRAME set (~34 skills).
- 3.2 Add `mem-constant init --with-workflow-skills` flag in `src/mem_constant/cli.py` + `init_scaffold.py`.
- 3.3 Tests in `tests/test_cli.py`: positive (flag drops skills) + negative (no-op without flag).
- 3.4 Update `docs/CLI.md`, `docs/CONFIGURATION.md`, `README.md` Quick start with the new flag.
- 3.5 New doc: `docs/WORKFLOW-SKILLS.md` (mem-constant's AI-coding workflow skill catalog).
- 3.6 `pytest -q` green; bump version `0.2.2 → 0.3.0` (feature addition per semver) — **confirm before bumping**.

### Phase 4 — `_bmad-output/` → `agent-artifacts/` rebuild (workspace-only, untracked)

- 4.1 `mv _bmad-output agent-artifacts` then `mkdir agent-artifacts/_archive-2026-04` and move contents under it (preserves the secure-API brainstorm path inside the archive subdir).
- 4.2 Recreate canonical secure-API brainstorm at `agent-artifacts/brainstorm-2026-04-12-secure-writer-api.md` (preserve content; rewrite intent/header for AI-coding framing — the content is mostly already technical).
- 4.3 Update `AI_GROUPCHAT.md` Group goal #3 link + the "Brainstorm (BMAD)" Current tasks line + `_bmad-output/planning-artifacts/PLANNING-INDEX.md` reference to point at the new path.

### Phase 5 — `_bmad/` source install: DELETE entirely

- 5.1 Confirm no live skill references `_bmad/_config/*.csv` (none should after Phase 2.4 manifest updates feed into the new catalog).
- 5.2 `rm -rf _bmad/` (workspace-untracked, safe; user direction confirmed).
- 5.3 Note in `AGENTS.md` that BMAD source install is no longer present; if needed, re-run upstream installer.

### Phase 6 — Rules + AGENTS.md

- 6.1 Update `.cursor/rules/workspace-goals-agent-dump.mdc` — remove BMAD-PRD references, note workspace dogfoods AI-coding workflow skills.
- 6.2 Update `AGENTS.md` "Learned Workspace Facts" — note the fold and the new mem-constant feature.

### Phase 7 — Commit + push

- Granular commits per phase to `master`; push to `github.com:kineticdirt/mem-constant.git`.
- Phase 2/4/5 changes are workspace-only and **do not** end up on the remote unless user explicitly requests `.cursor/` or `_bmad*/` be tracked.

---

## Open questions resolved (2026-04-26 second pass)

- **Q1** → DELETE `_bmad/` entirely (Phase 5).
- **Q2** → Rename `_bmad-output/` → `agent-artifacts/` (Phase 4).
- **Q3** → No deletes; reframe all 14 (Group A + Group B above).
- **Q4** → Pause after Phase 2 before Phase 3.
- **Q5 (2026-04-26 third pass, post-Phase-2)** → Phase 3 namespace = **strip `bmad-` prefix** in `src/mem_constant/templates/workflow-skills/<clean-name>/`. Implies a later parity rename in `.cursor/skills/` (deferred to Phase 6) and rewrites of cross-skill references inside step files.
- **Q6 (same pass)** → Phase 3 publishes **34 of 41 skills**; excludes 7 BMAD-specific meta/orchestration skills (workspace-only): `bmad-help`, `bmad-party-mode`, `bmad-distillator`, `bmad-checkpoint-preview`, `bmad-correct-course`, `bmad-document-project`, `bmad-shard-doc`.

---

## Risks & gotchas

- **`bmad-party-mode`** orchestrates all installed BMAD agents — after deletes, its agent list shrinks. Need to re-test/update its manifest in Phase 2.
- **`bmad-help`** has a catalog (`bmad-help.csv` + skill table); update after each delete/reframe.
- **Atomic ledger fix**: `_bmad-output/brainstorming/brainstorming-session-2026-04-12-combined-ledger-secure-api.md` is referenced from `AI_GROUPCHAT.md` Group goal #3 **and** the "Brainstorm (BMAD)" line in Current tasks. Phase 4 must update both references in the same commit.
- **mem-constant version bump**: Phase 3 ships a new feature (workflow-skills templates + init flag), so `0.2.2 → 0.3.0` by semver — confirm before bumping.
- **41-skill rewrite is a lot.** Phase 2 alone is ~14 mutations. Recommend pausing for user review after Phase 2 before Phase 3 begins.
- **Public surface**: Phase 3 publishes the workflow-skills templates to the public `kineticdirt/mem-constant` GitHub. The framing is fine ("AI-coding workflow skills") but worth flagging.

## Verification per phase

| Phase | Verification |
|---|---|
| 1 | User signs off classification table + Q1/Q2 |
| 2 | `.cursor/skills/` directory listing matches expected; `bmad-help` catalog updated; `bmad-party-mode` still loads |
| 3 | `pytest -q` green; manual smoke `mem-constant init --with-workflow-skills` in tmp project; `mem-constant doctor` still passes |
| 4 | `rg '_bmad-output/brainstorming/brainstorming-session-2026-04-12'` returns zero hits in tracked docs (only the new path) |
| 5 | Per user choice in Q1 |
| 6 | Workspace rules accurate; `AGENTS.md` reflects reality |
| 7 | `git push origin master` clean; GitHub shows new commits + new docs |
