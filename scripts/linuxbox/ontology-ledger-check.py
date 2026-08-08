#!/usr/bin/env python3
"""Ontology-at-the-ledger check for ops SoT (user-tasks lane handoff).

Coyle musing: probabilistic agents propose; deterministic rules admit writes.
Potato-sized: JSON ontology, not OWL reasoner.

Usage:
  python3 scripts/linuxbox/ontology-ledger-check.py --self-check
  python3 scripts/linuxbox/ontology-ledger-check.py --task-json '{"id":"x","status":"done"}' \\
      --prior-status open
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List, Optional

REPO = Path(__file__).resolve().parents[2]
ONTOLOGY = REPO / "agents" / "ontology" / "ops-v1.json"

# Potato/Hermes sometimes use aliases; normalize before owl:oneOf.
_STATUS_ALIAS = {
    "pending": "open",
    "running": "in_progress",
    "": "open",
}


def load_ontology() -> dict:
    return json.loads(ONTOLOGY.read_text(encoding="utf-8"))


def _norm_status(raw: Optional[str]) -> str:
    s = str(raw or "").lower().strip()
    return _STATUS_ALIAS.get(s, s)


def validate_task(
    task: dict,
    *,
    prior_status: Optional[str] = None,
    ontology: Optional[dict] = None,
) -> List[str]:
    """Return list of violation strings (empty = admit)."""
    ont = ontology or load_ontology()
    errs: List[str] = []
    classes = ont.get("classes") or {}
    ut = classes.get("UserTask") or {}
    props = ut.get("properties") or {}
    status_spec = props.get("status") or {}
    allowed = set(status_spec.get("oneOf") or [])

    tid = task.get("id")
    if not tid or not isinstance(tid, str):
        errs.append("UserTask.id required (functional)")

    status = _norm_status(task.get("status"))
    if allowed and status not in allowed:
        errs.append(f"status {status!r} not in owl:oneOf {sorted(allowed)}")

    transitions = (ont.get("transitions") or {}).get("UserTask.status") or {}
    if prior_status is not None and status:
        prior = _norm_status(prior_status)
        if prior in transitions:
            nxt = transitions[prior]
            if status != prior and status not in nxt:
                errs.append(f"illegal transition {prior}→{status} (allowed {nxt})")

    ctx = task.get("context") if isinstance(task.get("context"), dict) else {}
    lane = ctx.get("assigned_lane")
    lane_spec = ((classes.get("LaneAssignment") or {}).get("properties") or {}).get(
        "assigned_lane"
    ) or {}
    lane_allowed = set(lane_spec.get("oneOf") or [])
    if lane is not None and lane_allowed and str(lane) not in lane_allowed:
        errs.append(f"assigned_lane {lane!r} not in {sorted(lane_allowed)}")

    for rule in ont.get("rules") or []:
        if rule.get("id") == "archived-implies-blocked":
            if str(lane) == "archived" and status != "blocked":
                errs.append("archived-implies-blocked: assigned_lane=archived requires status=blocked")

    return errs


def self_check() -> int:
    ont = load_ontology()
    ok = 0
    # admit
    e = validate_task(
        {"id": "t1", "status": "done", "context": {"assigned_lane": "hermes"}},
        prior_status="open",
        ontology=ont,
    )
    assert not e, e
    ok += 1
    # enum invent
    e = validate_task({"id": "t1", "status": "probably-done"}, prior_status="open", ontology=ont)
    assert e and any("oneOf" in x for x in e), e
    ok += 1
    # done→open illegal
    e = validate_task({"id": "t1", "status": "open"}, prior_status="done", ontology=ont)
    assert e and any("transition" in x for x in e), e
    ok += 1
    # archived without blocked
    e = validate_task(
        {"id": "t1", "status": "open", "context": {"assigned_lane": "archived"}},
        prior_status="open",
        ontology=ont,
    )
    assert e and any("archived" in x for x in e), e
    ok += 1
    # archived + blocked admit
    e = validate_task(
        {"id": "t1", "status": "blocked", "context": {"assigned_lane": "archived"}},
        prior_status="open",
        ontology=ont,
    )
    assert not e, e
    ok += 1
    print(f"ontology-ledger-check self-check PASS ({ok})")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--self-check", action="store_true")
    ap.add_argument("--task-json", help="JSON object for proposed task state")
    ap.add_argument("--prior-status", default=None)
    args = ap.parse_args()
    if args.self_check:
        return self_check()
    if not args.task_json:
        ap.error("need --self-check or --task-json")
    task = json.loads(args.task_json)
    errs = validate_task(task, prior_status=args.prior_status)
    if errs:
        for e in errs:
            print(f"HOLD: {e}", file=sys.stderr)
        print("VERDICT=HOLD")
        return 1
    print("VERDICT=ADMIT")
    return 0


if __name__ == "__main__":
    sys.exit(main())
