# Chat human-usable — v1 shipped / phase 2

**Goal:** Dashboard Chat is usable by a human: mode templates, optional model pick with relative cost + tok/s, mobile layout, potato offload queue.

## Design constraints (confirmed)

| Constraint | v1 behavior |
|------------|-------------|
| Free-first default | No model pick → free chain then paid (`model-budget`) |
| Explicit model | Overrides start model; still fails over on 429/dead |
| Modes without picker | Brief RP + Workshop hide model select |
| Online only | Picker skips `status: offline` / recent hard-fail |
| Cost + tok/s | Curated `agents/model-budget/chat-catalog.json` (estimated) |
| Potato ~2GB | Offload = structured laptop/PC user-task, not fake remote runtime |
| Mobile ≤720px | Threads drawer + full-width pane + sticky composer |
| Threads | Never wipe `agents/state/chat-threads/` |

## How to use (v1)

1. **Mode** — pick Brief RP / Workshop / Meta ops / Agent coding (sets profile + style + prompt).
2. **Model** (Meta/coding only) — Auto (free-first) or a named model; labels show est. $/token in+out and tok/s.
3. **Offload to laptop** — check before Send → queues `[ops]/load]` user-task (thread path/excerpt + mode/campaign) **and** appends one `[LINUX]` line under `AI_GROUPCHAT.md` Recent activity; does **not** run Hermes on potato.
4. Normal Send without Offload → Hermes on linuxbox with free-first (or pinned model).

## Phase 2 (later)

- [ ] True laptop/PC Hermes (or Cursor agent) worker that drains `offload`/`laptop` tagged tasks over Tailscale
- [ ] Proactive preflight: healthcheck scripts + Hub Fix-this auto-suggest before Chat meta
- [ ] Live OpenRouter model probe cache (TTL) instead of curated status alone
- [ ] Per-mode default pinned model (optional) without hiding free-first Auto
- [ ] Deterministic error playbooks wired from Chat bubble actions (restart gateway, clear bloated state.db warn)
- [ ] Mobile polish: composer height when model+offload rows visible on Pixel 3a
