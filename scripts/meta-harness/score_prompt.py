#!/usr/bin/env python3
"""Offline rubric scorer for think-pod harness prompt candidates (no Hermes)."""

from __future__ import annotations

import re

REQUIRED_PHRASES = [
    r"\bONE\b",
    r"IDLE",
    r"AI_GROUPCHAT",
    r"CURRENT_TASK",
    r"agent-loops",
    r"verify_agent_intent",
]

BONUS_PHRASES = [
    (r"LINUXBOX_DASHBOARD_BACKLOG", 2),
    (r"first.*unchecked|first\s+\[ \]", 2),
    (r"read.*before.*edit|before editing", 1),
    (r"dashboard.*8790|linuxbox-status", 1),
    (r"human-inbox", 1),
    (r"stop\.|then stop", 1),
]

ANTI_PATTERNS = [
    (r"\bgit pull\b", -2, "think owns sync; fast pod pulls"),
    (r"\bbatch\b|\bmultiple items\b", -2, "violates one-step law"),
    (r"\bdelete\b.*\bfile", -3, "deletion risk"),
    (r"campaigns/", -1, "out of think scope unless CURRENT_TASK says so"),
]


def score_prompt_text(text: str) -> dict:
    score = 0
    notes: list[str] = []
    length = len(text)

    for pat in REQUIRED_PHRASES:
        if re.search(pat, text, re.IGNORECASE):
            score += 2
        else:
            notes.append(f"missing required pattern: {pat}")

    for pat, pts in BONUS_PHRASES:
        if re.search(pat, text, re.IGNORECASE):
            score += pts

    for pat, penalty, reason in ANTI_PATTERNS:
        if re.search(pat, text, re.IGNORECASE):
            score += penalty
            notes.append(f"anti: {reason}")

    if length > 8000:
        score -= 3
        notes.append("prompt too long (>8k)")
    elif length < 200:
        score -= 2
        notes.append("prompt too short")
    elif 400 <= length <= 2500:
        score += 1

    return {
        "rubric_total": max(score, 0),
        "length": length,
        "notes": notes,
    }


def combined_score(rubric: dict, sim_score: int | None = None) -> int:
    base = rubric["rubric_total"]
    if sim_score is not None:
        return base + sim_score
    return base


if __name__ == "__main__":
    import sys

    from think_baseline import think_prompt_baseline

    text = sys.argv[1] if len(sys.argv) > 1 else think_prompt_baseline()
    print(score_prompt_text(text))
