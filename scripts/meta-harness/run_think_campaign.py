#!/usr/bin/env python3
"""Phase 3: think-pod Meta-Harness search campaign (PC-only when linuxbox is down).

5 iterations × 2 candidates by default. Proposer uses Claude CLI; eval uses rubric +
optional Claude dry-run planner. Writes agents/meta-harness/campaigns/001-think-prompt/.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CAMPAIGN_DIR = REPO_ROOT / "agents" / "meta-harness" / "campaigns" / "001-think-prompt"
RUNS_DIR = REPO_ROOT / "agents" / "meta-harness" / "runs"
VIOLATIONS = REPO_ROOT / "agents" / "state" / "intent-violations.jsonl"

sys.path.insert(0, str(Path(__file__).parent))
from score_prompt import combined_score, score_prompt_text  # noqa: E402
from think_baseline import INTENT, think_prompt_baseline  # noqa: E402


def resolve_claude_bin() -> str | None:
    for name in ("claude", "claude.cmd"):
        path = shutil.which(name)
        if path:
            return path
    npm = Path.home() / "AppData" / "Roaming" / "npm" / "claude.cmd"
    if npm.is_file():
        return str(npm)
    return None


CLAUDE_BIN = resolve_claude_bin()


def rule_variants(iteration: int, frontier: dict | None) -> list[dict]:
    """Deterministic harness mutations when Claude CLI unavailable."""
    dash = (
        "Pod think (ops pool). Workdir: agent-dump. "
        f"{INTENT} "
        "Read agents/CURRENT_TASK.md lane rotation. "
        "Priority: if agents/LINUXBOX_DASHBOARD_BACKLOG.md Open section has any `- [ ]`, "
        "read agents/LINUXBOX_DASHBOARD_TASK.md and implement the **first** unchecked item only "
        "(scope: scripts/linuxbox/linuxbox-status/ + server JS). "
        "Verify curl http://127.0.0.1:8790/ → 200; restart linuxbox-status if server JS changed; "
        "run bash scripts/linuxbox/run-dashboard-ui-smoke.sh after UI edits. "
        "Mark that one backlog line `[x]` with date. ONE step then stop. "
        "If no open dashboard items, follow CURRENT_TASK next lane only. "
        "If nothing actionable, reply IDLE only. Append one [LINUX] line to AI_GROUPCHAT.md when done."
    )
    checklist = (
        "Pod think (ops). Workdir: agent-dump. "
        f"{INTENT} "
        "Before any edit: (1) read agents/CURRENT_TASK.md, (2) read agents/intent/agent-loops.json, "
        "(3) read the lane's task spec + progress file. "
        "Execute exactly ONE checkbox from the highest-priority lane with open work. "
        "Do not git pull (fast pod owns pull). Do not batch. "
        "If blocked, append ONE question to agents/state/human-inbox.json and stop. "
        "Else if all lanes clear, reply IDLE only. Log [LINUX] to AI_GROUPCHAT.md when work completes."
    )
    compact = (
        "Think pod (ops). agent-dump. "
        f"{INTENT} "
        "CURRENT_TASK.md defines lane order — dashboard backlog first. "
        "One `[ ]` item from agents/LINUXBOX_DASHBOARD_BACKLOG.md Open (see LINUXBOX_DASHBOARD_TASK.md) "
        "OR next lane with open work. Verify :8790. Stop after one item. IDLE if clear. [LINUX] log."
    )
    inbox_gate = (
        dash.replace(
            "If no open dashboard items",
            "Check agents/state/human-inbox.json for open questions — do not duplicate. "
            "If no open dashboard items",
        )
    )
    smoke_heavy = (
        dash.replace(
            "run bash scripts/linuxbox/run-dashboard-ui-smoke.sh after UI edits.",
            "MANDATORY after any index.html change: bash scripts/linuxbox/run-dashboard-ui-smoke.sh "
            "(see agents/DASHBOARD_UI_SMOKE_TASK.md).",
        )
    )
    read_first = (
        "Pod think (ops pool). Workdir: agent-dump. "
        f"{INTENT} "
        "Read agents/CURRENT_TASK.md and agents/LINUXBOX_DASHBOARD_BACKLOG.md before touching files. "
        "Pick the first `- [ ]` in dashboard Open if any exist; else first open lane in CURRENT_TASK order. "
        "Read the matching `*_TASK.md` spec. Implement ONE item in allowed paths only. "
        "verify_agent_intent.py must pass. curl :8790 → 200. ONE step, stop, [LINUX] ledger line."
    )
    carryover = (
        read_first
        + " If .cursor/hooks/state/last-session-carryover.md exists, skim it for resume context only "
        "(MemPalace wins on conflict)."
    )
    frontier_bits = ""
    if frontier and frontier.get("id") != "baseline":
        frontier_bits = " Prioritize dashboard-first one-step discipline. "

    pairs = [
        (f"iter{iteration}-a", dash),
        (f"iter{iteration}-b", checklist),
        (f"iter{iteration}-a", compact),
        (f"iter{iteration}-b", inbox_gate),
        (f"iter{iteration}-a", smoke_heavy),
        (f"iter{iteration}-b", read_first),
        (f"iter{iteration}-a", carryover + frontier_bits),
        (f"iter{iteration}-b", dash.replace("ONE step", "exactly ONE concrete step")),
        (f"iter{iteration}-a", (frontier or {}).get("prompt", dash) if frontier else dash),
        (f"iter{iteration}-b", read_first + " Never edit campaigns/, Cloudflare, or production portfolio."),
    ]
    idx = (iteration - 1) * 2
    out: list[dict] = []
    for cid, text in pairs[idx : idx + 2]:
        out.append({"id": cid, "prompt": text, "source": "rule"})
    return out


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def load_think_runs(limit: int = 20) -> list[dict]:
    think_dir = RUNS_DIR / "think"
    if not think_dir.is_dir():
        return []
    runs: list[dict] = []
    for path in sorted(think_dir.glob("*.json"))[-limit:]:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            data["_file"] = str(path.relative_to(REPO_ROOT))
            runs.append(data)
        except (json.JSONDecodeError, OSError):
            continue
    return runs


def load_violation_tail(n: int = 8) -> str:
    if not VIOLATIONS.is_file():
        return ""
    lines = [ln for ln in VIOLATIONS.read_text(encoding="utf-8").splitlines() if ln.strip()]
    return "\n".join(lines[-n:])


def claude_text(prompt: str, *, model: str = "sonnet", timeout: int = 300) -> tuple[str, int]:
    if not CLAUDE_BIN:
        return "claude CLI not found", 127
    cmd = [
        CLAUDE_BIN,
        "--dangerously-skip-permissions",
        "-p",
        prompt,
        "--output-format",
        "text",
        "--model",
        model,
        "--setting-sources",
        "",
        "--disable-slash-commands",
        "--strict-mcp-config",
    ]
    try:
        proc = subprocess.run(
            cmd,
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
            shell=(CLAUDE_BIN.endswith(".cmd")),
        )
        return (proc.stdout or proc.stderr or "").strip(), proc.returncode
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
        return str(e), 127


def extract_prompt_block(text: str) -> str:
    m = re.search(r"```(?:text|markdown)?\s*\n(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()
    if text.upper().startswith("PROMPT:"):
        return text.split(":", 1)[1].strip()
    return text.strip()


def propose_candidates(
    iteration: int,
    baseline: str,
    frontier: dict | None,
    prior: list[dict],
    n: int,
    model: str,
    *,
    use_claude: bool,
) -> list[dict]:
    if not use_claude or not CLAUDE_BIN:
        return rule_variants(iteration, frontier)[:n]

    runs = load_think_runs()
    run_summary = json.dumps(runs[-5:], indent=2) if runs else "[]"
    violations = load_violation_tail() or "(none)"
    frontier_txt = json.dumps(frontier, indent=2) if frontier else "(none yet)"
    prior_txt = "\n".join(
        f"- {p['id']}: score={p.get('total', '?')} — {p.get('prompt', '')[:120]}…"
        for p in prior[-6:]
    ) or "(none)"

    prompt = f"""You are the Meta-Harness proposer for linuxbox **think pod** harness search.

Domain: optimize the Hermes chat -q prompt prefix for the think pod (ops lane). Fixed: models, intent laws, mem-constant, ponytail. Mutable: prompt wording only.

**Baseline prompt:**
```
{baseline}
```

**Recent think runs (JSON):**
{run_summary}

**Recent intent violations:**
{violations}

**Current frontier (best candidate):**
{frontier_txt}

**Prior candidates this campaign:**
{prior_txt}

**Iteration:** {iteration}

Propose exactly {n} DISTINCT improved think-pod prompt variants. Each must:
- Keep ONE-step-then-stop, IDLE when nothing to do, [LINUX] ledger line when done
- Reference CURRENT_TASK.md lane rotation and dashboard backlog first-unchecked item
- Require reading agent-loops before edits; never batch multiple backlog items
- Stay under 2500 characters each
- NOT tell the agent to git pull (think lane; fast pod pulls)

Return ONLY this format (no other prose):

## Candidate A
```text
<full prompt text>
```

## Candidate B
```text
<full prompt text>
```
"""
    if n == 1:
        prompt = prompt.replace("exactly 2", "exactly 1").replace("## Candidate B\n```text\n<full prompt text>\n```", "")

    raw, rc = claude_text(prompt, model=model, timeout=120)
    if rc != 0:
        print(f"  proposer: claude failed ({rc}), using rule variants")
        return rule_variants(iteration, frontier)[:n]

    candidates: list[dict] = []
    for label, block in re.findall(
        r"## Candidate ([A-Z])\s*\n```(?:text)?\s*\n(.*?)```",
        raw,
        re.DOTALL | re.IGNORECASE,
    ):
        text = block.strip()
        if text:
            candidates.append({"id": f"iter{iteration}-{label.lower()}", "prompt": text, "raw": raw})
    if not candidates:
        text = extract_prompt_block(raw)
        if text:
            candidates.append({"id": f"iter{iteration}-a", "prompt": text, "raw": raw})
    return candidates[:n]


def local_sim_eval(prompt: str) -> tuple[int, str]:
    """Score prompt against live repo state without Hermes."""
    sim = 0
    notes: list[str] = []
    backlog = REPO_ROOT / "agents" / "LINUXBOX_DASHBOARD_BACKLOG.md"
    current = REPO_ROOT / "agents" / "CURRENT_TASK.md"
    open_dash = False
    if backlog.is_file():
        in_open = False
        for line in backlog.read_text(encoding="utf-8").splitlines():
            if line.strip() == "## Open":
                in_open = True
                continue
            if in_open and line.startswith("## "):
                break
            if in_open and re.search(r"- \[ \]", line):
                open_dash = True
                break

    if re.search(r"LINUXBOX_DASHBOARD_BACKLOG", prompt, re.I):
        sim += 2
        notes.append("mentions dashboard backlog")
    if re.search(r"LINUXBOX_DASHBOARD_TASK", prompt, re.I):
        sim += 2
        notes.append("mentions dashboard task spec")
    if re.search(r"CURRENT_TASK", prompt, re.I):
        sim += 2
        notes.append("mentions CURRENT_TASK")
    if open_dash and re.search(r"first.*\[ \]|first unchecked", prompt, re.I):
        sim += 3
        notes.append("dashboard has open items + prompt targets first unchecked")
    elif not open_dash and re.search(r"\bIDLE\b", prompt, re.I):
        sim += 1
        notes.append("idle path when dashboard clear")
    if re.search(r"8790|linuxbox-status", prompt, re.I):
        sim += 2
        notes.append("verify dashboard")
    if re.search(r"run-dashboard-ui-smoke|DASHBOARD_UI_SMOKE", prompt, re.I):
        sim += 1
        notes.append("smoke harness")
    if re.search(r"human-inbox", prompt, re.I):
        sim += 1
        notes.append("inbox gate")
    if re.search(r"read.*before|before.*edit", prompt, re.I):
        sim += 2
        notes.append("read-before-edit")
    if current.is_file() and "lane rotation" in current.read_text(encoding="utf-8").lower():
        if re.search(r"lane rotation|lane order|priority", prompt, re.I):
            sim += 1
            notes.append("lane order awareness")
    return sim, "; ".join(notes) or "local sim"


def sim_eval_prompt(prompt: str, model: str, *, use_claude: bool) -> tuple[int, str]:
    local_score, local_raw = local_sim_eval(prompt)
    if not use_claude or not CLAUDE_BIN:
        return local_score, f"local: {local_raw}"
    """Claude dry-run: plan one think tick without editing files."""
    eval_prompt = f"""You are simulating ONE think-pod tick on linuxbox. Do NOT edit any files.

Harness prompt you must follow:
---
{prompt}
---

Read agents/CURRENT_TASK.md and agents/LINUXBOX_DASHBOARD_BACKLOG.md (use Read tool).

Reply in this exact structure:
PLAN: <one concrete step OR the word IDLE>
FOLLOWS_ONE_STEP: yes|no
READS_BEFORE_EDIT: yes|no
SCOPE_OK: yes|no
"""
    raw, rc = claude_text(eval_prompt, model=model, timeout=180)
    if rc != 0:
        return local_score, f"local: {local_raw}; claude failed: {raw[:200]}"

    sim = local_score
    if re.search(r"FOLLOWS_ONE_STEP:\s*yes", raw, re.I):
        sim += 3
    if re.search(r"READS_BEFORE_EDIT:\s*yes", raw, re.I):
        sim += 2
    if re.search(r"SCOPE_OK:\s*yes", raw, re.I):
        sim += 2
    if re.search(r"\bIDLE\b", raw) or re.search(r"PLAN:", raw, re.I):
        sim += 1
    return sim, raw


def evaluate_candidate(cand: dict, *, use_sim: bool, model: str, use_claude: bool) -> dict:
    rubric = score_prompt_text(cand["prompt"])
    sim_score = None
    sim_raw = ""
    if use_sim:
        sim_score, sim_raw = sim_eval_prompt(cand["prompt"], model, use_claude=use_claude)
    total = combined_score(rubric, sim_score)
    return {
        **cand,
        "rubric": rubric,
        "sim_score": sim_score,
        "sim_raw": sim_raw[:4000] if sim_raw else "",
        "total": total,
    }


def write_campaign_artifacts(
    results: list[dict],
    winner: dict,
    baseline: str,
    config: dict,
) -> None:
    CAMPAIGN_DIR.mkdir(parents=True, exist_ok=True)
    (CAMPAIGN_DIR / "baseline.md").write_text(
        f"# Think pod baseline\n\n```text\n{baseline}\n```\n",
        encoding="utf-8",
    )
    (CAMPAIGN_DIR / "config.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    (CAMPAIGN_DIR / "results.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    (CAMPAIGN_DIR / "winner.json").write_text(json.dumps(winner, indent=2) + "\n", encoding="utf-8")
    (CAMPAIGN_DIR / "winner-prompt.md").write_text(
        "# Winner — think pod harness\n\n"
        f"Score: **{winner.get('total')}** (id: `{winner.get('id')}`)\n\n"
        "Promote via human inbox → `agents/meta-harness/active/think-prompt.md` on linuxbox.\n\n"
        f"```text\n{winner.get('prompt', '')}\n```\n",
        encoding="utf-8",
    )

    active_dir = REPO_ROOT / "agents" / "meta-harness" / "active"
    active_dir.mkdir(parents=True, exist_ok=True)
    staged = active_dir / "think-prompt.md.staged"
    staged.write_text(
        "# STAGED — awaiting inbox approval\n\n"
        f"Campaign: 001-think-prompt\nWinner: {winner.get('id')}\n\n"
        f"{winner.get('prompt', '')}\n",
        encoding="utf-8",
    )

    report_lines = [
        "# Campaign 001 — think prompt search",
        "",
        f"Completed: {datetime.now(timezone.utc).isoformat()}",
        "",
        f"- Iterations: {config['iterations']}",
        f"- Candidates per iter: {config['candidates_per_iter']}",
        f"- Sim eval: {config['use_sim']}",
        f"- Think runs available: {len(load_think_runs())}",
        "",
        "## Winner",
        "",
        f"- **{winner.get('id')}** — total score **{winner.get('total')}**",
        f"- Rubric: {winner.get('rubric', {}).get('rubric_total')}",
        f"- Sim: {winner.get('sim_score')}",
        "",
        "## Leaderboard (top 5)",
        "",
    ]
    for r in sorted(results, key=lambda x: x.get("total", 0), reverse=True)[:5]:
        report_lines.append(f"- `{r.get('id')}` — {r.get('total')} (rubric {r.get('rubric', {}).get('rubric_total')}, sim {r.get('sim_score')})")
    report_lines.extend(
        [
            "",
            "## Promotion",
            "",
            "1. Human approves in `agents/human-inbox.json`",
            "2. `mv agents/meta-harness/active/think-prompt.md.staged → think-prompt.md`",
            "3. `push-linuxbox.sh --scripts-linuxbox` when box is back",
            "",
        ]
    )
    (CAMPAIGN_DIR / "REPORT.md").write_text("\n".join(report_lines) + "\n", encoding="utf-8")


def append_inbox_question(winner: dict) -> None:
    inbox_path = REPO_ROOT / "agents" / "state" / "human-inbox.json"
    if not inbox_path.is_file():
        inbox_path = REPO_ROOT / "agents" / "human-inbox.json"
    if not inbox_path.is_file():
        return
    try:
        data = json.loads(inbox_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return
    questions = data.setdefault("questions", [])
    qid = f"meta-harness-001-{utc_stamp()}"
    questions.append(
        {
            "id": qid,
            "asked_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "from": "PC meta-harness campaign 001",
            "question": (
                f"Promote think-pod harness winner `{winner.get('id')}` (score {winner.get('total')})? "
                "If yes: rename agents/meta-harness/active/think-prompt.md.staged → think-prompt.md "
                "and push-linuxbox --scripts-linuxbox when box is back."
            ),
            "context": f"agents/meta-harness/campaigns/001-think-prompt/winner-prompt.md",
            "status": "open",
        }
    )
    inbox_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"Inbox question added: {qid}")


def run_campaign(
    iterations: int,
    candidates_per_iter: int,
    use_sim: bool,
    model: str,
    include_baseline: bool,
    use_claude: bool,
) -> dict:
    baseline = think_prompt_baseline()
    all_results: list[dict] = []
    frontier: dict | None = None

    if include_baseline:
        base_eval = evaluate_candidate(
            {"id": "baseline", "prompt": baseline},
            use_sim=use_sim,
            model=model,
            use_claude=use_claude,
        )
        all_results.append(base_eval)
        frontier = base_eval
        print(f"baseline score={base_eval['total']}")

    for it in range(1, iterations + 1):
        print(f"\n=== Iteration {it}/{iterations} ===")
        props = propose_candidates(
            it, baseline, frontier, all_results, candidates_per_iter, model, use_claude=use_claude
        )
        for cand in props:
            ev = evaluate_candidate(cand, use_sim=use_sim, model=model, use_claude=use_claude)
            all_results.append(ev)
            print(f"  {ev['id']}: total={ev['total']} rubric={ev['rubric']['rubric_total']} sim={ev['sim_score']}")
            if frontier is None or ev["total"] > frontier.get("total", -1):
                frontier = ev
                print(f"  → new frontier: {ev['id']} ({ev['total']})")
        iter_dir = CAMPAIGN_DIR / "iterations" / f"{it:02d}"
        iter_dir.mkdir(parents=True, exist_ok=True)
        (iter_dir / "candidates.json").write_text(
            json.dumps([r for r in all_results if r["id"].startswith(f"iter{it}")], indent=2) + "\n",
            encoding="utf-8",
        )
        time.sleep(1)

    winner = max(all_results, key=lambda x: x.get("total", 0))
    config = {
        "iterations": iterations,
        "candidates_per_iter": candidates_per_iter,
        "use_sim": use_sim,
        "use_claude": use_claude,
        "claude_bin": CLAUDE_BIN,
        "model": model,
        "include_baseline": include_baseline,
        "linuxbox_online": False,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    write_campaign_artifacts(all_results, winner, baseline, config)
    append_inbox_question(winner)
    return {"winner": winner, "count": len(all_results)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Run think-pod Meta-Harness search campaign")
    parser.add_argument("--iterations", type=int, default=5)
    parser.add_argument("--candidates", type=int, default=2)
    parser.add_argument("--no-sim", action="store_true", help="Rubric only, skip Claude dry-run eval")
    parser.add_argument("--model", default="sonnet")
    parser.add_argument("--claude", action="store_true", help="Use Claude CLI for proposer/sim (slow)")
    parser.add_argument("--no-baseline", action="store_true")
    args = parser.parse_args()

    summary = run_campaign(
        iterations=args.iterations,
        candidates_per_iter=args.candidates,
        use_sim=not args.no_sim,
        model=args.model,
        include_baseline=not args.no_baseline,
        use_claude=args.claude,
    )
    print(f"\nCampaign done. Winner: {summary['winner']['id']} score={summary['winner']['total']}")
    print(f"Artifacts: {CAMPAIGN_DIR.relative_to(REPO_ROOT)}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
