# mem-constant continuity and routing

<!-- mem-constant:start -->

- Read `.mem-constant/last-session.md` before first substantial response when present.
- Treat MemPalace as durable archive authority.
- Treat working cache as short-horizon context only.
- Reconcile memory at `new_chat`, `new_agent`, and `end_milestone` boundaries.
- Promote durable decisions/facts; prune low-signal or stale context aggressively per `mem-constant.yaml`.

If a request asks for handoff, follow `docs/mem-constant/global-handoff-template.md`.
<!-- mem-constant:end -->
