# Repo organization plan — agent-dump / Linuxbox

**Status:** Phase 0 DONE 2026-07-18 — PLAN ONLY thereafter; no moves until you sign off per phase.  
**Author:** [PC] 2026-07-07; Phase 0 inventory [PC] 2026-07-18  
**Goal:** Less randomness, predictable layout, **zero breakage** of linuxbox services, deploy scripts, or agent intent laws.

---

## Principles (non-negotiable)

1. **Move in phases** — each phase ends with a verification checklist before the next starts.
2. **Archive before delete** — nothing removed until a phase sits stable for one week.
3. **Frozen paths** — Tier-0 paths below are not renamed in Phases 1–3.
4. **One source of truth per concern** — docs in `docs/`, ops in `agents/`, deploy in `scripts/`.
5. **Symlinks during transition** — if something external links to an old path, leave a stub or symlink for one release cycle.
6. **Linuxbox is the runtime** — every change must pass PC checks *and* be deployable without breaking `~/agent-dump` on potato.

---

## Target layout (north star)

```text
agent-dump/
├── AGENTS.md              # durable facts (stay at root — agents read it)
├── CLAUDE.md              # linuxbox operating manual (stay at root)
├── AI_GROUPCHAT.md        # coordination ledger (stay at root)
├── README.md              # single human entry (merge README-LINUXBOX + workspace README)
│
├── agents/                # lanes, intent, inbox seeds, deploy manifest, state/
├── campaigns/             # RP + map (paths fixed for tableslop)
├── docs/                  # all runbooks + plans
│   ├── linuxbox/          # intent-and-architecture.md, tunnels, …
│   ├── agents/            # lane runbooks
│   └── plans/             # promoted *-plan.md from root
├── projects/              # tableslop, mazda3, infranet, …
├── scripts/
│   ├── linuxbox/          # systemd-facing (DO NOT reshuffle internally in Phase 1–3)
│   ├── pc/                # push-linuxbox, publish, …
│   └── …
├── sites/abhinavall.net/  # production deploy bundle
├── .staging/              # portfolio prototypes + Playwright smoke only
├── src/ + tests/          # mem-constant PyPI island (publish excludes homelab)
├── agent-artifacts/       # BMAD / brainstorm archives
├── reports/               # generated agent output
├── workshop/              # small experiments
├── _archive/              # NEW — superseded trees moved here (not deleted)
└── secrets/               # gitignored
```

**Not in north star at root:** `integrations-root/`, `pi_agent_daemon-root-stub/`, `scripts-moved/`, `docs-from-writer/`, loose `*-plan.md`, duplicate READMEs, `nul`, stray keys.

---

## Tier 0 — FROZEN (do not move without full migration project)

These paths are hardcoded in systemd, deploy manifests, intent laws, or live services.

| Path | Why frozen |
|------|------------|
| `~/agent-dump` on linuxbox | 40+ scripts default here |
| `scripts/linuxbox/*.service` → `/etc/systemd/system/` | Absolute `ExecStart` paths |
| `scripts/linuxbox/linuxbox-status-server.js` | `linuxbox-status.service` |
| `scripts/linuxbox/linuxbox-status/` | Dashboard static + icons |
| `scripts/linuxbox/tableslop-server.js` | `linuxbox-tableslop.service` |
| `scripts/linuxbox/tunnel-origin-proxy.js` | `abhinavall-origin-8780.service` |
| `agents/intent/agent-loops.json` | Pod path laws; `verify_agent_intent.py` |
| `agents/linuxbox-deploy-manifest.json` | `push-linuxbox.sh` bundles |
| `campaigns/tropic-gooner/map/` layout | `tableslop-server.js`, `push-tableslop-map.sh` |
| `projects/tableslop/regions.json` | Map viewer manifest |
| `.staging/portfolio-redesign/_screenshots/` | Playwright smoke harness |
| `sites/abhinavall.net/` | `push_abhinavall_to_linuxbox.sh` |
| `.cursor/hooks.json` + `.cursor/rules/` | IDE behavior |
| `AI_GROUPCHAT.md`, `AGENTS.md`, `CLAUDE.md` | Multi-agent + box agent entrypoints |

**Internal reshuffle of `scripts/linuxbox/`** (e.g. subfolders) is **Phase 4+** only, with a path-alias grep pass and box redeploy.

---

## Tier 1 — Move only with grep + manifest update

| Path | Consumers to update |
|------|---------------------|
| `agents/*_TASK.md` | Hermes prompts, `CURRENT_TASK.md` |
| Individual `docs/*.md` | Cross-links in skills, AGENTS.md |
| `.cursor/skills/` | Skill frontmatter paths; mem-constant template sync |
| `reports/` subfolders | Dashboard API, cron writers |

---

## Tier 2 — Safe to consolidate (archive first)

Already called out as superseded in `README-agent-dump-workspace.md`:

| Current | Action |
|---------|--------|
| `integrations-root/` | → `_archive/integrations-root/` + one-line README stub at old path |
| `pi_agent_daemon-root-stub/` | → `_archive/` (contains `.env` / `node_modules` — **do not commit secrets**) |
| `scripts-moved/` | → `_archive/scripts-moved/` |
| `docs-from-writer/` | Merge unique content into `docs/legacy/writer-stack/` then archive |
| Root `*-plan.md` (6 files) | → `docs/plans/` with redirect note in root stub |
| `README-LINUXBOX.md`, `README-agent-dump-workspace.md` | Merge into `README.md` sections |
| Root `id_rsa_potato` | **Remove from tree** — belongs on USB kit only (`scripts/laptop-usb-kit/`) |
| Root `nul` | Delete (Windows artifact; breaks `git add -A`) |
| `deckard-local.env` | Ensure gitignored; move to `secrets/` if kept |

---

## Tier 3 — Deferred (separate project)

| Idea | Why deferred |
|------|--------------|
| Physical split: homelab repo vs mem-constant on disk | Already have `publish-linuxbox-repo.sh`; needs dual-workspace Cursor setup |
| Split `src/` to separate clone on PC | High churn; PyPI release cadence ≠ homelab |
| Reorganize `scripts/linuxbox/` into subpackages | Touches every systemd unit |
| Track all `agents/*_TASK.md` in git | Policy decision; many are operational but untracked |

---

## Phased execution

### Phase 0 — Baseline (no file moves)

**Deliverables:**

- [ ] This plan approved by human
- [x] `scripts/verify_repo_layout.sh` — exits non-zero if Tier-0 paths missing (PASS 2026-07-18)
- [x] Record baseline: `git status`, linuxbox `curl` checks, inbox state path (see inventory refresh below)
- [x] `scripts/inventory_md_baseline.py` — read-only `.md` category counts (2026-07-18)

**Verify on linuxbox (from PC):**

```bash
ssh potato "systemctl is-active linuxbox-status linuxbox-tableslop cloudflared-tableslop abhinav-portfolio"
ssh potato "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8790/"
ssh potato "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/health"
curl -sI https://map.tableslop.org/health | head -1
```

**Gate:** All 200/active before Phase 1.

#### 2026-07-18 inventory refresh (Phase 0 executed)

**Evidence (PC, no moves):**

| Check | Result |
|-------|--------|
| `bash scripts/verify_repo_layout.sh` | **PASS** (all Tier-0 paths present) |
| `python scripts/inventory_md_baseline.py` | **1237** `.md` on disk (~1235 prior inventory) |
| linuxbox systemd | `linuxbox-status` / `linuxbox-tableslop` / `cloudflared-tableslop` / `abhinav-portfolio` → **active** |
| linuxbox curl | `:8790/` → **200**; `:8765/health` → **200** |
| inbox | potato `agents/state/human-inbox.json` **present**; PC workspace copy missing (expected — runtime on box) |

**Category counts (on disk):** `node_modules` 386 · `.cursor/skills` 236 · package workflow-skills 206 · `campaigns` 148 · `docs` 72 · `agents` 48 · `agent-artifacts` 35 · `docs-from-writer` 13 · root 7. Tracked `.md` ≈ **377**; gitignored ≈ **392**; untracked-not-ignored ≈ **469**.

**Conclusions:**

- **Movable set is small.** The bulk of `.md` must stay (node_modules, path-loaded skills, package template data, campaign sheets). Do not churn those.
- **`docs-from-writer/` is a clean orphan** — 13 markdown files, no live script imports found in Phase 0; safe Phase 2 archive candidate after content merge review.
- **Rule-coupled paths** — if moved later, update `.cursor/rules/workspace-goals-agent-dump.mdc` (and Group goals §3 in `AI_GROUPCHAT.md`):
  - `agent-artifacts/brainstorm-2026-04-12-secure-writer-api.md`
  - `agent-artifacts/_archive-2026-04/`
- **Phase 1 root plans are not at repo root.** They were removed to potato archive `/mnt/archive/agent-dump-pc-archive/2026-07-17-continuity-cleanup/root-plans/` (stub index: `agent-artifacts/_archive-2026-07/README.md`). On-disk root: **0/6** present. Working tree still has `D agent-workflow-fold-plan.md` (tracked delete pending commit). Helper script: `scripts/inventory_md_baseline.py` (read-only).

**Phase 0 checkbox:** baseline script + verification **done** 2026-07-18 — human plan approval still separate.

---

### Phase 1 — Documentation only (zero runtime risk)

**Moves:**

| From | To |
|------|-----|
| `linuxbox-archive-setup-plan.md` | `docs/plans/linuxbox-archive-setup.md` |
| `blog-ai-expansion-plan.md` | `docs/plans/blog-ai-expansion.md` |
| `dashboard-security-and-continuous-dev-plan.md` | `docs/plans/dashboard-security.md` |
| `pi-agents-plan.md` | `docs/plans/pi-agents.md` |
| `tableslop-discord-oauth-plan.md` | `docs/plans/tableslop-discord-oauth.md` |
| `agent-workflow-fold-plan.md` | `docs/plans/agent-workflow-fold.md` |

**At old root paths:** leave a 3-line stub:

```markdown
# Moved
This plan lives at `docs/plans/<name>.md`.
```

**Also:**

- Add `docs/README.md` — index linking `linuxbox/`, `agents/`, `plans/`
- Link `docs/linuxbox/intent-and-architecture.md` from `README.md`

**Verify:**

```bash
# No broken refs in Tier-0 scripts
rg -l "linuxbox-archive-setup-plan|blog-ai-expansion-plan" scripts/ agents/ || true
# Should only hit stubs or docs
```

**Gate:** Human confirms doc index readable; no script changes required.

---

### Phase 2 — Archive legacy folders (read-only risk)

**Pre-check:** `rg` each folder for imports from live code.

| Move | Stub at old path |
|------|------------------|
| `integrations-root/` → `_archive/integrations-root/` | `integrations-root/README.md` → "archived" |
| `scripts-moved/` → `_archive/scripts-moved/` | same pattern |
| `pi_agent_daemon-root-stub/` → `_archive/pi_agent_daemon-root-stub/` | same; scrub secrets first |
| `docs-from-writer/` → `_archive/docs-from-writer/` after merging unique pages to `docs/legacy/writer-stack/` | stub |

**Do NOT touch:** `agents/integrations/` (canonical clawdbot bridge), `agents/pi_agent_daemon/`.

**Verify:**

```bash
rg "integrations-root|scripts-moved|docs-from-writer|pi_agent_daemon-root-stub" scripts/linuxbox agents .cursor --glob '!_archive/**'
# Expect zero hits (or only stubs)
bash scripts/verify_repo_layout.sh   # after Phase 0 script exists
```

**Gate:** One week stable; human approves Phase 3.

---

### Phase 3 — Root hygiene

| Action | Risk |
|--------|------|
| Merge READMEs into single `README.md` | Low — links only |
| Add `deckard-local.env` to `.gitignore` if not already | Low |
| Remove root `nul` | Low — unblocks `git add -A` |
| Move `id_rsa_potato` off repo tree to USB kit path only | Medium — verify SSH still works via `~/.ssh/` |
| Add `_archive/README.md` explaining archive policy | None |

**Verify:** Full Phase 0 linuxbox curl/systemd check again.

---

### Phase 4 — Optional script hygiene (future)

Only after Phases 1–3 stable:

- `scripts/linuxbox/verify_paths.py` — single registry of all path constants
- Generate `agents/path-registry.json` from that registry for intent verifier
- Consider `scripts/linuxbox/services/` vs `scripts/linuxbox/crons/` split with **compat symlinks** at old filenames

---

## Verification matrix (run after every phase)

| Check | Command / action |
|-------|------------------|
| Dashboard | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8790/` on box |
| Map origin | `curl … :8765/health` |
| Map public | `curl -sI https://map.tableslop.org/health` |
| Portfolio | `curl … :3000/` |
| Tunnel units | `systemctl is-active cloudflared-*` |
| Intent laws | `python3 scripts/linuxbox/verify_agent_intent.py --self-check` |
| Dashboard smoke | `bash scripts/linuxbox/run-dashboard-ui-smoke.sh` (if Playwright available) |
| Deploy dry-run | `bash scripts/pc/push-linuxbox.sh --dry-run` (add flag if missing) |
| Inbox state | `test -f agents/state/human-inbox.json` on box |

---

## Rollback policy

- **Phase 1:** Restore stub → full file from git history.
- **Phase 2:** `mv _archive/<name> ./<name>` — stubs make it obvious.
- **Phase 3:** `git checkout` for README merge.
- **Never rollback** by force-pushing linuxbox git bundle without checking `agents/state/` on box.

---

## What we will NOT do in this project

- Delete campaign content or map binaries
- Rename `campaigns/tropic-gooner/`
- Change linuxbox systemd unit `ExecStart` paths without paired installer update
- Mass-delete `.cursor/skills/` (dogfooding set)
- "Clean up" by untracking operational `agents/` files without a tracking policy

---

## Feedback / sign-off

Mark phases when approved:

```
[x] Phase 0 — baseline script + verification (2026-07-18 inventory refresh)
[ ] Phase 1 — docs/plans consolidation only  ← WAIT human sign-off
[ ] Phase 2 — archive legacy folders
[ ] Phase 3 — root hygiene
[ ] Phase 4 — deferred script registry
```

### Phase 1 waitlist (for human sign-off — NOT executed)

Original table assumed six root `*-plan.md` files. **Current reality:** files live on potato archive only (`root-plans/` under `2026-07-17-continuity-cleanup`). Proposed Phase 1 scope for your OK:

1. **Restore → `docs/plans/`** from potato archive (optional stubs at old root names — root already empty):
   - `linuxbox-archive-setup-plan.md` → `docs/plans/linuxbox-archive-setup.md`
   - `blog-ai-expansion-plan.md` → `docs/plans/blog-ai-expansion.md`
   - `dashboard-security-and-continuous-dev-plan.md` → `docs/plans/dashboard-security.md`
   - `pi-agents-plan.md` → `docs/plans/pi-agents.md`
   - `tableslop-discord-oauth-plan.md` → `docs/plans/tableslop-discord-oauth.md`
   - `agent-workflow-fold-plan.md` → `docs/plans/agent-workflow-fold.md` (also resolve pending `D` in git index)
2. **Add** `docs/README.md` index (`linuxbox/`, `agents/`, `plans/`).
3. **Link** `docs/linuxbox/intent-and-architecture.md` from root `README.md`.
4. **Fix stale refs** (no moves): `AGENTS.md` still cites `linuxbox-archive-setup-plan.md`; `docs/agents/agent-orchestration-options.md` cites `pi-agents-plan.md`.

**Out of Phase 1 (do not do without later sign-off):** `docs-from-writer/`, `integrations-root/`, `scripts-moved/`, `pi_agent_daemon-root-stub/`, root `nul` / `id_rsa_potato` / README merge (Phase 2–3).

**Human notes:**

```text
(add constraints, e.g. "keep docs-from-writer until I read it", "don't touch workshop/")
```

---

## Related

- `docs/linuxbox/intent-and-architecture.md` — runtime topology
- `docs/repo-split-linuxbox-memconstant.md` — publish split policy
- `README-agent-dump-workspace.md` — historical split context (merge target for Phase 3)
- `agents/linuxbox-deploy-manifest.json` — deploy bundles
