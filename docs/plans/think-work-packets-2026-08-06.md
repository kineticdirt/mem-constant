# Think lane: why 28 turns / timeouts, and work packets

**Status:** DIAGNOSIS + FIX (2026-08-06). Code: `scripts/linuxbox/think-work-packet.py` + think-tick wire-in.
**Audience:** GM + potato think maintainers.

---

## 1. Verdict (plain)

The **28-turn ceiling is not the disease**. It is a stuck-tool fuse that keeps going off because each tick is asked to swallow an **epic-sized task with no pre-chewed steps**, while a **weak free model** burns the budget rediscovering context.

Paid “idles” because C8 needs **≥2 verified free failures on the same success metric** — free runs usually die on timeout/turn-cap **before** a harness can score them, or the next tick picks a *different* open task, so the counter never reaches 2.

Raising `--max-turns` past 28 without shrinking the work unit will mostly **spend more money on the same thrash**.

---

## 2. Evidence (potato, 2026-08-06)

| Signal | Value |
|--------|--------|
| Open `user-tasks` | **79** |
| With `steps` / `subtasks` / `acceptance` / `verify` fields | **0** |
| Bodies ≥400 chars | **41** |
| Auto `[ops] Think incident cleanup` (timeout_124…) | **32** — failure→task feedback loop |
| Wishlist / feature-shaped opens | **15** (calendar, weather, photography, …) |
| Setup injection alone | ~**23 KB** (`think-setup-context.py`) before the task line |
| Ops hard ceiling | **28** turns / **600s** wall (`THINK_MAX_TURNS_OPS`) |
| Typical fail shape | Iteration budget exhausted **or** `exit 124` mid `execute_code` / grep loop |
| Continuity seed | Only backfills smoke/backlog when queue empty — **does not decompose** |

Prompt today (user-task path) is essentially: “Do ONE step for task X: ⟨entire title/blurb⟩” plus CLAUDE/CURRENT_TASK/checks. The model still has to invent the step boundaries, so free models invent a **diagnose tour** (read → grep → read → …) until the fuse trips.

There is **no durable store of atomic work units** the picker can hand out. Meta-Harness exists for harness search; it is not a per-tick work queue.

---

## 3. Why “inability to run things” clusters with the fuse

Three independent mechanisms, same symptom:

1. **Scope mismatch** — one tick vs a multi-hour epic (or a cleanup title that embeds a full UI redesign).
2. **Context tax** — large setup + policy text every tick; weak models re-grep files they were already told exist.
3. **Tool friction** — Hermes sandbox / `TERMINAL_TIMEOUT` / Playwright / fake `HOME` under `-p think` → failed tools → more retries → fuse.

(1) is the structural miss. (2)/(3) amplify it.

---

## 4. Solution: work packets (smallest durable)

A **work packet** is one tick-sized unit:

```json
{
  "id": "pkt-<taskId>-01",
  "task_id": "<user-task id>",
  "goal": "one sentence — what changes on disk",
  "verify": "concrete command or file assertion (exit 0)",
  "max_turns": 10,
  "status": "open|done|blocked",
  "notes": ""
}
```

Rules:

1. **Think picks a packet, not an epic.** Prompt injects only the active packet (+ short parent title).
2. **`--max-turns` comes from the packet** (clamped to lane ceiling). Default packet = **10**, ops smoke = **16**, never invent “use all 28.”
3. **User-task flips `done` only when all its packets are `done`** (or human `blocked`).
4. **No packets yet → deterministic `ensure`** creates 1–3 packets from heuristics (incident cleanup → one root-cause+verify packet; wishlist without `priority=high|urgent` → single “spec stub or soft-close” packet; huge body → split on numbered lines / “Then” clauses when possible, else one “smallest shippable slice”).
5. **Incident cleanup promotion** must attach a packet at create time (stop naked epics).

Runtime SoT: `agents/state/work-packets.json` (potato-owned, protected). CLI: `scripts/linuxbox/think-work-packet.py`.

### Explicit non-goals (v1)

- No second LLM decomposer on the hot path (optional later, free-only, offline).
- No raise of global 28 without packetization first.
- No deletion of wishlist tasks — demote / soft-close via packet outcome.

---

## 5. Success metrics

- Share of think ticks that end `DONE`/`BLOCKED` **before** turn ceiling ↑
- `timeout_124` incident rate ↓ over a week
- Open user-tasks with ≥1 packet → target **100% of picked tasks**
- Paid C8 scenario-2 actually fires on the **same packet id** after 2 free verify fails (metric = packet verify, not whole epic)

---

## 6. Rollout

1. Ship CLI + state file + self-check.
2. Wire `agent-cycle-think-tick.sh` to `ensure`/`active` before Hermes; inject `WORK PACKET` block; set turns from packet.
3. Patch `think-incident-form.py` promote to call `ensure`.
4. Observe one day; only then consider LLM offline decomposer or ceiling tweaks.
