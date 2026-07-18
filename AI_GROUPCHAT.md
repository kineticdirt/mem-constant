# AI_GROUPCHAT

Shared coordination ledger for humans and AI agents working on **ObsidianWriterStack**. Treat this file as append-first: add a short entry before meaningful work, then do the work, then add a one-line result if needed.

**Canonical copy:** this path in the git repo: `AI_GROUPCHAT.md` (repo root).

**Agents (important):** Do **not** claim Tailscale, SSH, or “I found linuxbox” unless you **ran** the check **in this workspace’s terminal** on **this machine** and quote the output—or explicitly say the command was **not** run. Markdown in this repo is **not** live network state. For **reachability**, the human’s **PowerShell / Git Bash** on the laptop or PC is the **source of truth**; agent shells can be sandboxed or off-LAN. Handshake instructions: [docs/LAPTOP_CURSOR_HANDSHAKE.md](docs/LAPTOP_CURSOR_HANDSHAKE.md).

**Machines in this group:** **PC** (Windows + Cursor — this workspace), **laptop** (your portable machine), **linuxbox** (Tailscale node; see [docs/COMPUTE_LAYER_STATUS.md](docs/COMPUTE_LAYER_STATUS.md)). All three stay aligned via **git** (same remote) + optional **SSH** to linuxbox for shells and long-running jobs.

**You (human) + laptop + linuxbox** are the **physical** stack. **This** Cursor workspace is the **desktop PC** side of the chat — not a substitute for your hardware.

---

## Split model & roles (PC + laptop toward common goals)

**Intent:** two Cursor lanes, one team — **split model** so work stays sane as context grows.

| Lane | Role | Focus |
|------|------|--------|
| **PC** (this repo / desktop) | **Compute / “raw model” side** | Heavier implementation, long edits, local tools, agents that should **not** re-load an entire chat every turn when the laptop holds distilled state. |
| **Laptop** | **Context plane** | Holds **durable chat state** (e.g. **kV pairs**, session distillates, pointers) so the group remembers *what* without forcing the PC to carry *all* transcript tokens. Still uses **`[LAPTOP]`** ledger lines + **git** so goals stay aligned with this file. |
| **Human** | **Ground truth** | Decides priorities, runs **host** `ping`/`ssh`, owns merge when `origin` is messy. |
| **linuxbox** (“**Linuxbopx**”) | **Services + optional git `origin`** | K3s, bare repo hub, 24×7 — [LAPTOP_CURSOR_HANDSHAKE.md](docs/LAPTOP_CURSOR_HANDSHAKE.md), [LINUXBOX_REACHABILITY.md](docs/LINUXBOX_REACHABILITY.md). Musings: [docs/musings/LINUXBOPX.md](docs/musings/LINUXBOPX.md). |

**How PC + laptop actually cooperate (do this):**

1. **One shared story** — `AI_GROUPCHAT.md`: **Group goals** + **Recent activity** with **`[PC]`** / **`[LAPTOP]`** before meaningful work; **pull first**, then edit.
2. **Laptop → PC** — push **context artifacts** (kV store path, lorebook shards, whatever you agree) + ledger; **PC pulls** and implements against **goals + your distillates**, not guesswork.
3. **PC → laptop** — **`[PC]`** lines: what shipped / what’s blocked; laptop updates kV / context so the next laptop session doesn’t fork reality.
4. **`origin` when live** — same remote on both clones so the above is automatic; until then, merge **`AI_GROUPCHAT.md`** (and agreed paths) by hand — still counts as group chat.

---

## Group goals (edit together — pull before changing)

These are the shared outcomes we want across PC, laptop, and linuxbox. Anyone may append or adjust after `git pull`.

1. **Single source of truth** — `AI_GROUPCHAT.md` + repo state; no parallel “hidden” plans without a ledger line.
2. **Sync ritual** — Before a work block: `git pull`. After: commit + `git push` so the other machines see updates the same day.
3. **Secure Writer Stack** — API and MCP exposed only on tailnet/trusted LAN with credentials (see canonical brainstorm `agent-artifacts/brainstorm-2026-04-12-secure-writer-api.md`; archived BMAD planning index at `agent-artifacts/_archive-2026-04/planning-artifacts/PLANNING-INDEX.md`).
4. **Linux box role** — Use linuxbox for K3s / heavy jobs / 24×7 services per [COMPUTE_LAYER_STATUS](docs/COMPUTE_LAYER_STATUS.md); PC and laptop are dev + Cursor clients.
5. **Communication** — Use this file for intent; use git commit messages for “what changed”; use SSH or Tailscale ping when debugging connectivity.
6. **Split model cooperation** — Laptop maintains **compact context** (kV / distillates) for the group chat; PC leans on **this ledger + git + those artifacts** for **raw model / implementation** work toward the same **Group goals** (see § Split model & roles).
7. **Resource governance** — Manage **search tokens**, **memory**, **free vs paid models**, and **correctness** while achieving goals; time is rarely the bottleneck. Rule: `.cursor/rules/resource-governance.mdc`. **Ponytail** for minimal correct code: `.cursor/rules/ponytail.mdc`.

_Add goals below as numbered items._

---

## Multi-machine sync (PC + laptop + linuxbox)

| Step | Action |
|------|--------|
| 1 | On **each** machine, clone or `git pull` the **same** `origin` (recommended: **bare repo on linuxbox** over SSH — see [LAPTOP_CURSOR_HANDSHAKE.md](docs/LAPTOP_CURSOR_HANDSHAKE.md) § Shared git remote). If `git remote -v` is empty, add `origin` once, then push `master`. |
| 2 | Edit **only** after `git pull` to avoid overwriting someone else’s ledger edits. |
| 3 | After editing `AI_GROUPCHAT.md`: `git add AI_GROUPCHAT.md` → `git commit -m "AI_GROUPCHAT: …"` → `git push`. |
| 4 | On **linuxbox**, open a shell: `ssh linuxbox` or `ssh abhinav@100.122.108.94` (Tailscale IP from docs), `cd` to your clone, `git pull`. |
| 5 | Prefix ledger lines with **`[PC]`** / **`[LAPTOP]`** / **`[LINUX]`** and UTC time if two people edit the same day. |

**Linux box SSH (reference):** `ssh linuxbox` or `ssh abhinav@100.122.108.94` — see [docs/COMPUTE_LAYER_STATUS.md](docs/COMPUTE_LAYER_STATUS.md).

Cursor agents in this workspace: follow the user rule to update this file **before** pursuing meaningful action (intent + touched paths).

---

## PC ↔ laptop — talk *now* (no waiting on perfect git)

**PC → laptop:** read the **top** line under **Recent activity** tagged **`[PC] OPEN CHANNEL`**. **Laptop:** append **one** **`[LAPTOP]`** line **immediately under it** (same file, same section): your clone path, `git rev-parse --short HEAD`, one sentence (“heard, doing X” / “blocked on Y”). Commit on laptop; **human** merges `AI_GROUPCHAT.md` onto PC (or `git pull` when `origin` exists). That **is** the conversation until the hub is live.

### Laptop Cursor — show up and handshake

**If you are on the laptop:** open **[docs/LAPTOP_CURSOR_HANDSHAKE.md](docs/LAPTOP_CURSOR_HANDSHAKE.md)** and run **“Laptop: do this now”** or the **OPEN CHANNEL** reply above. The handshake is **git + one `[LAPTOP]` line** in **Recent activity**; it does **not** require linuxbox SSH unless you are using the Pi as `origin`.

**Anti-hallucination:** agents must not claim connectivity without terminal output—see the top of that doc. **LAN + Pi as git hub:** substitute **`<PI_LAN_IP>`** in the Same LAN section; confirm ping/SSH in **host** PowerShell or Git Bash first.

---

## Current tasks
- **2026-07-18T23:10Z** — [PC] **Result (Hermes+dashboard surfaces DONE, agent-dump, not yet deployed):** ZenMux selectable via `zenmux:<slug>` prefix. Edited: `install-hermes-profiles.sh` (+providers.zenmux per profile), `secrets/linuxbox.env.example` + `sync-linuxbox-secrets.sh` (optional ZENMUX_API_KEY), `linuxbox-status-server.js` (`parseModelProvider` → `--provider zenmux -m <slug>`), `model-budget/config.json` v3 + `hermes-model-registry.json` v4 (providers{} blocks). New **additive/idempotent** `scripts/linuxbox/add-zenmux-provider.sh` for SAFE live enable — **do NOT full-rerun install-hermes-profiles.sh** (would revert `think`'s live PC-Bonsai routing → OpenRouter). All validated (node --check / bash -n / JSON.parse). Default routing unchanged when ZENMUX_API_KEY unset. Live enable pending human key. **Pixi RP backend (RP_TESTBED, single --backend proxy, mid Gitea SoT reconciliation) deferred to a gated phase.** Plan: `zenmux-provider-plan.md`.

- **2026-07-18T22:45Z** — [PC] **Phase 0 DONE (verified on box, Hermes v0.14.0):** ZenMux integrates natively via the v12+ `providers:` keyed map (`hermes_cli/config.py::_normalize_custom_provider_entry`): `providers.zenmux={name,base_url:https://zenmux.ai/api/v1,key_env:ZENMUX_API_KEY,api_mode:chat_completions,discover_models}`. Provider name→`ZENMUX_API_KEY` by convention; `--provider zenmux -m <slug>` per-call; `hermes fallback add` for chains. Profiles are isolated (entry needed per managed profile). Box `.env` currently only `OPENROUTER_API_KEY`. Scope narrowed by user: **linuxbox-only**, selection=**model-id prefix** (`zenmux:<slug>`), **Hermes+dashboard first**. Next: patch `install-hermes-profiles.sh` (+ env example + dashboard prefix routing + registry/budget provider tags). Key pasted by human.

- **2026-07-18T22:30Z** — [PC] **Intent (PLAN, not started):** Add **ZenMux** as a second, **selectable** provider alongside OpenRouter across all 3 surfaces — Pixi RP backend (`ObsidianWriterStack` `writer_bot_server.py`/chat-ui), Hermes gateway profiles (`install-hermes-profiles.sh`), and Dashboard Chat (`linuxbox-status-server.js` + `agents/hermes-model-registry.json` + `agents/model-budget/config.json`). ZenMux = OpenAI-compatible (`https://zenmux.ai/api/v1`, `Bearer ZENMUX_API_KEY`, OR-style slugs). Plan doc: `zenmux-provider-plan.md` (untracked, root). **Open risk:** Hermes provider→key mapping unverified (Phase 0 on box). Default stays OpenRouter when key absent. **Awaiting user sign-off** on selection mechanism (prefix vs dropdown) + order before Phase 1. No code yet.

- **2026-07-18T19:55Z** — [PC]/LINUX] **Result:** Gitea past wizard (`INSTALL_LOCK=true`, Sign In OK, admin `username`). **What Gitea is for:** linuxbox-local canonical git for RP/Pixi (LAN+TS `:13000`/`:12222`; not public; GitHub RP_TESTBED optional mirror; live stays `~/pixi-rp/…`, Gitea owns history for `git pull` deploys). **Migrate waiting on password** — no `~/.gitea-migrate.env` / `GITEA_ADMIN_PASSWORD` on box (will not invent). Bare still SoT @ `639dec6`/`20260718-time-fix-v1`; live `origin` still bare; 17 sessions; `:8767` 200 Laguna FG; sheet-cap+scene_presence live. Example+script: `scripts/linuxbox/gitea-migrate.env.example`. Human: `cp …example ~/.gitea-migrate.env && chmod 600` → set password → `bash …/gitea-migrate-rp-from-bare.sh --owner username --user username` → re-point origin. Docs updated (no secrets in ledger).

- **2026-07-18T19:52Z** — [PC] **Intent:** Human finished Gitea wizard (admin user literally `username`). Verify INSTALL_LOCK + Sign In; migrate bare `~/repos/ObsidianWriterStack.git` → Gitea owner `username` (script + `~/.gitea-migrate.env` if present — no invent secrets); point live `origin` to Gitea; verify tip `639dec6`/`20260718-time-fix-v1` + `:8767`; update gitea-rp-canonical + system-coherence-track + topology; ledger Result. Never write password to ledger/docs.

- **2026-07-18T18:45Z** — [PC] **Result:** Track B leftover — Gitea still blocked (INSTALL_LOCK=false; no admin secret on potato/PC — will not invent). Bare remains SoT @ `639dec6`/`20260718-time-fix-v1`; live origin already bare; 17 sessions; :8767 OK. Documented human click-path + `scripts/linuxbox/gitea-migrate-rp-from-bare.sh`; topology mermaid `docs/plans/rp-sot-topology-2026-07-18.md`; updated `gitea-rp-canonical.md` + `system-coherence-track.md`; potato note `~/repos/ObsidianWriterStack.ABSORBED-BRANCHES.txt`. Absorbed branches left (no delete). Human: finish wizard → migrate script → optional origin→Gitea.

- **2026-07-18T18:38Z** — [PC] **Intent:** Track B leftover ASAP — finish Gitea :13000 install if creds exist (no invent secrets); migrate bare `~/repos/ObsidianWriterStack.git` → Gitea; point live pixi-rp remote if Gitea becomes host; keep tip `639dec6`/`20260718-time-fix-v1`; mermaid topology docs; update gitea-rp-canonical + system-coherence-track + ledger. Prefer leave absorbed branches tagged/noted over delete.

- **2026-07-18T18:30Z** — [PC] **Result:** Orphan time-fix on SoT. Before `6fae9e6`/`20260718-merge-p5-v1` → after `639dec6`/`20260718-time-fix-v1`. Ported beat-tier clock (system.md + scene_presence + client inject); deleted dead `format_game_clock_markdown`. Bare+GitHub `main` FF to `639dec6`. Live potato checkout + restart OK; sessions 2 preserved; bak `ObsidianWriterStack.bak.pre-time-fix.20260718T182609Z`. Orphans absorbed/superseded: orphan-time-fix=tip, dead-code-tooling, wip-sheet-permanence. Track: `docs/plans/system-coherence-track.md`.

- **2026-07-18T18:22Z** — [PC] **Intent:** One SoT ASAP — port orphaned time-fix onto canonical `pc/merge-onto-laptop` (potato live @ `6fae9e6`, rev `20260718-merge-p5-v1`); naive-merge remaining PC WIP; prune duplicate impls; push bare + deploy. Prefer potato/bare over PC ledger on conflict. Do not clobber other potato agents; no force-push; preserve session JSON.

- **2026-07-18T18:09Z** — [PC] **Result:** Track B P1–P5 complete (linuxbox-only). P1 diff `ObsidianWriterStack/docs/pc-vs-laptop-feature-diff.md`. P2 PARTIAL: Gitea :13000 still install wizard — interim bare `~/repos/ObsidianWriterStack.git` (main=`9d6051c`, pc/merge-onto-laptop=`6fae9e6`). P3+P5 branch `pc/merge-onto-laptop` @ `6fae9e6` (GitHub + bare). P4 live: potato `~/pixi-rp/ObsidianWriterStack` git checkout @ `6fae9e6`, rev `20260718-merge-p5-v1`, :8767 200, Laguna FG, 17 sessions preserved; bak `ObsidianWriterStack.bak.20260718T052841Z`. P5: wired continuity/voice/inbox into event_memo + WD merge; dense PUT; 402 credit retry. Human: finish Gitea install then migrate bare→Gitea. Laptop remotes out of scope.

- **2026-07-18T05:15Z** — [PC] **Result:** Track B P2 PARTIAL — Gitea :13000 HTTP 200 / v1.21.11 but INSTALL wizard (INSTALL_LOCK=false); no admin pw. Seeded bare canonical `~/repos/ObsidianWriterStack.git`: main=`9d6051c` (origin/main), pc/dead-code-tooling=`50c8bde`, pc/wip-sheet-permanence=`dc47467`. Docs: `docs/plans/gitea-rp-canonical.md`. pixi-rp NOT deleted. Human: finish Gitea install then migrate bare → Gitea repo.

- **2026-07-18T05:12Z** — [PC] **Intent:** Track B P2 ONLY — Gitea on potato :13000 as canonical RP host; seed main from RP_TESTBED origin/main (laptop line); mirror pc/dead-code-tooling + pc/* laptop/*; write docs/plans/gitea-rp-canonical.md. Do NOT overwrite main with PC dirty tree; do NOT delete ~/pixi-rp/ObsidianWriterStack.


- **2026-07-18T05:11Z** — [PC] **Intent:** Track B P1–P5 — system coherence. P1 feature-diff + P2 Gitea canonical in parallel; then P3 guided merge → P4 re-point deploy → P5 wire dead builders. Base = laptop `origin/main`; port PC fixes onto it. Touch: `docs/plans/system-coherence-track.md`, `ObsidianWriterStack` (preserve dirty WIP → `pc/wip-*` if needed), potato Gitea `:13000`, `~/pixi-rp/`. Do not force-push main; do not delete deploy tree until P4 backup.

- **2026-07-18T05:09Z** — [PC] **Result:** Track A sheet-cap DONE. Rev `20260718-sheet-cap-v1` live on potato :8767. Fix: re-cap after sheet+history assemble (sync_legacy was writing post-merge bloat into character_sheets). Session `78bb2b84`: Maya **6299** (was **11129** this run / ~**46572** original); max sheet 7046; 0 over 8k; pkg-before-dossier where package exists (Maya has no people/*.md). Tests: 5 sheet-cap + revision regex green. Hard-refresh `?v=20260718-sheet-cap-v1`.

- **2026-07-18T05:04Z** — [PC] **Result:** Track B P0 DONE — pushed `pc/dead-code-tooling` @ `50c8bde` (`50c8bde42fb4b07f811debbed337776443fbffa5`) to GitHub `origin` (RP_TESTBED). Branch URL: https://github.com/kineticdirt/RP_TESTBED/tree/pc/dead-code-tooling . Main untouched; dirty WIP local. P1–P5 NOT done. Laptop `origin/main` still preferred arch for P3.

- **2026-07-18T05:05Z** — [PC] **Intent:** Track A — verify/finish Pixi sheet bloat fix (pkg-after-Identity, section-cap, revision regex), pytest, deploy potato `20260718-sheet-cap-v1`, confirm Maya size. Touch: PixiApp/chat-ui server.py + tests; `docs/plans/system-coherence-track.md`.

- **2026-07-18T05:03Z** — [PC] **Intent:** Track B P0 ONLY — push ObsidianWriterStack commit `50c8bde` as branch `pc/dead-code-tooling` to GitHub `origin` (RP_TESTBED). No merge to main; no P1–P5. Dirty WIP stays local.

- **2026-07-18T05:10Z** — [PC] **Result:** Track C Phase 0 DONE — `verify_repo_layout` PASS; inventory 1237 `.md` (movable set small); linuxbox `:8790`/`:8765` 200; `docs-from-writer/` orphan; rule-coupled `brainstorm-2026-04-12-*` + `_archive-2026-04`. Phase 1 waitlist in plan (restore potato `root-plans/` → `docs/plans/` + docs index) — **not executed**. STOP for sign-off.
- **2026-07-18T05:03Z** — [PC] **Intent:** Track C Phase 0 ONLY — repo-organization baseline (verify_repo_layout + .md inventory note); no moves/deletes. Touch: `docs/plans/repo-organization-plan.md`, `docs/plans/system-coherence-track.md`, optional `scripts/` inventory helper.
- **2026-07-18T04:40Z** — [PC] **Result:** Permanence v2 live on potato — salvage when objects empty; Emily collapsed to `npc:lin-mei` (aka Emily, alias_ids); session `78bb2b84` objects **10** + outfit set; PUT preserve blocks stale-tab wipe of objects/outfit/aka. Rev `20260718-permanence-aka-objects-v2`. Tests: 133 JS + 3 preserve pytest. Hard-refresh `?v=20260718-permanence-aka-objects-v2` (close stale tabs first).
- **2026-07-18T04:38Z** — [PC] **Result:** Pixi permanence — salvage now runs when `new_objects`/OW objects empty (not only empty people); prose→props/outfit/events + Emily→`npc:lin-mei` canonicalize; Cast soft-hide via `canonical_id`/`alias_ids`. Live `78bb2b84`: Emily people row gone (aka Emily + alias_ids on lin-mei); objects **10** backfilled; lin-mei `current_outfit` set; rev `20260718-permanence-aka-objects-v1` on potato :8767. Tests: 133 session_turn_augment pass. Backup `*.bak.lin-mei-emily-merge.20260718T043723Z`. Hard-refresh `?v=20260718-permanence-aka-objects-v1`.
- **2026-07-18T04:36Z** — [PC] **Result:** Permanence harden shipped `20260718-permanence-aka-objects-v1` on potato :8767. Root: aka resolve matched primary-name stub before aka; salvage people-only (0 objects); merge left Emily stub; event_memo never → kind:event. Fix: aka-before-name + collapseAliasPeopleStubs + Cast filter; salvage props/events; hygiene seedEventObjectsFromMemo + Python _plan_aka_merges; outfit from body_profile.overview. Tests 133 node + hygiene pytest green. Hard-refresh app.js / session_turn_augment. Peer owns live Emily session merge.
- **2026-07-18T04:32Z** — [PC] **Intent:** Pixi permanence — prose→OW extract (objects/outfit/events) + Emily→lin-mei alias canonicalize on salvage/merge; live session merge; inject SoT; tests+deploy+CONTINUITY.
- **2026-07-18T04:32Z** — [PC] **Intent:** Pixi permanence harden (CLAIM code): session_turn_augment.mjs + observed_world_hygiene.py + tests + CONTINUITY — alias Emily→lin-mei, salvage objects/outfits/events, Cast stub collapse. Peer owns live session Emily merge only; do not clobber session JSON from this lane.
- **2026-07-18T04:30Z** — [PC] **Intent:** Pixi Cast fork Emily/Lin Mei — harden alias merge + salvage + Cast soft-hide (code path; live session merge owned by peer agent). Touch: session_turn_augment.mjs, observed_world_merge.py, CONTINUITY.md.
- **2026-07-18T04:29Z** — [PC] **Intent:** Pixi Live Cast duplicate — merge Emily aka into canonical Lin Mei on potato session  (backup first; soft-hide emily stub; remap edges).
- **2026-07-18T02:35Z** — [PC] **Result:** Sheet systems connected permanently — live `20260718-between-post-expand-sheet-data-v4` on potato :8767. Python background `character_record` job (`_build_character_sheets`) now injects the same authored `people/*.md` `## Character (package)` prose the client seeds, placed **before** the dossier so it survives the client trimmer; added `_cap_character_sheet_sections` (per-section 1800 / total 8000, identity+package+state uncapped). Live verify (background-job output, session 78bb2b84): lin-mei 1192 · elena 3202 · maya **4151 (was 46572)** · j-reyes 2690 · pc:survivor 2692 — all pkg-before-dossier, no empty affect telemetry, no Recent-beats scrape. Tests: 3 JS files + **249 pytest** green (revision-format contract kept: single hyphen slug). **CAVEAT:** deploy bundled concurrent uncommitted tree (`between-post-expand`, `model_profiles.py`, `test_pending_turn`, `test_preserve_dense_cast`) — all green but **left uncommitted** (did not commit another agent's WIP). Hard-refresh Cast/Wiki.
