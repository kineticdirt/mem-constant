# Agents & bridges

Long-running daemons and shared HTTP clients. See [docs/REPO_LAYOUT.md](../docs/REPO_LAYOUT.md).

| Path | Role |
|------|------|
| `CURRENT_TASK.md` | Hermes 1m inbox — **idle** by default; ad-hoc tasks only |
| `SITUATION_WATCHLIST.md` | Topics for daily **situation-hermes** cron (edit freely) |
| `WEBSITE_ABHINAVALL.md` | [abhinavall.net](https://abhinavall.net/) background lane (USB storage, cleanup rules) |
| `pi_agent_daemon/` | Node loop against an OpenAI-compatible endpoint |
| `integrations/` | Clawdbot HTTP client (`clawdbot_bridge`) for Discord bot and scripts |

Situation lane (RSS + daily digest, no Vercel): [`docs/agents/situation-monitor-lane.md`](../docs/agents/situation-monitor-lane.md).  
Website lane (abhinavall.net, USB tidy storage): [`docs/agents/website-abhinavall-lane.md`](../docs/agents/website-abhinavall-lane.md).

`scripts/discord_story_bot.py` prepends `agents/` to `sys.path` so `from integrations.clawdbot_bridge import …` keeps working.
