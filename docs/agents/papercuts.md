# Papercuts — when and how to log agent friction

**Canonical log:** `agents/papercuts.md` · **List open:** `bash scripts/linuxbox/papercuts-list.sh [open|in-progress|fixed|all]`

A **paper cut** is friction an agent hits while working that is not worth a user-task or inbox question by itself, but costs time/tokens every time it recurs. Logging it makes the problem findable so any lane (or the human) can resolve it autonomously later.

## When to log one

- **Friction / smells:** a script that needs tribal knowledge, a guard that blocks legitimate work, a config that misleads.
- **Repeated failures:** recurring 429s on a model id, exit 124 timeouts, silent fallback loops.
- **Unclear env / missing docs:** env var you had to guess, undocumented port, misleading label (e.g. Hub "BLOCKED" that was a false parse).
- **Bad UX in agent-facing surfaces:** Hub panels that hide the real state, logs that bury the error.
- **Regressions / drift:** runtime state clobbered by deploys, reverted fixes, stub-over-truth writes.

## When NOT to

- **User-facing answers or decisions** → talk to the user in chat, or `agents/state/human-inbox.json` if blocked on a human choice.
- **Real work items** that need a lane cycle → `agents/user-tasks.json` / progress boards.
- **Secrets** — never paste keys, tokens, or `.env` contents.

## Format

Newest first, one line per field, in `agents/papercuts.md` (template lives at the top of that file):

- ID `pc-YYYY-MM-DD-<slug>` — stable; reference it from `AI_GROUPCHAT.md` Result lines.
- Lane: `think | cursor-auto | hub | tableslop | pixi | nyc | euro | tropic | ops`.
- Severity: `paper cut` (cosmetic), `annoying` (recurring cost), `blocking` (stops lanes).
- Complaint: 1–3 sentences, evidence over vibes (path, log, holder id).
- Proposed fix: smallest concrete change (ponytail).
- Status: `open` → `in-progress` → `fixed` (add fix date + holder when closing).

## Resolving autonomously

1. Pick an `open` papercut you can fix safely (correctness gates still apply — supply-chain check before upgrades, no runtime wipes).
2. Flip to `in-progress`, fix it, verify with one concrete check.
3. Flip to `fixed` with date + holder; link the `pc-*` id in your `AI_GROUPCHAT.md` Result line.
4. If the fix needs a human call, leave it `open` and ask via the inbox instead of guessing.
