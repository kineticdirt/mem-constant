# Claude Code Plan — Kill 1

**Purpose:** Capture the **Claude Code Architecture** as an actionable system plan and define **Kill 1** — the minimal, safe path to **terminate a running agent loop / session / sub-work** without corrupting git state, observability, or durable memory.

**Reference diagram:** `assets/c__Users_abhinav_AppData_Roaming_Cursor_User_workspaceStorage_a04b0cfc902246cfe3439a19522f4141_images_image-78182373-7782-4e67-8acb-37ba6cb5bb30.png` (saved copy under the Cursor project `assets/` folder).

---

## 1. North-star loop

**Master Agent Loop:** `Perception → Action → Observation` (closed loop; all side effects and learning flow through this cycle).

**Invariant:** No layer bypasses the loop for “silent” mutation; tools and filesystem writes are always attributable to an observation step or an explicit user-approved branch.

---

## 2. Layered architecture (plan view)

### 2.1 Input layer

| Component        | Responsibility |
|-----------------|----------------|
| **User interface** | CLI, IDE, CI/CD entry points; uniform message envelope into the session. |
| **Session manager** | Resume, fork, persist; binds identity of the active loop to storage and permissions. |
| **YAML rules** | Three-tier rule stack (global → project → session); evaluated before dispatch. |
| **Permission gate** | Final pre-loop decision: **deny**, **allow**, or **approve** (human-in-the-loop). |

**Plan outcome:** Every inbound turn is `(session_id, rules_snapshot, permission_decision, payload)`.

---

### 2.2 Observability layer

| Component   | Responsibility |
|------------|----------------|
| **Event bus** | Lifecycle events, subscriptions, interceptors (metrics, tracing, policy hooks). |
| **Executor** | Non-blocking execution of tool/subagent work; reports completions and errors back as observations. |

**Plan outcome:** All tool runs emit structured events; the Master Agent Loop consumes **observations**, not raw stdout.

---

### 2.3 Knowledge layer

| Component        | Responsibility |
|-----------------|----------------|
| **Skill register** | Directed skill catalog (metadata, triggers, constraints). |
| **Task graph**     | Prioritized work DAG; fed by skills and user goals. |
| **Content**        | Three-layer time persistence (working → session → durable). |
| **Memory store**   | Ordered-time persistence and retrieval APIs. |
| **agent_memory.md** | Durable agent-visible log; **writes** append decisions, outcomes, and handoff context. |

**Plan outcome:** “What we decided” and “what happened” are reconstructable without replaying the model transcript.

---

### 2.4 Multi-agent layer

| Component        | Responsibility |
|-----------------|----------------|
| **Subagent**    | Retained context worker; **no hidden delegation** back to the user without an explicit observation. |
| **Teammate**    | Async coordination channel (mailslot / queue) between peers. |
| **FSM protocol** | Finite-state transitions for roles, locks, and merge readiness. |
| **Git integration** | **Autonomous lock** + **worktree** per task branch; goal: **zero-conflict parallel work** with **conflict detection on merge**. |

**Plan outcome:** Parallelism is opt-in and branch-scoped; merge is a first-class state, not an afterthought.

---

### 2.5 Execution layer

| Component           | Responsibility |
|--------------------|----------------|
| **Tool dispatch**  | Typed registry — **one handler per tool**; idempotency keys where applicable. |
| **Prompt cache**   | Stable prefix caching for latency and cost. |
| **Streaming runtime** | Sandboxed execution environment (filesystem, network, subprocess policy). |

**Plan outcome:** Tools are contracts (schema + handler + capability flags), not ad hoc scripts.

---

### 2.6 Output layer

| Component      | Responsibility |
|---------------|----------------|
| **Task result** | Verified output memory — only promoted after checks (tests, lints, policy). |

---

### 2.7 Integration layer

| Component            | Responsibility |
|---------------------|----------------|
| **External servers** | Third-party APIs and hosts. |
| **Register**         | Bridge from external integrations into the typed tool surface. |
| **MCP runtime**      | Model Context Protocol — audio, code, CI artifacts as **resources/tools** with explicit consent. |

---

## 3. Kill 1 — definition (minimal termination slice)

**Kill 1** is the first shippable behavior for **controlled shutdown** of an active loop instance (session turn, executor job, or subagent) **without** leaving inconsistent locks or silent partial writes.

### 3.1 Preconditions

1. **Session manager** can resolve `session_id` and whether the target is root loop, subagent, or executor job.
2. **Event bus** exposes `cancel_requested` and `cancel_acknowledged` (or equivalent).
3. **Git integration** knows active **worktree** and **lock owner** for the branch in question.

### 3.2 Kill 1 procedure (ordered)

1. **Stop ingress:** Input layer marks session **draining**; new user turns return `409` / “draining” (or enqueue with explicit policy — pick one implementation-wide).
2. **Signal executor:** Non-blocking **cancel** to in-flight tool/subagent handles; await **terminal observation** (`completed` | `cancelled` | `failed`) with timeout.
3. **Release autonomous lock:** If this session owned the lock, release in **one** code path (idempotent); if not owner, **no-op** and log.
4. **Stabilize worktree:** Leave worktree intact but **read-only** until merge policy runs; do not delete branch on Kill 1.
5. **Emit observability:** Event bus records `kill_1_applied` with `{session_id, branch, lock_released, pending_tools}`.
6. **Durable note:** Append to **agent_memory.md** (and long-term store if used): reason, timestamp, residual risk (“merge not attempted”, “tests not run”).

### 3.3 Explicit non-goals (Kill 1)

- Does **not** auto-merge or auto-resolve git conflicts.
- Does **not** delete user files or roll back arbitrary edits without a separate **rollback** plan.
- Does **not** guarantee model-side “stop generating” beyond streaming cancellation (platform-dependent); **system of record** is executor + event bus.

### 3.4 Acceptance criteria

- [ ] After Kill 1, **no** tool handler runs without a new session/approval.
- [ ] Lock/worktree metadata is consistent (no orphaned “locked” state).
- [ ] `agent_memory.md` contains a single append-only record for the kill.
- [ ] Event bus shows a terminal state for all previously in-flight jobs.

---

## 4. Implementation backlog (suggested order)

1. **Event model** — define canonical event schema (`turn_started`, `tool_started`, `tool_finished`, `kill_requested`, …).
2. **Executor cancellation** — cooperative cancel + hard timeout + resource cleanup hooks.
3. **Session states** — `active`, `draining`, `terminated`.
4. **Git lock API** — acquire/release/heartbeat; owner-scoped.
5. **agent_memory.md writer** — append-only, structured front-matter or JSONL block per entry.
6. **Kill 1 command** — single entry point (CLI/IDE) calling steps in §3.2.

---

## 5. Open decisions (resolve before coding Kill 1)

- **Draining vs queueing** new messages during kill.
- **Default timeout** per tool class (network-bound vs CPU-bound).
- **Merge policy** trigger: manual only for Kill 1, or automatic “safe merge” when CI green (defer to Kill 2+).

---

*End of Claude Code Plan — Kill 1.*
