#!/usr/bin/env python3
"""Local analyzer stub — summarizes runs before full Meta-Harness proposer is wired.

Reads agents/meta-harness/runs/ and agents/state/intent-violations.jsonl.
Writes agents/meta-harness/candidates/<timestamp>/proposal.md (no LLM calls).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RUNS_DIR = REPO_ROOT / "agents" / "meta-harness" / "runs"
VIOLATIONS = REPO_ROOT / "agents" / "state" / "intent-violations.jsonl"
CANDIDATES_DIR = REPO_ROOT / "agents" / "meta-harness" / "candidates"


def load_runs(runs_dir: Path) -> list[dict]:
    runs: list[dict] = []
    if not runs_dir.is_dir():
        return runs
    for pod_dir in sorted(runs_dir.iterdir()):
        if not pod_dir.is_dir():
            continue
        for path in sorted(pod_dir.glob("*.json")):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                data["_file"] = str(path.relative_to(REPO_ROOT))
                runs.append(data)
            except (json.JSONDecodeError, OSError):
                continue
    runs.sort(key=lambda r: r.get("at", ""))
    return runs


def recent_failures(runs: list[dict], limit: int = 10) -> list[dict]:
    failed = [
        r
        for r in runs
        if r.get("intent") == "INTENT_FAIL"
        or (r.get("exit_code") not in (None, 0))
    ]
    return failed[-limit:]


def bootstrap_stats(runs: list[dict]) -> dict[str, int | float]:
    if not runs:
        return {"total": 0, "bootstrap_on": 0, "bootstrap_off": 0, "bootstrap_pct": 0.0}
    on = sum(1 for r in runs if r.get("bootstrap"))
    total = len(runs)
    return {
        "total": total,
        "bootstrap_on": on,
        "bootstrap_off": total - on,
        "bootstrap_pct": round(100.0 * on / total, 1),
    }


def violation_tail(path: Path, limit: int = 5) -> list[str]:
    if not path.is_file():
        return []
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    return [ln for ln in lines if ln.strip()][-limit:]


def write_proposal(out_dir: Path, runs: list[dict], failures: list[dict], stats: dict) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    proposal = out_dir / "proposal.md"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        "# Harness proposal stub",
        "",
        f"Generated: {now}",
        "",
        "> Local analyzer only — not an upstream Meta-Harness proposer output.",
        "> Review traces, edit harness candidate, then promote per candidates/README.md.",
        "",
        "## Bootstrap usage",
        "",
        f"- Total runs scanned: {stats['total']}",
        f"- Bootstrap on: {stats['bootstrap_on']} ({stats['bootstrap_pct']}%)",
        f"- Bootstrap off: {stats['bootstrap_off']}",
        "",
        "## Intent violations",
        "",
        f"Path: `{VIOLATIONS.relative_to(REPO_ROOT)}`",
        "",
    ]
    tail = violation_tail(VIOLATIONS)
    if tail:
        lines.append("Recent lines:")
        lines.append("```")
        lines.extend(tail)
        lines.append("```")
    else:
        lines.append("_No violations file or empty._")
    lines.extend(["", "## Recent failures", ""])
    if failures:
        for r in failures:
            lines.append(
                f"- `{r.get('_file', '?')}` pod={r.get('pod')} "
                f"intent={r.get('intent')} exit={r.get('exit_code')} "
                f"bootstrap={r.get('bootstrap')}"
            )
    else:
        lines.append("_No failed runs in trace tree._")
    lines.extend(
        [
            "",
            "## Proposer notes (human edit)",
            "",
            "- [ ] Hypothesis:",
            "- [ ] Harness diff target (scheduler / bootstrap / candidate module):",
            "- [ ] Eval plan (search ticks from eval-tasks.json):",
            "",
        ]
    )
    proposal.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return proposal


def main() -> None:
    runs = load_runs(RUNS_DIR)
    failures = recent_failures(runs)
    stats = bootstrap_stats(runs)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out_dir = CANDIDATES_DIR / stamp
    path = write_proposal(out_dir, runs, failures, stats)
    print(path.relative_to(REPO_ROOT))


if __name__ == "__main__":
    main()
