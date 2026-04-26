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

- **2026-04-19 (UTC)** — [PC] **Intent:** Docs — **engineering-first** graph/ontology spec, **graph on top of vectors**, **behind vs in front** retrieval order, new **`docs/BUILD-PHILOSOPHY.md`**, README + INSTALL + CONFIGURATION + scaffold `query_pipeline` comment; vendor + **`git push origin master`**.
- **2026-04-19 (UTC)** — [PC] **Result:** Pushed — engineering-led **graph** doc rewrite, **`query_pipeline`** in CONFIGURATION, **BUILD-PHILOSOPHY**, README/INSTALL links, scaffold comment, vendored `spec/`; **`pytest`** OK.
- **2026-04-19 (UTC)** — [PC] **Intent:** Spec **graph + ontology + customization** — new `docs/memory/graph-ontology-and-customization.md`, architecture pointer, README + CONFIGURATION + `mem-constant.yaml` scaffold comments; `scripts/vendor_specs.py` sync.
- **2026-04-19 (UTC)** — [PC] **Result:** Added **graph/ontology/customization** spec + vendored `spec/`; scaffold YAML comments; README + CONFIGURATION links; **`pytest`** OK.
- **2026-04-19 (UTC)** — [PC] **Intent:** Polish GitHub **README** + **docs/INSTALL.md** for clarity; **`git push origin master`** so `https://github.com/kineticdirt/mem-constant` shows updated instructions.
- **2026-04-19 (UTC)** — [PC] **Result:** Pushed **`master`** to **`origin`** (`github.com:kineticdirt/mem-constant.git`, `03172c9..42c0c30`); README + INSTALL tables and quick-start path live on GitHub.
- **2026-04-19 (UTC)** — [PC] **Intent:** Repackage **mem-constant** as a **pip-installable CLI** (`mem-constant init` / `doctor` / `specs`) with bundled `docs/memory` specs, default `mem-constant.yaml`, optional Cursor rule scaffold; add **INSTALL / CLI / CONFIGURATION / integration** docs + README refresh. Paths: `pyproject.toml`, `src/mem_constant/`, `scripts/vendor_specs.py`, `docs/*.md`, `docs/memory/README.md`.
- **2026-04-19 (UTC)** — [PC] **Result:** Shipped **`mem-constant` 0.2.0** — `pyproject.toml` + `src/mem_constant/` (CLI, bundled `spec/*.md`, Cursor template), `scripts/vendor_specs.py`, `LICENSE`, docs (`INSTALL`, `CLI`, `CONFIGURATION`, `INTEGRATION-*`, `PACKAGING`), `docs/memory/README.md`, README refresh; **`pytest`** 3 passed; **`mem-constant doctor`** OK on PC.

- **2026-04-12 (UTC)** — [PC] **Fallout Repopulation audit — done:** removed duplicate `fictionlab-staging/PreviousChat.json`; added `PreviousChat-CANON.md` pointer; `chat-ui/server.py` docstring (`CHAT_UI_MAX_FALLSTART_CHARS` 450000) + Wiki `LORE_MEMORY_PATHS` (Pixi hub + scenarios-dump); `fictionlab/README.md`, `docs/lore/fallout/README.md`, LORE-LAYERS + scenarios-dump README aligned; rebuilt `MASTER-FALLOUT-SCENARIO.md`.
- **2026-04-12 (UTC)** — [PC] **Testing + cleanup:** `py -3 scripts/verify_fallout_repopulation_paths.py` (all required paths OK); `py -3 -m pytest scripts/test_pixi_rp_readiness.py scripts/test_adversarial_harness.py` → **9 passed**; **`AI_GROUPCHAT-archive.md`** holds old Recent activity; **`default_rpg.json`** slimmed to Fallout Repopulation default cast (one Regional Overseer).

- **Run the split model:** laptop writes **context (kV / notes)** + **`[LAPTOP]`** ledger; PC reads pulls + **`[PC]`** ledger + implements toward **Group goals**.
- Finish **shared `origin`** (linuxbox bare repo when reachable) so PC/laptop stop drifting.
- Align **PC ↔ laptop ↔ linuxbox** on group goals and keep git pushed.
- Brainstorm (canonical): secure Writer Stack API + coordination — `agent-artifacts/brainstorm-2026-04-12-secure-writer-api.md` (AI-coding framing). Archived BMAD planning index at `agent-artifacts/_archive-2026-04/planning-artifacts/PLANNING-INDEX.md`.

---

## Recent activity

Older bulk history (2026-04-09 through 2026-04-13) is in [`AI_GROUPCHAT-archive.md`](AI_GROUPCHAT-archive.md).

- **2026-04-26 (UTC)** — [PC] **Intent:** Plan **always-on Pi-class autonomous agent** stack on linuxbox + PC split topology — three workloads (AI-news/X scout, web archiver via **ArchiveBox**, YouTube curator for NotebookLM input). User-locked decisions (this session): archivex = ArchiveBox; topology = split (linuxbox = scheduler + MCP tool servers, PC = heavier reasoning when on); MVP = plan all three first then pick v1; framework lean = **LangGraph** primary, **z8run** (Rust visual flow engine, n8n alternative, fresh) as candidate, n8n as homelab-native fallback. Working plan: workspace-root **`pi-agents-plan.md`** (untracked). Slots into prior **2026-04-19** market-research artifact `_bmad-output/planning-artifacts/research/market-autonomous-agent-pi-and-alternatives-research-2026-04-19.md` (Days 1–14 = "one bounded agent, one schedule, one tool, full tracing"). **Status: drafting plan; no filesystem / Docker / Tailscale / install mutations yet — awaiting user review of plan + sign-off on which workload ships first.**

- **2026-04-26 (UTC)** — [PC] **Intent:** Fold `_bmad` into `mem-constant` and reframe the agent toolset away from B2B product framing toward AI-coding-standards focus. User direction (this date): destination = ship AI-focused workflow skills as `mem-constant` templates **and** dogfood in workspace `.cursor/skills/`; delete irreducibly business skills (PM/analyst/UX-designer personas, PRFAQ, market-research, product-brief, create-ux-design); reframe research/validation skills (PRD → implementation-spec, domain-research → technical-domain-research) toward "agent ships code per standards"; rebuild canonical `_bmad-output/` artifacts (secure-API brainstorm referenced from goal #3) under new AI-native naming, archive the rest. Working plan: workspace-root `agent-workflow-fold-plan.md` (untracked). **Status: awaiting user sign-off on DELETE list + `_bmad/` source treatment + `_bmad-output/` rename before any files move.**
- **2026-04-26 (UTC)** — [PC] **Intent:** Plan revised — **zero deletes, 14 reframes** (Group A 7 clear + Group B 7 newly promoted), `_bmad/` deletion moved to Phase 5, `_bmad-output/` → `agent-artifacts/` rename in Phase 4, **hard pause after Phase 2**. Presenting Group-B reframe-target confirmation (defaults bolded in plan, alternatives listed) before any folder rename / SKILL.md rewrite. No filesystem mutations yet.
- **2026-04-26 (UTC)** — [PC] **Result (Phase 2 complete):** All 11 folder renames applied under `.cursor/skills/`; 14 SKILL.md files rewritten (Group A spec/research/standards focus + Group B persona reframes John→spec-author, Mary→code-analyst, Sally→DX-designer + workflow renames create-ux-design→create-developer-experience-design, market-research→tooling-landscape-research, prfaq→release-notes-prfaq, product-brief→feature-brief). Updated `_bmad/_config/{skill-manifest,agent-manifest,bmad-help}.csv` and `_bmad/bmm/module-help.csv` (these die in Phase 5). Cleaned 2 broken cross-references in step files that the renames created. Ledger commit `6be3e68` on master (workspace-only `.cursor/` mutations deliberately not tracked per plan §7).
- **2026-04-26 (UTC)** — [PC] **Intent (Phase 3 start):** User-confirmed namespace strategy = **strip `bmad-` prefix** for `src/mem_constant/templates/workflow-skills/<clean-name>/` (Q5); publish 34 of 41 skills, exclude 7 meta/orchestration skills (Q6: `bmad-help`, `bmad-party-mode`, `bmad-distillator`, `bmad-checkpoint-preview`, `bmad-correct-course`, `bmad-document-project`, `bmad-shard-doc`). Implies later parity rename of `.cursor/skills/` deferred to Phase 6. Phase 3 sub-plan: bulk template copy with name-strip + cross-reference rewrite, `--with-workflow-skills` CLI flag, pytest coverage, docs, version bump 0.2.2 → 0.3.0.
- **2026-04-26 (UTC)** — [PC] **Result (Phase 3 complete):** 34 skill templates published under `src/mem_constant/templates/workflow-skills/<clean-name>/` (219 files, 89 cross-reference rewrites; 7 meta skills correctly excluded; 6 `bmad-skill-manifest.yaml` + 1 `bmad-manifest.json` renamed to drop prefix; only intentional `bmad-` strings remaining are 2 upstream URL attributions + 1 `replaces-skill:` provenance field). `--with-workflow-skills` CLI flag wired through `cli.py` + `init_scaffold.py::_install_workflow_skills`; package-data glob `templates/workflow-skills/**/*` added to `pyproject.toml`. **18/18 pytest passing** (added 2: positive 34-skill drop + name-strip assertion, negative no-skills-without-flag). Smoke-tested end-to-end: `python -m mem_constant.cli init --with-workflow-skills --yes` writes 34 skill folders to `<project>/.cursor/skills/`. Docs: `docs/CLI.md` updated with flag row + example, `README.md` Quick start row added, **new** `docs/WORKFLOW-SKILLS.md` catalog grouped by Agent Personas (6) / Spec & Planning (10) / Execution (3) / Review (5) / Research (3) / Test (1) / Brainstorming (2) / Misc (4). Version **bumped 0.2.2 → 0.3.0** (semver minor for new feature). One-shot migration helper `phase3_migrate_skills.py` left workspace-untracked. Ready to commit.
- **2026-04-26 (UTC)** — [PC] **Intent (Phase 4-7):** Finish bmad-fold plan end-to-end. **Phase 4** — `_bmad-output/` → `agent-artifacts/` rename (workspace-only), all existing folders moved under `agent-artifacts/_archive-2026-04/`, recreate canonical secure-API brainstorm at `agent-artifacts/brainstorm-2026-04-12-secure-writer-api.md` (AI-coding framing), update `AI_GROUPCHAT.md` Group goal #3 + Current tasks line + planning-index pointers. **Phase 5** — `rm -rf _bmad/` per Q1 (workspace-only; user-confirmed). **Phase 6** — update `.cursor/rules/workspace-goals-agent-dump.mdc` (workspace-only) + `AGENTS.md` Learned Workspace Facts (tracked). **Phase 7** — single commit with: ledger lines, AGENTS.md update, plus newly-tracked `agent-workflow-fold-plan.md` and `phase3_migrate_skills.py` (per user decision); then `git push origin master` to publish 0.3.0 (`3aeb71c`) + this ledger commit to `github.com:kineticdirt/mem-constant`.
- **2026-04-26 (UTC)** — [PC] **Result (Phase 4-7 complete):** Phase 4 — `_bmad-output/` renamed to `agent-artifacts/`; existing 5 entries (`brainstorming/`, `implementation-artifacts/`, `planning-artifacts/`, `MORNING-PICKUP.md`, `project-context.md`) moved under `agent-artifacts/_archive-2026-04/`; recreated canonical secure-API brainstorm at `agent-artifacts/brainstorm-2026-04-12-secure-writer-api.md` (AI-coding framing, technical content preserved verbatim from the 2026-04-12 combined session); updated AI_GROUPCHAT.md Group goal #3 + "Brainstorm" Current tasks line to the new path. Phase 5 — `rm -rf _bmad/` (workspace-only). Surfaced finding: 33 `.cursor/skills/*/workflow.md` files reference `_bmad/_config/*.csv` and `_bmad/bmm/config.yaml` in their narrative text; user decision = **delete anyway**, references stay as informational ghost paths (skills are self-contained, no functional break). Phase 6 — workspace-only edit to `.cursor/rules/workspace-goals-agent-dump.mdc` adds `agent-artifacts/` pointer + AI-coding workflow-skills note; tracked edit to `AGENTS.md` Learned Workspace Facts adds three new bullets (mem-constant 0.3.0 fold, `_bmad/` deletion + ghost-path note, agent-artifacts canonical location). Phase 7 — committing in this turn with: ledger Intent+Result, AGENTS.md update, newly-tracked `agent-workflow-fold-plan.md` + `phase3_migrate_skills.py`. Push to follow.
- **2026-04-26 (UTC)** — [PC] **Intent:** Implement deferred Graphify guardrail in `mem-constant doctor` (detect `graphify-out/` or importable `graphifyy`, print one read-only L1 reminder), add `tests/test_cli.py` coverage for both states, and propagate **L1/L5 vocabulary** into `README.md` so the entry-point doc names the two graphs. End-to-end: edit + pytest + manual `doctor` smoke + commit on `master`.
- **2026-04-26 (UTC)** — [PC] **Result:** Shipped: `src/mem_constant/cli.py` adds `_detect_graphify(project_root)` (importlib spec check for `graphifyy` + `graphify-out/` dir probe) and one read-only reminder line in `cmd_doctor`; `tests/test_cli.py` adds positive (`graphify-out/` present → reminder) and negative (no marker → no `graphify-out/` line) coverage — **`pytest` 16/16 passed**; manual `doctor` smoke against tmp project with `graphify-out/` printed `graphify: detected (graphify-out/ in project root)` + the L1/L4 reminder; against this repo (no `mem-constant.yaml` at root) prints no graphify line, as designed. `README.md` now has a **Layering at a glance** table (L0–L5, L1=Graphify, L5=curatorial) + updated doc-row labels for `INTEGRATION-GRAPHIFY.md` (L1) and `graph-ontology-and-customization.md` (L5). Single commit on `master`.
- **2026-04-26 (UTC)** — [PC] **Intent:** Resolve Graphify ↔ MemPalace architecture clash (docs-only): name two distinct graphs — **Structural graph (L1, Graphify)** vs **Curatorial graph (L5, mem-constant ontology)** — and document the **evidence-anchor** pattern (MemPalace records may cite Graphify node IDs; reverse forbidden). Touches `docs/INTEGRATION-GRAPHIFY.md`, `docs/memory/graph-ontology-and-customization.md`, `docs/CONFIGURATION.md`, `docs/BUILD-PHILOSOPHY.md`. No CLI/code changes.
- **2026-04-26 (UTC)** — [PC] **Result:** Shipped docs-only resolution: `INTEGRATION-GRAPHIFY.md` now has `## Layer position` (L0–L5 diagram + L1/L5 comparison table) and `## Evidence-anchor pattern` (one-way YAML example + four bridge rules); `docs/memory/graph-ontology-and-customization.md` adds `## Scope: this is the Curatorial graph (L5)` clarifying it is **not** the same as a structural code graph; `docs/CONFIGURATION.md` adds `query_pipeline.structural_graph` (`none` / `graphify` / `custom`) so retrieval code does not silently mix L1 and L5; `docs/BUILD-PHILOSOPHY.md` layering model now lists L0–L5 explicitly with L1 (structural) and L5 (curatorial) as distinct layers + doc map row for `INTEGRATION-GRAPHIFY.md`. No CLI/code changes; `mem-constant doctor` guardrail deferred per user choice.
- **2026-04-26 (UTC)** — [PC] **Intent:** Analyze and integrate external skills/retrieval repos into this workspace: `forrestchang/andrej-karpathy-skills` for auto-usable Cursor skills, plus deep analysis of `safishamsi/graphify` (large repo) for fit/conflicts with mem-constant + MemPalace.
- **2026-04-26 (UTC)** — [PC] **Result:** Added workspace rule `.cursor/rules/karpathy-guidelines.mdc` (auto-applied Karpathy guidelines) and new `docs/INTEGRATION-GRAPHIFY.md` documenting safe Graphify adoption as a **derived** graph/query layer while preserving MemPalace + mem-constant authority boundaries; linked in `README.md`.
- **2026-04-26 (UTC)** — [PC] **Intent:** Implement `memconstant-pruning-and-multiide` plan end-to-end: `$HOME` init safety, pruning/recontext config knobs, multi-IDE scaffolds (Cursor + Claude Code + VS Code), doctor health signals, docs, and tests.
- **2026-04-26 (UTC)** — [PC] **Result:** Shipped plan scope: `init` now redirects default `$HOME` runs to `~/.mem-constant/`; added balanced pruning/recontext config defaults; added `--with-ide-scaffolds` (writes/merges `CLAUDE.md` + `.github/copilot-instructions.md` from templates); extended `doctor` with Claude/VS Code project signals; added integration docs for Claude Code/VS Code; updated packaging + CLI/docs; `pytest` now **14 passed**.
- **2026-04-26 (UTC)** — [PC] **Intent (pi-agents-plan rev 2 — OpenCode integration):** Revised workspace-root **`pi-agents-plan.md`** to thread **OpenCode** (MIT, ~150K stars, v1.14.25 / 2026-04-25, daily releases) through the always-on Pi-class agent stack via **paths A + B + C all three**: (A) `opencode serve` on linuxbox port **13005**, Tailscale-only, password-auth via `OPENCODE_SERVER_PASSWORD` — remote dev console; (B) `opencode run --agent <name>` as the **autonomous cron runtime** for W3 (POC: `yt-curator`) and W1 once W3 passes; LangGraph kept as documented fallback; W2 stays cron+Python (no LLM in the loop); (C) shared **MCP servers** (`x-fetch`, `archivebox-cli`, `yt-dlp-meta`) registered in `opencode.json` so they're reachable from both cron and interactive OpenCode/Cursor sessions. Framework table reordered: OpenCode = recommended runtime; LangGraph = fallback; z8run demoted to tertiary. Added **Q7/Q8/Q9** sign-off (path-A install scope; path-B POC scope; **aarch64 + 2 GB RAM verification** as a flagged risk — _unverified_, mitigation = prefer `opencode run` over long-lived `serve`, Phase 3 must measure RSS). Added **Phase 0.5** (first linuxbox mutation = OpenCode `serve` install) gated separately from Phase 1 (repo scaffold, reversible). **Status: drafting plan rev 2; no filesystem / Docker / Tailscale / install / npm / pip mutations yet — awaiting user review of plan rev 2 + Q1–Q9 answers in one consolidated pass.**
- **2026-04-25 (UTC)** — [PC] **Intent:** Update **mem-constant** docs/integration to verify **claude-mem** usage and improve where carryover/session-memory guidance lives (`docs/INTEGRATION-CLAUDE-MEM.md`, `docs/CLI.md`, `docs/CONFIGURATION.md`, `README.md`, `src/mem_constant/` if needed).
- **2026-04-25 (UTC)** — [PC] **Result:** Added `mem-constant doctor --path` integration checks (Node/NPX, workspace hooks, user Cursor hooks/MCP, Claude Mem detection) in `src/mem_constant/cli.py`; updated `docs/CLI.md`, `docs/INTEGRATION-CLAUDE-MEM.md`, and `README.md` with verification flow + clearer “what goes where” guidance; `pytest` 10/10 passed.

- **2026-04-22 (UTC)** — [PC] **Intent:** Prepare **E:\\** removable drive for **laptop handoff**: keep **`CUSTOMER COPIES.pdf`** only at root besides **`RemotePC-Setup`**; remove macOS metadata folders; write connection summary + pre-filled **`config.psd1`** and full **`scripts\\`** bundle on the drive.

- **2026-04-22 (UTC)** — [PC] **Result:** Deleted **`E:\\.fseventsd`**, **`E:\\.Spotlight-V100`**, and replaced **`E:\\RemotePC-Setup`** with **`START-HERE-LAPTOP.txt`**, **`CONNECTION-SUMMARY.txt`**, **`SETUP-REFERENCE.md`**, and **`scripts\\`** (PowerShell + laptop **`config.psd1`** + **`config.when-on-desktop.psd1`**). Left **`E:\\CUSTOMER COPIES.pdf`** and **`System Volume Information`** untouched.

- **2026-04-21 (UTC)** — [PC] **Intent:** Implement the **remote PC companion** plan as runnable **`scripts/remote-stream-companion/`** (WoL + wait for Apollo port + Moonlight / RustDesk / Apollo UI), not docs-only.

- **2026-04-21 (UTC)** — [PC] **Result:** Added **`RemoteStreamCommon.ps1`**, **`Connect-RemotePC.ps1`**, **`Open-ApolloWebUI.ps1`**, **`Connect-RustDesk.ps1`**, **`config.example.psd1`**, folder **`README.md`**; **`docs/remote-pc-setup`** updated to point at scripts; **`config.psd1`** gitignored under that folder.

- **2026-04-21 (UTC)** — [PC] **Intent:** Update **mem-constant** from `origin/master` and bring **E:\RemotePC-Setup** (Apollo + Moonlight remote PC notes) into the repo for git-backed reference.

- **2026-04-21 (UTC)** — [PC] **Result:** Fast-forward to **v0.2.2** (session carryover CLI, Cursor hooks, `mem_constant_carryover_hooks.py`); `python scripts/vendor_specs.py` (specs already aligned); **pytest** 10 passed; added **`docs/remote-pc-setup/`** (mirror of E:\ + note that the client is **Moonlight**, not “Midnight”).

- **2026-04-19 (UTC)** — [PC] **Result:** **`docs/ssh-le-potato-reference.md`** — **Quick connect** (Git Bash helper, direct SSH, PowerShell, LAN) + **fix Tailscale SSH check** for automation (`sudo tailscale set --ssh=false`, then `tailscale up` without `--ssh`, merge exit-node flags as needed).

- **2026-04-19 (UTC)** — [PC] **Intent:** SSH to **linuxbox** and configure Tailscale **exit node** (`ip_forward`, `tailscale up --advertise-exit-node`); quote terminal output; update doc if applied.

- **2026-04-19 (UTC)** — [PC] **Result:** From this workspace shell — **`ssh` … `abhinav@100.122.108.94`** (`BatchMode`, key `~/.ssh/id_rsa_potato`): **`# Tailscale SSH requires an additional check`** + `https://login.tailscale.com/a/l3f64ccc335ef9` (non-interactive cannot finish). **`ssh` … `abhinav@192.168.1.191`**: **`Connection timed out`** (PC not on Pi LAN / wrong path). **Exit node commands not run on Pi** — human: interactive `ssh` / `bash scripts/tailscale-ssh-open-check-url.sh` then paste remote block from chat, **or** LAN `potato-lan` when home.

- **2026-04-19 (UTC)** — [PC] **Intent:** User wants **linuxbox** as Tailscale **exit node** (VPN egress from company WiFi). Agent: relay setup steps + policy warning; no live `tailscale` probe from this shell.

- **2026-04-19 (UTC)** — [PC] **Result:** Steps delivered in chat — Pi: `ip_forward` + `tailscale up --advertise-exit-node` (merge with existing flags); admin console approve exit node; client: “Use exit node”. Optional **subnet router** (`--advertise-routes`) if “entrance” = reach LAN from tailnet. Employer AUP caveat.

- **2026-04-19 (UTC)** — [PC] **Intent:** implement Autonomous Memory Redesign design package (model-agnostic working memory spec, MemPalace routing policy, semi-auto prune/GC, scheduler, daily standup, and global handoff template) under `docs/memory/`.

- **2026-04-19 (UTC)** — [PC] **Result:** delivered `docs/memory/` design package: `autonomous-memory-architecture.md`, `memory-schema-and-scoring.md`, `routing-policy.md`, `pruning-and-gc-policy.md`, `operations-runbook.md`, `daily-standup-spec.md`, `validation-plan.md`, and `global-handoff-template.md`.

- **2026-04-19 (UTC)** — [PC] **Intent:** BMAD market research — user said **Proceed**; run steps 2–6 (web-sourced) into `_bmad-output/planning-artifacts/research/market-autonomous-agent-pi-and-alternatives-research-2026-04-19.md`.

- **2026-04-19 (UTC)** — [PC] **Result:** BMAD market research — completed artifact **`_bmad-output/planning-artifacts/research/market-autonomous-agent-pi-and-alternatives-research-2026-04-19.md`** (customer behavior → pain points → decisions → competitive landscape → synthesis). Primary sources include IDC agent-economics blog, LangGraph docs, MCP specification, Temporal blog, n8n docs, OpenAI Agents SDK docs, Raspberry Pi product/docs pages, OWASP LLM Top 10 hub.

- **2026-04-19 (UTC)** — [PC] **Intent:** BMAD market research kickoff for an always-on autonomous agent stack, starting with Raspberry Pi-hosted agents and alternatives; producing planning artifact under `_bmad-output/planning-artifacts/research/`.

- **2026-04-17 (UTC)** — [PC] **Handoff:** User stopping for the night — workspace changes are on disk; **this folder is not a git repo** (no `git commit` here). Next session: resume **linuxbox** (Pi-hole when static IP ready, **Gitea**/**Uptime Kuma** on **13000**/**13001**, **USB** `ebooks/` at **`/media/abhinav/PERSONAL`**), **`AGENTS.md`** + **continual-learning** index up to date.

- **2026-04-17 (UTC)** — [PC] **Result:** **continual-learning** — incremental transcript index **`.cursor/hooks/state/continual-learning-index.json`** refreshed (5 parent transcripts, mtimes); **`AGENTS.md`** updated (linuxbox USB vs internal storage, ~40 GB library policy, Docker homelab services, `copy_linuxbox_usb_bundle.ps1` LF normalization, `&&` diagnostic preference, no large-scale photo/file cloud priority).

- **2026-04-17 (UTC)** — [PC] **Result:** **linuxbox homelab (no Pi-hole yet)** — **`docker.io`** + **`docker-compose`** (apt); **`/home/abhinav/homelab/docker-compose.yml`** — **Uptime Kuma** host **13001**, **Gitea** **13000** / SSH **12222** (avoided conflict with existing **Node** on **3000/3001**). Repo: **`scripts/linuxbox/homelab/`**. Paperless / Home Assistant **not** installed (RAM).

- **2026-04-16 (UTC)** — [PC] **Result:** **linuxbox USB (PERSONAL)** — SSH: mounted **`/dev/sda1`** → **`/media/abhinav/PERSONAL`**, fixed **CRLF** on `*.sh` (vfat), ran **`bash bootstrap.sh`** → **`ebooks/`** on USB; **`/etc/fstab`** line **`UUID=35A3-6203`** … **`nofail`**. Pi-hole **not** run (interactive). Repo: **`linuxbox-usb-bundle/.gitattributes`**, **`copy_linuxbox_usb_bundle.ps1`** normalizes **LF** for `*.sh` after copy.

- **2026-04-16 (UTC)** — [PC] **Result:** **USB bundle docs** — **`README-FIRST.txt`** + **`STORAGE-PLAN.txt`**: warn **do not** run `bootstrap.sh` from **`~/linuxbox-usb-bundle`** (scp copy) if bulk library should live on **USB** — that path puts `ebooks/` on **~64 GB internal**; run **`bootstrap.sh` from USB mount** only. Synced those two files to Pi `~/linuxbox-usb-bundle/`.

- **2026-04-16 (UTC)** — [PC] **Result:** **USB bundle** — **`STORAGE-PLAN.txt`** (~40 GB for `ebooks/`, rest mixed), **`USB-STACK-OPTIONS.md`** (home automation, monitoring, documents/PDF, DNS/privacy, knowledge/docs; **not** prioritizing cloud file/photo sync), **`README-FIRST.txt`** updated; **`README.md`** row.

- **2026-04-16 (UTC)** — [PC] **Result:** **256GB USB bundle** — added **`linuxbox-usb-bundle/`** (`README-FIRST.txt`, **`bootstrap.sh`**, **`sh/`** Pi-hole + ebook scripts, **`OFFLINE-linuxbox-pihole-and-ebooks.md`**) + **`scripts/copy_linuxbox_usb_bundle.ps1`** to copy bundle to a drive letter; **`README.md`** row.

- **2026-04-16 (UTC)** — [PC] **Result:** **Cursor rules — global vs workspace** — **`%USERPROFILE%\.cursor\rules\`**: `global-memory-and-sync.mdc`, `global-tech-style.mdc` + **`GLOBAL_USER_RULES_FOR_SETTINGS.md`** (paste into **Cursor Settings → User Rules** — Cursor does not auto-load `~/.cursor/rules` for all workspaces). **Repo:** `.cursor/rules/workspace-goals-agent-dump.mdc` (always apply in this workspace).

- **2026-04-16 (UTC)** — [PC] **Memory policy:** **MemPalace** = final zone of truth + deep recall/archive; **claude-mem** = small light **working cache** so the model tracks what you mean mid-thread; **sync** regularly — especially at **new chat / new agent** — then decide what stays vs goes; **vault** may be **encrypted**; **FIDO** keys intended for vault unlock (how to wire: TBD).

- **2026-04-16 (UTC)** — [PC] **Result:** **SSH unblocked** — opened Tailscale check URLs via `cmd start`; ran **`scripts/tailscale-ssh-open-check-url.sh`** (keeps `ssh` alive while opening browser). **`ssh` … `BatchMode=yes`** to `abhinav@100.122.108.94` → **`BATCH_OK`** + **`raspbian-bullseye-aml-s905x-cc`**. Agent can run remote commands again until Tailscale **check** period expires.

- **2026-04-16 (UTC)** — [PC] **Result:** **SSH retry** (`BatchMode` → `abhinav@100.122.108.94`): still **`Tailscale SSH requires an additional check`** + new `login.tailscale.com/a/…` URL — **one interactive** `ssh` / `tailscale ssh` from **your** terminal (open link, approve) is required before agent/non-interactive runs can execute **on the Pi** (Pi-hole / ebook scripts).

- **2026-04-16 (UTC)** — [PC] **Intent:** **linuxbox** — add **Pi-hole** + **ebook library** layout: runbook **`docs/linuxbox-pihole-and-ebooks.md`**, scripts **`scripts/linuxbox/`** (`create-ebook-library-layout.sh`, `preflight-pihole-dns.sh`, `install-pihole-interactive.sh`). Human runs on Pi after SSH (Tailscale browser check if needed).

- **2026-04-16 (UTC)** — [PC] **Result:** **Pi-hole + ebooks** — added **`docs/linuxbox-pihole-and-ebooks.md`** (router + Tailscale DNS, port 53 / K3s / `systemd-resolved` notes, `rsync` from PC); **`scripts/linuxbox/`** install + preflight + **same** `ebooks/` tree as **`scripts/create_ebook_library_tree.ps1`**; **`README.md`** row. **Agent did not run installer on Pi** (no SSH session from here).

- **2026-04-16 (UTC)** — [PC] **Intent:** Cursor agent — SSH smoke test to **linuxbox** (`abhinav@100.122.108.94`, `~/.ssh/id_rsa_potato`, `BatchMode`) for MemPalace / claude-mem stack check; will append **Result** with exact terminal lines.

- **2026-04-16 (UTC)** — [PC] **Result:** **`tailscale status`** (this PC): **`raspbian-bullseye-aml-s905x-cc`** `100.122.108.94` **online** (`idle`, tx/rx non-zero). **`ssh -i ~/.ssh/id_rsa_potato` … `abhinav@100.122.108.94`** (`BatchMode`): reached host, printed **`# Tailscale SSH requires an additional check`** + **`https://login.tailscale.com/a/…`** — **non-interactive session cannot finish** until you open that URL once (see [docs/ssh-le-potato-reference.md](docs/ssh-le-potato-reference.md) § Tailscale SSH browser step). **`ssh` … `abhinav@192.168.1.191`**: **connection timed out** (likely off-LAN from this PC). **MemPalace / claude-mem on-box:** not probed — complete Tailscale SSH check (or use an interactive terminal), then `ssh` / `tailscale ssh` and inspect services there.

- **2026-04-16 (UTC)** — [PC] **Result:** **linuxbox** (100.122.108.94): **`systemctl enable`** **`tailscaled`** + **`ssh`**; **`sudo tailscale up --ssh --accept-dns=true`**; prefs **`RunSSH`/`WantRunning`** OK; **sshd** on **:22** all interfaces. **`docs/ssh-le-potato-reference.md`** updated (persistence table). SSH from agent PC verified **BatchMode** OK.

- **2026-04-16 (UTC)** — [PC] **Result:** Saved **`docs/ssh-le-potato-reference.md`** (Tailscale IP, MagicDNS, `ssh potato` / `tailscale ssh` notes). Copied **`id_rsa_potato`** → **`%USERPROFILE%\.ssh\id_rsa_potato`** (ACL tightened); **`~/.ssh/config`** `IdentityFile` for **`potato`** / **`potato-lan`** now uses **`~/.ssh/id_rsa_potato`**.

- **2026-04-16 (UTC)** — [PC] **Result:** SSH test from this PC to **`abhinav@100.122.108.94`** → **connection timed out** (12s). **`ping`** same. **`tailscale status`** on this PC shows **`raspbian-bullseye-aml-s905x-cc`** (100.122.108.94) **offline, last seen 6d ago** (relay `nyc`; tx 624 rx 0). **Fix on the Pi (LAN):** `sudo tailscale up` / `systemctl status tailscaled` / reboot; confirm **online** in Tailscale admin before SSH over tailnet.

- **2026-04-16 (UTC)** — [PC] **Intent:** SSH connectivity test from this workspace to **linuxbox** (`abhinav@100.122.108.94` per ledger); quote terminal output in chat.

- **2026-04-15 (UTC)** — [PC] **Intent:** **256GB USB** — ebook library layout + reserve ~64GB elsewhere for indexes; USB speed tests (3.x bus).

- **2026-04-15 (UTC)** — [PC] **Result:** **USB + ebooks** — this session: no ~256GB volume visible (only USB **D:** Seagate Portable ~2TB, BusType USB). **Speed test** (512 MiB, staged copy): **~124 MiB/s write**, **~114 MiB/s read** to D: — consistent with **USB 3.x + HDD**, not bus-limited. Scripts: **`scripts/usb_sequential_speedtest.ps1`**, **`scripts/create_ebook_library_tree.ps1`** (run with your 256GB drive letter). **256GB** holds **many thousands** of typical EPUBs (most books ≈ **1–5 MiB** text; PDFs/scans much larger).

- **2026-04-15 (UTC)** — [PC] **Result:** **MemPalace** — `pip install mempalace` (3.3.0); `mempalace init "$HOME" --yes` (v3 scans home for miner `mempalace.yaml` + `entities.json` — broad); dedicated palace dir **`mempalace-archive/palace`** for MCP archival; Cursor **`%USERPROFILE%\.cursor\mcp.json`** → `py -3 -m mempalace.mcp_server --palace <that path>` + `PYTHONIOENCODING=utf-8`. **Restart Cursor** to load MCP. (v3: `mempalace mcp` only prints help — server is `python -m mempalace.mcp_server`.)

- **2026-04-15 (UTC)** — [PC] **Intent:** **`workshop/02-claude-mem-cursor/`** — docs + **`npx claude-mem@latest install --ide cursor`** wrappers (`install-cursor` / `upgrade-cursor` / **`register-weekly-upgrade.ps1`** for Scheduled Task). Upstream [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem). This PC: install completed (hooks + MCP); **`npx claude-mem start`** + Cursor restart still on you.

- **2026-04-15 (UTC)** — [PC] **Intent:** **`workshop/01-article-understanding/`** — multi-slot JSON schema + agent prompt + stdlib **`scripts/prep_article.py`** (URL or file → `inbox/` plain text) so Cursor can reliably **UNDERSTAND** AI/ML articles and capture follow-up information kinds (claims, pointers, skeptic notes, etc.). Root **`README.md`** row for `workshop/`.

- **2026-04-14 (UTC)** — [PC] **Result:** EKS stress PoC tree **moved / restored to** **`E:\ekspoc-stress-testcases\`** (`test-cases/`, `docs/`, `scripts/kind/`). Interrupted cross-drive `mv` required full **restore** onto E:; **`test-cases/` removed from `agent-dump`** (see root `README.md`).

- **2026-04-14 (UTC)** — [PC] **Intent:** Add **`test-cases/`** polyglot EKS stress PoC (Spring, Go, React, Node, Next, Vue), **`docs/test-cases-index.md`**, **`docs/stress-scenario-matrix.md`**, **`test-cases/k8s-umbrella/`** (Kustomize + local/EKS overlays), **`scripts/kind/`** bootstrap notes.

- **2026-04-13 (UTC)** — [PC] **Intent:** Gemma 4 **triplet tree merge** over `PreviousChat.json` chunks — sliding window (center = 2nd…n−1) merges layer-up until one summary; criterion in `docs/pixi/fallout/scenarios-dump/CHUNK_TREE_CRITERION.md`; script `scripts/gemma_chunk_tree_merge.py`; published `PREVIOUSCHAT-CHUNK-TREE-GEMMA.md` (base + final only), intermediates under `scenarios-dump/tree-runs/<id>/`.
- **2026-04-12 (UTC)** — [PC] **Result:** Chat UI — **`starting_message`** always on **+ New** scenario row; `syncMessagesWithScenarioOpener` + **`opener_seed`**; `ensureRpg` backfill includes default opener; scenario switch replaces seeded opener only; **Opening beat** toolbar (reset template / regen AI / undo, Ctrl+Z) with one-level snapshot of messages + active scenario world pack — `chat-ui/static/`, `README.md`.
- **2026-04-12 (UTC)** — [PC] **Intent:** Party-mode audit — in-game time / world ticks vs `pixi_world_state` + chat-ui board gap; user = sole scope owner (no external stakeholders) — reply in chat; optional follow-up card in Kanban if desired.
- **2026-04-12 (UTC)** — [PC] **Result:** Chat UI gaps — **scenario** dropdown never empty (client `ensureRpg` backfill + select labels; server `_default_rpg()` stub if JSON missing); **FictionLab start** / **Fallout bundle** moved to **Session dock → Scenario** (canonical `fallout-fictionlab-lore` or `repo_corpus: true`); fixed `newSession` → `quickCreateSession`; docs — `chat-ui/static/`, `server.py`, `README.md`, `fictionlab/README.md`, `default_rpg.json`.
- **2026-04-12 (UTC)** — [PC] **Intent:** Chat UI polish — circular **favicon** loading indicator (no duplicate “Thinking…” text); circular archive/delete row actions; **+ New** modal optional **system prompt**; markdown GFM + table styles — `chat-ui/static/` (`index.html`, `styles.css`, `app.js`).
- **2026-04-12 (UTC)** — [PC] **Result:** Chat UI — per-scenario **`starting_message`** (default Fallout opener); `POST /api/sessions` seeds transcript; client backfill + scenario switch; **+ New** modal field; Session → Scenario preview; README + `server.py` docstring.
- **2026-04-12 (UTC)** — [PC] **Result:** Chat UI — empty **decision dock** amber bar fixed (`hidden` + `:empty` CSS); Character dock **You** tab (player fields, inject sheet, interview prompt); `default_rpg.json` optional sheet keys; README.
- **2026-04-12 (UTC)** — [PC] **Result:** RP visibility — writer `GET /health` adds `primary_backend` / `default_model` / `expert_backend` / `router_config` (sanitized); chat-ui `POST /api/chat` returns `rp_trace`; `/api/config` adds `has_writer_api_key`; Monitor + Debug copy + `chat-ui/README.md`.
- **2026-04-12 (UTC)** — [PC] **Intent:** BMAD `bmad-generate-project-context` — Step 01 discovery only; `_bmad-output/project-context.md` already present — halt for user **[C]** or update vs new choice.
- **2026-04-12 (UTC)** — [PC] **Repopulation = default AI RP test track:** `default_rpg.json` + **+ New** modal prefilled and **`fallout-fictionlab-lore`** id; docs (`chat-ui/README`, `docs/pixi/fallout/README`, `chat-ui/fictionlab/README`) + `server.py` docstring state Fallout Repopulation as **first scenario** for exercising the larger stack.
- **2026-04-12 (UTC)** — [PC] **chat-ui polish (done):** footer **spinner** + “Thinking…” while waiting; **A** / **U** archive + **×** delete on each session row; **+ New** opens a **modal** (title + scenario name / setting / world / summary); **marked** + **DOMPurify** for chat + Session dock summary; circular **`favicon.svg`**; server stores **`archived`** and lists **`scenario_label`**.
- **2026-04-12 (UTC)** — [PC] **Ledger + default session cleanup:** archived long **Recent activity**; `default_rpg.json` default cast = one **Regional Overseer** (Fallout: Shelter Repopulation); added `scripts/verify_fallout_repopulation_paths.py` and **Reality check** in `docs/pixi/fallout/README.md`.
- **2026-04-13 (UTC)** — [PC] **Result:** Chat UI — GET `/api/default-fictionlab`, GET `/api/lore-links`, FictionLab start, Wiki dock; `CHAT_UI_MAX_SYSTEM_CHARS` / `FICTIONLAB_SCENARIO_PATH`; `chat-ui/fictionlab/README.md`.
- **2026-04-13 (UTC)** — [PC] **Intent:** FictionLab default start + Wiki + repo lore paths — `chat-ui/`, `fictionlab-staging/`, `default_rpg.json`.
- **2026-04-13 (UTC)** — [PC] **Result:** Kanban to chat-ui — GET `/api/chat-feed`, POST `/api/chat-sessions`, Start RP opens session query; `board.json` B-16 backlog QA; `PROJECTAPPS` + `chat-ui/README`.
- **2026-04-13 (UTC)** — [PC] **Intent:** Kanban live feed + Start RP — `scripts/kanban_dashboard/`, `chat-ui/static/app.js`.
- **2026-04-13 (UTC)** — [PC] **Result (stack checks):** `adversarial_harness preflight` returns 200 on `/health`; nine pytest tests (harness + `test_pixi_rp_readiness`); `writer_bot_try_chat.py` returns PONG when writer is up.
- **2026-04-12 (UTC)** — [PC] **Fallout Repopulation paths:** Pixi `scenarios-dump/PreviousChat.json` plus optional Create Scenario HTML; lean `fictionlab-staging/rp/scenario.md`; duplicate staging JSON removed (commit 4b06ea3).
- **2026-04-12 (UTC)** — [PC] **Master bundle:** `python scripts/build_master_fallout_scenario.py` writes `compiled/MASTER-FALLOUT-SCENARIO.md`; GET `/api/default-fallout-start` default cap 450000 chars.
- **2026-04-12 (UTC)** — [PC] **Result:** chat-ui `app.js` — Cast / Wiki / You / Relations / World / Monitor use **active scenario** `entities` / `edges` / `selectedId` when present (`liftFlatRosterIntoActiveScenarioOnce`, `ensureScenarioWorldPack`, `repairActiveSelection`); Notes + World filter/sort `localStorage` include `scenarioId`; **+ New** / Fallout bundle stub rows carry a default overseer pack; `app.js?v=20260412h`.
- **2026-04-12 (UTC)** — [PC] **Fix:** `ensureScenarioWorldPack` no longer clones another scenario’s roster into scenarios missing `entities` (that showed Courier-9 on every track). Missing key → **empty** cast; `app.js?v=20260412i`.
- **2026-04-12 (UTC)** — [PC] **Plan (user):** FictionLab = **source of truth**; repo lore = **secondary context**. Roadmap: prompt order (FL opener + sheet + labeled lore), rich **You** / inventory / NSFW-gated fields, confirm NPC merges, `world_state_delta` / entity patches for tracking.
- **2026-04-12 (UTC)** — [PC] **Intent:** User — **cannibalize FictionLab JSON** into `lore/fallout-nsfw/characters/` (one-by-one review); **analysis plan** for tightening scenario writing (dual source: `scenario.md` Story characters vs `PreviousChat.json` transcript; provenance + consistency passes).
- **2026-04-12 (UTC)** — [PC] **Result:** User — **planning/brainstorm data inventory** — canonical brainstorm = combined ledger+API (`_bmad-output/brainstorming/…2026-04-12…`); Fallout narrative “massage” work = Layer B character promotion + export-id hygiene + optional B-16 / ADVRP / PRD 2b (see reply).
- **2026-04-12 (UTC)** — [PC] **Result:** User — **`PREVIOUSCHAT-CHARACTER-REGISTRY.md`** (explore subagent + grep verify) — raiders/Dunkirk/Bivens/V33 roster + merge checklist; `scenarios-dump/README.md` link.
- **2026-04-13 (UTC)** — [PC] **Intent:** Fallout scenarios-dump — starting cast doc, two-layer PreviousChat summary tree (10-msg chunks), zip snapshot of key markdown; `STARTING-SCENARIO-CAST.md`, `PREVIOUSCHAT-SUMMARY-TREE.md`, `scripts/build_previouschat_summary_tree.py`, `fallout-scenarios-documentation-snapshot-2026-04-13.zip`, `scenarios-dump/README.md`.
- **2026-04-13 (UTC)** — [PC] **Result:** Writer defaults — replaced Red Hat NVFP4 router/config/snapshot defaults with **DavidAU** DECKARD E4B GGUF repo + `E4B-Gemma4-it-vl-HERE-DECKARD4-Q8_0.gguf`; `GEMMA4_DAVIDAU_DECKARD_LOCAL.md`; legacy `GEMMA4_RED_HAT_NVFP4.md` stub; `writer_bot_config.json`, `model_router_config*.json`, `packages/writer-hf-snapshot/*`, `docs/index.md`, `CONTINUOUS_RP_WRITER_LAB.md`.
- **2026-04-13 (UTC)** — [PC] **Result:** Docs + defaults — **Pixi = Gemma 4 cloud + Gemma 4 local only** (`docs/pixi/MODELS.md`, router, `env.example`, `open-claw.env.example`, chat-ui defaults, smoke scripts, `writer_bot_server` help strings); removed extra `local_vllm` router backend; OpenRouter default model **`google/gemma-4-31b-it`**.
- **2026-04-21 (UTC)** — [PC] **Result:** **mem-constant 0.2.2** — **Cursor Composer hooks** (with **`init --with-cursor-rules`**): buffer user/assistant → **`sessionEnd`** writes **`last-session.md`**; workspace **Linuxbox** has **`.cursor/hooks.json`** + script. See **`docs/CLI.md`**.
- **2026-04-21 (UTC)** — [PC] **Result:** **mem-constant 0.2.1** — **session carryover**: **`.mem-constant/last-session.md`** + **`mem-constant carryover`** CLI + init/bootstrap + **`.cursor/rules/mem-constant.mdc`** (**alwaysApply**, read carryover at new chat). Not auto-transcript; end-of-session **`carryover write`** still required.
- **2026-04-21 (UTC)** — [PC] **Result:** **MemPalace** — package **3.3.1** OK; default palace `C:\Users\abhin\.mempalace\palace` has **empty Chroma** (no collections) → **search/status fail** until **`mempalace mine`** on an inited project. **`%USERPROFILE%\.cursor\mcp.json`** has **no** MCP servers. Root workspace **`AI_GROUPCHAT`** has the one-line audit.
- **2026-04-21 (UTC)** — [PC] **Intent:** install and launch RustDesk from USB handoff package at `E:\RemotePC-Setup\scripts\Connect-RustDesk.ps1`, then report install/launch status.
- **2026-04-21 (UTC)** — [PC] **Result:** RustDesk installed from `E:\RemotePC-Setup\installers\rustdesk-1.4.6-x86_64.exe` (silent install) and launched successfully via `E:\RemotePC-Setup\scripts\Connect-RustDesk.ps1`; process verified at `C:\Program Files\RustDesk\rustdesk.exe`.

---

## Cursor extras (optional)

- [docs/CURSOR_AGENT_BRAINSTORM_COMMAND.md](docs/CURSOR_AGENT_BRAINSTORM_COMMAND.md) — brainstorm / loop
- [docs/SUBAGENTS_GUIDE.md](docs/SUBAGENTS_GUIDE.md), [docs/RUN_COMMANDS.md](docs/RUN_COMMANDS.md) — multi-step agent runbooks

---

## Background

- **Linuxbopx:** [docs/musings/LINUXBOPX.md](docs/musings/LINUXBOPX.md)
- **Git remote (PC + laptop hub):** same `origin` on every clone. **Default intent:** **bare repository on linuxbox** (SSH, e.g. via Tailscale IP in [LINUXBOX_REACHABILITY.md](docs/LINUXBOX_REACHABILITY.md)) — no GitHub required. Steps: [docs/LAPTOP_CURSOR_HANDSHAKE.md](docs/LAPTOP_CURSOR_HANDSHAKE.md) § Shared git remote.
- **Linuxbox actually reachable?** [docs/LINUXBOX_REACHABILITY.md](docs/LINUXBOX_REACHABILITY.md) (Tailscale vs LAN vs Cloudflare; Debian SBC + storage context)
- Tailscale / linuxbox quick ref: [docs/COMPUTE_LAYER_STATUS.md](docs/COMPUTE_LAYER_STATUS.md)
- Syncing repo to Linux (git): [docs/SYNC_COMPUTE_LAYER_FROM_WINDOWS.md](docs/SYNC_COMPUTE_LAYER_FROM_WINDOWS.md) (paths mention ObsidianSync; use the same pattern for this repo if the clone lives on the box)
