#!/usr/bin/env python3
"""Baseline think-pod harness prompt (mirrors agent-pod-scheduler read_task_prompt)."""

from __future__ import annotations

INTENT = (
    "Before editing files read agents/intent/agent-loops.json and agents/AGENT_LOOPS_INTENT.md "
    "for your pod boundary laws. Edits must pass scripts/linuxbox/verify_agent_intent.py."
)


def think_prompt_parts() -> list[str]:
    return [
        "Pod think (ops pool). Workdir: agent-dump.",
        INTENT,
        "Complete exactly ONE concrete step from the task spec and progress file, then stop.",
        "If nothing actionable, reply IDLE only.",
        "Append one [LINUX] line to AI_GROUPCHAT.md when work is done.",
        "Read agents/CURRENT_TASK.md.",
    ]


def think_prompt_baseline() -> str:
    return " ".join(think_prompt_parts())


if __name__ == "__main__":
    print(think_prompt_baseline())
