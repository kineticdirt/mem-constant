#!/usr/bin/env python3
"""Door validation (Coyle: Pydantic at the door) — stdlib, specs-as-data.

Validates a JSON payload against `door` specs in agents/ontology/ops-v1.json
BEFORE any disk write. Ledger (ontology-ledger-check.py) owns transitions after.

Usage:
  door-validate.py --spec inbox_seed_append --json '{"id":"x",...}'
  door-validate.py --spec user_task_status_patch --file payload.json
  door-validate.py --self-check

Exit 0 = ADMIT, 1 = HOLD. Unknown fields are ignored (forward-compatible).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

REPO = Path(__file__).resolve().parents[2]
ONTOLOGY = REPO / "agents" / "ontology" / "ops-v1.json"


def load_door_specs() -> Dict[str, Any]:
    ont = json.loads(ONTOLOGY.read_text(encoding="utf-8"))
    return ont.get("door") or {}


def _check_type(name: str, val: Any, spec: Dict[str, Any], errs: List[str]) -> bool:
    t = spec.get("type")
    if t == "string":
        if not isinstance(val, str):
            errs.append(f"{name}: expected string")
            return False
    elif t == "int":
        if not isinstance(val, int) or isinstance(val, bool):
            errs.append(f"{name}: expected int")
            return False
    elif t == "bool":
        if not isinstance(val, bool):
            errs.append(f"{name}: expected bool")
            return False
    elif t == "list":
        if not isinstance(val, list):
            errs.append(f"{name}: expected list")
            return False
        item_t = spec.get("item")
        if item_t == "string" and any(not isinstance(x, str) for x in val):
            errs.append(f"{name}: items must be string")
            return False
    elif t == "enum":
        one = spec.get("oneOf") or []
        if val not in one:
            errs.append(f"{name}: {val!r} not in oneOf {one}")
            return False
    return True


def validate_payload(spec_name: str, payload: Dict[str, Any], specs: Optional[dict] = None) -> List[str]:
    specs = specs if specs is not None else load_door_specs()
    spec = specs.get(spec_name)
    if not spec:
        return [f"unknown door spec {spec_name!r}"]
    fields: Dict[str, Any] = spec.get("fields") or {}
    errs: List[str] = []

    for name, fs in fields.items():
        req_if = fs.get("required_if")
        required = bool(fs.get("required"))
        if req_if:
            dep = payload.get(req_if.get("field"))
            if dep in (req_if.get("oneOf") or []):
                required = True
        present = name in payload and payload.get(name) is not None
        if required and not present:
            errs.append(f"{name}: required")
            continue
        if not present:
            continue
        val = payload.get(name)
        if not _check_type(name, val, fs, errs):
            continue
        if isinstance(val, str):
            if "min_len" in fs and len(val) < int(fs["min_len"]):
                errs.append(f"{name}: len<{fs['min_len']}")
            if "max_len" in fs and len(val) > int(fs["max_len"]):
                errs.append(f"{name}: len>{fs['max_len']}")
            if fs.get("pattern") and not re.match(fs["pattern"], val):
                errs.append(f"{name}: pattern {fs['pattern']} mismatch")
        if isinstance(val, int) and not isinstance(val, bool):
            if "min" in fs and val < int(fs["min"]):
                errs.append(f"{name}: < min {fs['min']}")
            if "max" in fs and val > int(fs["max"]):
                errs.append(f"{name}: > max {fs['max']}")
    return errs


def self_check() -> int:
    specs = load_door_specs()
    n = 0

    def expect(spec: str, payload: dict, ok: bool) -> None:
        nonlocal n
        errs = validate_payload(spec, payload, specs)
        if ok:
            assert not errs, (spec, errs)
        else:
            assert errs, (spec, payload)
        n += 1

    expect(
        "user_task_status_patch",
        {"id": "ab12-cd", "status": "done", "prior_status": "open"},
        True,
    )
    expect(
        "user_task_status_patch",
        {"id": "BAD ID", "status": "done"},
        False,
    )
    expect(
        "user_task_status_patch",
        {"id": "ab12", "status": "probably-done"},
        False,
    )
    expect(
        "lane_failover_record",
        {"task_id": "t1", "lane": "cursor", "n": 2, "exit_code": 1},
        True,
    )
    expect(
        "lane_failover_record",
        {"task_id": "t1", "lane": "banana", "n": 999},
        False,
    )
    expect(
        "inbox_seed_append",
        {
            "id": "si-example-1",
            "type": "text",
            "question": "Which drill next?",
            "context": "x" * 48,
        },
        True,
    )
    expect(
        "inbox_seed_append",
        {
            "id": "si-bad",
            "type": "choice",
            "question": "Pick one?",
            "context": "short",
        },
        False,
    )
    expect(
        "inbox_seed_append",
        {
            "id": "si-choice-1",
            "type": "choice",
            "question": "Pick a lane?",
            "context": "y" * 48,
            "options": ["a", "b"],
        },
        True,
    )
    print(f"door-validate self-check PASS ({n})")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--self-check", action="store_true")
    ap.add_argument("--spec")
    ap.add_argument("--json")
    ap.add_argument("--file")
    args = ap.parse_args()
    if args.self_check:
        return self_check()
    if not args.spec:
        ap.error("need --spec or --self-check")
    raw = args.json
    if args.file:
        raw = Path(args.file).read_text(encoding="utf-8")
    if raw is None:
        ap.error("need --json or --file")
    payload = json.loads(raw)
    errs = validate_payload(args.spec, payload)
    if errs:
        for e in errs:
            print(f"HOLD: {e}", file=sys.stderr)
        print("VERDICT=HOLD")
        return 1
    print("VERDICT=ADMIT")
    return 0


if __name__ == "__main__":
    sys.exit(main())
