# Gemini CLI instructions

<!-- mem-constant:start -->

## mem-constant continuity and routing

- Read `.mem-constant/last-session.md` before your first substantial action when it exists.
- Treat MemPalace as the durable archive authority; the working cache is short-horizon context only.
- Reconcile memory at `new_chat`, `new_agent`, and `end_milestone` boundaries (see `mem-constant.yaml`).
- Promote durable decisions/facts; prune low-signal or stale context per the project policy.
- For step-based work, state a brief goal → steps → verify plan before editing, and loop until the
  verify check passes (see `docs/mem-constant/` specs).

If a request asks for handoff, follow `docs/mem-constant/global-handoff-template.md`.
<!-- mem-constant:end -->
