# Agent mistake patterns — 2026-07-26

Blunt postmortem: why tableslop / vibes / potato work in session `254a83fd…` was slow and error-prone. Not an apology — process + tooling gaps.

## Verdict

Slowness is mostly **rework of unverified claims**, not raw task size. Agents treat PC edits + ledger prose as “done,” then the human (or a later agent) pays for potato truth. Parallel multitask **amplifies** that when shared files lack a single-writer lock.

## Causes ranked by impact

### 1. Soft / content-blind deploy verify (highest)

**Evidence**

- Manifest policy (`agents/linuxbox-deploy-manifest.json`): *push → verify → Result*.
- `scripts/linuxbox/push-tableslop-map.sh` only checks `systemctl is-active` + `/health` **HTTP code** — never marker count or labels.
- `scripts/pc/push-linuxbox.sh` optional `verify_url` does `curl … || true` (HTTP code only; **cannot fail the push**). Runtime gate (`verify-runtime-state.sh`) protects dashboard state markers, not map content.
- Ledger `2026-07-26T04:01Z` Result claimed vibes rename deployed + `/api/map` OK; `04:10` Intent forced re-investigate; `04:15` Result: **potato still Jul-01 lore** (CuloVera / Crimson Quay). PC had the rename; live did not.

**Why it hurts:** Agents write “Deployed; sha match” from local intent or a partial SCP, then move on. User sees old names → new investigate round → trust tax.

### 2. Parallel writers on unlocked shared files

**Evidence**

- Multitask lock docs/rules cover **`chars-registry:*` only** — not `map.json` / coords / regions-ui.
- Same minute (`04:40Z`): Intent restore/push **17** markers (incl. Orchid/Nueva) **and** Intent remove Orchid/Nueva → **15**. Results at `04:43`/`04:44` race: system push restored 17 after map “dropped to 15,” then remove agent pushed 15 again.
- Parent transcript launched **five** parallel sweeps (parity / lore / coords / secondary UI / places md) against overlapping SoT.

**Why it hurts:** Ledger Intent is coordination theater without disk lock. Last SCP wins; prior “verified” Result is instantly stale.

### 3. Wrong source of truth (lore over art)

**Evidence**

- Name-source diag (`03:58`): UI uses `markers[].label||name`; vibes spellings sat in unused `aliases`.
- Prior “vibes align” moved x/y only — looked like progress, failed the user’s actual ask (names on art).
- Chain: user asks why names wrong → diagnose → choose vibes → rename → still wrong live → parity sweep → more sweeps.

**Why it hurts:** Every downstream deploy/verify assumes the PC file is correct. Wrong SoT × soft verify = long loops that feel like “agent mistakes.”

### 4. PC ↔ potato drift as normal operating mode

**Evidence**

- Think timeout on `tropic-gooner/reports/progress.md`: PC boxes `[x]`, potato still `[ ]` → paid DeepSeek re-ingest → exit 124 (`04:36` Result).
- Continual push Results repeatedly list “was missing/drifted on potato” (map, dashboard `dash_build`, think-tick hashes).
- Map binaries are gitignored — `git pull` / bundle alone never syncs them; agents forget dedicated `push-tableslop-map.sh`.

**Why it hurts:** Think + Hub burn time redoing finished work; humans see “Active Now failed” on already-done lanes.

### 5. Investigate-then-fix multitask chains (process culture)

**Evidence**

- Parent pattern: complaint → Task diagnose → Task fix → user still broken → more Tasks. Transcript shows diagnose → rename → “never landed” → five parallel sweeps → this postmortem.
- Resource-governance correctness pillar exists (“do not claim without terminal evidence”) but is not enforced as a **Result gate**.
- Preference for 2–3 concurrent agents without expanding lock scope.

**Why it hurts:** Wall-clock grows with agent count when work is sequential dependency (SoT → edit → push → curl) dressed up as parallel.

### 6. Progress / checkbox lag feeding think

Already covered under #4; called out separately because it burns **paid** last-resort and Hub “failed” optics on stale boards — a guard was added (`think-progress-evidence-guard`) *after* the failure.

---

## What is *not* the root cause

- OpenRouter key count / think flock (think is single-flight by design; extra keys ≠ parallel think).
- “Agents are slow at typing” — rework dominates.
- Lack of ledger lines — ledger is noisy; it does not substitute for potato curl evidence.

---

## Concrete fixes (prefer process; tiny tooling where obvious)

### Immediate process (do these now)

1. **No `[PC] Result` for deploy without potato loopback evidence pasted**  
   Minimum for map: `curl -s http://127.0.0.1:8765/api/map` on potato → print `markers.length` + labels (or sha of map.json on potato == PC). HTTP 200 alone is **not** evidence.  
   Phrase for agents: *Result without potato curl snippet = incomplete.*

2. **Single-writer for map bundle**  
   Before any edit/SCP of `campaigns/tropic-gooner/map/{map,coords,regions-ui}.json`:  
   `bash scripts/linuxbox/multitask-lock.sh acquire map:tropic-gooner --holder <id> --wait`  
   Parent must not spawn two map-touching Tasks in the same wave. Lore-md sweeps can parallelize; map+server deploy cannot.

3. **Verify-first on user “still wrong” reports**  
   One SSH curl/diff PC↔potato **before** another rename/sweep Task. If live ≠ expected, fix deploy/path — do not start five renames.

### Tooling (small, ranked)

| Fix | Effort | Effect |
|-----|--------|--------|
| Content check in `push-tableslop-map.sh` after health: dump marker count + labels (fail if count 0) | ~10 lines | Stops silent empty/wrong serve after restart |
| Make `push-linuxbox.sh` curl verify **fail-loud** (drop `\|\| true`) | 1 line | Soft verify stops lying |
| Extend multitask rule + doc: resource `map:tropic-gooner` required | docs only | Prevents 17↔15 races |
| Optional `scripts/pc/verify-tableslop-live.sh` one-liner wrapper | tiny | Agents have a copy-paste gate |
| Progress sync: PC checkbox flips must push board file or think-reconcile only on potato | already partially guarded | Cuts Discord redo |

### Parent / multitask hygiene

- Cap parallel Tasks that share a write path to **1**. Parallelize only disjoint paths (e.g. places md vs dashboard UI).
- Prefer one agent: SoT confirm → edit → push script → verify script → Result.
- Treat “Deployed” in a sibling Result as **untrusted** until this agent re-curls.

---

## Session timeline (compressed)

| UTC | What went wrong |
|-----|-----------------|
| ~03:58 | Diag: wrong SoT (lore labels; vibes in aliases) |
| ~04:01 | Claimed vibes rename deploy OK |
| ~04:10–04:15 | Live still lore — deploy never landed / unverified |
| ~04:20–04:23 | Five parallel sweeps; coords+secondary+md overlap |
| ~04:40–04:44 | Push restores 17 vs remove wants 15 — race |
| ~04:36 | Think timeouts on stale potato progress checkboxes |

---

## Success criteria for “this postmortem worked”

- Next map change: push script prints marker labels from potato `/api/map`; Result quotes them.
- No two concurrent holders of `map:tropic-gooner`.
- User-facing “names wrong” → first tool call is potato curl / sha diff, not another rename Task.
