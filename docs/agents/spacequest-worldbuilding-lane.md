# SpaceQuest worldbuilding lane (linuxbox)

The **linuxbox Hermes agent** reads the SpaceQuest campaign and drafts worldbuilding
reports on a schedule. Drafts land in the repo for human review; **no canon is
edited automatically** and nothing is deployed.

Config: [`agents/SPACEQUEST_WORLDBUILDING_TASK.md`](../../agents/SPACEQUEST_WORLDBUILDING_TASK.md)

## What lives where

```text
campaigns/spacequest/
  story/  lore/  characters/  discord-export/   # corpus (read-only for the lane)
  reports/
    README.md                                   # index (lane appends rows)
    2026-06-07-canon-state.md                    # initial agent pass
    2026-06-07-worldbuilding-open-threads.md     # priority queue the lane works from
    <YYYY-MM-DD>-<slug>.md                        # one new draft per review tick
```

## Jobs

| Cron | Schedule | What |
|------|----------|------|
| `spacequest-worldbuilding-review` | **Saturday 09:30 UTC** | Hermes reads corpus + latest reports, drafts **one** open-thread proposal into `reports/` |

Kept to **one weekly LLM job** to respect linuxbox RAM/cost (OpenRouter `owl-alpha`
primary, per [linuxbox-hermes-owl-alpha.md](linuxbox-hermes-owl-alpha.md)). Bump the
cadence later if useful.

## Install (run ON linuxbox)

```bash
cd ~/agent-dump
git pull
bash scripts/linuxbox/install-spacequest-worldbuilding-cron.sh
```

## Manual run (one report now, on linuxbox)

```bash
cd ~/agent-dump
hermes run --workdir "$PWD" "$(sed -n '/^HERMES_PROMPT/,/^EOF/p' scripts/linuxbox/install-spacequest-worldbuilding-cron.sh)"
```

…or just trigger the cron's prompt via the Hermes UI/CLI. (The install script holds
the canonical prompt; see it for the exact instructions handed to the model.)

## Rules for the agent

- **Drafts only.** Never edit `story/`, `lore/`, `characters/`, or Discord exports.
- **Evidence-anchored.** Cite the source file (and export path/line when relevant).
- **Design level, not explicit.** Erotic-horror campaign — keep reports structural.
- **One item per tick.** Don't re-draft an already-covered open thread.
- **No deploy, no production side effects.**

## Promoting a draft to canon (human)

1. Read the draft in `reports/`.
2. Move accepted content into the right `story/` or `lore/` file (and back into the
   Obsidian vault if you keep that as primary).
3. Flip the matching row in `characters/meta/PROJECT-BACKLOG.md` to **done**.
4. Log it in `AI_GROUPCHAT.md`.
