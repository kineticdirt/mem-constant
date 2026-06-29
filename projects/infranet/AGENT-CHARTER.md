# Infranet — research & development

**Project id:** `infranet` · **Kind:** research & development

## Scope

Infranet is the umbrella for **researching**, **prototyping**, and **building** internal/home-stack infrastructure — not production portfolio deploys unless explicitly promoted.

Typical work in this project:

- **Research** — best practices, comparable systems, supply-chain-safe tooling choices
- **Spike / prototype** — small proofs (scripts, configs, local previews)
- **Development** — incremental implementation toward a stable internal surface
- **Documentation** — capture decisions in repo markdown; promote to `docs/` after sign-off

## Out of scope (unless task says otherwise)

- Live edits to **abhinavall.net** production content
- Cloudflare DNS / tunnel changes without human review
- Secrets in git — use host env files only

## Agent notes

Tasks tagged with project **Infranet** should prefer `projects/infranet/` and linked `docs/` artifacts. One concrete step per think tick; log to `AI_GROUPCHAT.md`.

**Context resume:** invoke the **`rewind`** skill (`.cursor/skills/rewind/`) — not a public URL.
