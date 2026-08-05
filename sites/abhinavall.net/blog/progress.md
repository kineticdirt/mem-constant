# Blog lane progress (v8-brutalist-map/blog)

**Agent spec:** `agents/BLOG_AI_LANE_TASK.md`  
**Tone:** public Medium-style essays — no internal infra in post bodies

## Done

- [x] Multi-page site split (index, projects, experience, connect)
- [x] Blog index + `blog.css`
- [x] Nav `blog` tab on all pages
- [x] Seed post replaced: `posts/mcp-beyond-function-calling.html` (2026-06-05) — MCP / tool engineering essay
- [x] Redaction rules in `BLOG_AI_LANE_TASK.md` (no IPs, paths, homelab ops)

## Backlog (agent picks one per cycle)

- [x] Post: Context engineering vs 1M-token windows — `posts/context-engineering-beats-long-windows.html` (2026-06-05, PC trial run)
- [ ] Post: Multi-model routing for agents — latency SLOs, fallback tiers, cost envelopes (generic patterns)
- [ ] Post: RAG evaluation that catches real failures — citation fidelity, retrieval noise, abstention
- [ ] Post: Memory tiers for coding agents — working cache vs archival authority (conceptual, no product names)
- [ ] Post: Tool sandboxing and approval UX — blast radius, read/write server split
- [ ] Post: Structured outputs in production — JSON schema, validation loops, repair strategies
- [ ] Add RSS `blog/feed.xml` (static generator)
- [ ] OG/meta images per post under `blog/images/`

## Rules

- Cutting-edge AI topics with **actual information** — cite public specs/papers.
- **Never** expose internal hosts, paths, preview URLs, or personal stack in articles.
- Every post: lede, ≥4 h2 sections, ≥1 figure, references section.
- Append completion lines here; do not delete prior entries.
