#!/usr/bin/env python3
"""Write one meta-harness run JSON + optional score_tick. Stdlib only.

Used by agent-cycle-think-tick (crontab path) and agent-pod-scheduler.
Does not require the upstream stanford-iris-lab/meta-harness clone.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def stamp_now() -> str:
    # Include microseconds so two ticks in the same second do not clobber.
    return utc_now().strftime("%Y%m%d-%H%M%S-%f")


def iso_now() -> str:
    return utc_now().isoformat().replace("+00:00", "Z")


def record_tick(
    *,
    repo: Path,
    pod: str,
    profile: str,
    exit_code: int,
    intent: str,
    log_path: str = "",
    prompt: str = "",
    bootstrap: bool = False,
    task_id: str = "",
    model: str = "",
    score: bool = True,
) -> Path:
    mh_dir = repo / "agents" / "meta-harness" / "runs" / pod
    mh_dir.mkdir(parents=True, exist_ok=True)
    out_path = mh_dir / f"{stamp_now()}.json"
    record = {
        "pod": pod,
        "profile": profile,
        "at": iso_now(),
        "prompt_hash": hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:16] if prompt else None,
        "bootstrap": bool(bootstrap),
        "exit_code": int(exit_code),
        "intent": intent if intent in ("INTENT_OK", "INTENT_FAIL") else (
            "INTENT_OK" if int(exit_code) == 0 else "INTENT_FAIL"
        ),
        "log_path": log_path or "",
        "harness_candidate": None,
    }
    if task_id:
        record["task_id"] = task_id[:120]
    if model:
        record["model"] = model[:160]
    out_path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")

    if score:
        score_py = repo / "scripts" / "meta-harness" / "score_tick.py"
        if score_py.is_file():
            try:
                sc = subprocess.run(
                    [sys.executable, str(score_py), str(out_path)],
                    cwd=str(repo),
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                if sc.returncode == 0 and sc.stdout.strip():
                    record["score"] = json.loads(sc.stdout)
                    out_path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
            except (subprocess.TimeoutExpired, OSError, json.JSONDecodeError):
                pass

    return out_path


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Record one meta-harness think/pod tick")
    p.add_argument("--repo", type=Path, default=REPO_ROOT)
    p.add_argument("--pod", required=True)
    p.add_argument("--profile", default="")
    p.add_argument("--exit-code", type=int, required=True)
    p.add_argument("--intent", default="", help="INTENT_OK or INTENT_FAIL (default from exit-code)")
    p.add_argument("--log-path", default="")
    p.add_argument("--prompt", default="")
    p.add_argument("--bootstrap", action="store_true")
    p.add_argument("--task-id", default="")
    p.add_argument("--model", default="")
    p.add_argument("--no-score", action="store_true")
    args = p.parse_args(argv)

    profile = (args.profile or args.pod).strip() or args.pod
    intent = (args.intent or "").strip()
    if not intent:
        intent = "INTENT_OK" if args.exit_code == 0 else "INTENT_FAIL"

    out = record_tick(
        repo=args.repo.resolve(),
        pod=args.pod.strip(),
        profile=profile,
        exit_code=args.exit_code,
        intent=intent,
        log_path=args.log_path,
        prompt=args.prompt,
        bootstrap=args.bootstrap,
        task_id=args.task_id,
        model=args.model,
        score=not args.no_score,
    )
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
