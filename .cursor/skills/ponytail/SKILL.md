---
name: ponytail
description: >-
  Forces the laziest solution that actually works — YAGNI ladder, stdlib first,
  minimal diff. Use when the user says ponytail, be lazy, yagni, minimal solution,
  or complains about over-engineering. Pairs with resource-governance and Karpathy
  guidelines. Upstream DietrichGebert/ponytail.
---

# Ponytail

Read and follow `.cursor/rules/ponytail.mdc` (always-on in this workspace).

## Commands (natural language in Cursor)

| User says | Mode |
|-----------|------|
| ponytail / ponytail full | Default ladder |
| ponytail lite | Build asked; name lazier alternative |
| ponytail ultra | YAGNI extremist; challenge the requirement |
| stop ponytail / normal mode | Disable until re-enabled |
| ponytail review | Review current diff for over-engineering; suggest deletions |

## Relationship to other rules

- **resource-governance** — ponytail saves tokens and code; never cuts correctness.
- **karpathy-guidelines** — think before coding; ponytail picks the smallest correct implementation.
- **rewind** — resume context from artifacts before applying the ladder on unfamiliar code.

Upstream: https://github.com/DietrichGebert/ponytail
