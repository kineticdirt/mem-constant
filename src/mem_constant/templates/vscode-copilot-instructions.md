<!-- mem-constant:start -->
# mem-constant instructions

Use this project memory policy:

- Read `.mem-constant/last-session.md` at session start when it exists.
- Use MemPalace for durable archive facts and decisions.
- Use working cache only for short-horizon continuity.
- Follow `mem-constant.yaml` for pruning and recontextualization.
- At goal changes, run a recontext pass and drop stale low-signal context.

When producing handoffs, use `docs/mem-constant/global-handoff-template.md`.
<!-- mem-constant:end -->
