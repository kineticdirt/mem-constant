# Agent instructions (Codex CLI / opencode)

<!-- mem-constant:start -->

## mem-constant continuity and routing

- Read `.mem-constant/last-session.md` before your first substantial action when it exists.
- Read `.mem-constant/ops-discipline.md` when present; follow `docs/mem-constant/ops-discipline.md`
  (or `docs/memory/ops-discipline.md` in the package source repo): after something is wrong,
  (1) understand why with evidence, (2) leave a prevention before closing.
- Treat MemPalace as the durable archive authority; the working cache is short-horizon context only.
- Reconcile memory at `new_chat`, `new_agent`, and `end_milestone` boundaries (see `mem-constant.yaml`).
- Promote durable decisions/facts; prune low-signal or stale context per the project policy.
- For step-based work, state a brief goal → steps → verify plan before editing, and loop until the
  verify check passes (see `docs/mem-constant/` specs).

If a request asks for handoff, follow `docs/mem-constant/global-handoff-template.md`
(include Failures and preventions when applicable).
<!-- mem-constant:end -->
