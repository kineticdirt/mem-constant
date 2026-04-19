# Autonomous memory specifications

These Markdown files are the **canonical v1 design** for a two-layer memory stack:

- **Archive** (role filled by [MemPalace](https://pypi.org/project/mempalace/) or similar): durable facts and decisions.
- **Working cache** (role filled by [Claude Mem](https://github.com/thedotmack/claude-mem) or similar): short-horizon thread continuity.

## Index

| Document | Purpose |
|----------|---------|
| [autonomous-memory-architecture.md](autonomous-memory-architecture.md) | End-to-end architecture and components |
| [routing-policy.md](routing-policy.md) | When items go to archive vs cache vs quarantine |
| [memory-schema-and-scoring.md](memory-schema-and-scoring.md) | Record fields and scoring |
| [pruning-and-gc-policy.md](pruning-and-gc-policy.md) | Retention and safe deletion |
| [operations-runbook.md](operations-runbook.md) | Triggers, modes, operator controls |
| [daily-standup-spec.md](daily-standup-spec.md) | Digest format and schedule |
| [global-handoff-template.md](global-handoff-template.md) | Copy-paste handoff for chat rollover |
| [validation-plan.md](validation-plan.md) | How to validate an implementation |

## Easiest way to pull these into a project

Install the **mem-constant** package and run:

```bash
mem-constant init --with-cursor-rules
```

That writes **`mem-constant.yaml`** and copies this set into **`docs/mem-constant/`** (version-matched to the wheel you installed). See [../INSTALL.md](../INSTALL.md) and [../CLI.md](../CLI.md).

## Maintainer note

Repo **source of truth** for spec text is this directory. Before publishing a **PyPI** release, run **`python scripts/vendor_specs.py`** so `src/mem_constant/spec/` matches this tree. See [../PACKAGING.md](../PACKAGING.md).
