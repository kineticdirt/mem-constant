# Workflow skills

`mem-constant init --with-workflow-skills` drops 34 AI-coding workflow skills under your project's `.cursor/skills/`. Each is a directory with a `SKILL.md` (frontmatter + description) plus optional `workflow.md`, step files, templates, and data. Cursor / compatible agents discover these by scanning `.cursor/skills/` and trigger them by description.

These templates are reframed from the upstream BMAD method toward an **AI-coding-standards** focus: implementation specs over market PRDs, code-graph analysis over market analysis, developer experience over end-user UX.

## Install

```bash
mem-constant init --with-workflow-skills
```

Combine with other flags:

```bash
mem-constant init --with-cursor-rules --with-ide-scaffolds --with-workflow-skills --yes
```

The `--yes` flag is needed to overwrite an existing `.cursor/skills/<name>/` folder; without it, existing skill folders are preserved.

## Catalog

### Agent personas (6)

Conversational personas with distinct identities and capability tables. Trigger by name or role.

| Skill | Persona | Role |
|---|---|---|
| `agent-architect` | Winston | System architect and technical design leader |
| `agent-code-analyst` | Mary | Codebase / stack analyst and dependency cartographer |
| `agent-dev` | Amelia | Senior software engineer for story execution |
| `agent-dx-designer` | Sally | Developer-experience designer (CLI / API / DX patterns) |
| `agent-spec-author` | John | Implementation spec author and requirements decomposer |
| `agent-tech-writer` | Paige | Technical documentation specialist |

### Specification & planning (10)

| Skill | Use when |
|---|---|
| `create-implementation-spec` | Author an acceptance-criteria-first spec for code work |
| `edit-implementation-spec` | Edit an existing implementation spec |
| `validate-implementation-spec` | Validate a spec against standards before handoff |
| `create-architecture` | Capture architecture decisions for AI-agent consistency |
| `create-developer-experience-design` | Plan CLI / API / DX patterns and surface specifications |
| `create-epics-and-stories` | Break requirements into epics and developer stories |
| `create-story` | Create a single context-rich story file for later execution |
| `feature-brief` | Brief a feature scope before spec authoring |
| `sprint-planning` | Generate a sprint plan from epics |
| `sprint-status` | Summarize sprint status and surface risks |

### Execution & dev (3)

| Skill | Use when |
|---|---|
| `dev-story` | Execute a story implementation against its spec |
| `quick-dev` | Implement small change requests following project conventions |
| `generate-project-context` | Create a `project-context.md` with AI-relevant rules |

### Review (5)

| Skill | Use when |
|---|---|
| `code-review` | Adversarial code review (parallel layers; structured triage) |
| `review-adversarial-general` | General cynical review for any artifact |
| `review-edge-case-hunter` | Walk every branching path and report unhandled cases |
| `editorial-review-prose` | Clinical copy-edit review of writing |
| `editorial-review-structure` | Structural editor: cuts, reorganization, simplification |

### Research (3)

| Skill | Use when |
|---|---|
| `technical-research` | Research technologies and architectures for AI-driven implementation |
| `technical-domain-research` | Research a technical domain or codebase ecosystem |
| `tooling-landscape-research` | Survey tools / libraries / dev infrastructure choices |

### Test (1)

| Skill | Use when |
|---|---|
| `qa-generate-e2e-tests` | Generate end-to-end tests for an existing feature |

### Brainstorming & elicitation (2)

| Skill | Use when |
|---|---|
| `brainstorming` | Facilitate ideation using diverse creative techniques |
| `advanced-elicitation` | Push the LLM to reconsider and refine recent output |

### Misc (4)

| Skill | Use when |
|---|---|
| `check-implementation-readiness` | Validate spec / architecture / tests / standards completeness |
| `index-docs` | Generate or update an `index.md` for a folder of docs |
| `release-notes-prfaq` | Compose a release-notes / changelog PRFAQ |
| `retrospective` | Post-epic review to extract lessons and assess success |

## What is *not* shipped

Seven BMAD-specific orchestration / meta skills are **not** in the templates because they are tied to BMAD's own runtime catalog and would confuse new mem-constant users:

- `bmad-help`, `bmad-party-mode`, `bmad-distillator`, `bmad-checkpoint-preview`, `bmad-correct-course`, `bmad-document-project`, `bmad-shard-doc`

## Provenance

These templates derive from the upstream [BMAD method](https://bmad-code-org.github.io/), with Group A / Group B reframes (PRD → implementation spec, market research → tooling-landscape research, persona shifts: PM → spec author, analyst → code analyst, UX designer → DX designer) for AI-coding-standards focus. See repository commit history for the rename map.
