#!/usr/bin/env python3
"""Ingest a Gemini/NotebookLM injection-pack return into packs_registry.js staging.

Usage:
  python scripts/pixi/ingest-injection-pack.py --pack kit_gear --file docs/pixi/injection-packs/returns/kit_gear-….md --dry-run
  python scripts/pixi/ingest-injection-pack.py --pack kit_gear --file … --apply-staging

Does NOT push to potato unless --apply-potato (requires SSH potato + explicit flag).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VALID = {"kit_gear", "world_storage", "system_dynamics", "mechanics"}
STAGING = ROOT / ".staging" / "pixi-kit-packs"


def extract_json(text: str) -> dict:
    # Prefer fenced json block
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    raw = m.group(1) if m else None
    if not raw:
        # whole file is JSON
        raw = text.strip()
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("top-level JSON must be an object")
    return data


def validate(pack_id: str, data: dict) -> list[str]:
    errs = []
    pid = str(data.get("pack_id") or "")
    if pid != pack_id:
        errs.append(f"pack_id mismatch: file={pack_id!r} json={pid!r}")
    if pid not in VALID:
        errs.append(f"invalid pack_id {pid!r}")
    mode = data.get("mode") or "full"
    if mode == "full":
        lines = data.get("lines")
        if not isinstance(lines, list) or not lines:
            errs.append("full mode needs non-empty lines[]")
        elif len(lines) > 10:
            errs.append(f"lines too long ({len(lines)} > 10)")
        else:
            joined = "\n".join(str(x) for x in lines)
            if len(joined) > 2200:
                errs.append(f"lines char budget exceeded ({len(joined)} > 2200)")
        kws = data.get("match_keywords")
        if not isinstance(kws, list) or len(kws) < 10:
            errs.append("match_keywords should have ≥10 items")
    elif mode == "diff":
        if not any(
            data.get(k)
            for k in (
                "add_keywords",
                "remove_keywords",
                "add_lines",
                "remove_line_substrings",
                "replace_lines",
                "anti_patterns_add",
            )
        ):
            errs.append("diff mode has no changes")
    else:
        errs.append(f"unknown mode {mode!r}")
    return errs


def load_baseline_registry() -> str:
    local = STAGING / "packs_registry.js"
    if local.exists():
        return local.read_text(encoding="utf-8")
    return ""


def write_normalized(pack_id: str, data: dict, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pack", required=True, choices=sorted(VALID))
    ap.add_argument("--file", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true", default=True)
    ap.add_argument("--apply-staging", action="store_true", help="write normalized JSON under .staging")
    ap.add_argument(
        "--apply-potato",
        action="store_true",
        help="reserved — refuse unless explicitly implemented with SSH",
    )
    args = ap.parse_args()
    if args.apply_staging:
        args.dry_run = False

    text = args.file.read_text(encoding="utf-8")
    data = extract_json(text)
    errs = validate(args.pack, data)
    if errs:
        print("VALIDATION FAIL:")
        for e in errs:
            print(" -", e)
        return 1

    print("VALIDATION OK")
    print("pack_id:", data.get("pack_id"))
    print("mode:", data.get("mode") or "full")
    if data.get("summary"):
        print("summary:", data["summary"])
    if data.get("match_keywords"):
        print("keywords:", len(data["match_keywords"]))
    if data.get("lines"):
        print("lines:", len(data["lines"]), "chars:", len("\n".join(map(str, data["lines"]))))
    if data.get("scenario_notes_template"):
        print("scenario_notes_template: present")
    if data.get("add_keywords"):
        print("diff add_keywords:", data["add_keywords"])
    if data.get("add_lines"):
        print("diff add_lines:", data["add_lines"])

    out = STAGING / "ingested" / f"{args.pack}.json"
    if args.dry_run and not args.apply_staging:
        print("dry-run only — would write", out)
        print("re-run with --apply-staging after review")
        return 0

    if args.apply_potato:
        print("REFUSE: --apply-potato not auto; merge manually after staging OK")
        return 2

    write_normalized(args.pack, data, out)
    # also keep scenario notes template aside
    notes = data.get("scenario_notes_template")
    if notes:
        npath = STAGING / "ingested" / f"{args.pack}.scenario_notes.txt"
        if isinstance(notes, list):
            npath.write_text("\n".join(str(x) for x in notes) + "\n", encoding="utf-8")
        else:
            npath.write_text(str(notes) + "\n", encoding="utf-8")
        print("wrote", npath)
    print("wrote", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
