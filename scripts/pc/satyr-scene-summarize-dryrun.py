#!/usr/bin/env python3
"""Dry-run Satyr scene summarization (PC :8001). Wiki-aware new_facts + optional 1d20.

Does not touch Pixi chat-ui inject paths. Writes reports under reports/pixi-summary-testbed/.
"""
from __future__ import annotations

import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPORTS = Path(__file__).resolve().parents[2] / "reports" / "pixi-summary-testbed"
BASE_URL = os.environ.get("SATYR_BASE_URL", "http://127.0.0.1:8001").rstrip("/")
MODEL = os.environ.get("SATYR_MODEL", "Satyr-V0.1-4B-Q8_0")
# Maximize output budget for summarization jobs
MAX_TOKENS = int(os.environ.get("SATYR_MAX_TOKENS", "4096"))
TEMPERATURE = float(os.environ.get("SATYR_TEMPERATURE", "0.3"))

SYSTEM = """You are a precise RP scene summarizer. Output ONLY the summary structure below.
Do NOT write chain-of-thought, planning, or <think> blocks. Do NOT invent facts absent from the transcript.
Preserve key details: quoted speech, clothing/outfit changes, fatigue, hunger, orgasm counts, injuries, location, diegetic time, who is present, emotional state.

When the transcript marks an uncertain/random outcome, roll a mental 1d20 (use the ROLL provided in the user message) and record the roll + a short interpretation.

Also emit a separate section of NEW facts not already stated in the provided wiki (nuggets humans would otherwise hand-author).

Required output format (markdown):

## Scene summary
(dense but complete; keep important quoted lines)

## State snapshot
- location / time
- present cast
- per-character: clothing, fatigue, hunger, injuries, orgasms, emotion

## RNG (if used)
- roll: N/20 — interpretation

## Notes (previously unknown) / new_facts
- bullet list of facts NOT already in the wiki
"""


def _post_chat(messages: list[dict], max_tokens: int) -> dict:
    body = {
        "model": MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": TEMPERATURE,
        "stream": False,
        # Discourage thinking / reasoning waste if server supports it
        "chat_template_kwargs": {"enable_thinking": False},
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/v1/chat/completions",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    transcript = (REPORTS / "fixture-transcript.md").read_text(encoding="utf-8")
    wiki = (REPORTS / "fixture-wiki.md").read_text(encoding="utf-8")
    roll = random.randint(1, 20)

    user = f"""## Wiki (already known — do not repeat these as new_facts)
{wiki}

## Transcript to summarize
{transcript}

## Optional RNG
Uncertainty: is a second shambler around the next corner after Scene 2?
Use this 1d20 roll: **{roll}** (1–7 no; 8–14 yes but distant/slow; 15–20 yes and close/aggressive).
Record the roll and interpretation in the RNG section.
"""

    # Probe
    try:
        with urllib.request.urlopen(f"{BASE_URL}/v1/models", timeout=5) as r:
            models = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"ERROR: Satyr server not reachable at {BASE_URL}: {e}", file=sys.stderr)
        return 2

    t0 = time.perf_counter()
    try:
        result = _post_chat(
            [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": user},
            ],
            MAX_TOKENS,
        )
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code}: {err}", file=sys.stderr)
        return 1
    elapsed = time.perf_counter() - t0

    choice = (result.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    content = message.get("content") or ""
    usage = result.get("usage") or {}
    prompt_tokens = usage.get("prompt_tokens")
    completion_tokens = usage.get("completion_tokens")
    total_tokens = usage.get("total_tokens")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_md = REPORTS / f"dry-run-summary-{stamp}.md"
    out_json = REPORTS / f"dry-run-meta-{stamp}.json"

    meta = {
        "model": MODEL,
        "base_url": BASE_URL,
        "max_tokens": MAX_TOKENS,
        "temperature": TEMPERATURE,
        "d20_roll": roll,
        "elapsed_sec": round(elapsed, 3),
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
        },
        "models_probe": models,
        "finish_reason": choice.get("finish_reason"),
        "output_path": str(out_md),
    }

    header = (
        f"# Satyr dry-run summary\n\n"
        f"- model: `{MODEL}`\n"
        f"- server: `{BASE_URL}`\n"
        f"- d20 roll supplied: **{roll}**\n"
        f"- tokens in/out: **{prompt_tokens}** / **{completion_tokens}** (total {total_tokens})\n"
        f"- elapsed: {elapsed:.2f}s\n"
        f"- max_tokens: {MAX_TOKENS}\n\n"
        f"---\n\n"
    )
    out_md.write_text(header + content.strip() + "\n", encoding="utf-8")
    out_json.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    # Stable latest pointers
    (REPORTS / "dry-run-summary-latest.md").write_text(out_md.read_text(encoding="utf-8"), encoding="utf-8")
    (REPORTS / "dry-run-meta-latest.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    print(json.dumps(meta, indent=2))
    print(f"Wrote {out_md}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
