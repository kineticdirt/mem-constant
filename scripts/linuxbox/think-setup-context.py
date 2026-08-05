#!/usr/bin/env python3
"""Build setup block for Hermes think prompt injection (stdlib only)."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

MAX_CLAUDE = 14000
MAX_LEDGER_LINES = 18
MAX_LANE_FILE = 3500

LANE_SOT: dict[str, list[str]] = {
    "nyc-mafia-dnd": [
        "campaigns/nyc-mafia-dnd/LOCKS.md",
        "campaigns/nyc-mafia-dnd/SETTING-SPELL-TECH-TREE.md",
        "campaigns/nyc-mafia-dnd/SETTING-ANCESTRIES-WARDS.md",
        "agents/NYC_MAFIA_DND_TASK.md",
    ],
    "tropic-gooner": [
        "agents/TROPIC_GOONER_TASK.md",
    ],
    "progress-hunter": [
        "agents/HUNTER_RECKONING_TASK.md",
    ],
    "tableslop": [
        "agents/TABLESLOP_PROJECT_TASK.md",
    ],
    "portfolio": [
        "agents/PORTFOLIO_REDESIGN_TASK.md",
    ],
    "self-improvement": [
        "agents/SELF_IMPROVEMENT_TASK.md",
    ],
    "research-studies": [
        "agents/RESEARCH_STUDIES_TASK.md",
    ],
}


def read_capped(path: Path, max_chars: int) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    if len(text) <= max_chars:
        return text.strip()
    return text[:max_chars].rsplit("\n", 1)[0].strip() + "\n…(truncated)"


def ledger_tail(path: Path, max_lines: int) -> str:
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return ""
    return "\n".join(lines[:max_lines]).strip()


def lane_key(lane_file: str) -> str | None:
    norm = lane_file.replace("\\", "/").lower()
    for key in LANE_SOT:
        if key in norm:
            return key
    if "tableslop-progress" in norm:
        return "tableslop"
    if "portfolio-progress" in norm:
        return "portfolio"
    if "self-improvement-progress" in norm:
        return "self-improvement"
    if "research-studies-progress" in norm:
        return "research-studies"
    return None


PAID_RULES = """## Paid model rules (C8 — mandatory every tick)
Free-first. Ops paid models only in TWO cases:
1) Full free pool exhausted (429/unavailable after rotate + mid-day re-probe).
2) Verified free failure: explicit success metric + ≥N free runs that failed a concrete
   harness verify (checkbox closed / task status done|blocked / script|curl evidence) —
   NOT model self-claim. Default N=2 (`THINK_PAID_FREE_FAIL_N`).
Never pay because the model said it failed. Research-studies = free-only.
Every tick MUST state: SUCCESS METRIC: … and VERIFY: … then end with exactly one marker
(DONE: … or BLOCKED: … or IDLE: …) only after verify matches.
SoT: agents/THINK_SECURITY_CHECKS.md §C8."""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--lane-file", default="")
    args = ap.parse_args()
    repo = Path(args.repo).resolve()
    parts: list[str] = ["--- AGENT SETUP (injected; not a second lane) ---", PAID_RULES]

    setup = repo / "agents/think-agent-setup.md"
    if setup.is_file():
        parts.append("## think-agent-setup.md\n" + read_capped(setup, 2500))

    claude = repo / "CLAUDE.md"
    if claude.is_file():
        parts.append("## CLAUDE.md\n" + read_capped(claude, MAX_CLAUDE))

    current = repo / "agents/CURRENT_TASK.md"
    if current.is_file():
        parts.append("## CURRENT_TASK.md\n" + read_capped(current, 4000))

    key = lane_key(args.lane_file or "")
    if key and key in LANE_SOT:
        lane_parts = [f"## Lane SoT ({key})"]
        per_file = max(800, MAX_LANE_FILE // max(len(LANE_SOT[key]), 1))
        for rel in LANE_SOT[key]:
            p = repo / rel
            if p.is_file():
                lane_parts.append(f"### {rel}\n" + read_capped(p, per_file))
        parts.append("\n\n".join(lane_parts))

    ledger = repo / "AI_GROUPCHAT.md"
    if ledger.is_file():
        parts.append("## AI_GROUPCHAT.md (recent)\n" + ledger_tail(ledger, MAX_LEDGER_LINES))

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.write("\n\n".join(parts) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
